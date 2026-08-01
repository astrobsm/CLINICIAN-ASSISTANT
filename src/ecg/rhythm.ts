/**
 * Rhythm classification.
 *
 * Atrial activity is recovered by QRST cancellation — subtracting an averaged
 * beat template from each complex leaves the residual atrial signal, which is
 * how fibrillatory and flutter waves are separated from ventricular
 * repolarisation. Without this step the T wave dominates any periodicity
 * measurement and flutter cannot be distinguished from a fast sinus rhythm.
 */
import { bandpass, median, stdev } from './dsp';
import type { Signal } from './dsp';
import { dominantPeriod } from './grid';
import type { Beat, RhythmAssessment } from './types';

export interface AtrialActivity {
  rateBpm: number | null;
  /** 0–1 strength of the periodicity in the residual signal. */
  regularity: number;
  residual: Signal;
}

/**
 * Build an average QRST template and subtract it, leaving atrial activity.
 */
export function cancelQrst(signal: Signal, beats: Beat[], fs: number): AtrialActivity {
  const residual = Float32Array.from(signal);
  if (beats.length < 3) return { rateBpm: null, regularity: 0, residual };

  const pre = Math.round(0.08 * fs);
  const post = Math.round(0.42 * fs);
  const len = pre + post;
  const template = new Float32Array(len);
  const counts = new Float32Array(len);

  for (const b of beats) {
    for (let k = 0; k < len; k++) {
      const i = b.rIndex - pre + k;
      if (i < 0 || i >= signal.length) continue;
      template[k] += signal[i];
      counts[k] += 1;
    }
  }
  for (let k = 0; k < len; k++) if (counts[k]) template[k] /= counts[k];

  for (const b of beats) {
    for (let k = 0; k < len; k++) {
      const i = b.rIndex - pre + k;
      if (i < 0 || i >= residual.length) continue;
      residual[i] -= template[k];
    }
  }

  // Atrial rates of interest span roughly 100–450 per minute.
  const atrial = bandpass(residual, 2.5, Math.min(14, fs / 2 - 2), fs);
  const minLag = Math.round((60 / 450) * fs);
  const maxLag = Math.round((60 / 100) * fs);
  const { period, strength } = dominantPeriod(atrial, minLag, Math.min(maxLag, Math.floor(atrial.length / 3)));

  return {
    rateBpm: period > 0 ? Math.round((60 * fs) / period) : null,
    regularity: strength,
    residual: atrial,
  };
}

export interface RhythmInput {
  beats: Beat[];
  fs: number;
  /** Lead II or the rhythm strip, baseline corrected. */
  rhythmLead: Signal;
  /** Median QRS duration in milliseconds. */
  qrsMs: number | null;
  /** Median PR interval in milliseconds. */
  prMs: number | null;
  pacingSpikes: number;
  /** True when only a single lead was recovered. */
  singleLead: boolean;
}

export interface RhythmResult extends RhythmAssessment {
  heartRateBpm: number | null;
  atrialRateBpm: number | null;
  rrIrregularity: number | null;
  pWavePresent: boolean;
  pWaveConsistent: boolean;
  avBlock: string | null;
}

