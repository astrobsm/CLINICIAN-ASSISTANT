/**
 * QRS detection — Pan-Tompkins.
 *
 * Bandpass, differentiate, square, integrate, then apply the two adaptive
 * thresholds with a refractory period, T-wave discrimination and search-back
 * for missed beats. Coefficients are derived from the actual sampling rate
 * rather than hard-coded for 200 Hz, because the rate here depends on the scan
 * resolution.
 */
import { bandpass, derivative, movingAverage, square, median, extremum } from './dsp';
import type { Signal } from './dsp';

export interface QrsDetection {
  /** R peak indices in the source signal. */
  peaks: number[];
  /** Integration signal, retained for diagnostics. */
  integrated: Signal;
  threshold: number;
  /** Beats recovered by the search-back rule. */
  searchBackCount: number;
}

interface Candidate {
  index: number;
  value: number;
  slope: number;
}

function localMaxima(x: Signal, minDistance: number): Candidate[] {
  const out: Candidate[] = [];
  for (let i = 1; i < x.length - 1; i++) {
    if (x[i] > x[i - 1] && x[i] >= x[i + 1]) {
      const last = out[out.length - 1];
      if (last && i - last.index < minDistance) {
        if (x[i] > last.value) { last.index = i; last.value = x[i]; }
      } else {
        out.push({ index: i, value: x[i], slope: 0 });
      }
    }
  }
  return out;
}

export function detectQrs(signal: Signal, fs: number): QrsDetection {
  const n = signal.length;
  if (n < fs) return { peaks: [], integrated: new Float32Array(0), threshold: 0, searchBackCount: 0 };

  const band = bandpass(signal, 5, Math.min(15, fs / 2 - 2), fs);
  const diff = derivative(band, fs);
  const sq = square(diff);
  const integrated = movingAverage(sq, Math.round(0.15 * fs));

  const refractory = Math.round(0.2 * fs);
  const candidates = localMaxima(integrated, refractory);
  for (const c of candidates) {
    // Steepest slope in the 60 ms preceding the peak, used to tell a QRS from
    // a T wave of similar integrated amplitude.
    let s = 0;
    for (let i = Math.max(1, c.index - Math.round(0.06 * fs)); i <= c.index; i++) {
      s = Math.max(s, Math.abs(diff[i]));
    }
    c.slope = s;
  }
  if (!candidates.length) return { peaks: [], integrated, threshold: 0, searchBackCount: 0 };

  // Learning phase over the first two seconds.
  const learnEnd = Math.min(n, Math.round(2 * fs));
  let maxLearn = 0, sumLearn = 0;
  for (let i = 0; i < learnEnd; i++) { maxLearn = Math.max(maxLearn, integrated[i]); sumLearn += integrated[i]; }
  let spki = maxLearn * 0.25;
  let npki = (sumLearn / Math.max(1, learnEnd)) * 0.5;
  let threshold1 = npki + 0.25 * (spki - npki);
  let threshold2 = 0.5 * threshold1;

  const peaks: number[] = [];
  const rrHistory: number[] = [];
  let rrAverage = 0;
  let lastQrs = -Infinity;
  let lastSlope = 0;
  let searchBackCount = 0;

  const registerRr = (rr: number) => {
    rrHistory.push(rr);
    if (rrHistory.length > 8) rrHistory.shift();
    rrAverage = rrHistory.reduce((a, b) => a + b, 0) / rrHistory.length;
  };

  for (let ci = 0; ci < candidates.length; ci++) {
    const c = candidates[ci];

    if (c.value > threshold1) {
      const rr = c.index - lastQrs;

      // T-wave discrimination. The classical rule uses a fixed 360 ms window,
      // which fails at slow rates: at 48 per minute a T wave arrives around
      // 400 ms after the R and would be counted as a beat, doubling the
      // reported rate and making a regular rhythm look irregular. The window
      // therefore also scales with the running RR mean.
      const tWindow = Math.max(0.36 * fs, 0.55 * rrAverage);
      if (peaks.length && rr < tWindow && c.slope < 0.6 * lastSlope) {
        npki = 0.125 * c.value + 0.875 * npki;
      } else if (rr >= refractory) {
        peaks.push(c.index);
        if (Number.isFinite(rr)) registerRr(rr);
        spki = 0.125 * c.value + 0.875 * spki;
        lastQrs = c.index;
        lastSlope = c.slope;
      }
    } else {
      npki = 0.125 * c.value + 0.875 * npki;
    }

    threshold1 = npki + 0.25 * (spki - npki);
    threshold2 = 0.5 * threshold1;

    // Search-back: if the gap to the next accepted beat exceeds 166% of the
    // running mean, re-examine the interval at the lower threshold.
    const next = candidates[ci + 1];
    if (peaks.length >= 2 && rrAverage > 0 && next && next.index - lastQrs > 1.66 * rrAverage) {
      let best: Candidate | null = null;
      for (let j = ci; j < candidates.length; j++) {
        const cj = candidates[j];
        if (cj.index <= lastQrs + refractory) continue;
        if (cj.index >= next.index) break;
        if (cj.value > threshold2 && (!best || cj.value > best.value)) best = cj;
      }
      if (best) {
        peaks.push(best.index);
        registerRr(best.index - lastQrs);
        spki = 0.25 * best.value + 0.75 * spki;
        lastQrs = best.index;
        lastSlope = best.slope;
        searchBackCount++;
        threshold1 = npki + 0.25 * (spki - npki);
        threshold2 = 0.5 * threshold1;
      }
    }
  }

  peaks.sort((a, b) => a - b);
  return { peaks, integrated, threshold: threshold1, searchBackCount };
}

