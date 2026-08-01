/**
 * Wave delineation — locating the onset, peak and offset of P, QRS and T.
 *
 * Interval measurements are taken from the spatial magnitude of all available
 * leads rather than from any single lead, which is how recording equipment
 * derives global intervals: depolarisation begins at the earliest onset seen in
 * any lead and ends at the latest offset, so a single-lead measurement
 * systematically underestimates QRS duration and QT.
 *
 * The T wave offset uses the tangent method — the intersection of the steepest
 * descending tangent with the isoelectric line — which is the accepted manual
 * technique and behaves far better than a simple threshold on flat T waves.
 */
import { extremum, lowpass, median, derivative } from './dsp';
import type { Signal } from './dsp';
import type { Beat } from './types';

export interface DelineationInput {
  /** Spatial magnitude across leads, baseline removed. */
  magnitude: Signal;
  /** Lead used for P wave assessment — lead II when available. */
  pLead: Signal;
  /** Lead used for T wave assessment. */
  tLead: Signal;
  peaks: number[];
  fs: number;
}

const MIN_P_AMPLITUDE_MV = 0.04;

export function delineate(input: DelineationInput): Beat[] {
  const { magnitude, pLead, tLead, peaks, fs } = input;
  if (!peaks.length) return [];

  const magSmooth = lowpass(magnitude, Math.min(40, fs / 2 - 5), fs);
  const magDeriv = derivative(magSmooth, fs);
  const pSmooth = lowpass(pLead, Math.min(20, fs / 2 - 5), fs);
  const tSmooth = lowpass(tLead, Math.min(20, fs / 2 - 5), fs);
  const tDeriv = derivative(tSmooth, fs);

  // Baseline level of the magnitude signal: its median sits on the isoelectric
  // segments, which occupy most of the record.
  const magSorted = Float32Array.from(magSmooth).sort();
  const magFloor = magSorted[Math.floor(magSorted.length * 0.4)];

  const ms = (v: number) => Math.round((v * fs) / 1000);
  const beats: Beat[] = [];

  for (let i = 0; i < peaks.length; i++) {
    const r = peaks[i];
    const prev = i > 0 ? peaks[i - 1] : null;
    const next = i < peaks.length - 1 ? peaks[i + 1] : null;
    const rrSamples = prev !== null ? r - prev : next !== null ? next - r : Math.round(fs);
    const rrSec = prev !== null ? (r - prev) / fs : null;

    // ── QRS boundaries ────────────────────────────────────────────────
    //
    // Boundaries are taken from the rate of change of the spatial magnitude
    // rather than from its amplitude. An amplitude threshold fails exactly
    // when it matters most: with ST elevation the magnitude never returns to
    // baseline after the J point, so the search runs on into the T wave and
    // both the QRS duration and the ST measurement are corrupted. The slope,
    // by contrast, genuinely flattens at the J point whatever the ST level.
    const onsetLimit = Math.max(0, r - ms(130));
    const offsetLimit = Math.min(magSmooth.length - 1, r + ms(200));
    const hold = ms(10);

    // Each boundary is judged against the steepest slope of its own limb, not
    // against the steepest slope anywhere in the complex. The R upstroke
    // dominates the latter, so a global threshold is far too high for the
    // terminal limb and resolves the J point early — inside the S wave, where
    // the signal is still negative. That systematically attenuates every ST
    // measurement, which is the one thing this must not do.
    const limbPeak = (from: number, to: number): { slope: number; at: number } => {
      let slope = 0, at = from;
      for (let k = Math.max(0, from); k <= Math.min(to, magDeriv.length - 1); k++) {
        const v = Math.abs(magDeriv[k]);
        if (v > slope) { slope = v; at = k; }
      }
      return { slope, at };
    };

    const walk = (from: number, limit: number, dir: 1 | -1, cut: number): number => {
      for (let k = from; dir === 1 ? k <= limit : k >= limit; k += dir) {
        let stable = true;
        for (let h = 0; h < hold; h++) {
          const j = k + dir * h;
          if (j < 0 || j >= magDeriv.length) break;
          if (Math.abs(magDeriv[j]) > cut) { stable = false; break; }
        }
        if (stable) return k;
      }
      return limit;
    };

    const upstroke = limbPeak(onsetLimit, r);
    const terminal = limbPeak(r, offsetLimit);

    // A low fraction is deliberate. The initial and terminal deflections of a
    // complex are shallower than its steepest limb — a septal q or a slurred
    // S returns to baseline gradually — so a higher threshold clips the
    // complex at both ends and under-reports QRS duration by tens of
    // milliseconds, which is the difference between calling a bundle branch
    // block and missing it.
    const guard = ms(8);
    const onset = walk(Math.max(onsetLimit, upstroke.at - guard), onsetLimit, -1, 0.08 * upstroke.slope);
    const offset = walk(Math.min(offsetLimit, terminal.at + guard), offsetLimit, 1, 0.08 * terminal.slope);

    const qrsMs = ((offset - onset) / fs) * 1000;

    // ── T wave ────────────────────────────────────────────────────────
    let tPeak: number | null = null;
    let tOffset: number | null = null;
    const tStart = Math.min(offset + ms(40), tSmooth.length - 1);
    const rrCap = Math.min(0.65 * rrSamples, ms(560));
    let tEndSearch = Math.min(offset + Math.round(rrCap), tSmooth.length - 1);
    if (next !== null) tEndSearch = Math.min(tEndSearch, next - ms(60));

    if (tEndSearch - tStart > ms(50)) {
      const cand = extremumAbs(tSmooth, tStart, tEndSearch);
      if (Math.abs(cand.value) > 0.03) {
        tPeak = cand.index;
        // Tangent method: steepest slope returning towards the baseline.
        const sign = Math.sign(cand.value) || 1;
        let steepIdx = tPeak;
        let steepVal = 0;
        for (let k = tPeak; k < tEndSearch; k++) {
          const d = -sign * tDeriv[k]; // returning to baseline
          if (d > steepVal) { steepVal = d; steepIdx = k; }
        }
        if (steepVal > 1e-6) {
          const slopePerSample = (sign * -steepVal) / fs;
          const intersect = steepIdx + (0 - tSmooth[steepIdx]) / slopePerSample;
          tOffset = Math.round(Math.max(tPeak + 1, Math.min(intersect, tEndSearch)));
        } else {
          tOffset = tEndSearch;
        }
      }
    }

    // ── P wave ────────────────────────────────────────────────────────
    let pPeak: number | null = null;
    let pOnset: number | null = null;
    let pOffset: number | null = null;
    const pSearchEnd = Math.max(0, onset - ms(20));
    // Wide enough to contain a P wave at a PR interval of 320 ms, which marked
    // first degree block reaches.
    let pSearchStart = Math.max(0, onset - ms(360));
    if (prev !== null) {
      const prevBeat = beats[beats.length - 1];
      if (prevBeat?.tOffset != null) {
        // Keep clear of the previous T wave, but never let that shrink the
        // window below 120 ms: with tall T waves at a fast rate the T offset
        // can fall beyond the P wave, and the search would then land on the
        // T tail and report an implausibly short PR interval.
        const floor = Math.min(prevBeat.tOffset + ms(10), pSearchEnd - ms(120));
        pSearchStart = Math.max(pSearchStart, floor);
      }
    }

    if (pSearchEnd - pSearchStart > ms(40)) {
      const cand = extremumAbs(pSmooth, pSearchStart, pSearchEnd);
      if (Math.abs(cand.value) >= MIN_P_AMPLITUDE_MV) {
        pPeak = cand.index;
        const sign = Math.sign(cand.value) || 1;
        const cut = 0.2 * Math.abs(cand.value);
        pOnset = pPeak;
        for (let k = pPeak; k >= pSearchStart; k--) {
          if (sign * pSmooth[k] < cut) { pOnset = k; break; }
          pOnset = k;
        }
        pOffset = pPeak;
        for (let k = pPeak; k <= pSearchEnd; k++) {
          if (sign * pSmooth[k] < cut) { pOffset = k; break; }
          pOffset = k;
        }
      }
    }

    beats.push({
      rIndex: r,
      qrsOnset: onset,
      qrsOffset: offset,
      pPeak, pOnset, pOffset,
      tPeak, tOffset,
      rrSec,
      broad: qrsMs >= 120,
      paced: false,
    });
  }

  return beats;
}

