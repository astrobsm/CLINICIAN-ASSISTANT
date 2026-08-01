/**
 * Offline OCR engine.
 *
 * Tesseract runs entirely in a local WebAssembly worker. The worker script,
 * WASM core and English language data are all served from the application's own
 * /ocr/ directory (staged by scripts/setup-ocr-assets.mjs), so recognition
 * involves no network request whatsoever and no image ever leaves the device.
 */
import { createWorker, PSM, type Worker } from 'tesseract.js';
import { preprocessToCanvas } from './preprocess';

export interface OcrProgress {
  stage: string;
  progress: number;
}

const ASSET_BASE = new URL('ocr/', document.baseURI).href;

let workerPromise: Promise<Worker> | null = null;
let progressSink: ((p: OcrProgress) => void) | null = null;

/** Characters that appear in laboratory reports; restricting the set reduces misreads. */
// Retained for reference; not applied — see the note where parameters are set.
const LAB_CHARSET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789' +
  '.,:;()[]{}<>/\\-+*%^#&\'"|=_ \n\t';

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, {
      workerPath: `${ASSET_BASE}worker.min.js`,
      corePath: ASSET_BASE,
      langPath: ASSET_BASE,
      // The language file is staged uncompressed so that a server sending
      // `Content-Encoding: gzip` for a .gz asset cannot cause a double-decompress
      // failure. See scripts/setup-ocr-assets.mjs.
      gzip: false,
      logger: (m: { status?: string; progress?: number }) => {
        if (progressSink && typeof m.progress === 'number') {
          progressSink({ stage: m.status ?? 'working', progress: m.progress });
        }
      },
    }).then(async (w) => {
      // No character whitelist: it constrains the LSTM decoder and measurably
      // degrades recognition on printed reports. Implausible readings are
      // rejected downstream by the per-analyte plausibility guards instead.
      await w.setParameters({
        preserve_interword_spaces: '1',
        tessedit_pageseg_mode: PSM.AUTO,
      });
      return w;
    });
  }
  return workerPromise;
}

export interface OcrWordBox {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  confidence: number;
}

export interface OcrResult {
  text: string;
  confidence: number;
  /**
   * Recognised words with their pixel bounding boxes, in the coordinate space
   * of the canvas that was recognised. Used to locate ECG lead labels, which
   * is the most reliable way to assign panels to leads.
   */
  words: OcrWordBox[];
}

/** Flatten the nested block/paragraph/line/word structure Tesseract returns. */
function collectWords(data: unknown): OcrWordBox[] {
  const out: OcrWordBox[] = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    if (typeof n.text === 'string' && n.bbox && typeof n.confidence === 'number' && !n.words && !n.lines) {
      const b = n.bbox as Record<string, number>;
      if (typeof b.x0 === 'number') {
        out.push({
          text: n.text,
          bbox: { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 },
          confidence: n.confidence,
        });
      }
    }
    for (const key of ['blocks', 'paragraphs', 'lines', 'words']) {
      const child = n[key];
      if (Array.isArray(child)) for (const c of child) visit(c);
    }
  };
  visit(data);
  return out;
}

/**
 * Recognise a single page. `source` may be a Blob, a canvas or an image element.
 * Two passes are attempted where confidence is poor: the default page
 * segmentation, then a single-block mode which suits dense tabular reports.
 */
export interface RecogniseOptions {
  /**
   * Page segmentation modes to try. More than one is worth the time on a
   * printed results table, where automatic segmentation often returns a
   * fraction of the page; a single pass is right for an image whose content
   * is already known, such as an extracted ECG trace, where extra passes only
   * invent text from the waveform.
   */
  modes?: PSM[];
}

/** Run several segmentation passes and return them all, richest first. */
export async function recognisePasses(
  source: Blob | HTMLCanvasElement | HTMLImageElement,
  onProgress?: (p: OcrProgress) => void,
  modes: PSM[] = [PSM.AUTO, PSM.SINGLE_BLOCK, PSM.SPARSE_TEXT],
): Promise<OcrResult[]> {
  progressSink = onProgress ?? null;
  try {
    const worker = await getWorker();
    const input = await toCanvas(source);
    const output = { text: true, blocks: true } as const;
    const results: OcrResult[] = [];

    for (const mode of modes) {
      await worker.setParameters({ tessedit_pageseg_mode: mode });
      const res = await worker.recognize(input, undefined, output);
      results.push({
        text: res.data.text ?? '',
        confidence: (res.data.confidence ?? 0) / 100,
        words: collectWords(res.data),
      });
    }
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });

    return results.sort((a, b) => textYield(b) - textYield(a));
  } finally {
    progressSink = null;
  }
}

/**
 * A rough measure of how much usable data a pass produced.
 *
 * Deliberately not the engine's own confidence, which is the mean over the
 * words it did recognise: a pass that reads one row of a table and abandons
 * the rest reports near-perfect confidence on almost nothing. Pairs of a word
 * followed by a number are counted, because that is the shape of a result row.
 */
function textYield(r: OcrResult): number {
  const pairs = (r.text.match(/[A-Za-z]{3,}[^\n\d]{0,24}\d/g) ?? []).length;
  const numbers = (r.text.match(/\d+(?:[.,]\d+)?/g) ?? []).length;
  const words = (r.text.match(/[A-Za-z]{3,}/g) ?? []).length;
  return pairs * 4 + numbers + words * 0.5 + r.confidence * 3;
}

async function toCanvas(
  source: Blob | HTMLCanvasElement | HTMLImageElement,
): Promise<HTMLCanvasElement> {
  if (source instanceof HTMLCanvasElement) return source;
  if (source instanceof Blob) {
    const url = URL.createObjectURL(source);
    try {
      const img = new Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error('Unable to decode image'));
        img.src = url;
      });
      return preprocessToCanvas(img);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return preprocessToCanvas(source);
}

export async function recognisePage(
  source: Blob | HTMLCanvasElement | HTMLImageElement,
  onProgress?: (p: OcrProgress) => void,
  options: RecogniseOptions = {},
): Promise<OcrResult> {
  const modes = options.modes ?? [PSM.AUTO, PSM.SINGLE_BLOCK, PSM.SPARSE_TEXT];
  const passes = await recognisePasses(source, onProgress, modes);
  return passes[0] ?? { text: '', confidence: 0, words: [] };
}

/** Release the worker — called when the session is cleared. */
export async function terminateOcr(): Promise<void> {
  if (!workerPromise) return;
  try {
    const w = await workerPromise;
    await w.terminate();
  } catch {
    /* already gone */
  } finally {
    workerPromise = null;
  }
}

/**
 * True when the language data has been staged locally. Probes a small manifest
 * written by the setup script rather than the multi-megabyte language file, so
 * answering "is OCR available?" costs a few bytes.
 */
export async function ocrAssetsAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${ASSET_BASE}manifest.json`, { cache: 'no-store' });
    if (!res.ok) return false;
    const m = (await res.json()) as { file?: string };
    return typeof m.file === 'string' && m.file.length > 0;
  } catch {
    return false;
  }
}
