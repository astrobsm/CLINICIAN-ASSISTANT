/**
 * Morphological criteria applied to the measured signal.
 *
 * Each rule is the published criterion rather than an approximation, and each
 * emits a key from the ECG feature catalogue so that the existing severity,
 * urgency and correlation machinery applies to signal-derived findings exactly
 * as it does to statement-derived ones.
 */
import { LEAD_TERRITORY, type LeadAmplitudes, type LeadName, type StMeasurement } from './types';
import { hasContiguous } from './measure';

export interface MorphologyInput {
  amplitudes: Map<LeadName, LeadAmplitudes>;
  st: StMeasurement[];
  qrsMs: number | null;
  prMs: number | null;
  qtcMs: number | null;
  axisDeg: number | null;
  /** Slope of the first 40 ms of the QRS relative to the steepest slope. */
  initialSlopeRatio: number | null;
  sex: 'male' | 'female' | 'unspecified';
  age: number | null;
  leadsAvailable: LeadName[];
}

export interface MorphologyResult {
  features: string[];
  statements: string[];
  /** Territories with significant ST elevation, for the narrative. */
  stElevationTerritories: string[];
  stDepressionTerritories: string[];
}

const has = (input: MorphologyInput, lead: LeadName) => input.leadsAvailable.includes(lead);
const amp = (input: MorphologyInput, lead: LeadName) => input.amplitudes.get(lead);
const stOf = (input: MorphologyInput, lead: LeadName) => input.st.find((s) => s.lead === lead);

/** Fourth Universal Definition thresholds for J-point elevation. */
function elevationThresholdMv(lead: LeadName, sex: MorphologyInput['sex'], age: number | null): number {
  if (lead === 'V2' || lead === 'V3') {
    if (sex === 'female') return 0.15;
    if (sex === 'male') return (age !== null && age < 40) ? 0.25 : 0.2;
    return 0.2; // sex not recorded — use the less sensitive male threshold
  }
  return 0.1;
}

