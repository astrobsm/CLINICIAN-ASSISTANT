/**
 * Types for ECG waveform digitisation and signal analysis.
 *
 * The pipeline recovers a millivolt-versus-time signal for each lead from a
 * scanned or photographed ECG, then measures it. Every stage records its own
 * quality so the clinician can see how much weight the output deserves.
 */

export type LeadName =
  | 'I' | 'II' | 'III' | 'aVR' | 'aVL' | 'aVF'
  | 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6'
  | 'rhythm';

export const LIMB_LEADS: LeadName[] = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF'];
export const PRECORDIAL_LEADS: LeadName[] = ['V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
export const ALL_LEADS: LeadName[] = [...LIMB_LEADS, ...PRECORDIAL_LEADS];

/** Contiguous lead territories used for ST-segment criteria. */
export const LEAD_TERRITORY: Record<string, LeadName[]> = {
  inferior: ['II', 'III', 'aVF'],
  lateral: ['I', 'aVL', 'V5', 'V6'],
  anteroseptal: ['V1', 'V2', 'V3', 'V4'],
  highLateral: ['I', 'aVL'],
};

export interface PanelBounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface LeadSignal {
  lead: LeadName;
  /** Millivolts, uniformly sampled at `fs`. */
  samples: Float32Array;
  /** Panel rectangle in image pixels. */
  bounds: PanelBounds;
  /** Isoelectric row in image pixels, before baseline correction. */
  baselinePx: number;
  /** Fraction of columns in which a trace pixel was found (0–1). */
  coverage: number;
  /** Estimated noise, in millivolts (residual after smoothing). */
  noiseMv: number;
  /** Time offset of this panel's first sample within the recording, seconds. */
  startSec: number;
}

export interface QualityReport {
  /** 0–1 overall confidence in the digitisation. */
  score: number;
  notes: string[];
  warnings: string[];
}

export interface DigitisedEcg {
  /** Sampling rate of the recovered signal, Hz. */
  fs: number;
  pxPerMm: number;
  mmPerSec: number;
  mmPerMv: number;
  gridDetected: boolean;
  calibrationPulseMm: number | null;
  rotationDeg: number;
  layout: string;
  leads: LeadSignal[];
  durationSec: number;
  quality: QualityReport;
}

/** One detected cardiac cycle with its fiducial points, in sample indices. */
export interface Beat {
  rIndex: number;
  qrsOnset: number;
  qrsOffset: number;
  pPeak: number | null;
  pOnset: number | null;
  pOffset: number | null;
  tPeak: number | null;
  tOffset: number | null;
  /** RR interval to the preceding beat, seconds (null for the first). */
  rrSec: number | null;
  /** True when the QRS is broad enough to be ventricular in origin. */
  broad: boolean;
  /** A pacing spike was detected immediately before this complex. */
  paced: boolean;
}

export interface StMeasurement {
  lead: LeadName;
  /** ST deviation at the J point, millivolts. */
  jMv: number;
  /** ST deviation 60 ms after the J point, millivolts. */
  j60Mv: number;
  /** Slope of the ST segment: rising, horizontal or falling. */
  slope: 'upsloping' | 'horizontal' | 'downsloping';
}

export interface LeadAmplitudes {
  lead: LeadName;
  /** Millivolts; Q and S are negative-going magnitudes reported positive. */
  qMv: number;
  rMv: number;
  sMv: number;
  rPrimeMv: number;
  qDurationMs: number;
  /** Peak-to-peak QRS amplitude. */
  qrsAmplitudeMv: number;
  tMv: number;
  pMv: number;
  /** Terminal R in V1 exceeds S — used for right ventricular criteria. */
  rsRatio: number;
}

export interface WaveformMeasurements {
  heartRateBpm: number | null;
  rrMeanSec: number | null;
  rrSdSec: number | null;
  /** Coefficient of RR variation; drives the regularity assessment. */
  rrIrregularity: number | null;
  prMs: number | null;
  qrsMs: number | null;
  qtMs: number | null;
  qtcBazettMs: number | null;
  qtcFridericiaMs: number | null;
  axisDeg: number | null;
  pAxisDeg: number | null;
  beats: number;
  st: StMeasurement[];
  amplitudes: LeadAmplitudes[];
  /** Atrial rate where flutter or dissociated P waves are present. */
  atrialRateBpm: number | null;
  pWavePresent: boolean;
  pWaveConsistent: boolean;
  pacingSpikes: number;
}

export interface RhythmAssessment {
  label: string;
  /** Feature keys from the ECG feature catalogue that this rhythm implies. */
  featureKeys: string[];
  regular: boolean;
  narrative: string;
  confidence: number;
}

export interface WaveformAnalysis {
  digitised: DigitisedEcg;
  measurements: WaveformMeasurements;
  beats: Beat[];
  rhythm: RhythmAssessment;
  /** Keys into ECG_FEATURES, derived from the signal rather than from text. */
  features: string[];
  /** Human-readable statements generated from the signal. */
  statements: string[];
  quality: QualityReport;
}

/** Disagreement between a computed value and the value printed on the report. */
export interface Discrepancy {
  field: string;
  computed: number | null;
  printed: number | null;
  unit: string;
  /** Absolute difference exceeding the tolerance for this field. */
  significant: boolean;
  note: string;
}
