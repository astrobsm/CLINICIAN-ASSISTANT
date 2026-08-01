/**
 * Document ingestion pipeline.
 *
 * File → (PDF text layer | OCR) → classification → module parsers → extraction
 * fragments. Runs entirely on the device.
 */
import { recognisePage, type OcrWordBox } from '../ocr/ocrEngine';
import { enhanceForOcr, loadImage, scaleToCanvas } from '../ocr/preprocess';
import { readPdf } from '../ocr/pdf';
import { analyseEcgImage } from '../ecg/client';
import { buildMasks, type Masks } from '../ecg/grid';
import { reconcile } from '../ecg/reconcile';
import { classifyReport } from './classify';

/** Render a trace mask as black ink on white, for recognition. */
function traceMaskToCanvas(masks: Masks): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = masks.width;
  canvas.height = masks.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const out = ctx.createImageData(masks.width, masks.height);
  for (let i = 0, p = 0; i < masks.trace.length; i++, p += 4) {
    const v = masks.trace[i] ? 0 : 255;
    out.data[p] = v; out.data[p + 1] = v; out.data[p + 2] = v; out.data[p + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}
import { parseDemographics, parseLabValues, resolvePercentages, type ParsedDemographics } from './labParser';
import { parseEcg } from './ecgParser';
import { parseMicrobiology } from './microParser';
import type { Analyte, EcgData, MicrobiologyReport, ModuleId, Observation, PatientContext, ScannedDocument } from '../clinical/types';

export interface IngestResult {
  document: ScannedDocument;
  analytes: Analyte[];
  observations: Observation[];
  micro: MicrobiologyReport[];
  ecg: EcgData[];
  demographics: ParsedDemographics;
}

export interface IngestProgress {
  fileName: string;
  stage: string;
  progress: number;
}

let counter = 0;
const nextId = () => `doc_${Date.now().toString(36)}_${(counter++).toString(36)}`;

interface ExtractedContent {
  text: string;
  confidence: number;
  pageCount: number;
  method: string;
  words: OcrWordBox[];
  /**
   * Colour raster of the page, retained so that an ECG can be digitised from
   * the trace itself. The grid is printed in red and the trace in black, so
   * colour information is what makes the separation possible; a binarised copy
   * would be useless for this.
   */
  raster?: { pixels: Uint8ClampedArray; width: number; height: number };
}

/** Extract raw text from any supported file, entirely locally. */
async function extractText(
  file: File,
  onProgress: (p: IngestProgress) => void,
): Promise<ExtractedContent> {
  const name = file.name;

  if (file.type === 'application/pdf' || /\.pdf$/i.test(name)) {
    onProgress({ fileName: name, stage: 'Reading PDF', progress: 0.05 });
    const { pages } = await readPdf(file, (done, total) =>
      onProgress({ fileName: name, stage: `Reading PDF page ${done} of ${total}`, progress: (done / total) * 0.4 }),
    );

    const parts: string[] = [];
    const confidences: number[] = [];
    const words: OcrWordBox[] = [];
    let ocrPages = 0;
    let raster: ExtractedContent['raster'];

    for (const [i, page] of pages.entries()) {
      if (page.text) {
        parts.push(page.text);
        confidences.push(0.99); // digital text layer — no recognition error
      } else if (page.canvas) {
        ocrPages++;
        onProgress({ fileName: name, stage: `Recognising page ${i + 1} of ${pages.length}`, progress: 0.4 + (i / pages.length) * 0.55 });
        const res = await recognisePage(page.canvas, (p) =>
          onProgress({ fileName: name, stage: `Recognising page ${i + 1}: ${p.stage}`, progress: 0.4 + ((i + p.progress) / pages.length) * 0.55 }),
        );
        parts.push(res.text);
        confidences.push(res.confidence);
        if (!raster) {
          const ctx = page.canvas.getContext('2d', { willReadFrequently: true });
          const data = ctx?.getImageData(0, 0, page.canvas.width, page.canvas.height);
          if (data) {
            raster = { pixels: data.data, width: page.canvas.width, height: page.canvas.height };
            words.push(...res.words);
          }
        }
      }
    }

    return {
      text: parts.join('\n\n'),
      confidence: confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0,
      pageCount: pages.length,
      method: ocrPages === 0 ? 'PDF text layer' : ocrPages === pages.length ? 'OCR (scanned PDF)' : 'Mixed: text layer + OCR',
      words,
      raster,
    };
  }

  if (/^text\//.test(file.type) || /\.(txt|csv|log)$/i.test(name)) {
    const text = await file.text();
    return { text, confidence: 1, pageCount: 1, method: 'Plain text', words: [] };
  }

  onProgress({ fileName: name, stage: 'Preparing image', progress: 0.05 });

  // Two canvases of identical geometry: a colour one for waveform work and a
  // binarised one for OCR. Sharing the geometry means recognised word boxes —
  // and therefore ECG lead labels — map straight onto the colour raster.
  const img = await loadImage(file);
  const colour = scaleToCanvas(img, 1800);
  const ctx = colour.getContext('2d', { willReadFrequently: true })!;
  const data = ctx.getImageData(0, 0, colour.width, colour.height);

  // OCR benefits from upscaling; grid measurement does not. Interpolation
  // makes the millimetre lines land on alternating pixel counts, which spreads
  // the measured spacing and biases the scale — and the scale is what every
  // time and voltage measurement is derived from. Where the original is
  // already large enough, the waveform analyser is given it untouched.
  const nativeWidth = (img as HTMLImageElement).naturalWidth || colour.width;
  const useNative = nativeWidth >= 1200 && nativeWidth < colour.width;
  let waveformRaster = { pixels: data.data, width: colour.width, height: colour.height };
  let wordScale = 1;
  if (useNative) {
    const nativeCanvas = scaleToCanvas(img, 0);
    const nctx = nativeCanvas.getContext('2d', { willReadFrequently: true })!;
    const ndata = nctx.getImageData(0, 0, nativeCanvas.width, nativeCanvas.height);
    waveformRaster = { pixels: ndata.data, width: nativeCanvas.width, height: nativeCanvas.height };
    wordScale = nativeCanvas.width / colour.width;
  }

  // On ruled ECG paper a plain greyscale threshold turns the whole red grid
  // black and OCR reads nothing but noise — including the lead labels, which
  // are the most reliable way to assign panels. Where a colour grid is
  // present, the chroma separation used by the waveform digitiser is reused to
  // strip it, leaving only the ink for recognition.
  const masks = buildMasks(data.data, colour.width, colour.height);
  const ocrInput = masks.colourGrid ? traceMaskToCanvas(masks) : enhanceForOcr(colour);

  const res = await recognisePage(ocrInput, (p) =>
    onProgress({ fileName: name, stage: `Recognising: ${p.stage}`, progress: 0.1 + p.progress * 0.7 }),
  );

  return {
    text: res.text,
    confidence: res.confidence,
    pageCount: 1,
    method: 'OCR (image)',
    // Word boxes are recognised on the upscaled canvas; rescale them so they
    // land correctly on whichever raster the waveform analyser is given.
    words: wordScale === 1 ? res.words : res.words.map((w) => ({
      ...w,
      bbox: {
        x0: Math.round(w.bbox.x0 * wordScale), y0: Math.round(w.bbox.y0 * wordScale),
        x1: Math.round(w.bbox.x1 * wordScale), y1: Math.round(w.bbox.y1 * wordScale),
      },
    })),
    raster: waveformRaster,
  };
}

export async function ingestFile(
  file: File,
  patient: PatientContext,
  onProgress: (p: IngestProgress) => void = () => {},
): Promise<IngestResult> {
  const id = nextId();
  const document: ScannedDocument = {
    id,
    fileName: file.name,
    mime: file.type || 'application/octet-stream',
    pageCount: 0,
    rawText: '',
    meanConfidence: 0,
    detectedModules: [],
    addedAt: new Date().toISOString(),
    status: 'ocr',
  };

  try {
    const { text, confidence, pageCount, method, words, raster } = await extractText(file, onProgress);
    document.rawText = text;
    document.meanConfidence = confidence;
    document.pageCount = pageCount;
    document.status = 'parsing';
    onProgress({ fileName: file.name, stage: `Interpreting (${method})`, progress: 0.96 });

    if (!text.trim()) {
      document.status = 'error';
      document.error = 'No readable text was extracted. Try a higher-resolution scan, better lighting, or a flatter page.';
      return { document, analytes: [], observations: [], micro: [], ecg: [], demographics: {} };
    }

    const classification = classifyReport(text);
    document.detectedModules = classification.modules;

    // Laboratory values — run for every document, since panels are frequently
    // combined on one page and the classifier only decides the heading.
    const lab = parseLabValues(text, patient, id, confidence);
    const derivedAbs = resolvePercentages(lab, patient, id, confidence);
    const analytes = [...lab.analytes, ...derivedAbs];

    const micro: MicrobiologyReport[] = [];
    if (classification.modules.includes('microbiology')) {
      const m = parseMicrobiology(text);
      if (m) micro.push(m);
    }

    // An image that yielded no confident classification is still worth
    // offering to the waveform analyser: a photograph of a tracing may carry no
    // legible text whatsoever. The analyser refuses cleanly when there is no
    // millimetre grid, so a wasted attempt costs a second and misleads no one.
    const unclassifiedImage =
      !!raster &&
      !classification.modules.some((m) => m !== 'other') &&
      analytes.length === 0 &&
      micro.length === 0;

    const ecg: EcgData[] = [];
    if (classification.modules.includes('ecg') || unclassifiedImage) {
      const e = parseEcg(text) ?? {
        rateBpm: null, rhythm: '', axisDegrees: null, axisText: '',
        prMs: null, qrsMs: null, qtMs: null, qtcMs: null,
        statements: [], features: {}, leadDetail: '',
      };

      // Waveform signal analysis from the trace itself. This is independent of
      // anything printed on the report and works even when the printout
      // carries no measurements at all.
      if (raster) {
        onProgress({ fileName: file.name, stage: 'Digitising the ECG trace', progress: 0.85 });
        const outcome = await analyseEcgImage(raster.pixels, raster.width, raster.height, {
          sex: patient.sex === 'unspecified' ? 'unspecified' : patient.sex,
          age: patient.age,
          words: words.map((w) => ({ text: w.text, bbox: w.bbox, confidence: w.confidence })),
        });

        if (outcome.analysis) {
          const w = outcome.analysis;
          e.waveform = w;
          e.discrepancies = reconcile(w, {
            rateBpm: e.rateBpm, prMs: e.prMs, qrsMs: e.qrsMs,
            qtMs: e.qtMs, qtcMs: e.qtcMs, axisDegrees: e.axisDegrees,
          });
          // Signal-derived features join those read from the statements.
          for (const key of w.features) e.features[key] = true;
          if (!e.leadDetail) e.leadDetail = w.digitised.layout;
        } else if (outcome.error) {
          e.waveformError = outcome.error;
        }
      }

      // Only record an ECG if something was actually recovered. A speculative
      // attempt on an unclassified image must not leave an empty ECG behind
      // that makes the module look present when nothing was read.
      const meaningful =
        !!e.waveform ||
        e.rateBpm !== null || e.prMs !== null || e.qrsMs !== null ||
        e.statements.length > 0 || Object.keys(e.features).length > 0 ||
        (!unclassifiedImage && !!e.waveformError);
      if (meaningful) ecg.push(e);
      // A speculative attempt that failed is not an ECG, but the reason is
      // still worth showing on the document so the clinician is not left
      // wondering why nothing happened.
      else if (e.waveformError) document.error = `Waveform analysis was attempted and could not proceed: ${e.waveformError}`;
    }

    // Nothing recognised at all is worth telling the clinician about.
    if (!analytes.length && !lab.observations.length && !micro.length && !ecg.length) {
      document.status = 'done';
      document.error = 'Text was extracted but no recognised clinical values were found. Values can be added manually in the review step.';
    } else {
      document.status = 'done';
    }

    const detected = new Set<ModuleId>(classification.modules);
    if (micro.length) detected.add('microbiology');
    if (ecg.length) detected.add('ecg');
    document.detectedModules = [...detected];

    return {
      document,
      analytes,
      observations: lab.observations,
      micro,
      ecg,
      demographics: parseDemographics(text),
    };
  } catch (err) {
    document.status = 'error';
    document.error = err instanceof Error ? err.message : 'Unknown error during processing';
    return { document, analytes: [], observations: [], micro: [], ecg: [], demographics: {} };
  }
}
