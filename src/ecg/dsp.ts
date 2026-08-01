/**
 * Signal-processing primitives for ECG analysis.
 *
 * Everything is sampling-rate agnostic — the recovered sampling rate depends on
 * the resolution of the scan, so fixed-coefficient filters designed for 200 Hz
 * (as in the original Pan-Tompkins paper) cannot be used. Biquads are derived
 * at run time from the actual rate and applied forward-and-backward for zero
 * phase distortion, which matters because a phase shift would move the
 * fiducial points the measurements depend on.
 */

export type Signal = Float32Array;

// ─────────────────────────────── Biquad ───────────────────────────────

export interface Biquad {
  b0: number; b1: number; b2: number;
  a1: number; a2: number;
}

export function lowpassBiquad(fc: number, fs: number, q = Math.SQRT1_2): Biquad {
  const w0 = (2 * Math.PI * Math.min(fc, fs / 2 - 1)) / fs;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  return {
    b0: ((1 - cos) / 2) / a0,
    b1: (1 - cos) / a0,
    b2: ((1 - cos) / 2) / a0,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha) / a0,
  };
}

export function highpassBiquad(fc: number, fs: number, q = Math.SQRT1_2): Biquad {
  const w0 = (2 * Math.PI * Math.max(fc, 0.01)) / fs;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  return {
    b0: ((1 + cos) / 2) / a0,
    b1: (-(1 + cos)) / a0,
    b2: ((1 + cos) / 2) / a0,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha) / a0,
  };
}

export function bandpassBiquad(fLow: number, fHigh: number, fs: number): Biquad {
  const f0 = Math.sqrt(fLow * fHigh);
  const bw = fHigh - fLow;
  const q = f0 / bw;
  const w0 = (2 * Math.PI * Math.min(f0, fs / 2 - 1)) / fs;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  return {
    b0: alpha / a0,
    b1: 0,
    b2: -alpha / a0,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha) / a0,
  };
}

function applyBiquad(x: Signal, f: Biquad, out: Signal): Signal {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let n = 0; n < x.length; n++) {
    const xn = x[n];
    const yn = f.b0 * xn + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    x2 = x1; x1 = xn;
    y2 = y1; y1 = yn;
    out[n] = yn;
  }
  return out;
}

function reverse(x: Signal): Signal {
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[x.length - 1 - i];
  return out;
}

/** Zero-phase filtering: forward then backward. */
export function filtfilt(x: Signal, f: Biquad): Signal {
  const a = applyBiquad(x, f, new Float32Array(x.length));
  const b = applyBiquad(reverse(a), f, new Float32Array(x.length));
  return reverse(b);
}

export const lowpass = (x: Signal, fc: number, fs: number): Signal => filtfilt(x, lowpassBiquad(fc, fs));
export const highpass = (x: Signal, fc: number, fs: number): Signal => filtfilt(x, highpassBiquad(fc, fs));
export const bandpass = (x: Signal, lo: number, hi: number, fs: number): Signal => filtfilt(x, bandpassBiquad(lo, hi, fs));

// ─────────────────────────── Baseline wander ───────────────────────────

/**
 * Median filter on a decimated copy, then linear interpolation back to full
 * rate. A median cascade is used rather than a high-pass filter because a
 * high-pass distorts the ST segment, and ST deviation is one of the
 * measurements that matters most here.
 */
export function estimateBaseline(x: Signal, fs: number): Signal {
  const win1 = Math.max(3, Math.round(0.2 * fs) | 1);
  const win2 = Math.max(3, Math.round(0.6 * fs) | 1);
  const decim = Math.max(1, Math.floor(fs / 50)); // ~50 Hz is ample for baseline

  const small = new Float32Array(Math.ceil(x.length / decim));
  for (let i = 0; i < small.length; i++) small[i] = x[Math.min(i * decim, x.length - 1)];

  const m1 = runningMedian(small, Math.max(3, Math.round(win1 / decim) | 1));
  const m2 = runningMedian(m1, Math.max(3, Math.round(win2 / decim) | 1));

  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const p = i / decim;
    const i0 = Math.min(Math.floor(p), m2.length - 1);
    const i1 = Math.min(i0 + 1, m2.length - 1);
    const frac = p - i0;
    out[i] = m2[i0] * (1 - frac) + m2[i1] * frac;
  }
  return out;
}

export function runningMedian(x: Signal, window: number): Signal {
  const w = Math.max(1, window | 1);
  const half = (w - 1) / 2;
  const out = new Float32Array(x.length);
  const buf = new Float32Array(w);
  for (let i = 0; i < x.length; i++) {
    let n = 0;
    for (let k = -half; k <= half; k++) {
      const j = i + k;
      if (j >= 0 && j < x.length) buf[n++] = x[j];
    }
    const slice = buf.subarray(0, n);
    const sorted = Float32Array.from(slice).sort();
    out[i] = sorted[n >> 1];
  }
  return out;
}

