/**
 * Session state.
 *
 * Deliberately held in memory only. Patient-identifiable data is never written
 * to localStorage, IndexedDB or any other persistent store automatically —
 * persistence is an explicit clinician action producing an encrypted archive
 * file (see store/archive.ts).
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { analyse } from '../clinical/analyse';
import { emptyExtraction, type Extraction } from '../clinical/context';
import type {
  Analyte,
  AnalysisResult,
  EcgData,
  MicrobiologyReport,
  Observation,
  PatientContext,
  ScannedDocument,
} from '../clinical/types';
import { emptyPatient } from '../clinical/types';
import { ANALYTE_BY_KEY, refForPatient } from '../clinical/referenceRanges';
import { ingestFile, type IngestProgress } from '../parse/pipeline';
import { terminateOcr } from '../ocr/ocrEngine';
import { terminateWaveformWorker } from '../ecg/client';

export interface SessionSnapshot {
  version: 1;
  patient: PatientContext;
  extraction: Extraction;
  documents: ScannedDocument[];
  savedAt: string;
}

export interface SessionApi {
  patient: PatientContext;
  setPatient: (p: Partial<PatientContext>) => void;
  documents: ScannedDocument[];
  extraction: Extraction;
  analysis: AnalysisResult;
  busy: boolean;
  progress: IngestProgress | null;

  addFiles: (files: FileList | File[]) => Promise<void>;
  removeDocument: (id: string) => void;
  updateAnalyte: (key: string, value: number) => void;
  removeAnalyte: (key: string) => void;
  addManualAnalyte: (key: string, value: number) => void;
  updateObservation: (key: string, value: string) => void;
  setEcgFeature: (index: number, featureKey: string, on: boolean) => void;
  updateEcgField: (index: number, field: keyof EcgData, value: number | string | null) => void;
  addBlankEcg: () => void;
  updateMicroSusceptibility: (repIdx: number, orgIdx: number, abKey: string, result: 'S' | 'I' | 'R') => void;
  clearAll: () => void;
  snapshot: () => SessionSnapshot;
  restore: (s: SessionSnapshot) => void;

  /**
   * The original file for a scanned document, kept in memory so that assisted
   * extraction can be offered after the fact without asking for the file
   * again. Never persisted.
   */
  fileFor: (documentId: string) => File | undefined;
  /** Replace a document's values with those from assisted extraction. */
  applyAssisted: (documentId: string, analytes: Analyte[], model: string) => void;
}