export function classifyRhythm(input: RhythmInput): RhythmResult {
  const { beats, fs, rhythmLead, qrsMs, prMs, pacingSpikes } = input;

  const empty: RhythmResult = {
    label: 'Rhythm could not be determined',
    featureKeys: [],
    regular: false,
    narrative: 'Too few complexes were recovered from the trace to characterise the rhythm.',
    confidence: 0,
    heartRateBpm: null,
    atrialRateBpm: null,
    rrIrregularity: null,
    pWavePresent: false,
    pWaveConsistent: false,
    avBlock: null,
  };
  if (beats.length < 3) return empty;

  const rr = beats.map((b) => b.rrSec).filter((v): v is number => v !== null && v > 0.2 && v < 4);
  if (rr.length < 2) return empty;

  const rrMean = rr.reduce((a, b) => a + b, 0) / rr.length;
  const rrSd = stdev(rr);
  const irregularity = rrSd / rrMean;
  const heartRate = Math.round(60 / median(rr));

  // Fraction of consecutive intervals differing by more than 10% — the
  // signature of an irregularly irregular rhythm.
  let bigSteps = 0;
  for (let i = 1; i < rr.length; i++) if (Math.abs(rr[i] - rr[i - 1]) > 0.1 * rrMean) bigSteps++;
  const stepFraction = bigSteps / Math.max(1, rr.length - 1);

  const withP = beats.filter((b) => b.pPeak !== null);
  const pFraction = withP.length / beats.length;
  const prValues = beats
    .filter((b) => b.pOnset !== null)
    .map((b) => ((b.qrsOnset - (b.pOnset as number)) / fs) * 1000);
  const prSd = prValues.length > 2 ? stdev(prValues) : 0;
  const pWavePresent = pFraction >= 0.6;
  // The tolerance allows for delineation jitter on a digitised paper trace,
  // which is coarser than a native digital recording.
  const pWaveConsistent = pWavePresent && prSd < 40;

  const atrial = cancelQrst(rhythmLead, beats, fs);
  const broad = (qrsMs ?? 0) >= 120;
  const regular = irregularity < 0.09 && stepFraction < 0.25;
  const paced = pacingSpikes >= Math.max(2, beats.length * 0.5);

  const featureKeys: string[] = [];
  let label = '';
  let narrative = '';
  let confidence = 0.6;
  let avBlock: string | null = null;

  // ── Atrioventricular conduction ─────────────────────────────────────
  if (pWavePresent && prMs !== null && prMs > 200 && pWaveConsistent) {
    avBlock = 'First degree atrioventricular block';
    featureKeys.push('avb1');
  }

  // Dropped beats: an RR interval close to a whole multiple of the others.
  const droppedBeats = rr.filter((v) => v > 1.6 * median(rr)).length;
  if (droppedBeats > 0 && pWavePresent) {
    // Progressive PR lengthening before the pause indicates Wenckebach.
    let progressive = false;
    for (let i = 2; i < prValues.length; i++) {
      if (prValues[i] - prValues[i - 1] > 10 && prValues[i - 1] - prValues[i - 2] > 10) { progressive = true; break; }
    }
    if (progressive) {
      avBlock = 'Second degree atrioventricular block, Mobitz type I (Wenckebach)';
      featureKeys.push('avb2t1');
    } else if (prSd < 25) {
      avBlock = 'Second degree atrioventricular block, Mobitz type II';
      featureKeys.push('avb2t2');
    }
  }

  // Complete block: regular atrial activity at a rate independent of a regular,
  // slower ventricular rate, with a PR interval that wanders.
  if (
    atrial.rateBpm !== null && atrial.regularity > 0.3 &&
    atrial.rateBpm > heartRate * 1.4 && regular && heartRate < 55 && prSd > 40
  ) {
    avBlock = 'Complete atrioventricular block with atrioventricular dissociation';
    featureKeys.length = 0;
    featureKeys.push('avb3');
    label = avBlock;
    narrative = `Ventricular rate ${heartRate} per minute with independent atrial activity at approximately ${atrial.rateBpm} per minute and a varying PR relationship.`;
    confidence = 0.55;
  }

  // ── Principal rhythm ────────────────────────────────────────────────
  if (!label) {
    if (paced) {
      label = 'Paced rhythm';
      featureKeys.push('paced');
      narrative = `Pacing artefact identified before ${pacingSpikes} of ${beats.length} complexes.`;
      confidence = 0.5;
    } else if (atrial.rateBpm !== null && atrial.rateBpm >= 230 && atrial.rateBpm <= 350 && atrial.regularity > 0.35) {
      label = 'Atrial flutter';
      featureKeys.push('aflutter');
      narrative = `Regular atrial activity at approximately ${atrial.rateBpm} per minute with a ventricular rate of ${heartRate} per minute (about ${Math.max(1, Math.round(atrial.rateBpm / Math.max(heartRate, 1)))} : 1 conduction).`;
      confidence = 0.6;
    } else if (!pWavePresent && (irregularity > 0.14 || stepFraction > 0.4)) {
      label = 'Atrial fibrillation';
      featureKeys.push('af');
      narrative = `Irregularly irregular ventricular response at ${heartRate} per minute with no organised atrial activity (RR coefficient of variation ${(irregularity * 100).toFixed(0)}%).`;
      confidence = 0.65;
    } else if (broad && heartRate > 100 && regular) {
      label = 'Broad complex tachycardia — ventricular tachycardia until proven otherwise';
      featureKeys.push('vt');
      narrative = `Regular broad complex tachycardia at ${heartRate} per minute with a QRS duration of ${Math.round(qrsMs ?? 0)} ms.`;
      confidence = 0.55;
    } else if (!broad && heartRate > 150 && regular && !pWavePresent) {
      label = 'Regular narrow complex tachycardia — supraventricular tachycardia';
      featureKeys.push('svt');
      narrative = `Regular narrow complex tachycardia at ${heartRate} per minute without discernible P waves.`;
      confidence = 0.55;
    } else if (pWavePresent && pWaveConsistent) {
      if (heartRate > 100) { label = 'Sinus tachycardia'; featureKeys.push('sinusTach'); }
      else if (heartRate < 60) { label = 'Sinus bradycardia'; featureKeys.push('sinusBrady'); }
      else label = 'Sinus rhythm';
      narrative = `${label} at ${heartRate} per minute with a P wave preceding ${withP.length} of ${beats.length} complexes at a consistent PR interval.`;
      confidence = 0.75;
    } else if (!pWavePresent && !broad && heartRate >= 40 && heartRate <= 60 && regular) {
      label = 'Junctional rhythm';
      narrative = `Regular narrow complex rhythm at ${heartRate} per minute without visible P waves.`;
      confidence = 0.45;
    } else if (!pWavePresent && broad && heartRate < 50) {
      label = 'Idioventricular / ventricular escape rhythm';
      featureKeys.push('vt');
      narrative = `Slow broad complex rhythm at ${heartRate} per minute without atrial activity.`;
      confidence = 0.45;
    } else if (regular) {
      label = heartRate > 100 ? 'Regular tachycardia — atrial activity not clearly resolved'
        : heartRate < 60 ? 'Regular bradycardia — atrial activity not clearly resolved'
          : 'Regular rhythm — atrial activity not clearly resolved';
      narrative = `Regular ventricular rate of ${heartRate} per minute; P waves could not be identified reliably on the recovered trace.`;
      confidence = 0.35;
    } else {
      label = 'Irregular rhythm — requires direct review';
      narrative = `Irregular ventricular rate averaging ${heartRate} per minute (RR coefficient of variation ${(irregularity * 100).toFixed(0)}%).`;
      confidence = 0.35;
    }
  }

  if (avBlock && !label.includes('atrioventricular')) {
    narrative += ` ${avBlock} is also present.`;
  }

  if (input.singleLead) confidence *= 0.85;

  return {
    label,
    featureKeys,
    regular,
    narrative,
    confidence,
    heartRateBpm: heartRate,
    atrialRateBpm: atrial.rateBpm,
    rrIrregularity: irregularity,
    pWavePresent,
    pWaveConsistent,
    avBlock,
  };
}