export function removeBaseline(x: Signal, fs: number): Signal {
  const base = estimateBaseline(x, fs);
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i] - base[i];
  return out;
}

// ─────────────────────────── Utility maths ───────────────────────────

export function derivative(x: Signal, fs: number): Signal {
  const out = new Float32Array(x.length);
  const k = fs / 8;
  for (let i = 2; i < x.length - 2; i++) {
    out[i] = k * (-x[i - 2] - 2 * x[i - 1] + 2 * x[i + 1] + x[i + 2]);
  }
  out[0] = out[1] = out[2];
  out[x.length - 1] = out[x.length - 2] = out[x.length - 3];
  return out;
}

export function square(x: Signal): Signal {
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i] * x[i];
  return out;
}

/** Moving-window integration, the final Pan-Tompkins stage. */
export function movingAverage(x: Signal, window: number): Signal {
  const w = Math.max(1, Math.round(window));
  const out = new Float32Array(x.length);
  let acc = 0;
  for (let i = 0; i < x.length; i++) {
    acc += x[i];
    if (i >= w) acc -= x[i - w];
    out[i] = acc / Math.min(i + 1, w);
  }
  // Compensate the group delay introduced by the causal window.
  const shift = Math.floor(w / 2);
  const shifted = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) shifted[i] = out[Math.min(i + shift, x.length - 1)];
  return shifted;
}

export function mean(x: ArrayLike<number>, from = 0, to = x.length): number {
  let s = 0, n = 0;
  for (let i = Math.max(0, from); i < Math.min(to, x.length); i++) { s += x[i]; n++; }
  return n ? s / n : 0;
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1));
}

export function maxAbs(x: Signal, from = 0, to = x.length): { value: number; index: number } {
  let best = 0, idx = Math.max(0, from);
  for (let i = Math.max(0, from); i < Math.min(to, x.length); i++) {
    const v = Math.abs(x[i]);
    if (v > best) { best = v; idx = i; }
  }
  return { value: best, index: idx };
}

export function extremum(x: Signal, from: number, to: number, sign: 1 | -1): { value: number; index: number } {
  let best = -Infinity, idx = Math.max(0, from);
  for (let i = Math.max(0, from); i < Math.min(to, x.length); i++) {
    const v = sign * x[i];
    if (v > best) { best = v; idx = i; }
  }
  return { value: x[idx], index: idx };
}

/** Root-mean-square across leads at each instant — the spatial magnitude. */
export function spatialMagnitude(leads: Signal[]): Signal {
  if (!leads.length) return new Float32Array(0);
  const n = Math.min(...leads.map((l) => l.length));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (const l of leads) s += l[i] * l[i];
    out[i] = Math.sqrt(s / leads.length);
  }
  return out;
}

/** Cubic Hermite resampling to a new rate. */
export function resample(x: Signal, fsIn: number, fsOut: number): Signal {
  if (Math.abs(fsIn - fsOut) < 0.01) return x;
  const ratio = fsIn / fsOut;
  const n = Math.max(2, Math.floor(x.length / ratio));
  const out = new Float32Array(n);
  const at = (i: number) => x[Math.min(Math.max(i, 0), x.length - 1)];
  for (let i = 0; i < n; i++) {
    const p = i * ratio;
    const i1 = Math.floor(p);
    const t = p - i1;
    const p0 = at(i1 - 1), p1 = at(i1), p2 = at(i1 + 1), p3 = at(i1 + 2);
    const a = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
    const b = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3;
    const c = -0.5 * p0 + 0.5 * p2;
    out[i] = ((a * t + b) * t + c) * t + p1;
  }
  return out;
}

/** Interpolate across gaps marked NaN; returns coverage fraction. */
export function fillGaps(x: Float32Array): number {
  const n = x.length;
  let filled = 0;
  let i = 0;
  while (i < n) {
    if (!Number.isNaN(x[i])) { filled++; i++; continue; }
    let j = i;
    while (j < n && Number.isNaN(x[j])) j++;
    const before = i > 0 ? x[i - 1] : (j < n ? x[j] : 0);
    const after = j < n ? x[j] : before;
    const span = j - i + 1;
    for (let k = i; k < j; k++) {
      const t = (k - i + 1) / span;
      x[k] = before * (1 - t) + after * t;
    }
    i = j;
  }
  return n ? filled / n : 0;
}

/** Residual high-frequency energy, used as a noise estimate. */
export function noiseEstimate(x: Signal, fs: number): number {
  const smooth = lowpass(x, Math.min(35, fs / 2 - 5), fs);
  let s = 0;
  for (let i = 0; i < x.length; i++) { const d = x[i] - smooth[i]; s += d * d; }
  return Math.sqrt(s / Math.max(1, x.length));
}