export function assessMorphology(input: MorphologyInput): MorphologyResult {
  const features = new Set<string>();
  const statements: string[] = [];
  const elevationTerritories: string[] = [];
  const depressionTerritories: string[] = [];
  const twelveLead = input.leadsAvailable.length >= 8;

  const mm = (mv: number) => (mv * 10).toFixed(1);

  // ── ST elevation ──────────────────────────────────────────────────
  const elevated = input.st
    .filter((s) => s.jMv >= elevationThresholdMv(s.lead, input.sex, input.age))
    .map((s) => s.lead);

  for (const [name, leads] of Object.entries(LEAD_TERRITORY)) {
    if (name === 'highLateral') continue;
    const hits = elevated.filter((l) => leads.includes(l));
    if (hits.length >= 2 && hasContiguous(hits, leads)) {
      elevationTerritories.push(name);
      features.add('stElevation');
      statements.push(
        `ST elevation in ${hits.join(', ')} (${hits
          .map((l) => `${l} ${mm(stOf(input, l)?.jMv ?? 0)} mm`)
          .join(', ')}) — ${name} territory.`,
      );
    }
  }
  if (!elevationTerritories.length && elevated.length >= 2) {
    features.add('stElevation');
    statements.push(`ST elevation in ${elevated.join(', ')} without a single contiguous territory — correlate clinically.`);
  }

  // ── ST depression ─────────────────────────────────────────────────
  const depressed = input.st
    .filter((s) => s.jMv <= -0.05 && s.slope !== 'upsloping' && s.lead !== 'aVR')
    .map((s) => s.lead);

  for (const [name, leads] of Object.entries(LEAD_TERRITORY)) {
    if (name === 'highLateral') continue;
    const hits = depressed.filter((l) => leads.includes(l));
    if (hits.length >= 2 && hasContiguous(hits, leads)) {
      depressionTerritories.push(name);
      features.add('stDepression');
      statements.push(
        `ST depression in ${hits.join(', ')} (${hits
          .map((l) => `${l} ${mm(stOf(input, l)?.jMv ?? 0)} mm`)
          .join(', ')}) — ${name} territory.`,
      );
    }
  }

  // Widespread depression with aVR elevation identifies a very high-risk group.
  const avr = stOf(input, 'aVR');
  if (depressed.length >= 6 && avr && avr.jMv >= 0.1) {
    features.add('stDepression');
    statements.push('Widespread ST depression with ST elevation in aVR — this pattern suggests left main or severe multivessel disease and warrants immediate discussion.');
  }

  // ── T wave inversion ──────────────────────────────────────────────
  // aVR, V1 and III commonly show inversion in health and are excluded.
  const inversionCandidates: LeadName[] = ['I', 'II', 'aVL', 'aVF', 'V2', 'V3', 'V4', 'V5', 'V6'];
  const inverted = inversionCandidates.filter((l) => {
    const a = amp(input, l);
    return a && a.tMv <= -0.1;
  });
  for (const [name, leads] of Object.entries(LEAD_TERRITORY)) {
    if (name === 'highLateral') continue;
    const hits = inverted.filter((l) => leads.includes(l));
    if (hits.length >= 2 && hasContiguous(hits, leads)) {
      features.add('tInversion');
      statements.push(`T wave inversion in ${hits.join(', ')} — ${name} territory.`);
    }
  }

  // ── Pathological Q waves ──────────────────────────────────────────
  // V1 and V2 are excluded: a QS complex there is a common normal variant and
  // would otherwise be reported as an anteroseptal infarct on most tracings.
  const qCandidates: LeadName[] = ['I', 'II', 'aVL', 'aVF', 'V3', 'V4', 'V5', 'V6'];
  const pathologicalQ = qCandidates.filter((l) => {
    const a = amp(input, l);
    if (!a) return false;
    // Both limbs of the criterion require real depth: a narrow septal q is
    // normal, and a shallow slur is not a Q wave whatever its duration.
    return (a.qDurationMs >= 40 && a.qMv >= 0.1) || (a.rMv > 0.05 && a.qMv >= 0.25 * a.rMv && a.qMv >= 0.15);
  });
  for (const [name, leads] of Object.entries(LEAD_TERRITORY)) {
    if (name === 'highLateral') continue;
    const hits = pathologicalQ.filter((l) => leads.includes(l));
    if (hits.length >= 2 && hasContiguous(hits, leads)) {
      features.add('qWaves');
      statements.push(`Pathological Q waves in ${hits.join(', ')} — ${name} territory, indicating established myocardial scar.`);
    }
  }

  // ── Bundle branch block ───────────────────────────────────────────
  const qrs = input.qrsMs ?? 0;
  if (twelveLead && qrs >= 120) {
    const v1 = amp(input, 'V1');
    const v6 = amp(input, 'V6');
    const i = amp(input, 'I');

    const v1Negative = v1 ? v1.sMv > v1.rMv : false;
    const v1RsR = v1 ? v1.rPrimeMv > 0.05 && v1.rMv > 0.05 : false;
    const lateralWideS = (v6?.sMv ?? 0) > 0.15 || (i?.sMv ?? 0) > 0.15;
    const lateralMonophasicR = v6 ? v6.rMv > 0.5 && v6.qMv < 0.05 && v6.sMv < 0.1 : false;

    if (v1Negative && lateralMonophasicR) {
      features.add('lbbb');
      statements.push(`Left bundle branch block: QRS ${Math.round(qrs)} ms with a dominant S wave in V1 and a broad monophasic R wave laterally. Conventional ST interpretation does not apply — the Sgarbossa criteria are required.`);
    } else if (v1RsR && lateralWideS) {
      features.add('rbbb');
      statements.push(`Right bundle branch block: QRS ${Math.round(qrs)} ms with an RSR′ pattern in V1 and a broad S wave laterally.`);
    } else {
      statements.push(`Non-specific intraventricular conduction delay: QRS ${Math.round(qrs)} ms without a typical bundle branch block pattern.`);
    }
  }

  // ── Fascicular block ──────────────────────────────────────────────
  if (twelveLead && input.axisDeg !== null && input.axisDeg <= -45 && qrs < 120) {
    const avl = amp(input, 'aVL');
    const ii = amp(input, 'II');
    const iii = amp(input, 'III');
    const qRinAvl = avl ? avl.rMv > 0.1 : false;
    const rSinferior = ii && iii ? ii.sMv > ii.rMv && iii.sMv > iii.rMv : false;
    if (qRinAvl && rSinferior) {
      features.add('lafb');
      statements.push(`Left anterior fascicular block: axis ${input.axisDeg}° with qR in aVL and rS inferiorly.`);
    }
  }

  // ── Left ventricular hypertrophy ──────────────────────────────────
  if (twelveLead) {
    const v1 = amp(input, 'V1');
    const v5 = amp(input, 'V5');
    const v6 = amp(input, 'V6');
    const avl = amp(input, 'aVL');
    const v3 = amp(input, 'V3');

    const sokolow = (v1?.sMv ?? 0) + Math.max(v5?.rMv ?? 0, v6?.rMv ?? 0);
    const cornellThreshold = input.sex === 'female' ? 2.0 : 2.8;
    const cornell = (avl?.rMv ?? 0) + (v3?.sMv ?? 0);

    if (sokolow >= 3.5 || cornell >= cornellThreshold) {
      features.add('lvh');
      const which = sokolow >= 3.5
        ? `Sokolow-Lyon ${mm(sokolow)} mm (threshold 35 mm)`
        : `Cornell ${mm(cornell)} mm (threshold ${mm(cornellThreshold)} mm)`;
      statements.push(`Voltage criteria for left ventricular hypertrophy met: ${which}. Electrocardiographic criteria are specific but insensitive — echocardiography is definitive.`);
    }

    // ── Right ventricular hypertrophy ───────────────────────────────
    if (v1 && v1.rsRatio > 1 && v1.rMv >= 0.7 && input.axisDeg !== null && input.axisDeg > 90) {
      features.add('rvh');
      statements.push(`Dominant R wave in V1 with right axis deviation (${input.axisDeg}°) — right ventricular hypertrophy or right heart strain.`);
    }

    // ── Poor R wave progression ─────────────────────────────────────
    const v2 = amp(input, 'V2');
    const v4 = amp(input, 'V4');
    if (v3 && v3.rMv < 0.3 && v2 && v4 && v4.rMv < 0.5) {
      statements.push('Poor R wave progression across the precordial leads — consider prior anterior infarction, lead placement or chronic lung disease.');
    }

    // ── Low voltage ─────────────────────────────────────────────────
    const limb = (['I', 'II', 'III', 'aVR', 'aVL', 'aVF'] as LeadName[])
      .map((l) => amp(input, l)?.qrsAmplitudeMv ?? null)
      .filter((v): v is number => v !== null);
    const precordial = (['V1', 'V2', 'V3', 'V4', 'V5', 'V6'] as LeadName[])
      .map((l) => amp(input, l)?.qrsAmplitudeMv ?? null)
      .filter((v): v is number => v !== null);
    // Generalised low voltage requires both territories to be small; limb-lead
    // voltages alone are reduced by body habitus far more often than by
    // anything pathological.
    const lowLimb = limb.length >= 4 && limb.every((v) => v < 0.5);
    const lowPrecordial = precordial.length >= 4 && precordial.every((v) => v < 1.0);
    if (lowLimb && lowPrecordial) {
      features.add('lowVoltage');
      statements.push('Low QRS voltage — consider pericardial effusion, obesity, hyperinflation, hypothyroidism or infiltrative cardiomyopathy.');
    }
  }

  // ── Atrial abnormality ────────────────────────────────────────────
  const leadII = amp(input, 'II');
  if (leadII && leadII.pMv >= 0.25) {
    features.add('atrialEnlargement');
    statements.push(`Tall P wave in lead II (${mm(leadII.pMv)} mm) — right atrial enlargement (P pulmonale).`);
  }

  // ── QT ────────────────────────────────────────────────────────────
  const qtcLimit = input.sex === 'female' ? 470 : 450;
  if (input.qtcMs !== null) {
    if (input.qtcMs > qtcLimit) {
      features.add('longQt');
      statements.push(`QTc ${Math.round(input.qtcMs)} ms exceeds the upper limit of ${qtcLimit} ms for this patient.`);
    } else if (input.qtcMs < 340) {
      features.add('hypercalcaemiaEcg');
      statements.push(`Short QTc (${Math.round(input.qtcMs)} ms) — consider hypercalcaemia, digoxin effect or congenital short QT syndrome.`);
    }
  }

  // ── Electrolyte patterns ──────────────────────────────────────────
  // Peaked T waves: tall, and tall relative to the R wave in the same lead.
  const peaked = (['II', 'V2', 'V3', 'V4', 'V5'] as LeadName[]).filter((l) => {
    const a = amp(input, l);
    if (!a) return false;
    const limit = l.startsWith('V') ? 1.0 : 0.6;
    return a.tMv >= limit && (a.rMv < 0.05 || a.tMv / a.rMv > 0.75);
  });
  if (peaked.length >= 2) {
    features.add('hyperkalaemiaEcg');
    statements.push(`Tall peaked T waves in ${peaked.join(', ')} — consider hyperkalaemia and check the potassium urgently.`);
  }

  const flattened = (['I', 'II', 'V4', 'V5', 'V6'] as LeadName[]).filter((l) => {
    const a = amp(input, l);
    return a && a.rMv > 0.5 && Math.abs(a.tMv) < 0.1;
  });
  if (flattened.length >= 3 && input.qtcMs !== null && input.qtcMs > qtcLimit) {
    features.add('hypokalaemiaEcg');
    statements.push(`Flattened T waves in ${flattened.join(', ')} with a prolonged QT interval — consider hypokalaemia and hypomagnesaemia.`);
  }

  // ── Pre-excitation ────────────────────────────────────────────────
  if (
    input.prMs !== null && input.prMs < 120 &&
    qrs > 110 && input.initialSlopeRatio !== null && input.initialSlopeRatio < 0.35
  ) {
    features.add('wpw');
    statements.push(`Short PR interval (${Math.round(input.prMs)} ms) with a slurred QRS upstroke — ventricular pre-excitation.`);
  }

  // ── Pericarditis pattern ──────────────────────────────────────────
  if (twelveLead && elevated.length >= 5 && depressed.length === 0) {
    const reciprocal = input.st.filter((s) => s.lead !== 'aVR' && s.lead !== 'V1' && s.jMv <= -0.05).length;
    if (reciprocal === 0) {
      features.add('pericarditis');
      statements.push('Widespread ST elevation without reciprocal depression — consider acute pericarditis, though myocardial infarction must be excluded first.');
    }
  }

  return {
    features: [...features],
    statements,
    stElevationTerritories: elevationTerritories,
    stDepressionTerritories: depressionTerritories,
  };
}
