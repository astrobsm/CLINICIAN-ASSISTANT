/**
 * ECG waveform analysis orchestrator.
 *
 * Image → grid scale → lead panels → millivolt signals → QRS detection →
 * delineation → measurement → rhythm and morphology.
 *
 * Measurements are pooled across lead groups because, on a standard printout,
 * only the leads sharing a column were recorded simultaneously. Rhythm is taken
 * from the longest continuous panel — the rhythm strip where one exists —
 * because RR intervals cannot be measured across a panel boundary.
 */
import { median, removeBaseline, spatialMagnitude, derivative, lowpass } from './dsp';
import type { Signal } from './dsp';
import { buildMasks, detectGrid, rotatePixels } from './grid';
import { segmentLeads, type OcrWord } from './layout';
import { completeLimbLeads, extractPanel, TARGET_FS, type ExtractedLead } from './traceExtract';
import { detectPacingSpikes, detectQrs, refinePeaks } from './qrs';
import { delineate, summariseBeats } from './delineate';
import {
  computeAxis, describeAxis, measureAmplitudes, measureSt,
  qtcBazett, qtcFridericia, type LeadGroup,
} from './measure';
import { classifyRhythm } from './rhythm';
import { assessMorphology } from './morphology';
import type {
  Beat, DigitisedEcg, LeadAmplitudes, LeadName, LeadSignal,
  QualityReport, StMeasurement, WaveformAnalysis, WaveformMeasurements,
} from './types';

export interface WaveformOptions {
  sex: 'male' | 'female' | 'unspecified';
  age: number | null;
  /** Paper speed, mm/s. Standard is 25. */
  mmPerSec?: number;
  /** Gain, mm/mV. Standard is 10. */
  mmPerMv?: number;
  /** Lead labels located by OCR, used to assign panels. */
  words?: OcrWord[];
}

export class WaveformError extends Error {
  constructor(message: string, readonly quality: QualityReport) {
    super(message);
  }
}

