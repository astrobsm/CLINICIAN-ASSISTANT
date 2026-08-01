/// <reference lib="webworker" />
/**
 * Waveform analysis worker.
 *
 * Digitisation and signal analysis take one to two seconds on a typical
 * printout, which would visibly freeze the interface if run on the main
 * thread. The pixel buffer is transferred rather than copied.
 */
import { analyseWaveform, WaveformError } from './analyseWaveform';
import type { WaveformOptions } from './analyseWaveform';
import type { OcrWord } from './layout';
import type { WaveformAnalysis } from './types';

export interface WaveformRequest {
  id: number;
  pixels: ArrayBuffer;
  width: number;
  height: number;
  options: WaveformOptions & { words?: OcrWord[] };
}

export type WaveformResponse =
  | { id: number; ok: true; analysis: WaveformAnalysis }
  | { id: number; ok: false; message: string; quality: WaveformAnalysis['quality'] | null };

self.onmessage = (event: MessageEvent<WaveformRequest>) => {
  const { id, pixels, width, height, options } = event.data;
  try {
    const analysis = analyseWaveform(new Uint8ClampedArray(pixels), width, height, options);
    const response: WaveformResponse = { id, ok: true, analysis };
    self.postMessage(response);
  } catch (err) {
    const response: WaveformResponse = {
      id,
      ok: false,
      message: err instanceof Error ? err.message : 'Waveform analysis failed',
      quality: err instanceof WaveformError ? err.quality : null,
    };
    self.postMessage(response);
  }
};
