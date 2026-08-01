/**
 * Core domain types for the Clinical Diagnostic Interpretation Engine.
 * Everything here is pure data — no I/O, no network. All analysis is local.
 */

/** Priority Alert System — six tiers, ordered least to most urgent. */
export type Severity =
  | 'normal'
  | 'minor'
  | 'moderate'
  | 'significant'
  | 'critical'
  | 'life-threatening';

export const SEVERITY_ORDER: Severity[] = [
  'normal',
  'minor',
  'moderate',
  'significant',
  'critical',
  'life-threatening',
];

export const SEVERITY_LABEL: Record<Severity, string> = {
  normal: 'Normal',
  minor: 'Minor Abnormality',
  moderate: 'Moderate Abnormality',
  significant: 'Significant Abnormality',
  critical: 'Critical Result',
  'life-threatening': 'Life-Threatening Finding',
};

export const severityRank = (s: Severity): number => SEVERITY_ORDER.indexOf(s);

export const maxSeverity = (...s: Severity[]): Severity =>
  s.reduce((a, b) => (severityRank(b) > severityRank(a) ? b : a), 'normal' as Severity);

/** Diagnostic modules supported by the engine. */
export type ModuleId =
  | 'fbc'
  | 'coagulation'
  | 'renal'
  | 'electrolytes'
  | 'lft'
  | 'abg'
  | 'urinalysis'
  | 'inflammatory'
  | 'cardiac'
  | 'ecg'
  | 'microbiology'
  | 'other';

export const MODULE_LABEL: Record<ModuleId, string> = {
  fbc: 'Full Blood Count',
  coagulation: 'Coagulation Profile',
  renal: 'Renal Function',
  electrolytes: 'Electrolytes',
  lft: 'Liver Function Tests',
  abg: 'Arterial Blood Gas',
  urinalysis: 'Urinalysis',
  inflammatory: 'Inflammatory Markers',
  cardiac: 'Cardiac Biomarkers',
  ecg: 'Electrocardiogram',
  microbiology: 'Microbiology (MCS / Culture)',
  other: 'Other Investigations',
};

export type Sex = 'male' | 'female' | 'unspecified';

/** Patient demographics and clinical context driving interpretation. */
export interface PatientContext {
  name: string;
  hospitalNumber: string;
  age: number | null;
  sex: Sex;
  weightKg: number | null;
  heightCm: number | null;
  ward: string;
  consultant: string;
  diagnosis: string;
  /** Free-text presenting problem / clinical details. */
  clinicalDetails: string;
  /** Context flags that switch on specific correlation rules. */
  fever: boolean;
  plannedSurgery: boolean;
  onAnticoagulant: boolean;
  anticoagulantName: string;
  pregnant: boolean;
  knownCKD: boolean;
  immunosuppressed: boolean;
  /** User-entered drug allergies — surfaced against antimicrobial suggestions. */
  allergies: string[];
  /** Prior creatinine (µmol/L) used for AKI staging. */
  baselineCreatinine: number | null;
  collectedAt: string;
}

export const emptyPatient = (): PatientContext => ({
  name: '',
  hospitalNumber: '',
  age: null,
  sex: 'unspecified',
  weightKg: null,
  heightCm: null,
  ward: '',
  consultant: '',
  diagnosis: '',
  clinicalDetails: '',
  fever: false,
  plannedSurgery: false,
  onAnticoagulant: false,
  anticoagulantName: '',
  pregnant: false,
  knownCKD: false,
  immunosuppressed: false,
  allergies: [],
  baselineCreatinine: null,
  collectedAt: '',
});

/** A single extracted, validated numeric analyte. */
export interface Analyte {
  key: string;
  label: string;
  /** Canonical value after unit normalisation. */
  value: number;
  /** Canonical unit. */
  unit: string;
  /** Exactly what OCR read, before normalisation — preserved for the report. */
  rawText: string;
  rawValue?: number;
  rawUnit?: string;
  /** 0–1 OCR confidence. */
  confidence: number;
  /** Clinician corrected this value in the review step. */
  edited: boolean;
  /** Analyte was typed in manually rather than scanned. */
  manual?: boolean;
  refLow?: number;
  refHigh?: number;
  /**
   * The reference interval printed on the report itself.
   *
   * The issuing laboratory's interval is specific to its assay and population
   * and is the correct one to grade against — a built-in default can call a
   * result normal that the laboratory flagged, and vice versa. Where the
   * report states its interval it is used, and the report says so.
   */
  printedRefLow?: number;
  printedRefHigh?: number;
  refSource?: 'report' | 'built-in';
  flag?: 'low' | 'high' | 'normal';
  /** Which scanned document this came from. */
  sourceId?: string;
}

/** A qualitative / textual observation (ECG features, culture results, dipstick). */
export interface Observation {
  key: string;
  label: string;
  value: string;
  rawText: string;
  confidence: number;
  edited: boolean;
  sourceId?: string;
}

/** Antimicrobial susceptibility result for one organism/drug pair. */
export type SusceptibilityResult = 'S' | 'I' | 'R' | 'unknown';