export function analyseWaveform(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  opts: WaveformOptions,
): WaveformAnalysis {
  const notes: string[] = [];
  const warnings: string[] = [];
  const mmPerSec = opts.mmPerSec ?? 25;
  let mmPerMv = opts.mmPerMv ?? 10;

  // ── 1. Grid scale and deskew ────────────────────────────────────────
  let masks = buildMasks(pixels, width, height);
  let grid = detectGrid(masks);
  notes.push(...grid.notes);

  if (grid.rotationDeg !== 0) {
    const rotated = rotatePixels(pixels, width, height, grid.rotationDeg);
    masks = buildMasks(rotated, width, height);
    const regrid = detectGrid(masks);
    if (regrid.strength > grid.strength) {
      grid = { ...regrid, rotationDeg: grid.rotationDeg };
    }
  }

  if (!grid.detected || grid.pxPerMm < 2.2) {
    throw new WaveformError(
      'The millimetre grid could not be measured, so time and voltage cannot be calibrated.',
      {
        score: 0,
        notes,
        warnings: [
          'Waveform analysis requires a visible ECG grid to establish scale.',
          'Photograph the ECG square-on, filling the frame, with even lighting and no shadow across the paper.',
        ],
      },
    );
  }

  const pxPerMm = grid.pxPerMm;
  notes.push(`Grid scale ${pxPerMm.toFixed(2)} pixels per millimetre at ${mmPerSec} mm/s and ${mmPerMv} mm/mV.`);

  const nativeFs = mmPerSec * pxPerMm;
  if (nativeFs < 90) {
    warnings.push(`The scan resolves only ${nativeFs.toFixed(0)} samples per second. Interval measurements will be coarse; a higher-resolution scan is strongly preferred.`);
  }

  // ── 2. Lead panels ──────────────────────────────────────────────────
  const words = opts.words ?? [];
  const layout = segmentLeads(masks, pxPerMm, mmPerSec, words);
  notes.push(...layout.notes);

  if (!layout.panels.length) {
    throw new WaveformError('No lead panels could be identified in the image.', {
      score: 0, notes, warnings: ['Ensure the whole ECG is in frame and the trace is legible.'],
    });
  }

  // ── 3. Trace extraction ─────────────────────────────────────────────
  let extracted: ExtractedLead[] = [];
  for (const panel of layout.panels) {
    const lead = extractPanel(masks, panel, { pxPerMm, mmPerSec, mmPerMv });
    if (lead) extracted.push(lead);
  }

  if (!extracted.length) {
    throw new WaveformError('The trace could not be followed in any lead panel.', {
      score: 0, notes, warnings: ['The trace may be too faint, broken, or obscured by the grid.'],
    });
  }

  // Calibration pulse: an independent check on the voltage scale.
  const calHeights = extracted.map((l) => l.calibrationMm).filter((v): v is number => v !== null);
  let calibrationPulseMm: number | null = null;
  if (calHeights.length) {
    calibrationPulseMm = median(calHeights);
    const impliedGain = calibrationPulseMm; // a 1 mV pulse is `gain` mm tall
    if (Math.abs(impliedGain - mmPerMv) > 2.5) {
      const corrected = impliedGain > 15 ? 20 : impliedGain < 7.5 ? 5 : 10;
      if (corrected !== mmPerMv) {
        notes.push(`Calibration pulse measured ${impliedGain.toFixed(1)} mm — gain reinterpreted as ${corrected} mm/mV and all amplitudes rescaled.`);
        const factor = mmPerMv / corrected;
        for (const l of extracted) {
          for (let i = 0; i < l.samples.length; i++) l.samples[i] *= factor;
        }
        mmPerMv = corrected;
      }
    } else {
      notes.push(`Calibration pulse ${calibrationPulseMm.toFixed(1)} mm — consistent with ${mmPerMv} mm/mV.`);
    }
  } else {
    notes.push('No calibration pulse was found; standard gain has been assumed.');
  }

  // Two views of each lead. The aggressive baseline correction below is what
  // detection and delineation need; ST and amplitude measurement instead use
  // `samplesRaw`, detrended only over a window far longer than a cardiac cycle
  // so that a genuine ST shift cannot be filtered away with the wander.
  for (const l of extracted) {
    l.samplesRaw = gentleDetrend(l.samples, TARGET_FS);
    l.samples = removeBaseline(l.samples, TARGET_FS);
  }

  const completion = completeLimbLeads(extracted);
  extracted = completion.leads;
  if (completion.derived.length) {
    notes.push(`Leads ${completion.derived.join(', ')} were reconstructed from leads I and II using the standard limb lead relationships.`);
  }

  const poor = extracted.filter((l) => l.coverage < 0.7).map((l) => l.lead);
  if (poor.length) warnings.push(`Trace continuity was incomplete in ${poor.join(', ')} — gaps were interpolated.`);

  // ── 4. Group simultaneous leads ─────────────────────────────────────
  const groupsByStart = new Map<number, ExtractedLead[]>();
  for (const l of extracted) {
    const key = Math.round(l.startSec * 4) / 4;
    if (!groupsByStart.has(key)) groupsByStart.set(key, []);
    groupsByStart.get(key)!.push(l);
  }

  const groups: LeadGroup[] = [];
  for (const [startSec, leads] of [...groupsByStart.entries()].sort((a, b) => a[0] - b[0])) {
    const signals = leads.map((l) => l.samples);
    const magnitude = spatialMagnitude(signals);
    if (magnitude.length < TARGET_FS * 0.6) continue;
    const detection = detectQrs(magnitude, TARGET_FS);
    const peaks = refinePeaks(detection.peaks, magnitude, TARGET_FS);
    const map = new Map<LeadName, Signal>(leads.map((l) => [l.lead, l.samples]));
    const rawMap = new Map<LeadName, Signal>(leads.map((l) => [l.lead, l.samplesRaw]));
    const pLead = map.get('II') ?? map.get('rhythm') ?? signals[0];
    const tLead = map.get('V5') ?? map.get('II') ?? map.get('rhythm') ?? signals[0];
    const beats = delineate({ magnitude, pLead, tLead, peaks, fs: TARGET_FS });
    groups.push({ startSec, leads: map, leadsRaw: rawMap, magnitude, beats });
  }

  if (!groups.length || groups.every((g) => !g.beats.length)) {
    throw new WaveformError('No QRS complexes could be detected in the recovered signal.', {
      score: 0.1, notes,
      warnings: [...warnings, 'The trace was digitised but no complexes were found — check that the image shows an ECG rather than a report page.'],
    });
  }

  // ── 5. Rhythm from the longest continuous panel ─────────────────────
  const rhythmLeadCandidate = [...extracted].sort((a, b) => b.samples.length - a.samples.length)[0];
  const rhythmSignal = rhythmLeadCandidate.samples;
  const rhythmDetection = detectQrs(rhythmSignal, TARGET_FS);
  const rhythmPeaks = refinePeaks(rhythmDetection.peaks, rhythmSignal, TARGET_FS);
  const rhythmBeats = delineate({
    magnitude: absSignal(rhythmSignal),
    pLead: rhythmSignal,
    tLead: rhythmSignal,
    peaks: rhythmPeaks,
    fs: TARGET_FS,
  });

  // ── 6. Pooled interval measurements ─────────────────────────────────
  const allBeats: Beat[] = groups.flatMap((g) => g.beats);
  const groupSummaries = groups.map((g) => summariseBeats(g.beats, TARGET_FS));
  const pooled = {
    qrsMs: pickMedian(groupSummaries.map((s) => s.qrsMs)),
    prMs: pickMedian(groupSummaries.map((s) => s.prMs)),
    qtMs: pickMedian(groupSummaries.map((s) => s.qtMs)),
  };

  const rhythmSummary = summariseBeats(rhythmBeats, TARGET_FS);
  const rrSec = rhythmSummary.rrSec ?? pickMedian(groupSummaries.map((s) => s.rrSec));
  const heartRate = rrSec ? Math.round(60 / rrSec) : null;

  const pacingSpikes = detectPacingSpikes(rhythmSignal, TARGET_FS, nativeFs).length;
  if (nativeFs < 250) {
    notes.push('Pacing artefact is not assessable at this scan resolution — a pacing spike lasts 1–2 ms, which this image cannot resolve. Absence of a reported spike does not exclude a paced rhythm.');
  }

  const rhythm = classifyRhythm({
    beats: rhythmBeats.length >= 3 ? rhythmBeats : allBeats,
    fs: TARGET_FS,
    rhythmLead: rhythmSignal,
    qrsMs: pooled.qrsMs,
    prMs: pooled.prMs,
    pacingSpikes,
    singleLead: extracted.length <= 2,
  });

  // ── 7. Per-lead amplitude and ST measurement ────────────────────────
  const amplitudes = new Map<LeadName, LeadAmplitudes>();
  const st: StMeasurement[] = [];
  for (const g of groups) {
    if (!g.beats.length) continue;
    for (const [lead] of g.leads) {
      if (lead === 'rhythm') continue;
      const signal = g.leadsRaw.get(lead) ?? g.leads.get(lead);
      if (!signal) continue;
      amplitudes.set(lead, measureAmplitudes(lead, signal, g.beats, TARGET_FS));
      st.push(measureSt(lead, signal, g.beats, TARGET_FS));
    }
  }

  const axisDeg = computeAxis(groups, TARGET_FS, 'qrs');
  const pAxisDeg = computeAxis(groups, TARGET_FS, 'p');

  const qtcBazettMs = pooled.qtMs !== null && rrSec ? qtcBazett(pooled.qtMs, rrSec) : null;
  const qtcFridericiaMs = pooled.qtMs !== null && rrSec ? qtcFridericia(pooled.qtMs, rrSec) : null;

  // ── 8. Morphology ───────────────────────────────────────────────────
  const leadsAvailable = [...amplitudes.keys()];
  const morphology = assessMorphology({
    amplitudes,
    st,
    qrsMs: pooled.qrsMs,
    prMs: pooled.prMs,
    qtcMs: qtcBazettMs,
    axisDeg,
    initialSlopeRatio: initialSlopeRatio(groups, TARGET_FS),
    sex: opts.sex,
    age: opts.age,
    leadsAvailable,
  });

  // ── 9. Assemble ─────────────────────────────────────────────────────
  const measurements: WaveformMeasurements = {
    heartRateBpm: rhythm.heartRateBpm ?? heartRate,
    rrMeanSec: rrSec,
    rrSdSec: rhythmSummary.rrValues.length > 1 ? stdevOf(rhythmSummary.rrValues) : null,
    rrIrregularity: rhythm.rrIrregularity,
    prMs: pooled.prMs !== null ? Math.round(pooled.prMs) : null,
    qrsMs: pooled.qrsMs !== null ? Math.round(pooled.qrsMs) : null,
    qtMs: pooled.qtMs !== null ? Math.round(pooled.qtMs) : null,
    qtcBazettMs,
    qtcFridericiaMs,
    axisDeg,
    pAxisDeg,
    beats: rhythmBeats.length || allBeats.length,
    st,
    amplitudes: [...amplitudes.values()],
    atrialRateBpm: rhythm.atrialRateBpm,
    pWavePresent: rhythm.pWavePresent,
    pWaveConsistent: rhythm.pWaveConsistent,
    pacingSpikes,
  };

  const statements: string[] = [];
  statements.push(rhythm.narrative);
  if (rhythm.avBlock && !rhythm.label.includes('atrioventricular')) statements.push(`${rhythm.avBlock}.`);
  if (axisDeg !== null) statements.push(`Cardiac axis ${axisDeg}° — ${describeAxis(axisDeg).toLowerCase()}.`);
  statements.push(...morphology.statements);

  const features = [...new Set([...rhythm.featureKeys, ...morphology.features])];

  const quality = scoreQuality({
    grid, extracted, groups, beats: measurements.beats,
    labelled: layout.panels.filter((p) => p.labelled).length,
    nativeFs, notes, warnings,
  });

  const digitised: DigitisedEcg = {
    fs: TARGET_FS,
    pxPerMm,
    mmPerSec,
    mmPerMv,
    gridDetected: grid.detected,
    calibrationPulseMm,
    rotationDeg: grid.rotationDeg,
    layout: layout.layout,
    leads: extracted.map<LeadSignal>((l) => ({
      lead: l.lead,
      samples: l.samples,
      bounds: l.bounds,
      baselinePx: l.baselinePx,
      coverage: l.coverage,
      noiseMv: l.noiseMv,
      startSec: l.startSec,
    })),
    durationSec: Math.max(...extracted.map((l) => l.samples.length / TARGET_FS)),
    quality,
  };

  return {
    digitised,
    measurements,
    beats: rhythmBeats.length ? rhythmBeats : allBeats,
    rhythm,
    features,
    statements: statements.filter(Boolean),
    quality,
  };
}