function extremumAbs(x: Signal, from: number, to: number): { value: number; index: number } {
  let bestIdx = Math.max(0, from);
  let bestVal = 0;
  for (let i = Math.max(0, from); i < Math.min(to, x.length); i++) {
    if (Math.abs(x[i]) > Math.abs(bestVal)) { bestVal = x[i]; bestIdx = i; }
  }
  return { value: bestVal, index: bestIdx };
}

/**
 * Representative values across beats.
 *
 * The median is used rather than the mean throughout: a single mis-delineated
 * beat, or one ectopic, should not move a reported interval.
 */
export function summariseBeats(beats: Beat[], fs: number) {
  const toMs = (samples: number) => (samples / fs) * 1000;

  const qrs = beats.map((b) => toMs(b.qrsOffset - b.qrsOnset)).filter((v) => v > 30 && v < 260);
  const pr = beats
    .filter((b) => b.pOnset !== null)
    .map((b) => toMs(b.qrsOnset - (b.pOnset as number)))
    .filter((v) => v > 60 && v < 500);
  const qt = beats
    .filter((b) => b.tOffset !== null)
    .map((b) => toMs((b.tOffset as number) - b.qrsOnset))
    .filter((v) => v > 200 && v < 800);
  const rr = beats.map((b) => b.rrSec).filter((v): v is number => v !== null && v > 0.2 && v < 3);

  return {
    qrsMs: qrs.length ? median(qrs) : null,
    prMs: pr.length >= Math.max(2, beats.length * 0.4) ? median(pr) : null,
    qtMs: qt.length ? median(qt) : null,
    rrSec: rr.length ? median(rr) : null,
    rrValues: rr,
    prValues: pr,
    qrsValues: qrs,
    pCount: beats.filter((b) => b.pPeak !== null).length,
  };
}

/** Isoelectric reference for a beat: the PR segment immediately before the QRS. */
export function isoelectric(signal: Signal, beat: Beat, fs: number): number {
  const end = Math.max(0, beat.qrsOnset - Math.round(0.008 * fs));
  const start = Math.max(0, end - Math.round(0.03 * fs));
  if (end - start < 2) return 0;
  const values: number[] = [];
  for (let i = start; i < end; i++) values.push(signal[i]);
  return median(values);
}

export { extremum };
