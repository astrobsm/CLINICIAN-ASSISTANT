/**
 * Trace extraction — converting inked pixels into a millivolt signal.
 *
 * For each column of a lead panel the inked run is located and its midpoint
 * taken. Midpoint is the right choice because tall runs occur on the steep
 * limbs of a complex, where the true curve genuinely spans that range, while at
 * peaks and troughs — the points amplitudes are measured from — the curve is
 * flat and the run is short. Continuity tracking prevents the extractor from
 * jumping onto a neighbouring lead's trace where panels bleed into each other.
 */
import { fillGaps, noiseEstimate, resample } from './dsp';
import type { Masks } from './grid';
import type { Panel } from './layout';
import type { LeadSignal, PanelBounds } from './types';

export const TARGET_FS = 500;

interface Run {
  top: number;
  bottom: number;
  mid: number;
}

function runsInColumn(masks: Masks, x: number, y0: number, y1: number): Run[] {
  const { trace, width, height } = masks;
  const runs: Run[] = [];
  let start = -1;
  const yEnd = Math.min(y1, height);
  for (let y = Math.max(0, y0); y <= yEnd; y++) {
    const inked = y < yEnd && trace[y * width + x] === 1;
    if (inked && start < 0) start = y;
    if (!inked && start >= 0) {
      runs.push({ top: start, bottom: y - 1, mid: (start + y - 1) / 2 });
      start = -1;
    }
  }
  return runs;
}

/**
 * Locate the calibration pulse at the start of a panel.
 *
 * The pulse is distinguished from a tall QRS complex by its flat top: a square
 * wave holds the same apex across several millimetres, whereas an R wave comes
 * to a point. Without that test the first complex of a lead is regularly
 * mistaken for a calibration pulse.
 *
 * The region is reported for blanking, never for trimming: shortening the
 * array would move this lead's time origin relative to the other leads in the
 * same column, and those leads share a set of beat indices.
 */
function findCalibrationPulse(
  masks: Masks,
  bounds: PanelBounds,
  pxPerMm: number,
): { fromPx: number; toPx: number; heightMm: number } | null {
  const limit = Math.min(bounds.x1, bounds.x0 + Math.round(pxPerMm * 20));
  const panelHeight = bounds.y1 - bounds.y0;

  // The threshold sits below half gain (5 mm/mV); missing a half-gain pulse
  // would halve every amplitude and silently suppress the voltage criteria.
  const minPulsePx = Math.min(pxPerMm * 3.5, panelHeight * 0.45);

  // Measure the tallest single run in the column, not the distance from the
  // first ink to the last. A neighbouring row's trace can intrude into this
  // panel's rectangle, and spanning across it would inflate the apparent pulse
  // height and corrupt the gain that every amplitude is scaled by.
  const columns: { x: number; top: number; span: number }[] = [];
  let started = false;
  for (let x = bounds.x0; x < limit; x++) {
    const runs = runsInColumn(masks, x, bounds.y0, bounds.y1);
    if (!runs.length) { if (started) break; continue; }
    let tallest = runs[0];
    for (const rr of runs) if (rr.bottom - rr.top > tallest.bottom - tallest.top) tallest = rr;
    const span = tallest.bottom - tallest.top + 1;
    const top = tallest.top;
    if (span > minPulsePx) { started = true; columns.push({ x, top, span }); }
    else if (started && columns.length && x - columns[columns.length - 1].x > pxPerMm * 1.5) break;
    else if (started) columns.push({ x, top, span });
  }

  const tall = columns.filter((c) => c.span > minPulsePx);
  if (tall.length < 2) return null;

  const fromPx = tall[0].x;
  const toPx = tall[tall.length - 1].x;
  const widthMm = (toPx - fromPx + 1) / pxPerMm;
  const startMm = (fromPx - bounds.x0) / pxPerMm;
  if (widthMm < 1.5 || widthMm > 10 || startMm > 8) return null;

  // Flat top: the apex must hold within 1.5 mm across at least 2 mm of width.
  const apex = Math.min(...columns.map((c) => c.top));
  const tolerance = pxPerMm * 1.5;
  const plateau = columns.filter((c) => c.top - apex <= tolerance).length;
  if (plateau < Math.max(2, Math.round(pxPerMm * 2))) return null;

  const heightPx = Math.max(...tall.map((c) => c.span));
  return { fromPx, toPx, heightMm: heightPx / pxPerMm };
}

export interface ExtractionOptions {
  pxPerMm: number;
  mmPerSec: number;
  mmPerMv: number;
  /** Maximum permitted jump between adjacent columns, in millimetres. */
  maxJumpMm?: number;
}

export interface ExtractedLead extends LeadSignal {
  /**
   * The signal with only gross offset removed.
   *
   * ST deviation and wave amplitudes are measured from this rather than from
   * the baseline-corrected copy. A median-cascade or high-pass baseline filter
   * whose window is comparable to the cardiac cycle removes a genuine ST shift
   * along with the wander — the very finding it would be used to assess — so
   * the aggressive correction is reserved for detection and delineation, where
   * an absolute level does not matter.
   */
  samplesRaw: Float32Array;
  /** Calibration pulse height for this panel, millimetres, if found. */
  calibrationMm: number | null;
  nativeFs: number;
}