// ─────────────────────────────── helpers ───────────────────────────────

/**
 * Remove only gross offset and very slow drift.
 *
 * The window is deliberately far longer than a cardiac cycle: anything shorter
 * behaves as a high-pass at ST-segment timescales and would subtract the very
 * deviation being measured.
 */
function gentleDetrend(x: Signal, fs: number): Signal {
  const window = Math.min(x.length, Math.round(2.4 * fs));
  if (window < 8) return Float32Array.from(x);

  const out = new Float32Array(x.length);
  const half = Math.floor(window / 2);
  const decim = Math.max(1, Math.round(fs / 25));

  // Sampled medians over the long window, interpolated back to full rate.
  const anchors: { at: number; value: number }[] = [];
  for (let centre = 0; centre < x.length; centre += Math.max(1, Math.round(fs / 5))) {
    const from = Math.max(0, centre - half);
    const to = Math.min(x.length, centre + half);
    const bucket: number[] = [];
    for (let i = from; i < to; i += decim) bucket.push(x[i]);
    bucket.sort((a, b) => a - b);
    anchors.push({ at: centre, value: bucket[bucket.length >> 1] ?? 0 });
  }
  if (!anchors.length) return Float32Array.from(x);

  let a = 0;
  for (let i = 0; i < x.length; i++) {
    while (a < anchors.length - 2 && anchors[a + 1].at < i) a++;
    const p0 = anchors[a];
    const p1 = anchors[Math.min(a + 1, anchors.length - 1)];
    const span = Math.max(1, p1.at - p0.at);
    const t = Math.max(0, Math.min(1, (i - p0.at) / span));
    out[i] = x[i] - (p0.value * (1 - t) + p1.value * t);
  }
  return out;
}

