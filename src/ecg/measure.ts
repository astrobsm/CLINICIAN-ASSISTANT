/**
 * Measurement from delineated beats.
 *
 * An important subtlety of paper ECGs: in a 4 × 3 layout the twelve leads are
 * not simultaneous. Only the leads within one column share a time window, so
 * amplitude and ST comparisons are made within a column group and interval
 * measurements are pooled across groups. Treating all twelve panels as
 * simultaneous would produce meaningless vector measurements.
 */
import { median } from './dsp';
import type { Signal } from './dsp';
import { isoelectric } from './delineate';
import type { Beat, LeadAmplitudes, LeadName, StMeasurement } from './types';

export interface LeadGroup {
  startSec: number;
  /** Baseline-corrected signals, used for detection and delineation. */
  leads: Map<LeadName, Signal>;
  /** Minimally-processed signals, used for ST and amplitude measurement. */
  leadsRaw: Map<LeadName, Signal>;
  magnitude: Signal;
  beats: Beat[];
}

const msToSamples = (ms: number, fs: number) => Math.round((ms * fs) / 1000);

// ─────────────────────────────── Amplitudes ───────────────────────────────

/**
 * Label the deflections of a complex in order, following standard
 * nomenclature: an initial negative deflection is Q, the first positive is R,
 * the negative that follows R is S, and a further positive is R′.
 *
 * Taking the deepest negative as Q whenever it happens to precede the largest
 * positive gets V1 badly wrong — its rS complex would be recorded as having no
 * S wave at all, which silently removes the S(V1) term from the Sokolow-Lyon
 * index and suppresses the hypertrophy criteria entirely.
 */
function amplitudesForBeat(signal: Signal, beat: Beat, fs: number): {
  q: number; r: number; s: number; rPrime: number; qDurMs: number; t: number; p: number; ptp: number;
} {
  const iso = isoelectric(signal, beat, fs);
  const from = beat.qrsOnset;
  const to = Math.min(beat.qrsOffset, signal.length - 1);

  let minVal = Infinity, maxVal = -Infinity;
  for (let i = from; i <= to; i++) {
    const v = signal[i] - iso;
    if (v > maxVal) maxVal = v;
    if (v < minVal) minVal = v;
  }
  const scale = Math.max(Math.abs(maxVal), Math.abs(minVal));
  const noiseFloor = Math.max(0.04, scale * 0.06);

  // Segment the complex into runs of consistent polarity, discarding
  // excursions too small to be named deflections.
  interface Deflection { sign: 1 | -1; peak: number; from: number; to: number }
  const deflections: Deflection[] = [];
  let current: Deflection | null = null;
  for (let i = from; i <= to; i++) {
    const v = signal[i] - iso;
    const sign: 1 | -1 = v >= 0 ? 1 : -1;
    if (!current || current.sign !== sign) {
      if (current && Math.abs(current.peak) >= noiseFloor) deflections.push(current);
      current = { sign, peak: v, from: i, to: i };
    } else {
      if (Math.abs(v) > Math.abs(current.peak)) current.peak = v;
      current.to = i;
    }
  }
  if (current && Math.abs(current.peak) >= noiseFloor) deflections.push(current);

  let q = 0, r = 0, s = 0, rPrime = 0, qDurMs = 0;
  let seenR = false;

  for (const [index, d] of deflections.entries()) {
    if (d.sign === -1) {
      // Q is strictly an initial negative deflection — that is what the
      // pathological Q criteria are defined on.
      if (!seenR && index === 0) {
        q = Math.abs(d.peak);
        qDurMs = ((d.to - d.from + 1) / fs) * 1000;
      }
      // S records the deepest negative deflection wherever it falls. Voltage
      // indices such as Sokolow-Lyon mean the depth of the downward
      // deflection, not its position in the naming sequence; on a digitised
      // trace the small initial r of V1 is often lost, and insisting on strict
      // sequence would then report no S wave at all in the very lead the
      // index depends on.
      if (Math.abs(d.peak) > s) s = Math.abs(d.peak);
    } else {
      if (!seenR) { r = d.peak; seenR = true; }
      else if (d.peak > rPrime) rPrime = d.peak;
    }
  }

  if (rPrime < 0.05) rPrime = 0;

  const t = beat.tPeak !== null ? signal[beat.tPeak] - iso : 0;
  const p = beat.pPeak !== null ? signal[beat.pPeak] - iso : 0;

  return { q, r: Math.max(0, r), s, rPrime, qDurMs, t, p, ptp: maxVal - minVal };
}

