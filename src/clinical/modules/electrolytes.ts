/**
 * ELECTROLYTE ANALYSIS MODULE
 *
 * Grades each electrolyte disturbance, computes the derived quantities that
 * change management (corrected calcium, anion gap, osmolar gap, free water and
 * sodium deficits) and produces replacement estimates with the safety limits
 * that govern them.
 */
import type { ClinicalContext } from '../context';
import { uniq } from '../context';
import { fmt } from '../units';
import type { Finding, ModuleResult, Severity } from '../types';
import { finding } from '../types';
import { rollUp } from '../severity';
import { correctionPlan } from '../replacement';
import { ckdEpi2021 } from './renal';

/** Total body water estimate (litres) used for sodium and free-water deficits. */
export function totalBodyWater(weightKg: number, sex: string, age: number | null): number {
  const elderly = (age ?? 0) >= 65;
  const factor = sex === 'female' ? (elderly ? 0.45 : 0.5) : elderly ? 0.5 : 0.6;
  return weightKg * factor;
}

export function analyseElectrolytes(ctx: ClinicalContext): ModuleResult {
  const findings: Finding[] = [];
  const derived: ModuleResult['derived'] = {};
  const p = ctx.patient;

  const na = ctx.v('na');
  const k = ctx.v('k');
  const cl = ctx.v('cl');
  const hco3 = ctx.v('hco3');
  const ca = ctx.v('calcium');
  const ica = ctx.v('ionisedCalcium');
  const mg = ctx.v('magnesium');
  const po4 = ctx.v('phosphate');
  const alb = ctx.v('albumin');
  const glu = ctx.v('glucose');
  const urea = ctx.v('urea');
  const osm = ctx.v('osmolality');
  const creat = ctx.v('creatinine');

  const tbw = p.weightKg ? totalBodyWater(p.weightKg, p.sex, p.age) : null;

  /**
   * Renal function governs the dose of almost every replacement below, so it
   * is resolved once here — the reported value where the laboratory gave one,
   * otherwise calculated. Without it the plans fall back to a generic caution
   * rather than a specific instruction.
   */
  const egfr = ctx.v('egfr') ?? (creat !== null && p.age !== null ? ckdEpi2021(creat, p.age, p.sex) : null);

  // ── DERIVED QUANTITIES ───────────────────────────────────────────────
  let correctedCa: number | null = null;
  if (ca !== null && alb !== null) {
    correctedCa = ca + 0.02 * (40 - alb);
    derived.correctedCalcium = {
      label: 'Albumin-corrected calcium',
      value: `${fmt(correctedCa, 2)} mmol/L`,
      note: `Measured ${fmt(ca, 2)} mmol/L with albumin ${fmt(alb, 0)} g/L. Ionised calcium is preferable in critical illness and acid–base disturbance.`,
    };
  }

  if (na !== null && cl !== null && hco3 !== null) {
    const ag = na - (cl + hco3);
    const agCorrected = alb !== null ? ag + 0.25 * (40 - alb) : null;
    derived.anionGap = {
      label: 'Anion gap',
      value: `${fmt(ag, 1)} mmol/L${agCorrected !== null ? ` (albumin-corrected ${fmt(agCorrected, 1)})` : ''}`,
      note: (agCorrected ?? ag) > 16
        ? 'Raised — consider lactate, ketones, renal failure, toxic alcohols and salicylate'
        : (agCorrected ?? ag) < 8 ? 'Low — consider hypoalbuminaemia, paraproteinaemia or laboratory error' : 'Within the usual range',
    };
  }

  if (na !== null && glu !== null && urea !== null) {
    const calcOsm = 2 * na + glu + urea;
    derived.calculatedOsmolality = {
      label: 'Calculated osmolality',
      value: `${fmt(calcOsm, 0)} mOsm/kg`,
      note: osm !== null
        ? `Measured ${fmt(osm, 0)}; osmolar gap ${fmt(osm - calcOsm, 0)}${osm - calcOsm > 10 ? ' — a gap above 10 raises the possibility of toxic alcohol ingestion' : ''}`
        : 'Request measured osmolality to derive the osmolar gap where poisoning is suspected.',
    };
  }

  if (na !== null && glu !== null && glu > 10) {
    const corrNa = na + 0.4 * (glu - 5.5);
    derived.correctedSodium = {
      label: 'Glucose-corrected sodium',
      value: `${fmt(corrNa, 0)} mmol/L`,
      note: 'Hyperglycaemia draws water into the vascular space and lowers measured sodium; the corrected value reflects true tonicity.',
    };
  }

  /**
   * Correction and administration guidance for a graded finding.
   *
   * Calcium is passed through albumin-corrected because that is the value the
   * decision is actually made on, and eGFR is resolved above because the dose
   * of magnesium, phosphate and zoledronic acid all depend on it.
   */
  const rx = (id: string, severity: Severity) =>
    correctionPlan(id, {
      patient: p,
      severity,
      value: (key) => (key === 'egfr' ? egfr : key === 'calcium' ? correctedCa ?? ca : ctx.v(key)),
    }) ?? undefined;

  // ── SODIUM ───────────────────────────────────────────────────────────
  if (na !== null && ctx.low('na')) {
    const sev: Severity = na < 120 ? 'life-threatening' : na < 125 ? 'critical' : na < 130 ? 'significant' : 'moderate';
    const deficit = tbw !== null ? tbw * (130 - na) : null;
    findings.push(finding({
      id: 'lyte.hyponatraemia',
      module: 'electrolytes',
      title: na < 125 ? 'Severe hyponatraemia' : na < 130 ? 'Moderate hyponatraemia' : 'Mild hyponatraemia',
      severity: sev,
      interpretation:
        `Sodium ${fmt(na, 0)} mmol/L.` +
        (na < 125 ? ' At this level there is a risk of cerebral oedema, seizures and coma, particularly if the fall has been rapid.' : '') +
        ' Assessment requires classification by volume status and by plasma and urine osmolality — treatment differs fundamentally between hypovolaemic, euvolaemic and hypervolaemic hyponatraemia.' +
        (glu !== null && glu > 10 ? ' Note the coexisting hyperglycaemia; see the glucose-corrected sodium above.' : ''),
      basis: uniq(['na', glu !== null ? 'glucose' : '']),
      differentials: [
        'Hypovolaemic: gastrointestinal losses, diuretics, salt-wasting, adrenal insufficiency',
        'Euvolaemic: syndrome of inappropriate antidiuresis, hypothyroidism, glucocorticoid deficiency, primary polydipsia',
        'Hypervolaemic: cardiac failure, cirrhosis, nephrotic syndrome, renal failure',
        'Pseudohyponatraemia: severe hyperlipidaemia or paraproteinaemia',
        'Translocational: hyperglycaemia, mannitol',
      ],
      investigations: [
        'Paired serum and urine osmolality with urine sodium — the single most useful investigation',
        'Careful clinical assessment of volume status',
        'Thyroid function and short synacthen test if euvolaemic',
        'Medication review — thiazides, SSRIs, carbamazepine, proton pump inhibitors, desmopressin',
        'Blood glucose and lipid profile to exclude a spurious result',
      ],
      implications: uniq([
        na < 125 ? 'Symptomatic severe hyponatraemia (seizures, reduced consciousness, vomiting) requires hypertonic saline under senior supervision.' : '',
        'Overly rapid correction risks osmotic demyelination syndrome, which is frequently irreversible.',
        deficit !== null ? `Estimated sodium deficit to reach 130 mmol/L: approximately ${fmt(deficit, 0)} mmol (total body water ${fmt(tbw, 1)} L). This is an estimate for planning only and does not account for ongoing losses.` : 'Enter body weight to enable a sodium deficit estimate.',
      ]),
      monitoring: [
        na < 125 ? 'Sodium every 2–4 hours during active correction' : 'Sodium every 6–12 hours',
        'Strict fluid balance and daily weight',
        'Neurological observations',
      ],
      guidance: [
        'Limit correction to no more than 10 mmol/L in the first 24 hours and 8 mmol/L in any subsequent 24 hours; a limit of 8 mmol/L in 24 hours applies where the risk of osmotic demyelination is high (chronic hyponatraemia, alcohol excess, malnutrition, liver disease, hypokalaemia).',
        'In severe symptomatic hyponatraemia, 100–150 mL of 3% sodium chloride over 20 minutes, repeated as necessary to achieve a 5 mmol/L rise, is the widely adopted approach — give under senior supervision.',
        'Treat the cause: fluid restriction for SIAD, volume replacement for hypovolaemia, and diuresis with sodium restriction for hypervolaemic states.',
      ],
      tags: ['hyponatraemia', na < 125 ? 'severe-hyponatraemia' : ''],
      correction: rx('lyte.hyponatraemia', sev),
    }));
  }

  if (na !== null && ctx.high('na')) {
    const sev: Severity = na > 160 ? 'life-threatening' : na > 155 ? 'critical' : na > 150 ? 'significant' : 'moderate';
    const freeWaterDeficit = tbw !== null ? tbw * (na / 140 - 1) : null;
    findings.push(finding({
      id: 'lyte.hypernatraemia',
      module: 'electrolytes',
      title: na > 155 ? 'Severe hypernatraemia' : 'Hypernatraemia',
      severity: sev,
      interpretation:
        `Sodium ${fmt(na, 0)} mmol/L. Hypernatraemia almost always reflects a water deficit rather than sodium excess, and in hospital most often occurs in patients unable to access or request water.`,
      basis: ['na'],
      differentials: ['Inadequate water intake (impaired consciousness, immobility, dysphagia)', 'Excess insensible or gastrointestinal losses', 'Osmotic diuresis (hyperglycaemia, high protein feed)', 'Diabetes insipidus — cranial or nephrogenic', 'Excess sodium administration (hypertonic saline, sodium bicarbonate)'],
      investigations: ['Paired serum and urine osmolality with urine sodium', 'Fluid balance and weight review', 'Blood glucose', 'Consider water deprivation testing if diabetes insipidus is suspected', 'Medication review including lithium'],
      implications: uniq([
        'Risk of cerebral shrinkage and intracranial haemorrhage, particularly with acute rises.',
        freeWaterDeficit !== null ? `Estimated free water deficit: approximately ${fmt(freeWaterDeficit, 1)} L (total body water ${fmt(tbw, 1)} L), before accounting for ongoing losses.` : 'Enter body weight to enable a free water deficit estimate.',
        'Rapid correction of chronic hypernatraemia risks cerebral oedema.',
      ]),
      monitoring: ['Sodium every 4–6 hours during correction', 'Strict fluid balance, daily weight', 'Neurological observations'],
      guidance: [
        'Correct at no more than 10 mmol/L per 24 hours in chronic hypernatraemia (over 48 hours duration or unknown).',
        'Replace the water deficit enterally where possible; otherwise use 5% glucose or 0.45% sodium chloride, adding maintenance requirements and ongoing losses.',
      ],
      tags: ['hypernatraemia'],
      correction: rx('lyte.hypernatraemia', sev),
    }));
  }

  // ── POTASSIUM ────────────────────────────────────────────────────────
  if (k !== null && ctx.high('k')) {
    const sev: Severity = k >= 6.5 ? 'life-threatening' : k >= 6.0 ? 'critical' : k >= 5.5 ? 'significant' : 'moderate';
    findings.push(finding({
      id: 'lyte.hyperkalaemia',
      module: 'electrolytes',
      title: k >= 6.5 ? 'Severe hyperkalaemia' : k >= 6.0 ? 'Moderate hyperkalaemia' : 'Mild hyperkalaemia',
      severity: sev,
      interpretation:
        `Potassium ${fmt(k, 1)} mmol/L.` +
        (k >= 6.5
          ? ' This is a medical emergency with a risk of malignant arrhythmia and cardiac arrest. An immediate ECG is required, and treatment should not await further investigations.'
          : k >= 6.0
            ? ' An ECG is required now, together with treatment and identification of the cause.'
            : ' Confirm the result and identify the cause; a haemolysed or delayed sample is a common explanation for an unexpected value.'),
      basis: uniq(['k', creat !== null ? 'creatinine' : '']),
      differentials: [
        'Acute kidney injury or chronic kidney disease',
        'Drugs: ACE inhibitors, angiotensin receptor blockers, potassium-sparing diuretics, trimethoprim, NSAIDs, heparin',
        'Metabolic acidosis with transcellular shift',
        'Tissue breakdown — rhabdomyolysis, tumour lysis, extensive burns, haemolysis',
        'Adrenal insufficiency / hypoaldosteronism',
        'Excess potassium administration',
        'Pseudohyperkalaemia from haemolysed sample, delayed separation, fist clenching or marked thrombocytosis/leucocytosis',
      ],
      investigations: uniq([
        'Immediate 12-lead ECG',
        'Repeat potassium on a fresh, promptly processed sample (or blood gas analyser for a rapid result)',
        'Renal function and venous blood gas',
        'Creatine kinase if rhabdomyolysis is possible',
        'Full medication review',
        'Short synacthen test if adrenal insufficiency is suspected',
      ]),
      implications: [
        'ECG changes progress from peaked T waves through PR prolongation and P wave loss to QRS widening and a sine wave pattern preceding arrest — but ECG changes correlate poorly with the absolute level and their absence does not exclude risk.',
        'Stop all potassium-containing fluids and potassium-elevating drugs.',
      ],
      monitoring: [
        k >= 6.0 ? 'Continuous cardiac monitoring; recheck potassium 1 hour after treatment, then 2–4 hourly' : 'Recheck potassium within 4–6 hours',
        'Monitor blood glucose hourly for at least 6 hours after insulin–dextrose therapy',
      ],
      guidance: [
        'Potassium ≥6.5 mmol/L, or ≥6.0 mmol/L with ECG changes: give 10 mL of 10% calcium chloride or 30 mL of 10% calcium gluconate intravenously for myocardial protection, repeated as required.',
        'Shift potassium intracellularly with 10 units of soluble insulin in 25 g of glucose intravenously over 15–30 minutes; salbutamol 10–20 mg nebulised is an adjunct.',
        'Remove potassium from the body with a potassium binder (sodium zirconium cyclosilicate or patiromer) and treat the underlying cause; consider renal replacement therapy for refractory hyperkalaemia.',
        'Calcium protects the myocardium but does not lower potassium — it must always be combined with a shifting and a removal strategy.',
      ],
      tags: ['hyperkalaemia', k >= 6.0 ? 'hyperkalaemia:severe' : '', 'ecg-indicated', 'arrhythmia-risk'],
      correction: rx('lyte.hyperkalaemia', sev),
    }));
  }

  if (k !== null && ctx.low('k')) {
    const sev: Severity = k < 2.5 ? 'life-threatening' : k < 3.0 ? 'critical' : k < 3.3 ? 'significant' : 'moderate';
    const deficit = k < 3.5 ? (3.5 - k) * 100 : 0; // ~100 mmol per 0.3 mmol/L is a common teaching estimate
    findings.push(finding({
      id: 'lyte.hypokalaemia',
      module: 'electrolytes',
      title: k < 2.5 ? 'Severe hypokalaemia' : k < 3.0 ? 'Moderate hypokalaemia' : 'Mild hypokalaemia',
      severity: sev,
      interpretation:
        `Potassium ${fmt(k, 1)} mmol/L.` +
        (k < 3.0 ? ' At this level there is a significant risk of ventricular arrhythmia, particularly with coexisting digoxin therapy, QT prolongation or ischaemia. Continuous cardiac monitoring is appropriate.' : '') +
        (mg !== null && mg < 0.7 ? ' Coexisting hypomagnesaemia is present — potassium cannot be corrected reliably until magnesium is replaced.' : mg === null ? ' Magnesium has not been measured; refractory hypokalaemia is usually due to unrecognised magnesium deficiency.' : ''),
      basis: uniq(['k', mg !== null ? 'magnesium' : '']),
      differentials: ['Diuretic therapy (loop and thiazide)', 'Gastrointestinal losses — vomiting, diarrhoea, high stoma output', 'Redistribution — insulin, beta-agonists, alkalosis, refeeding', 'Hyperaldosteronism, Cushing syndrome, liquorice excess', 'Renal tubular acidosis type 1 or 2', 'Magnesium deficiency', 'Poor intake'],
      investigations: uniq([
        '12-lead ECG looking for U waves, ST depression, T wave flattening and QT prolongation',
        mg === null ? 'Serum magnesium — essential before attempting correction' : '',
        'Venous blood gas for acid–base status',
        'Urinary potassium and, where indicated, aldosterone:renin ratio',
        'Medication review',
      ]),
      implications: uniq([
        'Arrhythmogenic, especially with digoxin, QT-prolonging drugs or myocardial ischaemia.',
        'May cause muscle weakness, ileus and rhabdomyolysis when severe.',
        deficit > 0 ? `Total body deficit is typically substantial — a serum potassium of ${fmt(k, 1)} mmol/L often corresponds to a whole-body deficit of the order of ${fmt(deficit, 0)}–${fmt(deficit * 1.5, 0)} mmol. Serum levels underestimate depletion because potassium is predominantly intracellular.` : '',
      ]),
      monitoring: [
        k < 3.0 ? 'Recheck potassium 2–4 hourly during intravenous replacement, with continuous cardiac monitoring' : 'Recheck potassium after each replacement course, typically 6–12 hourly',
        'Monitor renal function during replacement',
      ],
      guidance: [
        'Correct magnesium first or concurrently — hypokalaemia is refractory in the presence of magnesium deficiency.',
        'Oral replacement is preferred where the patient can absorb it. Peripheral intravenous potassium should not normally exceed 10 mmol/hour or a concentration of 40 mmol/L; higher rates require central access and cardiac monitoring.',
        'Never give undiluted concentrated potassium chloride.',
      ],
      tags: ['hypokalaemia', k < 3.0 ? 'hypokalaemia:severe' : '', 'ecg-indicated', 'arrhythmia-risk'],
      correction: rx('lyte.hypokalaemia', sev),
    }));
  }

  // ── CALCIUM ──────────────────────────────────────────────────────────
  const caForGrading = correctedCa ?? ca;
  if (caForGrading !== null && caForGrading < 2.20) {
    const sev: Severity = caForGrading < 1.6 ? 'life-threatening' : caForGrading < 1.9 ? 'critical' : caForGrading < 2.1 ? 'significant' : 'moderate';
    findings.push(finding({
      id: 'lyte.hypocalcaemia',
      module: 'electrolytes',
      title: caForGrading < 1.9 ? 'Severe hypocalcaemia' : 'Hypocalcaemia',
      severity: sev,
      interpretation:
        `${correctedCa !== null ? 'Albumin-corrected calcium' : 'Calcium'} ${fmt(caForGrading, 2)} mmol/L${ica !== null ? ` (ionised ${fmt(ica, 2)} mmol/L)` : ''}.` +
        (caForGrading < 1.9 ? ' Severe hypocalcaemia can cause tetany, laryngospasm, seizures and QT prolongation with arrhythmia, and requires intravenous replacement.' : '') +
        (mg !== null && mg < 0.7 ? ' Coexisting hypomagnesaemia impairs parathyroid hormone secretion and action and must be corrected.' : ''),
      basis: uniq(['calcium', alb !== null ? 'albumin' : '', ica !== null ? 'ionisedCalcium' : '', mg !== null ? 'magnesium' : '']),
      differentials: ['Vitamin D deficiency', 'Chronic kidney disease', 'Hypoparathyroidism, including post-thyroidectomy or post-parathyroidectomy', 'Hypomagnesaemia', 'Acute pancreatitis', 'Massive transfusion (citrate)', 'Tumour lysis syndrome', 'Rhabdomyolysis', 'Bisphosphonate or denosumab therapy'],
      investigations: ['Parathyroid hormone, vitamin D, magnesium and phosphate', '12-lead ECG for QT prolongation', 'Renal function', 'Amylase or lipase if pancreatitis is suspected', 'Check for Chvostek and Trousseau signs'],
      implications: ['QT prolongation with risk of torsades de pointes.', 'Symptoms include perioral and peripheral paraesthesiae, carpopedal spasm and, when severe, seizures.'],
      monitoring: ['Calcium 4–6 hourly during intravenous replacement', 'ECG monitoring in severe hypocalcaemia'],
      guidance: [
        'Severe or symptomatic hypocalcaemia: 10–20 mL of 10% calcium gluconate diluted and given intravenously over 10 minutes, followed by an infusion where necessary.',
        'Correct magnesium concurrently; identify and treat the underlying cause.',
      ],
      tags: ['hypocalcaemia', 'ecg-indicated', 'qt-prolongation-risk'],
      correction: rx('lyte.hypocalcaemia', sev),
    }));
  }

  if (caForGrading !== null && caForGrading > 2.60) {
    const sev: Severity = caForGrading > 3.5 ? 'life-threatening' : caForGrading > 3.0 ? 'critical' : caForGrading > 2.8 ? 'significant' : 'moderate';
    findings.push(finding({
      id: 'lyte.hypercalcaemia',
      module: 'electrolytes',
      title: caForGrading > 3.0 ? 'Severe hypercalcaemia' : 'Hypercalcaemia',
      severity: sev,
      interpretation:
        `${correctedCa !== null ? 'Albumin-corrected calcium' : 'Calcium'} ${fmt(caForGrading, 2)} mmol/L.` +
        (caForGrading > 3.0 ? ' Severe hypercalcaemia causes dehydration, renal impairment, confusion and arrhythmia and requires urgent treatment with intravenous fluids.' : ''),
      basis: uniq(['calcium', alb !== null ? 'albumin' : '']),
      differentials: ['Primary hyperparathyroidism', 'Malignancy — humoral hypercalcaemia (PTHrP), bone metastases, myeloma', 'Vitamin D excess', 'Granulomatous disease (sarcoidosis, tuberculosis)', 'Thiazide diuretics or lithium', 'Immobilisation', 'Milk-alkali syndrome', 'Thyrotoxicosis'],
      investigations: ['Parathyroid hormone (measured with the calcium sample)', 'Vitamin D, phosphate, alkaline phosphatase', 'Myeloma screen — serum protein electrophoresis, serum free light chains, urinary Bence Jones protein', 'Renal function', '12-lead ECG for a short QT interval', 'Imaging for malignancy where PTH is suppressed'],
      implications: ['Causes a nephrogenic diabetes insipidus with profound volume depletion, which in turn worsens the hypercalcaemia.', 'Digoxin toxicity is potentiated by hypercalcaemia.'],
      monitoring: ['Calcium and renal function every 12–24 hours during treatment', 'Fluid balance and urine output'],
      guidance: [
        'First-line treatment is aggressive intravenous volume expansion with 0.9% sodium chloride, typically 3–4 litres in 24 hours where cardiac and renal function permit.',
        'Intravenous bisphosphonate (for example zoledronic acid, dose-adjusted for renal function) after rehydration; the effect takes 2–4 days.',
        'Investigate and treat the underlying cause — PTH is the pivotal test.',
      ],
      tags: ['hypercalcaemia', 'ecg-indicated'],
      correction: rx('lyte.hypercalcaemia', sev),
    }));
  }

  // ── MAGNESIUM ────────────────────────────────────────────────────────
  if (mg !== null && mg < 0.70) {
    const sev: Severity = mg < 0.4 ? 'critical' : mg < 0.5 ? 'significant' : 'moderate';
    findings.push(finding({
      id: 'lyte.hypomagnesaemia',
      module: 'electrolytes',
      title: mg < 0.5 ? 'Severe hypomagnesaemia' : 'Hypomagnesaemia',
      severity: sev,
      interpretation:
        `Magnesium ${fmt(mg, 2)} mmol/L. Magnesium deficiency causes refractory hypokalaemia and hypocalcaemia and independently predisposes to arrhythmia, including torsades de pointes.`,
      basis: uniq(['magnesium', k !== null ? 'k' : '', ca !== null ? 'calcium' : '']),
      differentials: ['Diuretic therapy', 'Proton pump inhibitor therapy (long term)', 'Gastrointestinal losses including diarrhoea and stoma output', 'Alcohol excess', 'Refeeding syndrome', 'Poor intake or malabsorption', 'Nephrotoxic drugs — aminoglycosides, amphotericin, cisplatin'],
      investigations: ['Potassium, calcium and phosphate', '12-lead ECG', 'Medication review', 'Consider urinary magnesium to separate renal from gastrointestinal losses'],
      implications: [
        'Correct magnesium before or alongside potassium and calcium — otherwise those disturbances will not resolve.',
        'Predisposes to torsades de pointes, particularly with QT-prolonging drugs.',
      ],
      monitoring: ['Magnesium daily during replacement', 'Renal function — reduce replacement doses in renal impairment'],
      guidance: [
        'Typical intravenous replacement is 20 mmol of magnesium sulfate over 4–12 hours in severe deficiency, or oral replacement where mild and absorption is intact.',
        'Reduce the dose and monitor closely in renal impairment, where magnesium accumulates.',
      ],
      tags: ['hypomagnesaemia', 'arrhythmia-risk', 'qt-prolongation-risk'],
      correction: rx('lyte.hypomagnesaemia', sev),
    }));
  }

  if (mg !== null && mg > 1.0) {
    findings.push(finding({
      id: 'lyte.hypermagnesaemia',
      module: 'electrolytes',
      title: 'Hypermagnesaemia',
      severity: mg > 2.0 ? 'critical' : 'moderate',
      interpretation: `Magnesium ${fmt(mg, 2)} mmol/L. Hypermagnesaemia is almost always iatrogenic and occurs in renal impairment; it causes loss of deep tendon reflexes, respiratory depression and cardiac conduction delay.`,
      basis: uniq(['magnesium', creat !== null ? 'creatinine' : '']),
      differentials: ['Magnesium administration in renal impairment', 'Magnesium-containing antacids or laxatives', 'Severe renal failure', 'Obstetric magnesium sulfate therapy'],
      investigations: ['Renal function', '12-lead ECG', 'Clinical assessment of deep tendon reflexes and respiratory effort'],
      implications: ['Loss of the patellar reflex is an early clinical sign; respiratory depression and cardiac arrest occur at high levels.'],
      monitoring: ['Serial magnesium and clinical neurological assessment'],
      guidance: ['Stop all magnesium administration; intravenous calcium antagonises the cardiac and neuromuscular effects; consider dialysis in severe cases with renal failure.'],
      tags: ['hypermagnesaemia'],
    }));
  }

  // ── PHOSPHATE ────────────────────────────────────────────────────────
  if (po4 !== null && po4 < 0.80) {
    const sev: Severity = po4 < 0.32 ? 'critical' : po4 < 0.5 ? 'significant' : 'moderate';
    findings.push(finding({
      id: 'lyte.hypophosphataemia',
      module: 'electrolytes',
      title: po4 < 0.32 ? 'Severe hypophosphataemia' : 'Hypophosphataemia',
      severity: sev,
      interpretation: `Phosphate ${fmt(po4, 2)} mmol/L. Severe hypophosphataemia impairs ATP generation and causes muscle weakness, respiratory failure, haemolysis, rhabdomyolysis and cardiac dysfunction.`,
      basis: ['phosphate'],
      differentials: ['Refeeding syndrome', 'Alcohol excess', 'Diabetic ketoacidosis during treatment', 'Respiratory alkalosis', 'Hyperparathyroidism', 'Renal tubular disorders', 'Phosphate binders or poor intake'],
      investigations: ['Magnesium, potassium and calcium (refeeding syndrome affects all)', 'Assess nutritional status and recent feeding history', 'Renal function', 'Creatine kinase if weakness is prominent'],
      implications: ['Can precipitate failure to wean from mechanical ventilation.', 'Refeeding syndrome is life-threatening and requires a planned, cautious reintroduction of nutrition with thiamine supplementation.'],
      monitoring: ['Phosphate, magnesium and potassium daily during refeeding, or 12-hourly during intravenous replacement'],
      guidance: ['Where refeeding syndrome is suspected, give thiamine and vitamin B before feeding, start at a low caloric rate and increase gradually with daily electrolyte monitoring.'],
      tags: ['hypophosphataemia', 'refeeding-risk'],
      correction: rx('lyte.hypophosphataemia', sev),
    }));
  }

  if (po4 !== null && po4 > 1.45) {
    findings.push(finding({
      id: 'lyte.hyperphosphataemia',
      module: 'electrolytes',
      title: 'Hyperphosphataemia',
      severity: po4 > 2.5 ? 'significant' : 'moderate',
      interpretation: `Phosphate ${fmt(po4, 2)} mmol/L. Most commonly reflects reduced renal excretion; also seen with massive cell lysis.`,
      basis: uniq(['phosphate', creat !== null ? 'creatinine' : '']),
      differentials: ['Chronic kidney disease or acute kidney injury', 'Tumour lysis syndrome', 'Rhabdomyolysis', 'Hypoparathyroidism', 'Excess phosphate administration'],
      investigations: ['Renal function, calcium, potassium, urate and LDH', 'Consider tumour lysis syndrome where malignancy is present'],
      implications: ['Contributes to hypocalcaemia and, when chronic, to vascular calcification and renal bone disease.'],
      monitoring: ['Serial phosphate and calcium'],
      guidance: ['Treat the underlying cause; dietary phosphate restriction and phosphate binders are used in chronic kidney disease.'],
      tags: ['hyperphosphataemia', 'tumour-lysis-consideration'],
    }));
  }

  // ── GLUCOSE ──────────────────────────────────────────────────────────
  if (glu !== null && glu < 4.0) {
    findings.push(finding({
      id: 'lyte.hypoglycaemia',
      module: 'electrolytes',
      title: glu < 2.2 ? 'Severe hypoglycaemia' : 'Hypoglycaemia',
      severity: glu < 2.2 ? 'life-threatening' : glu < 3.0 ? 'critical' : 'significant',
      interpretation: `Glucose ${fmt(glu, 1)} mmol/L. Hypoglycaemia requires immediate treatment; neuroglycopenia causes confusion, seizures and coma and is rapidly reversible if treated.`,
      basis: ['glucose'],
      differentials: ['Insulin or sulfonylurea therapy', 'Sepsis', 'Adrenal insufficiency', 'Liver failure', 'Alcohol', 'Insulinoma', 'Malnutrition or prolonged fasting'],
      investigations: ['Confirm with a laboratory glucose while treating', 'If the cause is unclear, take a hypoglycaemia screen (insulin, C-peptide, cortisol, ketones) before giving glucose where feasible', 'Medication review'],
      implications: ['Sulfonylurea-induced hypoglycaemia is prolonged and frequently recurs — these patients require admission and observation.'],
      monitoring: ['Capillary glucose every 15 minutes until above 4 mmol/L, then hourly for at least 4 hours', 'Longer observation after sulfonylurea or long-acting insulin'],
      guidance: ['Treat with fast-acting oral carbohydrate if conscious and able to swallow, otherwise intravenous glucose or intramuscular glucagon, followed by a long-acting carbohydrate.'],
      tags: ['hypoglycaemia'],
    }));
  }

  if (glu !== null && glu > 11.0) {
    findings.push(finding({
      id: 'lyte.hyperglycaemia',
      module: 'electrolytes',
      title: glu > 30 ? 'Marked hyperglycaemia' : 'Hyperglycaemia',
      severity: glu > 30 ? 'critical' : glu > 20 ? 'significant' : 'moderate',
      interpretation:
        `Glucose ${fmt(glu, 1)} mmol/L.` +
        (glu > 20 ? ' Exclude diabetic ketoacidosis and hyperosmolar hyperglycaemic state — check ketones, venous blood gas and osmolality.' : '') +
        (hco3 !== null && hco3 < 18 ? ' The low bicarbonate raises the possibility of ketoacidosis.' : ''),
      basis: uniq(['glucose', hco3 !== null ? 'hco3' : '']),
      differentials: ['Known or new diabetes mellitus', 'Diabetic ketoacidosis', 'Hyperosmolar hyperglycaemic state', 'Stress hyperglycaemia in acute illness', 'Corticosteroid therapy', 'Pancreatic disease'],
      investigations: ['Capillary or serum ketones', 'Venous blood gas', 'Serum osmolality', 'HbA1c to distinguish acute stress hyperglycaemia from established diabetes', 'Urinalysis'],
      implications: ['Hyperglycaemia in acute illness is associated with worse outcomes, including impaired wound healing and increased infection risk.'],
      monitoring: ['Capillary glucose 1–4 hourly depending on severity and treatment', 'Ketones and electrolytes if ketoacidosis is suspected'],
      guidance: ['Manage diabetic ketoacidosis and hyperosmolar hyperglycaemic state with the relevant local protocol; both require fixed-rate insulin infusion with careful potassium replacement.'],
      tags: ['hyperglycaemia', hco3 !== null && hco3 < 18 ? 'possible-dka' : ''],
    }));
  }

  const analytes = ctx.moduleAnalytes('electrolytes');
  const present = analytes.length > 0;
  const titles = uniq(findings.map((f) => f.title));

  // Summarise normal vs abnormal explicitly — the report asks for both.
  const abnormalKeys = analytes.filter((a) => ctx.flag(a.key) !== 'normal').map((a) => a.label);
  const normalKeys = analytes.filter((a) => ctx.flag(a.key) === 'normal').map((a) => a.label);
  if (present) {
    derived.normalPanel = { label: 'Electrolytes within reference interval', value: normalKeys.length ? normalKeys.join(', ') : 'None' };
    derived.abnormalPanel = { label: 'Electrolytes outside reference interval', value: abnormalKeys.length ? abnormalKeys.join(', ') : 'None' };
  }

  return {
    module: 'electrolytes',
    present,
    analytes,
    observations: ctx.moduleObservations('electrolytes'),
    findings,
    summary: !present
      ? 'No electrolyte data available.'
      : titles.length ? `${titles.join('; ')}.` : 'All measured electrolytes are within the reference intervals applied.',
    severity: rollUp(findings.map((f) => f.severity)),
    derived,
  };
}