export function extractPanel(masks: Masks, panel: Panel, opts: ExtractionOptions): ExtractedLead | null {
  const { pxPerMm, mmPerSec, mmPerMv, maxJumpMm = 9 } = opts;
  const bounds = panel.bounds;
  const cal = findCalibrationPulse(masks, bounds, pxPerMm);
  // The time origin is always the panel's own left edge. Every lead printed in
  // the same column was recorded simultaneously and shares one set of beat
  // indices, so trimming a variable-width pulse off the front of some panels
  // and not others would silently misalign them by tens of milliseconds — and
  // then every amplitude, ST level and axis measured from those leads would be
  // taken at the wrong instant.
  const x0 = bounds.x0;
  const x1 = bounds.x1;
  const widthPx = x1 - x0;
  if (widthPx < pxPerMm * 10) return null;

  const raw = new Float32Array(widthPx).fill(NaN);
  const maxJumpPx = maxJumpMm * pxPerMm;

  // First pass: a rough baseline from the most frequently inked row, so the
  // very first column has something sensible to anchor to. This uses the panel
  // rectangle proper, where the isoelectric line certainly lies.
  const rowCounts = new Float32Array(bounds.y1 - bounds.y0);
  for (let x = x0; x < x1; x += 2) {
    for (const r of runsInColumn(masks, x, bounds.y0, bounds.y1)) {
      const idx = Math.round(r.mid) - bounds.y0;
      if (idx >= 0 && idx < rowCounts.length) rowCounts[idx] += 1;
    }
  }
  let modeRow = 0, modeVal = -1;
  for (let i = 0; i < rowCounts.length; i++) if (rowCounts[i] > modeVal) { modeVal = rowCounts[i]; modeRow = i; }
  let previous = bounds.y0 + modeRow;

  // Tracking is allowed to follow the trace outside its own row. Tall
  // complexes — hypertrophy voltages in particular — routinely overrun into
  // the row above or below on a real printout, and clipping them at the panel
  // edge would silently truncate the amplitude that the voltage criteria are
  // measured from. The per-column jump limit keeps the tracker from defecting
  // to a neighbouring lead's trace.
  const panelHeight = bounds.y1 - bounds.y0;
  const searchY0 = Math.max(0, bounds.y0 - Math.round(panelHeight * 0.65));
  const searchY1 = Math.min(masks.height, bounds.y1 + Math.round(panelHeight * 0.65));

  let found = 0;
  for (let i = 0; i < widthPx; i++) {
    const x = x0 + i;
    // Blank the calibration pulse rather than trimming it; the gap is
    // interpolated and the time base is preserved.
    if (cal && x >= cal.fromPx - 1 && x <= cal.toPx + Math.round(pxPerMm * 1.2)) continue;
    const runs = runsInColumn(masks, x, searchY0, searchY1);
    if (!runs.length) continue;

    // Prefer the run whose midpoint is closest to the previous accepted value.
    let best: Run | null = null;
    let bestDist = Infinity;
    for (const r of runs) {
      // Distance to the run's span, not just its midpoint: a steep limb
      // produces a long run that legitimately contains the previous value.
      const d = previous < r.top ? r.top - previous : previous > r.bottom ? previous - r.bottom : 0;
      if (d < bestDist) { bestDist = d; best = r; }
    }
    if (!best || bestDist > maxJumpPx) continue;

    raw[i] = best.mid;
    previous = best.mid;
    found++;
  }

  const coverage = found / widthPx;
  if (coverage < 0.35) return null;

  fillGaps(raw);

  // Isoelectric level: the median of the recovered trace. Depolarisation and
  // repolarisation occupy a minority of each cycle, so the median sits on the
  // baseline even with large complexes.
  const sorted = Float32Array.from(raw).sort();
  const baselinePx = sorted[sorted.length >> 1];

  const nativeFs = mmPerSec * pxPerMm;
  const mvPerPx = 1 / (pxPerMm * mmPerMv);
  const mv = new Float32Array(widthPx);
  for (let i = 0; i < widthPx; i++) mv[i] = (baselinePx - raw[i]) * mvPerPx;

  const samples = resample(mv, nativeFs, TARGET_FS);

  return {
    lead: panel.lead,
    samples,
    samplesRaw: Float32Array.from(samples),
    bounds: { ...bounds },
    baselinePx,
    coverage,
    noiseMv: noiseEstimate(samples, TARGET_FS),
    startSec: panel.startSec,
    calibrationMm: cal?.heightMm ?? null,
    nativeFs,
  };
}

/**
 * Derive the limb leads that were not recovered.
 *
 * The six limb leads are linear combinations of two independent measurements,
 * so any missing lead can be reconstructed exactly from leads I and II. This
 * matters because axis calculation and inferior-territory criteria need aVF and
 * III even when those panels digitised poorly.
 */
export function completeLimbLeads(leads: ExtractedLead[]): { leads: ExtractedLead[]; derived: string[] } {
  const by = new Map(leads.map((l) => [l.lead, l]));
  const derived: string[] = [];
  const I = by.get('I');
  const II = by.get('II');
  if (!I || !II) return { leads, derived };

  const n = Math.min(I.samples.length, II.samples.length);
  const make = (name: 'III' | 'aVR' | 'aVL' | 'aVF', fn: (a: number, b: number) => number): void => {
    if (by.has(name)) return;
    const s = new Float32Array(n);
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      s[i] = fn(I.samples[i], II.samples[i]);
      raw[i] = fn(I.samplesRaw[i], II.samplesRaw[i]);
    }
    by.set(name, {
      lead: name,
      samples: s,
      samplesRaw: raw,
      bounds: I.bounds,
      baselinePx: I.baselinePx,
      coverage: Math.min(I.coverage, II.coverage),
      noiseMv: Math.max(I.noiseMv, II.noiseMv),
      startSec: I.startSec,
      calibrationMm: null,
      nativeFs: I.nativeFs,
    });
    derived.push(name);
  };

  make('III', (a, b) => b - a);
  make('aVR', (a, b) => -(a + b) / 2);
  make('aVL', (a, b) => a - b / 2);
  make('aVF', (a, b) => b - a / 2);

  return { leads: [...by.values()], derived };
}