function absSignal(x: Signal): Signal {
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = Math.abs(x[i]);
  return out;
}

function pickMedian(values: (number | null)[]): number | null {
  const ok = values.filter((v): v is number => v !== null && Number.isFinite(v));
  return ok.length ? median(ok) : null;
}

function stdevOf(values: number[]): number {
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, values.length - 1));
}

/**
 * Ratio of the initial 40 ms QRS slope to the steepest slope in the complex.
 * A low ratio with a short PR interval indicates a delta wave.
 */
function initialSlopeRatio(groups: LeadGroup[], fs: number): number | null {
  const ratios: number[] = [];
  const window = Math.round(0.04 * fs);
  for (const g of groups) {
    const lead = g.leads.get('V5') ?? g.leads.get('II') ?? [...g.leads.values()][0];
    if (!lead) continue;
    const d = derivative(lowpass(lead, Math.min(40, fs / 2 - 5), fs), fs);
    for (const b of g.beats) {
      let initial = 0, peak = 0;
      for (let i = b.qrsOnset; i < Math.min(b.qrsOnset + window, d.length); i++) initial = Math.max(initial, Math.abs(d[i]));
      for (let i = b.qrsOnset; i <= Math.min(b.qrsOffset, d.length - 1); i++) peak = Math.max(peak, Math.abs(d[i]));
      if (peak > 1e-6) ratios.push(initial / peak);
    }
  }
  return ratios.length ? median(ratios) : null;
}

