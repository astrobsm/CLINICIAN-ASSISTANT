/**
 * ECG ANALYSIS MODULE
 *
 * Interprets the printed measurements (rate, intervals, axis) captured by OCR,
 * the machine or reporting statements, and any features the clinician ticks in
 * the review panel. Produces an interpretation with an explicit urgency
 * classification.
 *
 * Scope note carried into the report: this module does not perform waveform
 * signal analysis of the ECG trace itself.
 */
import type { ClinicalContext } from '../context';
import { uniq } from '../context';
import { fmt } from '../units';
import type { EcgData, Finding, ModuleResult, Severity } from '../types';
import { finding, maxSeverity } from '../types';
import { rollUp } from '../severity';
import { ECG_FEATURE_BY_KEY, ECG_FEATURES, URGENCY_LABEL, URGENCY_RANK, detectEcgFeatures } from './ecgFeatures';
import type { EcgUrgency } from './ecgFeatures';
import { reconcile } from '../../ecg/reconcile';

export const emptyEcg = (): EcgData => ({
  rateBpm: null,
  rhythm: '',
  axisDegrees: null,
  axisText: '',
  prMs: null,
  qrsMs: null,
  qtMs: null,
  qtcMs: null,
  statements: [],
  features: {},
  leadDetail: '',
});

/** Bazett correction, used when the report gives QT and rate but no QTc. */
export function bazettQtc(qtMs: number, rateBpm: number): number {
  const rr = 60 / rateBpm;
  return Math.round(qtMs / Math.sqrt(rr));
}

export function describeAxis(deg: number): string {
  if (deg >= -30 && deg <= 90) return 'Normal axis';
  if (deg > 90 && deg <= 180) return 'Right axis deviation';
  if (deg < -30 && deg >= -90) return 'Left axis deviation';
  return 'Extreme axis deviation (north-west axis)';
}