export function measureAmplitudes(lead: LeadName, signal: Signal, beats: Beat[], fs: number): LeadAmplitudes {
  const per = beats.map((b) => amplitudesForBeat(signal, b, fs));
  const pick = (f: (x: (typeof per)[number]) => number) => (per.length ? median(per.map(f)) : 0);
  const r = pick((x) => x.r);
  const s = pick((x) => x.s);
  return {
    lead,
    qMv: pick((x) => x.q),
    rMv: r,
    sMv: s,
    rPrimeMv: pick((x) => x.rPrime),
    qDurationMs: pick((x) => x.qDurMs),
    qrsAmplitudeMv: pick((x) => x.ptp),
    tMv: pick((x) => x.t),
    pMv: pick((x) => x.p),
    rsRatio: s > 0.02 ? r / s : r > 0.02 ? 99 : 0,
  };
}

// ─────────────────────────────── ST segment ───────────────────────────────

export function measureSt(lead: LeadName, signal: Signal, beats: Beat[], fs: number): StMeasurement {
  const j60 = msToSamples(60, fs);
  const j80 = msToSamples(80, fs);

  const jVals: number[] = [];
  const j60Vals: number[] = [];
  const j80Vals: number[] = [];

  for (const b of beats) {
    const iso = isoelectric(signal, b, fs);
    const j = Math.min(b.qrsOffset, signal.length - 1);
    jVals.push(signal[j] - iso);
    if (j + j60 < signal.length) j60Vals.push(signal[j + j60] - iso);
    if (j + j80 < signal.length) j80Vals.push(signal[j + j80] - iso);
  }

  const jMv = jVals.length ? median(jVals) : 0;
  const j60Mv = j60Vals.length ? median(j60Vals) : jMv;
  const j80Mv = j80Vals.length ? median(j80Vals) : j60Mv;

  const delta = j80Mv - jMv;
  const slope: StMeasurement['slope'] =
    delta > 0.05 ? 'upsloping' : delta < -0.05 ? 'downsloping' : 'horizontal';

  return { lead, jMv, j60Mv, slope };
}

// ─────────────────────────────── Axis ───────────────────────────────

/** Net QRS area for one beat, in millivolt-seconds. */
function netQrsArea(signal: Signal, beat: Beat, fs: number): number {
  const iso = isoelectric(signal, beat, fs);
  let area = 0;
  for (let i = beat.qrsOnset; i <= Math.min(beat.qrsOffset, signal.length - 1); i++) {
    area += signal[i] - iso;
  }
  return area / fs;
}

function netPArea(signal: Signal, beat: Beat, fs: number): number | null {
  if (beat.pOnset === null || beat.pOffset === null) return null;
  const iso = isoelectric(signal, beat, fs);
  let area = 0;
  for (let i = beat.pOnset; i <= Math.min(beat.pOffset, signal.length - 1); i++) {
    area += signal[i] - iso;
  }
  return area / fs;
}

/**
 * Frontal plane axis from the net QRS areas in leads I and aVF.
 *
 * Area is used rather than peak amplitude because it reflects the whole
 * depolarisation vector, which is what the axis represents, and is far less
 * sensitive to a single sharp deflection.
 */