function scoreQuality(args: {
  grid: ReturnType<typeof detectGrid>;
  extracted: ExtractedLead[];
  groups: LeadGroup[];
  beats: number;
  labelled: number;
  nativeFs: number;
  notes: string[];
  warnings: string[];
}): QualityReport {
  const { grid, extracted, beats, labelled, nativeFs, notes, warnings } = args;

  const coverage = median(extracted.map((l) => l.coverage));
  const noise = median(extracted.map((l) => l.noiseMv));

  let score = 0;
  score += Math.min(1, grid.strength / 0.4) * 0.25;          // grid confidence
  score += Math.min(1, coverage / 0.95) * 0.25;              // trace continuity
  score += Math.min(1, nativeFs / 200) * 0.15;               // effective sampling
  score += Math.min(1, extracted.length / 12) * 0.15;        // leads recovered
  score += Math.min(1, beats / 8) * 0.1;                     // beats available
  score += labelled > 0 ? 0.1 : 0;                           // labels confirmed

  const noiseMv = noise;
  if (noiseMv > 0.06) {
    score *= 0.8;
    warnings.push(`Residual noise of ${(noiseMv * 1000).toFixed(0)} µV in the recovered trace — measurements will be less precise.`);
  }
  if (extracted.length < 8) {
    warnings.push(`Only ${extracted.length} leads were recovered; criteria requiring a full 12-lead recording have not been applied.`);
  }
  if (beats < 4) {
    warnings.push('Fewer than four complexes were analysed — interval medians are based on very few beats.');
  }

  notes.push(`Trace continuity ${(coverage * 100).toFixed(0)}%, residual noise ${(noiseMv * 1000).toFixed(0)} µV, ${extracted.length} leads recovered.`);

  return { score: Math.max(0, Math.min(1, score)), notes, warnings };
}