export function analyseEcg(ctx: ClinicalContext): ModuleResult {
  const findings: Finding[] = [];
  const derived: ModuleResult['derived'] = {};
  const p = ctx.patient;

  // Merge all scanned ECGs — later documents supersede for scalar values.
  const ecgs = ctx.extraction.ecg;
  const merged: EcgData = emptyEcg();
  const waveform = [...ecgs].reverse().find((e) => e.waveform)?.waveform;
  const waveformError = [...ecgs].reverse().find((e) => e.waveformError)?.waveformError;
  for (const e of ecgs) {
    merged.rateBpm = e.rateBpm ?? merged.rateBpm;
    merged.rhythm = e.rhythm || merged.rhythm;
    merged.axisDegrees = e.axisDegrees ?? merged.axisDegrees;
    merged.axisText = e.axisText || merged.axisText;
    merged.prMs = e.prMs ?? merged.prMs;
    merged.qrsMs = e.qrsMs ?? merged.qrsMs;
    merged.qtMs = e.qtMs ?? merged.qtMs;
    merged.qtcMs = e.qtcMs ?? merged.qtcMs;
    merged.leadDetail = e.leadDetail || merged.leadDetail;
    merged.statements.push(...e.statements);
    Object.assign(merged.features, e.features);
  }

  // Analytes may also arrive through the generic lab parser.
  merged.rateBpm = merged.rateBpm ?? ctx.v('ecgRate');
  merged.prMs = merged.prMs ?? ctx.v('ecgPr');
  merged.qrsMs = merged.qrsMs ?? ctx.v('ecgQrs');
  merged.qtMs = merged.qtMs ?? ctx.v('ecgQt');
  merged.qtcMs = merged.qtcMs ?? ctx.v('ecgQtc');
  merged.axisDegrees = merged.axisDegrees ?? ctx.v('ecgAxis');

  // Where the report printed no measurement, the value computed from the
  // digitised trace fills the gap. Where both exist the printed value is kept
  // — it derives from the recorder's own raw signal — and any material
  // disagreement is reported separately rather than silently resolved.
  const printed = {
    rateBpm: merged.rateBpm, prMs: merged.prMs, qrsMs: merged.qrsMs,
    qtMs: merged.qtMs, qtcMs: merged.qtcMs, axisDegrees: merged.axisDegrees,
  };
  // Reconciliation is done here rather than per-document, because the printed
  // measurements and the waveform can arrive on separate scans — a photograph
  // of the tracing and a printout of the report.
  const discrepancies = waveform ? reconcile(waveform, printed) : [];

  if (waveform) {
    const w = waveform.measurements;
    merged.rateBpm = merged.rateBpm ?? w.heartRateBpm;
    merged.prMs = merged.prMs ?? w.prMs;
    merged.qrsMs = merged.qrsMs ?? w.qrsMs;
    merged.qtMs = merged.qtMs ?? w.qtMs;
    merged.qtcMs = merged.qtcMs ?? w.qtcBazettMs;
    merged.axisDegrees = merged.axisDegrees ?? w.axisDeg;
    if (!merged.rhythm) merged.rhythm = waveform.rhythm.label;
    merged.statements.push(...waveform.statements);
  }

  const present = ecgs.length > 0 || ctx.moduleAnalytes('ecg').length > 0;

  // Feature set = statements detected + clinician ticks.
  const statementText = merged.statements.join('\n');
  const detected = new Set<string>([
    ...detectEcgFeatures(`${statementText}\n${merged.rhythm}`),
    ...Object.entries(merged.features).filter(([, on]) => on).map(([k]) => k),
  ]);

  // Derive QTc if absent.
  if (merged.qtcMs === null && merged.qtMs !== null && merged.rateBpm) {
    merged.qtcMs = bazettQtc(merged.qtMs, merged.rateBpm);
    derived.qtcDerived = {
      label: 'QTc (Bazett, calculated)',
      value: `${merged.qtcMs} ms`,
      note: 'Calculated from the reported QT and rate. Bazett over-corrects at high rates — interpret with caution above 100 bpm.',
    };
  }

  // ── Structured measurement summary ───────────────────────────────────
  derived.measurements = {
    label: 'Reported measurements',
    value: uniq([
      merged.rateBpm !== null ? `Rate ${fmt(merged.rateBpm, 0)} bpm` : '',
      merged.prMs !== null ? `PR ${fmt(merged.prMs, 0)} ms` : '',
      merged.qrsMs !== null ? `QRS ${fmt(merged.qrsMs, 0)} ms` : '',
      merged.qtMs !== null ? `QT ${fmt(merged.qtMs, 0)} ms` : '',
      merged.qtcMs !== null ? `QTc ${fmt(merged.qtcMs, 0)} ms` : '',
      merged.axisDegrees !== null ? `Axis ${fmt(merged.axisDegrees, 0)}°` : '',
    ]).join(' · ') || 'No numeric measurements extracted',
  };

  if (merged.axisDegrees !== null) {
    derived.axis = { label: 'Cardiac axis', value: `${fmt(merged.axisDegrees, 0)}° — ${describeAxis(merged.axisDegrees)}` };
  } else if (merged.axisText) {
    derived.axis = { label: 'Cardiac axis', value: merged.axisText };
  }

  derived.rhythmStatement = {
    label: 'Rhythm',
    value: merged.rhythm || (detected.has('af') ? 'Atrial fibrillation' : detected.has('paced') ? 'Paced rhythm' : merged.rateBpm !== null ? (merged.rateBpm > 100 ? 'Tachycardic — rhythm not stated' : merged.rateBpm < 60 ? 'Bradycardic — rhythm not stated' : 'Rate within normal range — rhythm not stated') : 'Not stated'),
  };

  if (waveform) {
    const w = waveform.measurements;
    const d = waveform.digitised;

    derived.scope = {
      label: 'Analysis scope',
      value: 'Waveform signal analysis + statement interpretation',
      note: `The trace was digitised from the image and analysed as a signal: ${d.leads.length} leads recovered from a ${d.layout} layout at ${d.pxPerMm.toFixed(1)} pixels per millimetre. Measurements below are drawn from the printed report where it carries them, and from the digitised signal otherwise. The tracing must still be reviewed directly by a competent clinician.`,
    };

    derived.digitisation = {
      label: 'Digitisation quality',
      value: `${Math.round(d.quality.score * 100)}%`,
      note: [
        d.gridDetected ? `Grid measured at ${d.pxPerMm.toFixed(2)} px/mm` : 'Grid not detected',
        d.calibrationPulseMm !== null ? `calibration pulse ${d.calibrationPulseMm.toFixed(1)} mm (${d.mmPerMv} mm/mV)` : 'no calibration pulse found',
        d.rotationDeg ? `rotation ${d.rotationDeg.toFixed(1)}° corrected` : '',
        `${w.beats} complexes analysed`,
      ].filter(Boolean).join(' · '),
    };

    derived.computedMeasurements = {
      label: 'Measured from the digitised trace',
      value: uniq([
        w.heartRateBpm !== null ? `Rate ${w.heartRateBpm} bpm` : '',
        w.prMs !== null ? `PR ${w.prMs} ms` : '',
        w.qrsMs !== null ? `QRS ${w.qrsMs} ms` : '',
        w.qtMs !== null ? `QT ${w.qtMs} ms` : '',
        w.qtcBazettMs !== null ? `QTc ${w.qtcBazettMs} ms (Bazett)` : '',
        w.qtcFridericiaMs !== null ? `QTc ${w.qtcFridericiaMs} ms (Fridericia)` : '',
        w.axisDeg !== null ? `Axis ${w.axisDeg}°` : '',
      ]).join(' · ') || 'No measurements could be derived',
      note: 'Computed independently of anything printed on the report.',
    };

    const significantSt = w.st.filter((s) => Math.abs(s.jMv) >= 0.05);
    if (significantSt.length) {
      derived.stLevels = {
        label: 'ST deviation at the J point',
        value: significantSt
          .sort((a, b) => Math.abs(b.jMv) - Math.abs(a.jMv))
          .map((s) => `${s.lead} ${(s.jMv * 10) >= 0 ? '+' : ''}${(s.jMv * 10).toFixed(1)} mm`)
          .join(' · '),
        note: 'Measured against the PR segment of each beat and reported as the median across beats.',
      };
    }

    if (w.rrIrregularity !== null) {
      derived.rrVariability = {
        label: 'RR variability',
        value: `${(w.rrIrregularity * 100).toFixed(0)}% coefficient of variation`,
        note: waveform.rhythm.regular ? 'Consistent with a regular rhythm.' : 'Consistent with an irregular rhythm.',
      };
    }

    if (d.quality.warnings.length) {
      derived.digitisationWarnings = {
        label: 'Digitisation limitations',
        value: `${d.quality.warnings.length} noted`,
        note: d.quality.warnings.join(' '),
      };
    }
  } else {
    derived.scope = {
      label: 'Analysis scope',
      value: waveformError ? 'Statement interpretation only — waveform analysis unavailable' : 'Measurement and statement interpretation',
      note: waveformError
        ? `The trace could not be digitised: ${waveformError} Interpretation below rests only on the printed intervals, the reporting statements captured by OCR, and the features confirmed by the clinician.`
        : 'This module interprets the printed intervals, the reporting statements captured by OCR, and the features confirmed by the clinician. The tracing must be reviewed directly by a competent clinician.',
    };
  }

  // ── Feature-driven findings ──────────────────────────────────────────
  let urgency: EcgUrgency = 'routine';
  for (const key of detected) {
    const def = ECG_FEATURE_BY_KEY[key];
    if (!def) continue;
    if (URGENCY_RANK[def.urgency] > URGENCY_RANK[urgency]) urgency = def.urgency;

    // Electrolyte-related ECG features escalate when the laboratory value confirms them.
    let severity: Severity = def.severity;
    let extra = '';
    if (key === 'hyperkalaemiaEcg' && ctx.gt('k', 6.0)) {
      severity = 'life-threatening';
      extra = ` The measured potassium of ${fmt(ctx.v('k'), 1)} mmol/L confirms hyperkalaemia — treat immediately.`;
    }
    if (key === 'hypokalaemiaEcg' && ctx.lt('k', 3.0)) {
      severity = 'critical';
      extra = ` The measured potassium of ${fmt(ctx.v('k'), 1)} mmol/L confirms significant hypokalaemia.`;
    }
    if (key === 'longQt' && merged.qtcMs !== null && merged.qtcMs > 550) {
      severity = 'life-threatening';
      extra = ` The QTc of ${fmt(merged.qtcMs, 0)} ms is in the highest-risk range for torsades de pointes.`;
    }

    findings.push(finding({
      id: `ecg.${key}`,
      module: 'ecg',
      title: def.label,
      severity,
      interpretation: def.interpretation + extra,
      basis: uniq(['ecg:statements', key]),
      differentials: def.differentials,
      investigations: def.investigations,
      implications: def.implications,
      monitoring: def.monitoring,
      guidance: def.guidance,
      tags: uniq([...def.tags, `ecg:${key}`]),
    }));
  }

  // ── Measurement-driven findings not already covered by a feature ─────
  const rate = merged.rateBpm;
  if (rate !== null) {
    if (rate > 100 && !detected.has('sinusTach') && !detected.has('svt') && !detected.has('vt') && !detected.has('af') && !detected.has('aflutter')) {
      findings.push(finding({
        id: 'ecg.tachycardia',
        module: 'ecg',
        title: rate > 150 ? 'Marked tachycardia' : 'Tachycardia',
        severity: rate > 180 ? 'critical' : rate > 150 ? 'significant' : 'moderate',
        interpretation: `Reported ventricular rate ${fmt(rate, 0)} bpm without a stated rhythm diagnosis. The rhythm must be characterised — the distinction between sinus tachycardia, a supraventricular arrhythmia and a broad complex tachycardia determines management entirely.`,
        basis: ['ecgRate'],
        differentials: ['Sinus tachycardia secondary to pain, fever, sepsis, hypovolaemia or hypoxaemia', 'Atrial fibrillation or flutter', 'Supraventricular tachycardia', 'Ventricular tachycardia', 'Thyrotoxicosis', 'Drug effect'],
        investigations: ['Direct review of the 12-lead tracing by a competent clinician', 'Full physiological observations', 'Electrolytes, full blood count, thyroid function', 'Consider blood gas and septic screen'],
        implications: ['Assess immediately for adverse features: shock, syncope, myocardial ischaemia and heart failure.'],
        monitoring: ['Continuous cardiac monitoring if the rate exceeds 150 or adverse features are present'],
        guidance: ['Follow the adult tachycardia algorithm where the patient is compromised.'],
        tags: ['tachyarrhythmia'],
      }));
      if (rate > 150 && URGENCY_RANK.urgent > URGENCY_RANK[urgency]) urgency = 'urgent';
    }
    if (rate < 60 && !detected.has('sinusBrady') && !detected.has('avb3') && !detected.has('paced')) {
      findings.push(finding({
        id: 'ecg.bradycardia',
        module: 'ecg',
        title: rate < 40 ? 'Marked bradycardia' : 'Bradycardia',
        severity: rate < 40 ? 'critical' : 'moderate',
        interpretation: `Reported rate ${fmt(rate, 0)} bpm. Determine whether the rhythm is sinus with a physiological cause, or a conduction abnormality requiring intervention.`,
        basis: ['ecgRate'],
        differentials: ['Sinus bradycardia — physiological or drug-induced', 'Sinoatrial disease', 'Second or third degree AV block', 'Hypothyroidism', 'Hyperkalaemia', 'Hypothermia', 'Raised intracranial pressure', 'Inferior ischaemia'],
        investigations: ['Direct review of the 12-lead tracing', 'Potassium, thyroid function', 'Medication review for rate-limiting drugs', 'Troponin if ischaemia is suspected'],
        implications: ['Assess for adverse features: shock, syncope, myocardial ischaemia and heart failure.'],
        monitoring: ['Continuous cardiac monitoring where the rate is below 40 or adverse features are present'],
        guidance: ['Follow the adult bradycardia algorithm: atropine 500 micrograms intravenously, repeated to a maximum of 3 mg, then second-line measures including transcutaneous pacing.'],
        tags: ['bradyarrhythmia'],
      }));
      if (rate < 40 && URGENCY_RANK.urgent > URGENCY_RANK[urgency]) urgency = 'urgent';
    }
  }

  if (merged.prMs !== null && merged.prMs > 200 && !detected.has('avb1')) {
    findings.push(finding({
      id: 'ecg.prlong',
      module: 'ecg',
      title: 'Prolonged PR interval (first degree AV block)',
      severity: merged.prMs > 300 ? 'moderate' : 'minor',
      interpretation: `PR interval ${fmt(merged.prMs, 0)} ms exceeds the upper limit of 200 ms.`,
      basis: ['ecgPr'],
      differentials: ECG_FEATURE_BY_KEY.avb1.differentials,
      investigations: ECG_FEATURE_BY_KEY.avb1.investigations,
      implications: ECG_FEATURE_BY_KEY.avb1.implications,
      monitoring: ECG_FEATURE_BY_KEY.avb1.monitoring,
      guidance: ECG_FEATURE_BY_KEY.avb1.guidance,
      tags: ['conduction-abnormality'],
    }));
  }

  if (merged.qrsMs !== null && merged.qrsMs > 120 && !detected.has('lbbb') && !detected.has('rbbb') && !detected.has('paced') && !detected.has('vt')) {
    findings.push(finding({
      id: 'ecg.qrswide',
      module: 'ecg',
      title: 'Broad QRS complex',
      severity: merged.qrsMs > 160 ? 'significant' : 'moderate',
      interpretation:
        `QRS duration ${fmt(merged.qrsMs, 0)} ms. A broad QRS requires characterisation — bundle branch block, ventricular pacing, ventricular rhythm, pre-excitation, hyperkalaemia or sodium channel blockade.` +
        (ctx.gt('k', 6.0) ? ` Note the coexisting hyperkalaemia (potassium ${fmt(ctx.v('k'), 1)} mmol/L) — QRS widening in this context is a pre-terminal sign requiring immediate treatment.` : ''),
      basis: uniq(['ecgQrs', ctx.v('k') !== null ? 'k' : '']),
      differentials: ['Left or right bundle branch block', 'Ventricular pacing', 'Ventricular rhythm', 'Hyperkalaemia', 'Sodium channel blocker toxicity — tricyclic antidepressants, flecainide', 'Pre-excitation'],
      investigations: ['Direct review of the tracing', 'Urgent potassium', 'Medication and overdose history', 'Compare with previous ECGs'],
      implications: [ctx.gt('k', 6.0) ? 'Immediate treatment for hyperkalaemia is indicated.' : 'Determine whether the change is new by comparison with previous tracings.'],
      monitoring: ['Cardiac monitoring where the QRS exceeds 160 ms or hyperkalaemia is present'],
      guidance: ['Sodium bicarbonate is the specific treatment for QRS widening due to sodium channel blocker toxicity.'],
      tags: ['conduction-abnormality', ctx.gt('k', 6.0) ? 'hyperkalaemia' : ''],
    }));
    if (ctx.gt('k', 6.0)) urgency = 'immediate';
  }

  const qtcLimit = p.sex === 'female' ? 470 : 450;
  if (merged.qtcMs !== null && merged.qtcMs > qtcLimit && !detected.has('longQt')) {
    const def = ECG_FEATURE_BY_KEY.longQt;
    const sev: Severity = merged.qtcMs > 550 ? 'life-threatening' : merged.qtcMs > 500 ? 'critical' : 'significant';
    findings.push(finding({
      id: 'ecg.qtc',
      module: 'ecg',
      title: `Prolonged QTc (${fmt(merged.qtcMs, 0)} ms)`,
      severity: sev,
      interpretation:
        `QTc ${fmt(merged.qtcMs, 0)} ms exceeds the upper limit of ${qtcLimit} ms for this patient. ` + def.interpretation +
        uniq([
          ctx.lt('k', 3.5) ? ` Potassium is ${fmt(ctx.v('k'), 1)} mmol/L.` : '',
          ctx.lt('magnesium', 0.7) ? ` Magnesium is ${fmt(ctx.v('magnesium'), 2)} mmol/L.` : '',
          ctx.lt('calcium', 2.2) ? ` Calcium is ${fmt(ctx.v('calcium'), 2)} mmol/L.` : '',
        ]).join(''),
      basis: uniq(['ecgQtc', ctx.v('k') !== null ? 'k' : '', ctx.v('magnesium') !== null ? 'magnesium' : '']),
      differentials: def.differentials,
      investigations: def.investigations,
      implications: def.implications,
      monitoring: def.monitoring,
      guidance: def.guidance,
      tags: ['qt-prolongation-risk', 'arrhythmia-risk'],
    }));
    if (merged.qtcMs > 500 && URGENCY_RANK.urgent > URGENCY_RANK[urgency]) urgency = 'urgent';
  }

  if (merged.axisDegrees !== null) {
    const axisDesc = describeAxis(merged.axisDegrees);
    if (axisDesc !== 'Normal axis' && !detected.has('rvh') && !detected.has('lafb')) {
      findings.push(finding({
        id: 'ecg.axis',
        module: 'ecg',
        title: axisDesc,
        severity: axisDesc.startsWith('Extreme') ? 'significant' : 'minor',
        interpretation: `Cardiac axis ${fmt(merged.axisDegrees, 0)}° — ${axisDesc.toLowerCase()}.`,
        basis: ['ecgAxis'],
        differentials: axisDesc.includes('Right')
          ? ['Right ventricular hypertrophy', 'Pulmonary embolism', 'Chronic lung disease', 'Left posterior fascicular block', 'Lateral myocardial infarction', 'Normal variant in tall thin individuals']
          : axisDesc.includes('Left')
            ? ['Left anterior fascicular block', 'Left ventricular hypertrophy', 'Inferior myocardial infarction', 'Normal variant in the obese or elderly']
            : ['Ventricular rhythm', 'Hyperkalaemia', 'Lead misplacement', 'Congenital heart disease'],
        investigations: ['Compare with previous ECGs', 'Echocardiography where structural disease is suspected', 'Verify lead placement'],
        implications: ['Axis deviation is rarely significant in isolation but adds weight when combined with other findings.'],
        monitoring: ['Routine'],
        guidance: [],
        tags: ['axis-deviation'],
      }));
    }
  }

  // ── Disagreement between the computed and printed measurements ───────
  if (discrepancies.length) {
    const major = discrepancies.filter((d) => d.significant);
    if (major.length) {
      findings.push(finding({
        id: 'ecg.discrepancy',
        module: 'ecg',
        title: `Measurement disagreement between the digitised trace and the printed report (${major.length})`,
        severity: major.some((d) => /QTc|QRS/.test(d.field)) ? 'moderate' : 'minor',
        interpretation:
          major.map((d) => `${d.field}: computed ${Math.round(d.computed ?? 0)}${d.unit}, printed ${Math.round(d.printed ?? 0)}${d.unit}.`).join(' ') +
          ' Both figures are shown so the difference is visible rather than hidden. The printed values come from the recording equipment\'s analysis of its own raw signal and are generally the more accurate; the computed values are independent and are derived from the trace as scanned.',
        basis: ['ecg:waveform'],
        differentials: [],
        investigations: ['Read the intervals directly from the tracing where the difference would change management, particularly for QTc and QRS duration.'],
        implications: [
          'A disagreement can arise from an imperfect scan, from a difference in which beats were measured, or from a genuine measurement error on either side.',
          major.some((d) => /QTc/.test(d.field)) ? 'QTc disagreement matters: the threshold for stopping QT-prolonging drugs sits at 500 ms.' : '',
        ].filter(Boolean),
        monitoring: ['Repeat the ECG if the measurement is decision-critical and the scan quality is poor.'],
        guidance: ['Where a measurement determines management, verify it against the original tracing rather than relying on either automated figure.'],
        tags: ['ecg-measurement-discrepancy'],
      }));
    }
  }

  if (waveform && waveform.quality.score < 0.45) {
    findings.push(finding({
      id: 'ecg.lowquality',
      module: 'ecg',
      title: 'Low-confidence ECG digitisation',
      severity: 'moderate',
      interpretation:
        `The trace was digitised at a confidence of ${Math.round(waveform.quality.score * 100)}%. ` +
        waveform.quality.warnings.join(' ') +
        ' Signal-derived findings from this tracing should be treated as prompts to look at the ECG, not as measurements to act on.',
      basis: ['ecg:waveform'],
      differentials: [],
      investigations: ['Rescan the ECG square-on, filling the frame, under even lighting; or read the tracing directly.'],
      implications: ['Interval and amplitude criteria are unreliable at this digitisation quality.'],
      monitoring: [],
      guidance: [],
      tags: ['ecg-low-quality'],
    }));
  }

  // ── Urgency classification ───────────────────────────────────────────
  const severity = rollUp(findings.map((f) => f.severity));
  if (severity === 'life-threatening') urgency = 'immediate';
  else if (severity === 'critical' && URGENCY_RANK.urgent > URGENCY_RANK[urgency]) urgency = 'urgent';

  if (present) {
    derived.urgency = {
      label: 'ECG urgency classification',
      value: URGENCY_LABEL[urgency],
      note: urgency === 'immediate'
        ? 'Findings on this ECG require immediate clinician review. Do not defer.'
        : urgency === 'urgent'
          ? 'Review by a senior clinician is required without delay.'
          : urgency === 'same-day'
            ? 'Arrange clinical review during the current working day.'
            : 'No time-critical features identified from the extracted data.',
    };
    if (statementText) {
      derived.statements = { label: 'Reported statements', value: merged.statements.join(' · ') };
    }
  }

  const titles = uniq(findings.map((f) => f.title));

  return {
    module: 'ecg',
    present,
    analytes: ctx.moduleAnalytes('ecg'),
    observations: ctx.moduleObservations('ecg'),
    findings,
    summary: !present
      ? 'No ECG data available.'
      : titles.length
        ? `${titles.join('; ')}. ${URGENCY_LABEL[urgency]}.`
        : 'No abnormality identified from the extracted measurements and statements. Direct review of the tracing remains necessary.',
    severity: maxSeverity(severity, 'normal'),
    derived,
  };
}

/** Exposed so the review panel can render the tick-list in a stable order. */
export const ECG_CHECKLIST = ECG_FEATURES.map((f) => ({ key: f.key, label: f.label, group: f.group }));
