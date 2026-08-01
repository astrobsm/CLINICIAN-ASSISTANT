/**
 * CARDIAC BIOMARKER ANALYSIS MODULE
 *
 * Troponin, natriuretic peptides and creatine kinase. Troponin elevation is
 * deliberately framed as myocardial injury rather than infarction — the
 * distinction requires a rise-and-fall pattern plus clinical, ECG or imaging
 * evidence of ischaemia.
 */
import type { ClinicalContext } from '../context';
import { uniq } from '../context';
import { fmt } from '../units';
import type { Finding, ModuleResult, Severity } from '../types';
import { finding } from '../types';
import { rollUp } from '../severity';

export function analyseCardiac(ctx: ClinicalContext): ModuleResult {
  const findings: Finding[] = [];
  const derived: ModuleResult['derived'] = {};
  const p = ctx.patient;

  const trop = ctx.v('troponin');
  const ck = ctx.v('ck');
  const ckmb = ctx.v('ckmb');
  const bnp = ctx.v('bnp');
  const ntprobnp = ctx.v('ntprobnp');
  const creat = ctx.v('creatinine');
  const egfr = ctx.v('egfr');

  if (trop !== null) {
    const ulnMultiple = trop / 14;
    derived.troponinMultiple = {
      label: 'Troponin relative to upper reference limit',
      value: `${fmt(ulnMultiple, 1)}× the 99th centile`,
      note: 'Using a generic high-sensitivity 99th centile of 14 ng/L. Local assay-specific and sex-specific thresholds must be applied for diagnostic decisions.',
    };
  }

  if (trop !== null && trop > 14) {
    const sev: Severity = trop > 1000 ? 'critical' : trop > 100 ? 'significant' : 'moderate';
    findings.push(finding({
      id: 'card.troponin',
      module: 'cardiac',
      title: trop > 100 ? 'Significantly raised troponin — myocardial injury' : 'Raised troponin — myocardial injury',
      severity: sev,
      interpretation:
        `Troponin ${fmt(trop, 0)} ng/L is above the 99th centile upper reference limit, which defines myocardial injury. ` +
        'Myocardial injury is not synonymous with myocardial infarction: infarction additionally requires a rising and/or falling pattern with clinical, electrocardiographic or imaging evidence of ischaemia. ' +
        'A single value cannot make this distinction — a repeat sample at the assay-specific interval (commonly 1 to 3 hours) is required.' +
        (creat !== null && ctx.high('creatinine') ? ' Renal impairment is present, which raises baseline troponin through reduced clearance and chronic myocardial stress; the delta between serial samples is more informative than the absolute value.' : ''),
      basis: uniq(['troponin', creat !== null ? 'creatinine' : '']),
      differentials: [
        'Type 1 myocardial infarction — atherothrombotic plaque event',
        'Type 2 myocardial infarction — supply–demand mismatch from sepsis, tachyarrhythmia, anaemia, hypotension or hypoxaemia',
        'Myocarditis',
        'Pulmonary embolism with right ventricular strain',
        'Acute or decompensated heart failure',
        'Tachyarrhythmia',
        'Chronic kidney disease',
        'Sepsis and critical illness',
        'Aortic dissection',
        'Cardiac contusion, cardioversion, ablation or cardiac surgery',
        'Takotsubo cardiomyopathy',
      ],
      investigations: uniq([
        'Repeat troponin at the assay-specific interval to establish a rise-and-fall pattern',
        '12-lead ECG immediately, repeated with any change in symptoms',
        'Full blood count, renal function and electrolytes',
        'Echocardiography to assess regional wall motion and ventricular function',
        'Chest radiograph',
        'Consider CT pulmonary angiography or CT aorta where the clinical picture suggests embolism or dissection',
      ]),
      implications: [
        'Type 1 and type 2 infarction have entirely different management: the former may require antiplatelet therapy, anticoagulation and revascularisation, the latter treatment of the precipitating illness.',
        'Do not start dual antiplatelet therapy and anticoagulation reflexively on a raised troponin alone — particularly where bleeding risk is elevated.',
        p.plannedSurgery ? 'A raised troponin before planned surgery requires cardiology input and may warrant deferral.' : '',
      ].filter(Boolean),
      monitoring: ['Serial troponin per local pathway', 'Continuous cardiac monitoring where acute coronary syndrome is suspected', 'Repeat ECG'],
      guidance: [
        'Apply the Fourth Universal Definition of Myocardial Infarction: injury plus evidence of ischaemia, with a rise and/or fall of troponin.',
        'Risk-stratify suspected acute coronary syndrome with a validated score (for example GRACE) and follow the local acute coronary syndrome pathway.',
        'ST-elevation on the ECG with this biochemistry requires immediate discussion for primary percutaneous coronary intervention.',
      ],
      tags: ['myocardial-injury', trop > 100 ? 'acs-consideration' : '', 'ecg-indicated'],
    }));
  }

  const natriuretic = ntprobnp ?? bnp;
  const natriureticLabel = ntprobnp !== null ? 'NT-proBNP' : 'BNP';
  const threshold = ntprobnp !== null ? 125 : 100;
  if (natriuretic !== null && natriuretic > threshold) {
    const veryHigh = ntprobnp !== null ? ntprobnp > 2000 : (bnp ?? 0) > 400;
    findings.push(finding({
      id: 'card.natriuretic',
      module: 'cardiac',
      title: veryHigh ? `Markedly raised ${natriureticLabel}` : `Raised ${natriureticLabel}`,
      severity: veryHigh ? 'significant' : 'moderate',
      interpretation:
        `${natriureticLabel} ${fmt(natriuretic, 0)} pg/mL.` +
        (veryHigh
          ? ' Values at this level in a patient with suspected heart failure warrant urgent (within two weeks) specialist assessment and echocardiography, and correlate with worse prognosis.'
          : ' A raised value supports, but does not confirm, heart failure — echocardiography is required for diagnosis.') +
        ' Natriuretic peptides are also raised by age, renal impairment, atrial fibrillation, pulmonary embolism, sepsis and right heart strain, and are lowered by obesity.' +
        ((egfr !== null && egfr < 60) || (creat !== null && ctx.high('creatinine')) ? ' Renal impairment is present and independently raises the level.' : ''),
      basis: uniq([ntprobnp !== null ? 'ntprobnp' : 'bnp', creat !== null ? 'creatinine' : '']),
      differentials: ['Heart failure with reduced or preserved ejection fraction', 'Atrial fibrillation', 'Pulmonary embolism', 'Chronic kidney disease', 'Sepsis and critical illness', 'Valvular heart disease', 'Pulmonary hypertension', 'Advanced age'],
      investigations: ['Transthoracic echocardiography', '12-lead ECG', 'Chest radiograph', 'Renal function, full blood count, thyroid function', 'Assess fluid status and weight'],
      implications: [
        'A normal natriuretic peptide in an untreated patient makes heart failure very unlikely — its principal value is a negative result.',
        'Where heart failure is confirmed, disease-modifying therapy should be optimised.',
      ],
      monitoring: ['Daily weights and fluid balance where heart failure is being treated', 'Renal function and electrolytes during diuresis and titration of therapy'],
      guidance: [
        'Refer for specialist assessment and echocardiography within 2 weeks where NT-proBNP exceeds 2000 pg/mL, and within 6 weeks for values between 400 and 2000 pg/mL.',
        'Do not use natriuretic peptides alone to diagnose heart failure.',
      ],
      tags: ['heart-failure-consideration', 'fluid-balance'],
    }));
  }

  if (ck !== null && ck > 1000) {
    const rhabdo = ck > 5000;
    findings.push(finding({
      id: 'card.ck',
      module: 'cardiac',
      title: rhabdo ? 'Markedly raised creatine kinase — rhabdomyolysis' : 'Raised creatine kinase',
      severity: ck > 20000 ? 'critical' : rhabdo ? 'significant' : 'moderate',
      interpretation:
        `Creatine kinase ${fmt(ck, 0)} U/L.` +
        (rhabdo ? ' Values above 5000 U/L indicate significant rhabdomyolysis with a risk of acute kidney injury, hyperkalaemia and compartment syndrome.' : ' A moderate rise most often reflects skeletal muscle rather than cardiac origin.'),
      basis: uniq(['ck', ckmb !== null ? 'ckmb' : '', creat !== null ? 'creatinine' : '']),
      differentials: ['Rhabdomyolysis — prolonged immobility (long lie), crush injury, seizures, extreme exertion', 'Statin or other drug-induced myopathy', 'Inflammatory myositis', 'Myocardial infarction (CK-MB fraction)', 'Hypothyroidism', 'Malignant hyperthermia or neuroleptic malignant syndrome', 'Alcohol excess'],
      investigations: uniq([
        'Renal function, potassium, calcium, phosphate and urate',
        'Urinalysis — dipstick positive for blood without red cells on microscopy indicates myoglobinuria',
        'Venous blood gas',
        'ECG for hyperkalaemic changes',
        'Assess limbs for compartment syndrome',
        'Thyroid function and medication review',
      ]),
      implications: [
        rhabdo ? 'Aggressive intravenous fluid resuscitation targeting a urine output of 200–300 mL/hour is the mainstay of preventing acute kidney injury.' : '',
        'Hyperkalaemia may develop rapidly from muscle breakdown and requires close monitoring.',
        'Hypocalcaemia is common early and usually should not be corrected unless symptomatic, as rebound hypercalcaemia occurs during recovery.',
      ].filter(Boolean),
      monitoring: [rhabdo ? 'Creatine kinase, renal function and potassium every 6–12 hours until falling' : 'Repeat creatine kinase in 24–48 hours', 'Strict fluid balance and hourly urine output'],
      guidance: ['Stop the precipitating drug where implicated; involve critical care where renal function is deteriorating or potassium is rising.'],
      tags: ['rhabdomyolysis', rhabdo ? 'aki-risk' : '', 'hyperkalaemia-risk'],
    }));
  }

  const analytes = ctx.moduleAnalytes('cardiac');
  const present = analytes.length > 0;
  const titles = uniq(findings.map((f) => f.title));

  return {
    module: 'cardiac',
    present,
    analytes,
    observations: ctx.moduleObservations('cardiac'),
    findings,
    summary: !present
      ? 'No cardiac biomarker data available.'
      : titles.length ? `${titles.join('; ')}.` : 'Cardiac biomarkers are within the reference intervals applied.',
    severity: rollUp(findings.map((f) => f.severity)),
    derived,
  };
}
