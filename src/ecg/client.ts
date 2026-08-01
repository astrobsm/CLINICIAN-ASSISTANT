/**
 * Main-thread client for the waveform analysis worker.
 *
 * Falls back to running in-thread if workers are unavailable, so the feature
 * degrades in capability (responsiveness) rather than disappearing.
 */
import type { OcrWord } from './layout';
import type { WaveformOptions } from './analyseWaveform';
import type { QualityReport, WaveformAnalysis } from './types';
import type { WaveformRequest, WaveformResponse } from './worker';

export interface WaveformOutcome {
  analysis: WaveformAnalysis | null;
  error: string | null;
  quality: QualityReport | null;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (r: WaveformResponse) => void>();

function getWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === 'undefined') return null;
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<WaveformResponse>) => {
      const resolve = pending.get(e.data.id);
      if (resolve) { pending.delete(e.data.id); resolve(e.data); }
    };
    worker.onerror = () => {
      for (const [id, resolve] of pending) {
        resolve({ id, ok: false, message: 'The waveform analysis worker failed to start.', quality: null });
      }
      pending.clear();
      worker?.terminate();
      worker = null;
    };
    return worker;
  } catch {
    return null;
  }
}

export async function analyseEcgImage(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  options: WaveformOptions & { words?: OcrWord[] },
): Promise<WaveformOutcome> {
  const w = getWorker();

  if (!w) {
    // No worker available: run in-thread rather than losing the capability.
    const { analyseWaveform, WaveformError } = await import('./analyseWaveform');
    try {
      return { analysis: analyseWaveform(pixels, width, height, options), error: null, quality: null };
    } catch (err) {
      return {
        analysis: null,
        error: err instanceof Error ? err.message : 'Waveform analysis failed',
        quality: err instanceof WaveformError ? err.quality : null,
      };
    }
  }

  const id = nextId++;
  // Copy before transferring so the caller's buffer stays usable.
  const buffer = pixels.slice().buffer;
  const request: WaveformRequest = { id, pixels: buffer, width, height, options };

  const response = await new Promise<WaveformResponse>((resolve) => {
    pending.set(id, resolve);
    w.postMessage(request, [buffer]);
  });

  return response.ok
    ? { analysis: response.analysis, error: null, quality: response.analysis.quality }
    : { analysis: null, error: response.message, quality: response.quality };
}

export function terminateWaveformWorker(): void {
  worker?.terminate();
  worker = null;
  pending.clear();
}