export function computeAxis(
  groups: LeadGroup[],
  fs: number,
  which: 'qrs' | 'p' = 'qrs',
): number | null {
  // One angle per lead group. Groups reconstruct the frontal plane from
  // different lead pairs, so their raw areas are not on a common scale and
  // must not be pooled before the angle is taken.
  //
  // Groups holding leads I and II are used in preference to those holding only
  // the augmented leads: aVL is near-isoelectric over much of the normal axis
  // range, so an estimate resting on it is dominated by measurement noise.
  const primary: number[] = [];
  const fallback: number[] = [];

  for (const g of groups) {
    const areas: { i: number; avf: number }[] = [];
    let derivedFromAugmented = false;
    // On a 4 × 3 printout, I and aVF sit in different columns and were never
    // recorded together, so aVF is reconstructed from the simultaneous limb
    // leads in this group rather than read from its own panel.
    const area = (s: Signal | undefined, b: Beat): number | null => {
      if (!s) return null;
      return which === 'qrs' ? netQrsArea(s, b, fs) : netPArea(s, b, fs);
    };

    // Areas are taken from the minimally-processed signals so that baseline
    // correction cannot bias one lead's net deflection relative to another's,
    // which would rotate the computed axis.
    const src = g.leadsRaw.size ? g.leadsRaw : g.leads;
    const leadI = src.get('I');
    const leadII = src.get('II');
    const leadIII = src.get('III');
    const leadAvf = src.get('aVF');
    const leadAvl = src.get('aVL');

    for (const b of g.beats) {
      const aI = area(leadI, b);
      const aII = area(leadII, b);
      const aIII = area(leadIII, b);
      const aAvf = area(leadAvf, b);
      const aAvl = area(leadAvl, b);

      let i: number | null = aI;
      let f: number | null = aAvf;

      if (i !== null && aII !== null) f = aII - i / 2;
      else if (i !== null && aIII !== null) f = (i + 2 * aIII) / 2;
      else if (aII !== null && aIII !== null) { i = aII - aIII; f = aII - i / 2; }
      // aVL + aVF/2 evaluates to three quarters of lead I, not lead I itself;
      // omitting that factor rotates the axis by roughly ten degrees.
      else if (aAvf !== null && aAvl !== null) {
        i = (aAvl + aAvf / 2) / 0.75;
        f = aAvf;
        derivedFromAugmented = true;
      }

      if (i === null || f === null) continue;
      areas.push({ i, avf: f });
    }

    if (!areas.length) continue;
    const mi = median(areas.map((a) => a.i));
    const mf = median(areas.map((a) => a.avf));
    if (Math.abs(mi) < 1e-5 && Math.abs(mf) < 1e-5) continue;
    const angle = (Math.atan2(mf, mi) * 180) / Math.PI;
    (derivedFromAugmented ? fallback : primary).push(angle);
  }

  const angles = primary.length ? primary : fallback;
  if (!angles.length) return null;
  return Math.round(circularMedianDeg(angles));
}

/** Median of angles, taken through the unit circle so ±180° does not average to 0°. */
function circularMedianDeg(angles: number[]): number {
  if (angles.length === 1) return angles[0];
  const reference = angles[0];
  const unwrapped = angles.map((a) => {
    let d = a - reference;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return reference + d;
  });
  let m = median(unwrapped);
  while (m > 180) m -= 360;
  while (m <= -180) m += 360;
  return m;
}

export function describeAxis(deg: number): string {
  if (deg >= -30 && deg <= 90) return 'Normal axis';
  if (deg > 90 && deg <= 180) return 'Right axis deviation';
  if (deg < -30 && deg >= -90) return 'Left axis deviation';
  return 'Extreme axis deviation';
}

// ─────────────────────────────── Corrected QT ───────────────────────────────

export function qtcBazett(qtMs: number, rrSec: number): number {
  return Math.round(qtMs / Math.sqrt(rrSec));
}

export function qtcFridericia(qtMs: number, rrSec: number): number {
  return Math.round(qtMs / Math.cbrt(rrSec));
}

// ─────────────────────────── Territory helpers ───────────────────────────

export function stInTerritory(
  st: StMeasurement[],
  leads: LeadName[],
  predicate: (m: StMeasurement) => boolean,
): LeadName[] {
  return st.filter((m) => leads.includes(m.lead) && predicate(m)).map((m) => m.lead);
}

/** Two leads are contiguous when they sit next to each other in a territory. */
export function hasContiguous(hits: LeadName[], territory: LeadName[]): boolean {
  const idx = hits
    .map((h) => territory.indexOf(h))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);
  if (idx.length >= 2) {
    for (let i = 1; i < idx.length; i++) if (idx[i] - idx[i - 1] === 1) return true;
    // Limb territories are not linearly ordered on the page; any two count.
    if (territory.length <= 3 && idx.length >= 2) return true;
  }
  return false;
}