export function useSession(): SessionApi {
  const [patient, setPatientState] = useState<PatientContext>(emptyPatient);
  const [extraction, setExtraction] = useState<Extraction>(emptyExtraction);
  const [documents, setDocuments] = useState<ScannedDocument[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<IngestProgress | null>(null);
  const filesRef = useRef(new Map<string, File>());

  const setPatient = useCallback((patch: Partial<PatientContext>) => {
    setPatientState((prev) => {
      const next = { ...prev, ...patch };
      // Reference intervals are sex- and pregnancy-dependent; refresh them
      // whenever those change so the review table stays truthful.
      if (patch.sex !== undefined || patch.pregnant !== undefined || patch.age !== undefined) {
        setExtraction((ex) => ({
          ...ex,
          analytes: ex.analytes.map((a) => {
            const def = ANALYTE_BY_KEY[a.key];
            if (!def) return a;
            const ref = refForPatient(def, next);
            return { ...a, refLow: ref?.low, refHigh: ref?.high };
          }),
        }));
      }
      return next;
    });
  }, []);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    setBusy(true);
    try {
      for (const file of list) {
        setProgress({ fileName: file.name, stage: 'Queued', progress: 0 });
        const result = await ingestFile(file, patient, setProgress);

        filesRef.current.set(result.document.id, file);
        setDocuments((prev) => [...prev, result.document]);

        setExtraction((prev) => {
          // Later documents supersede earlier ones for the same analyte key.
          const byKey = new Map<string, Analyte>(prev.analytes.map((a) => [a.key, a]));
          for (const a of result.analytes) {
            const existing = byKey.get(a.key);
            if (existing?.edited) continue; // never overwrite a clinician correction
            byKey.set(a.key, a);
          }
          const obsByKey = new Map<string, Observation>(prev.observations.map((o) => [o.key, o]));
          for (const o of result.observations) {
            if (obsByKey.get(o.key)?.edited) continue;
            obsByKey.set(o.key, o);
          }
          return {
            analytes: [...byKey.values()],
            observations: [...obsByKey.values()],
            micro: [...prev.micro, ...result.micro],
            ecg: [...prev.ecg, ...result.ecg],
          };
        });

        // Adopt demographics the report supplies, without overwriting anything
        // the clinician has already typed.
        const d = result.demographics;
        setPatientState((prev) => ({
          ...prev,
          name: prev.name || (d.name ?? ''),
          hospitalNumber: prev.hospitalNumber || (d.hospitalNumber ?? ''),
          age: prev.age ?? (d.age ?? null),
          sex: prev.sex !== 'unspecified' ? prev.sex : (d.sex ?? 'unspecified'),
          ward: prev.ward || (d.ward ?? ''),
          consultant: prev.consultant || (d.consultant ?? ''),
          collectedAt: prev.collectedAt || (d.collectedAt ?? ''),
        }));
      }
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [patient]);

  const removeDocument = useCallback((id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    setExtraction((prev) => ({
      ...prev,
      analytes: prev.analytes.filter((a) => a.sourceId !== id || a.edited || a.manual),
      observations: prev.observations.filter((o) => o.sourceId !== id || o.edited),
    }));
  }, []);

  const updateAnalyte = useCallback((key: string, value: number) => {
    setExtraction((prev) => ({
      ...prev,
      analytes: prev.analytes.map((a) => (a.key === key ? { ...a, value, edited: true, confidence: 1 } : a)),
    }));
  }, []);

  const removeAnalyte = useCallback((key: string) => {
    setExtraction((prev) => ({ ...prev, analytes: prev.analytes.filter((a) => a.key !== key) }));
  }, []);

  const addManualAnalyte = useCallback((key: string, value: number) => {
    const def = ANALYTE_BY_KEY[key];
    if (!def) return;
    setExtraction((prev) => {
      const ref = refForPatient(def, patient);
      const entry: Analyte = {
        key: def.key,
        label: def.label,
        value,
        unit: def.unit,
        rawText: 'Entered manually',
        confidence: 1,
        edited: true,
        manual: true,
        refLow: ref?.low,
        refHigh: ref?.high,
      };
      return { ...prev, analytes: [...prev.analytes.filter((a) => a.key !== key), entry] };
    });
  }, [patient]);

  const updateObservation = useCallback((key: string, value: string) => {
    setExtraction((prev) => {
      const exists = prev.observations.some((o) => o.key === key);
      if (exists) {
        return {
          ...prev,
          observations: prev.observations.map((o) => (o.key === key ? { ...o, value, edited: true, confidence: 1 } : o)),
        };
      }
      return {
        ...prev,
        observations: [...prev.observations, { key, label: key.split(':')[1] ?? key, value, rawText: 'Entered manually', confidence: 1, edited: true }],
      };
    });
  }, []);

  const setEcgFeature = useCallback((index: number, featureKey: string, on: boolean) => {
    setExtraction((prev) => ({
      ...prev,
      ecg: prev.ecg.map((e, i) => (i === index ? { ...e, features: { ...e.features, [featureKey]: on } } : e)),
    }));
  }, []);

  const updateEcgField = useCallback((index: number, field: keyof EcgData, value: number | string | null) => {
    setExtraction((prev) => ({
      ...prev,
      ecg: prev.ecg.map((e, i) => (i === index ? { ...e, [field]: value } as EcgData : e)),
    }));
  }, []);

  const addBlankEcg = useCallback(() => {
    setExtraction((prev) => ({
      ...prev,
      ecg: [...prev.ecg, {
        rateBpm: null, rhythm: '', axisDegrees: null, axisText: '',
        prMs: null, qrsMs: null, qtMs: null, qtcMs: null,
        statements: [], features: {}, leadDetail: 'Entered manually',
      }],
    }));
  }, []);

  const updateMicroSusceptibility = useCallback(
    (repIdx: number, orgIdx: number, abKey: string, result: 'S' | 'I' | 'R') => {
      setExtraction((prev) => ({
        ...prev,
        micro: prev.micro.map((rep, i) => {
          if (i !== repIdx) return rep;
          return {
            ...rep,
            organisms: rep.organisms.map((org, j) => {
              if (j !== orgIdx) return org;
              return {
                ...org,
                susceptibilities: org.susceptibilities.map((s) => (s.key === abKey ? { ...s, result } : s)),
              };
            }),
          };
        }),
      }));
    },
    [],
  );

  const fileFor = useCallback((documentId: string) => filesRef.current.get(documentId), []);

  /**
   * Adopt assisted-extraction values for one document.
   *
   * Clinician corrections survive: a value already checked by a person is not
   * replaced by one a model produced.
   */
  const applyAssisted = useCallback((documentId: string, incoming: Analyte[], model: string) => {
    setExtraction((prev) => {
      const byKey = new Map<string, Analyte>(prev.analytes.map((a) => [a.key, a]));
      for (const a of incoming) {
        if (byKey.get(a.key)?.edited) continue;
        byKey.set(a.key, { ...a, sourceId: documentId });
      }
      return { ...prev, analytes: [...byKey.values()] };
    });
    setDocuments((prev) => prev.map((d) => (d.id === documentId ? { ...d, assistedModel: model, error: undefined } : d)));
  }, []);

  const clearAll = useCallback(() => {
    setPatientState(emptyPatient());
    setExtraction(emptyExtraction());
    setDocuments([]);
    filesRef.current.clear();
    void terminateOcr();
    terminateWaveformWorker();
  }, []);

  const snapshot = useCallback(
    (): SessionSnapshot => ({
      version: 1,
      patient,
      extraction: {
        ...extraction,
        // The digitised waveform holds a float sample array per lead. Those
        // serialise to enormous JSON objects and are reproducible by rescanning
        // the image, so the archive keeps the measurements, findings and
        // quality report and discards the raw signal.
        ecg: extraction.ecg.map((e) =>
          e.waveform
            ? {
                ...e,
                waveform: {
                  ...e.waveform,
                  beats: [],
                  digitised: { ...e.waveform.digitised, leads: [] },
                },
              }
            : e,
        ),
      },
      // previewUrl is a transient object URL and must not be archived. Word
      // boxes are reproducible from the source and would bloat the archive.
      documents: documents.map(({ previewUrl, words, ...rest }) => rest),
      savedAt: new Date().toISOString(),
    }),
    [patient, extraction, documents],
  );

  const restore = useCallback((s: SessionSnapshot) => {
    setPatientState({ ...emptyPatient(), ...s.patient });
    setExtraction({ ...emptyExtraction(), ...s.extraction });
    setDocuments(s.documents ?? []);
  }, []);

  const analysis = useMemo(
    () => analyse(patient, extraction, documents),
    [patient, extraction, documents],
  );

  return {
    patient, setPatient, documents, extraction, analysis, busy, progress,
    addFiles, removeDocument, updateAnalyte, removeAnalyte, addManualAnalyte,
    updateObservation, setEcgFeature, updateEcgField, addBlankEcg,
    updateMicroSusceptibility, clearAll, snapshot, restore,
    fileFor, applyAssisted,
  };
}