/**
 * Move each detection onto the true R peak of the clinical signal.
 *
 * The integration stage introduces a small delay and reports the centre of the
 * QRS energy rather than the peak, so each detection is snapped to the largest
 * absolute deflection within a 70 ms window.
 */
export function refinePeaks(peaks: number[], signal: Signal, fs: number): number[] {
  const half = Math.round(0.07 * fs);
  return peaks.map((p) => {
    const from = Math.max(0, p - half);
    const to = Math.min(signal.length, p + half);
    let bestIdx = p, bestVal = -Infinity;
    for (let i = from; i < to; i++) {
      const v = Math.abs(signal[i]);
      if (v > bestVal) { bestVal = v; bestIdx = i; }
    }
    return bestIdx;
  });
}

/**
 * Pacing spike detection.
 *
 * A pacing artefact lasts one to two milliseconds. Whether it can be seen at
 * all depends on the resolution of the scan: at 6 px/mm the paper resolves
 * about 150 samples per second, so a 2 ms impulse occupies less than a third of
 * a sample and is not recoverable. Detection is therefore attempted only when
 * the native resolution can actually support it, and the criteria are strict —
 * a very narrow, very steep excursion that returns to baseline immediately —
 * because a steep QRS upstroke otherwise triggers it on every beat.
 *
 * `nativeFs` is the sampling rate implied by the scan, not the rate the signal
 * was resampled to; upsampling cannot recover detail the paper never held.
 */
export function detectPacingSpikes(signal: Signal, fs: number, nativeFs: number): number[] {
  if (nativeFs < 250) return [];

  const d = derivative(signal, fs);
  const mags: number[] = [];
  for (let i = 0; i < d.length; i++) mags.push(Math.abs(d[i]));
  const med = median(mags);
  const cut = Math.max(med * 25, 120); // mV/s
  const maxWidth = Math.max(2, Math.round(0.006 * fs));
  const returnWindow = Math.round(0.012 * fs);

  const spikes: number[] = [];
  let i = 1;
  while (i < d.length - 1) {
    if (Math.abs(d[i]) <= cut) { i++; continue; }

    let j = i;
    while (j < d.length && Math.abs(d[j]) > cut * 0.4) j++;
    const width = j - i;

    if (width <= maxWidth) {
      const peak = extremum(signal, Math.max(0, i - 2), Math.min(signal.length, j + 2), Math.sign(d[i]) >= 0 ? 1 : -1);
      const before = signal[Math.max(0, i - 3)];
      const after = signal[Math.min(signal.length - 1, j + returnWindow)];
      const excursion = Math.abs(peak.value - before);
      const returned = Math.abs(after - before) < 0.3 * excursion;
      // A genuine impulse: large, narrow, and gone again within 12 ms.
      if (excursion > 0.4 && returned) spikes.push(peak.index);
    }
    i = j + 1;
  }
  return spikes;
}