export interface Susceptibility {
  antibiotic: string;
  /** Normalised antibiotic name used for class lookup. */
  key: string;
  result: SusceptibilityResult;
  rawText: string;
}

export type GramCategory =
  | 'gram-positive'
  | 'gram-negative'
  | 'anaerobe'
  | 'fungus'
  | 'mycobacterium'
  | 'unknown';

export interface Organism {
  name: string;
  key: string;
  gram: GramCategory;
  /** Typical significance in the sampled site. */
  likelySignificance: 'pathogen' | 'possible-contaminant' | 'coloniser' | 'indeterminate';
  resistanceMarkers: string[];
  susceptibilities: Susceptibility[];
  growthQuantity?: string;
  biofilmRisk?: boolean;
  hospitalAcquiredIndicator?: boolean;
}

export interface MicrobiologyReport {
  specimen: string;
  specimenType: 'wound' | 'blood' | 'urine' | 'sputum' | 'csf' | 'tissue' | 'other';
  microscopy: string;
  gramStain: string;
  cultureText: string;
  noGrowth: boolean;
  mixedGrowth: boolean;
  organisms: Organism[];
  collectedAt?: string;
}

/** Structured ECG feature set. */
export interface EcgData {
  rateBpm: number | null;
  rhythm: string;
  axisDegrees: number | null;
  axisText: string;
  prMs: number | null;
  qrsMs: number | null;
  qtMs: number | null;
  qtcMs: number | null;
  /** Machine/clinician statement lines from the ECG printout. */
  statements: string[];
  /** Feature flags detected from statements or entered by the clinician. */
  features: Record<string, boolean>;
  leadDetail: string;
  /**
   * Output of the waveform signal analysis, when the trace could be digitised
   * from the image. Present alongside — never replacing — the values printed
   * on the report, so that the two can be compared.
   */
  waveform?: import('../ecg/types').WaveformAnalysis;
  /** Why waveform analysis could not be performed, when it could not. */
  waveformError?: string;
  /** Disagreements between the computed and the printed measurements. */
  discrepancies?: import('../ecg/types').Discrepancy[];
}

/** One interpreted clinical finding produced by a module. */
export interface Finding {
  id: string;
  module: ModuleId;
  title: string;
  severity: Severity;
  interpretation: string;
  /** Analyte keys / observations that triggered this finding. */
  basis: string[];
  differentials: string[];
  investigations: string[];
  implications: string[];
  monitoring: string[];
  /** Guideline-aligned practice points. */
  guidance: string[];
  /** Machine tags consumed by the correlation engine. */
  tags: string[];
}

export const finding = (f: Partial<Finding> & Pick<Finding, 'id' | 'module' | 'title' | 'severity' | 'interpretation'>): Finding => ({
  basis: [],
  differentials: [],
  investigations: [],
  implications: [],
  monitoring: [],
  guidance: [],
  tags: [],
  ...f,
});

/** A correlation drawn across two or more modules. */
export interface Correlation {
  id: string;
  title: string;
  severity: Severity;
  narrative: string;
  /** Modules that contributed. */
  modules: ModuleId[];
  contributingFindings: string[];
  actions: string[];
}

/** A scanned source document. */
export interface ScannedDocument {
  id: string;
  fileName: string;
  /** Object URL for preview (revoked on clear). */
  previewUrl?: string;
  mime: string;
  pageCount: number;
  rawText: string;
  meanConfidence: number;
  detectedModules: ModuleId[];
  addedAt: string;
  status: 'queued' | 'ocr' | 'parsing' | 'done' | 'error';
  error?: string;
  /**
   * Recognised words with their positions, retained so that identifiers can be
   * located and painted out if assisted extraction is later requested for this
   * document. Dropped from the encrypted archive — it is reproducible.
   */
  words?: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number }; confidence: number }[];
  /** Set when values for this document came from assisted extraction. */
  assistedModel?: string;
}

/** Per-module analysis output. */
export interface ModuleResult {
  module: ModuleId;
  present: boolean;
  analytes: Analyte[];
  observations: Observation[];
  findings: Finding[];
  /** Short module-level narrative for the summary report. */
  summary: string;
  severity: Severity;
  /** Module-specific derived values (eGFR, CrCl, anion gap, corrected Ca, …). */
  derived: Record<string, { label: string; value: string; note?: string }>;
}

/** Everything the report generator needs. */
export interface AnalysisResult {
  patient: PatientContext;
  documents: ScannedDocument[];
  modules: ModuleResult[];
  correlations: Correlation[];
  overallSeverity: Severity;
  impression: string[];
  nextSteps: string[];
  generatedAt: string;
}

/** Longitudinal point for trend analysis. */
export interface TrendPoint {
  timestamp: string;
  value: number;
}

export interface TrendSeries {
  key: string;
  label: string;
  unit: string;
  points: TrendPoint[];
  direction: 'rising' | 'falling' | 'stable' | 'insufficient';
  changePercent: number | null;
}
