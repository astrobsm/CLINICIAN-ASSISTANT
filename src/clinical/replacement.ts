/**
 * Correction and administration guidance for electrolyte disturbance.
 *
 * Identifying a deficit is the easy half. What a clinician standing at the
 * bedside needs is the next step: which preparation, how much of it, by what
 * route, over what period, through which access, and what will go wrong if it
 * is given faster than that. Several of these have killed patients when given
 * carelessly — concentrated potassium, over-rapid correction of chronic
 * hyponatraemia — so the constraints are stated as prominently as the doses.
 *
 * Doses are computed from the patient's own weight and measured value where
 * the arithmetic is well established, and left as a range where it is not.
 * Everything here is decision support: local protocols and specialist advice
 * take precedence, and the application never prescribes.
 */
import { fmt } from './units';
import type { PatientContext, Severity } from './types';

export type Route = 'oral' | 'intravenous' | 'either' | 'nebulised' | 'other';

export interface CorrectionStep {
  /** When this option is the right one. */
  indication: string;
  route: Route;
  /** The product, at its stated strength. */
  preparation: string;
  /** How much, computed for this patient where possible. */
  dose: string;
  /** Dilution, duration and maximum rate. */
  administration: string;
  /** Peripheral or central, and why. */
  access?: string;
  cautions?: string[];
}

export interface CorrectionPlan {
  analyte: string;
  title: string;
  /** The measured value that triggered this. */
  measured: string;
  /** Where the value should end up, and how fast it may get there. */
  target: string;
  /** Estimated deficit, where a defensible calculation exists. */
  deficit?: { label: string; value: string; note: string };
  steps: CorrectionStep[];
  /** Limits that must not be exceeded, whatever the deficit suggests. */
  hardLimits: string[];
  monitoring: string[];
  /** Things to correct first, or alongside. */
  prerequisites?: string[];
}

interface Ctx {
  patient: PatientContext;
  value: (key: string) => number | null;
  severity: Severity;
}

/** Total body water, litres — the basis of sodium and free-water arithmetic. */
function tbw(p: PatientContext): number | null {
  if (!p.weightKg) return null;
  const elderly = (p.age ?? 0) >= 65;
  const factor = p.sex === 'female' ? (elderly ? 0.45 : 0.5) : elderly ? 0.5 : 0.6;
  return p.weightKg * factor;
}

const weightNote = 'Enter the patient\'s weight in the patient panel to compute this.';

// ─────────────────────────────── Potassium ───────────────────────────────

function hypokalaemia(ctx: Ctx): CorrectionPlan {
  const k = ctx.value('k') ?? 0;
  const mg = ctx.value('magnesium');
  const severe = k < 3.0;
  const veryLow = k < 2.5;

  // Serum potassium is a poor guide to total body stores: roughly 100 mmol of
  // whole-body deficit for each 0.3 mmol/L the serum level has fallen.
  //
  // Rounded to the nearest 10 mmol deliberately. The relationship is an
  // order-of-magnitude teaching estimate, and "267–401 mmol" would dress it
  // in a precision it does not have — inviting it to be read as a dose.
  const round10 = (n: number) => Math.round(n / 10) * 10;
  const deficitLow = round10(((3.5 - k) / 0.3) * 100);
  const deficitHigh = round10(((3.5 - k) / 0.3) * 100 * 1.5);

  const steps: CorrectionStep[] = [];

  if (!severe) {
    steps.push({
      indication: 'Potassium 3.0–3.4 mmol/L, patient able to absorb enterally, no arrhythmia and no digoxin.',
      route: 'oral',
      preparation: 'Potassium chloride modified release (Sando-K 12 mmol per tablet, or equivalent).',
      dose: '24 mmol (2 tablets) two to three times daily.',
      administration: 'With or after food, with a full glass of water. Do not crush modified-release tablets.',
      cautions: [
        'Oral potassium is a common cause of gastrointestinal irritation and, rarely, of small bowel ulceration.',
        'The oral route is preferred wherever it is available: it cannot deliver a dangerous rate.',
      ],
    });
  }

  steps.push({
    indication: severe
      ? 'Potassium below 3.0 mmol/L, or any level with arrhythmia, digoxin therapy, ECG change or an inability to absorb enterally.'
      : 'Where the enteral route is unavailable or replacement is urgent.',
    route: 'intravenous',
    preparation: 'Pre-mixed potassium chloride in 0.9% sodium chloride — 20 mmol in 500 mL, or 40 mmol in 1000 mL. Use a manufactured bag.',
    dose: severe
      ? '20–40 mmol per infusion, repeated according to serial levels.'
      : '20 mmol per infusion, reassessing after each.',
    administration: severe
      ? 'Peripherally, no faster than 10 mmol/hour. A rate above 10 mmol/hour requires central access, continuous cardiac monitoring and a critical care setting.'
      : 'Peripherally over at least 2 hours; that is 10 mmol/hour, the peripheral maximum.',
    access: severe
      ? 'Peripheral at up to 10 mmol/hour and no more than 40 mmol/L. Higher rates or concentrations require a central line and cardiac monitoring.'
      : 'Peripheral, at a concentration no greater than 40 mmol/L.',
    cautions: [
      'Never give a bolus or push of potassium. Concentrated potassium chloride given undiluted is rapidly fatal.',
      'Never add potassium to a bag on the ward where a pre-mixed preparation exists.',
      'Peripheral infusion is painful and causes phlebitis; a concentration above 40 mmol/L needs central access.',
      veryLow ? 'At this level continuous cardiac monitoring is required throughout replacement.' : '',
    ].filter(Boolean),
  });

  return {
    analyte: 'k',
    title: 'Correction of hypokalaemia',
    measured: `Potassium ${fmt(k, 1)} mmol/L`,
    target: severe
      ? 'Bring the serum potassium above 3.5 mmol/L, and to 4.0–4.5 mmol/L where there is arrhythmia, myocardial ischaemia or digoxin therapy.'
      : 'Restore to 3.5–5.0 mmol/L.',
    deficit: {
      label: 'Estimated whole-body potassium deficit',
      value: k < 3.5 ? `approximately ${deficitLow}–${deficitHigh} mmol` : 'none',
      note: 'Serum potassium underestimates depletion because potassium is overwhelmingly intracellular: roughly 100 mmol of whole-body deficit for every 0.3 mmol/L fall. This is an order-of-magnitude guide for planning, not a dose to be given at once.',
    },
    prerequisites: [
      mg !== null && mg < 0.7
        ? `Magnesium is ${fmt(mg, 2)} mmol/L. Correct it first or alongside — renal potassium wasting continues while magnesium is depleted and the potassium will not hold.`
        : mg === null
          ? 'Measure magnesium. Hypokalaemia that resists replacement is usually unrecognised magnesium deficiency.'
          : '',
      'Review and stop the cause where possible: loop and thiazide diuretics, ongoing gastrointestinal or stoma losses, insulin infusions, beta-agonists.',
    ].filter(Boolean),
    hardLimits: [
      'Peripheral line: maximum 10 mmol/hour and maximum concentration 40 mmol/L.',
      'Central line with cardiac monitoring: up to 20 mmol/hour, in critical care.',
      'Undiluted potassium chloride must never be given by any route.',
    ],
    monitoring: [
      severe ? 'Serum potassium every 2–4 hours during intravenous replacement.' : 'Serum potassium after each replacement course, typically 6–12 hourly.',
      'Continuous cardiac monitoring where potassium is below 3.0 mmol/L, or there is arrhythmia, ischaemia or digoxin therapy.',
      'Renal function daily — replacement in renal impairment risks overshoot into hyperkalaemia.',
      'Magnesium alongside potassium until both are stable.',
    ],
    steps,
  };
}

function hyperkalaemia(ctx: Ctx): CorrectionPlan {
  const k = ctx.value('k') ?? 0;
  const severe = k >= 6.5;

  return {
    analyte: 'k',
    title: 'Emergency management of hyperkalaemia',
    measured: `Potassium ${fmt(k, 1)} mmol/L`,
    target: 'Protect the myocardium immediately, shift potassium intracellularly within the hour, then remove it from the body and treat the cause.',
    prerequisites: [
      'Obtain a 12-lead ECG now. Treatment is not deferred while waiting for it, or for a repeat sample.',
      'Stop every contributing drug: ACE inhibitors, angiotensin receptor blockers, potassium-sparing diuretics, trimethoprim, NSAIDs, heparin, and any potassium-containing fluid.',
    ],
    steps: [
      {
        indication: 'Potassium ≥6.5 mmol/L, or ≥6.0 mmol/L with ECG changes. Give first, before anything else.',
        route: 'intravenous',
        preparation: 'Calcium gluconate 10% (10 mL contains 2.26 mmol calcium), or calcium chloride 10% (10 mL contains 6.8 mmol).',
        dose: '30 mL of 10% calcium gluconate, or 10 mL of 10% calcium chloride.',
        administration: 'Over 5–10 minutes into a large vein, with cardiac monitoring. Repeat every 10–15 minutes, up to three times, until the ECG improves.',
        access: 'Calcium chloride is markedly more irritant and causes tissue necrosis on extravasation — give it centrally where possible. Calcium gluconate is preferred peripherally.',
        cautions: [
          'Calcium stabilises the myocardium but does not lower the potassium at all. It must always be followed by a shifting and a removal strategy.',
          'Use with great care in digoxin toxicity — give slowly, over 20 minutes, diluted.',
          'Do not give calcium in the same line as sodium bicarbonate; they precipitate.',
        ],
      },
      {
        indication: 'Potassium ≥6.0 mmol/L. The mainstay of lowering the level acutely.',
        route: 'intravenous',
        preparation: 'Soluble insulin with glucose — 10 units of soluble insulin in 25 g of glucose (50 mL of 50%, or 125 mL of 20%).',
        dose: '10 units insulin with 25 g glucose.',
        administration: 'Over 15–30 minutes. Expect the potassium to fall by 0.6–1.0 mmol/L within 15–60 minutes; the effect lasts 4–6 hours and the level will rebound.',
        access: '20% glucose is preferred peripherally; 50% is sclerosant and better given centrally.',
        cautions: [
          'Hypoglycaemia is common and often delayed. Monitor capillary glucose hourly for at least 6 hours.',
          'Where the pre-treatment glucose is above 15 mmol/L, insulin may be given without added glucose — but still monitor.',
        ],
      },
      {
        indication: 'Adjunct to insulin–glucose, not a substitute for it.',
        route: 'nebulised',
        preparation: 'Salbutamol nebuliser solution.',
        dose: '10–20 mg nebulised.',
        administration: 'Driven by oxygen, over 10 minutes. Lowers potassium by a further 0.5–1.0 mmol/L.',
        cautions: [
          'Causes tachycardia and tremor; use cautiously in ischaemic heart disease.',
          'Up to a fifth of patients do not respond, so it must never be the only shifting agent.',
        ],
      },
      {
        indication: 'To remove potassium from the body once it has been shifted.',
        route: 'oral',
        preparation: 'Sodium zirconium cyclosilicate, or patiromer.',
        dose: 'Sodium zirconium cyclosilicate 10 g three times daily for up to 72 hours, then a maintenance dose; or patiromer 8.4 g daily.',
        administration: 'Orally or by enteral tube. Onset is within an hour for zirconium cyclosilicate but it does not replace the emergency measures above.',
        cautions: [
          'Binders treat the total body burden, not the emergency. They are given after, not instead of, calcium and insulin–glucose.',
          'Separate from other oral medicines by at least two hours.',
        ],
      },
      {
        indication: 'Refractory hyperkalaemia, anuria, or established renal failure.',
        route: 'other',
        preparation: 'Renal replacement therapy.',
        dose: 'As determined by the renal or critical care team.',
        administration: 'Discuss urgently. Refractory hyperkalaemia is a recognised indication for emergency dialysis.',
        cautions: ['Potassium rebounds after dialysis; continue to monitor.'],
      },
    ],
    hardLimits: [
      'Calcium first, always, where there are ECG changes — before insulin, before anything else.',
      'Never give insulin without glucose unless the blood glucose is already above 15 mmol/L.',
      severe ? 'Continuous cardiac monitoring is mandatory at this level.' : 'Cardiac monitoring for any level above 6.0 mmol/L.',
    ],
    monitoring: [
      'Potassium at 1 hour after treatment, then 2–4 hourly — the level rebounds as the insulin effect wears off.',
      'Capillary glucose hourly for at least 6 hours after insulin–glucose.',
      'Continuous ECG monitoring until the potassium is below 6.0 mmol/L and stable.',
      'Renal function and urine output.',
    ],
  };
}

// ─────────────────────────────── Sodium ───────────────────────────────

function hyponatraemia(ctx: Ctx): CorrectionPlan {
  const na = ctx.value('na') ?? 0;
  const water = tbw(ctx.patient);
  const severe = na < 125;

  const deficitTo130 = water !== null ? Math.round(water * (130 - na)) : null;
  const highRisk = ctx.patient.knownCKD || (ctx.value('k') ?? 5) < 3.5;

  return {
    analyte: 'na',
    title: 'Correction of hyponatraemia',
    measured: `Sodium ${fmt(na, 0)} mmol/L`,
    target: severe
      ? 'In severe symptoms, raise the sodium by 4–6 mmol/L quickly to stop seizures or coma — that is enough. Thereafter correct slowly.'
      : 'Correct the underlying cause. The rate matters more than the destination.',
    deficit: {
      label: 'Sodium required to reach 130 mmol/L',
      value: deficitTo130 !== null ? `approximately ${deficitTo130} mmol (total body water ${fmt(water, 1)} L)` : 'not calculable',
      note: deficitTo130 !== null
        ? 'Deficit = total body water × (target − measured). It ignores ongoing losses and is a planning figure only. The rate limit below, not this number, governs administration.'
        : weightNote,
    },
    prerequisites: [
      'Assess volume status clinically before giving anything — the treatment of hypovolaemic, euvolaemic and hypervolaemic hyponatraemia are opposites, and the wrong one worsens the patient.',
      'Send paired serum and urine osmolality with a urine sodium before treatment starts. After fluids are running the result is uninterpretable.',
      'Exclude a spurious result: check glucose, and consider severe hyperlipidaemia or paraproteinaemia.',
    ],
    steps: [
      {
        indication: 'Severe symptoms — seizures, reduced consciousness, vomiting with obtundation. This is an emergency and does not wait for the cause to be established.',
        route: 'intravenous',
        preparation: 'Hypertonic sodium chloride 3% (513 mmol/L).',
        dose: '100–150 mL.',
        administration: 'Over 20 minutes, then recheck the sodium. Repeat up to twice more until the sodium has risen by 5 mmol/L or the symptoms resolve, whichever comes first.',
        access: 'Give under senior supervision, ideally in a critical care or high-dependency area with 1–2 hourly sodium measurement.',
        cautions: [
          'Stop as soon as symptoms resolve. The aim is to stop the seizure, not to normalise the number.',
          'A 150 mL bolus of 3% saline raises the sodium by roughly 2 mmol/L in an average adult.',
        ],
      },
      {
        indication: 'Hypovolaemic hyponatraemia — the commonest form in hospital.',
        route: 'intravenous',
        preparation: 'Sodium chloride 0.9% (154 mmol/L).',
        dose: 'Restore circulating volume; typically 500 mL to 1 L initially, guided by response.',
        administration: 'Over 2–4 hours, with sodium rechecked at 4–6 hours. Beware a rapid rise once volume is restored: correcting hypovolaemia switches off antidiuretic hormone and the sodium can climb abruptly.',
        cautions: [
          'This is where over-correction most often happens. Once ADH switches off, a water diuresis begins and the sodium can rise far faster than intended.',
          'If the rise is outstripping the limit, give 5% glucose, and discuss desmopressin with the renal team to arrest it.',
        ],
      },
      {
        indication: 'Euvolaemic hyponatraemia, typically syndrome of inappropriate antidiuresis.',
        route: 'oral',
        preparation: 'Fluid restriction.',
        dose: 'Usually 750–1000 mL of total fluid in 24 hours.',
        administration: 'Includes all oral and intravenous intake. Effectiveness is limited where the urine osmolality is high; review at 48 hours.',
        cautions: [
          'Treat the cause — medication review (thiazides, SSRIs, carbamazepine, proton pump inhibitors), and exclude hypothyroidism and adrenal insufficiency.',
          'Do not give 0.9% saline in established SIAD; it can lower the sodium further.',
        ],
      },
      {
        indication: 'Hypervolaemic hyponatraemia — cardiac failure, cirrhosis, nephrotic syndrome.',
        route: 'either',
        preparation: 'Fluid and sodium restriction with a loop diuretic.',
        dose: 'Treat the underlying condition; diurese as tolerated.',
        administration: 'Correcting the sodium is secondary to treating the cause. Saline will worsen the oedema.',
        cautions: ['Refer to the parent specialty; the hyponatraemia is a marker of severity.'],
      },
    ],
    hardLimits: [
      highRisk
        ? 'Maximum rise 8 mmol/L in any 24 hours — this patient has a risk factor for osmotic demyelination.'
        : 'Maximum rise 10 mmol/L in the first 24 hours, and 8 mmol/L in any subsequent 24 hours.',
      'Where the hyponatraemia is chronic, alcohol excess, malnutrition, hypokalaemia or liver disease is present, hold to 8 mmol/L in 24 hours.',
      'Exceeding these limits risks osmotic demyelination syndrome, which is frequently irreversible and may present days later.',
    ],
    monitoring: [
      severe ? 'Sodium every 2 hours during active correction, then 4–6 hourly.' : 'Sodium every 6–12 hours.',
      'Strict fluid balance, hourly urine output, and daily weight.',
      'Neurological observations — deterioration after initial improvement suggests demyelination.',
    ],
  };
}

function hypernatraemia(ctx: Ctx): CorrectionPlan {
  const na = ctx.value('na') ?? 0;
  const water = tbw(ctx.patient);
  const freeWater = water !== null ? water * (na / 140 - 1) : null;
  const hourly = freeWater !== null ? (freeWater * 1000) / 24 : null;

  return {
    analyte: 'na',
    title: 'Correction of hypernatraemia',
    measured: `Sodium ${fmt(na, 0)} mmol/L`,
    target: 'Replace the water deficit, at no more than 10 mmol/L of correction in 24 hours where this is chronic or of unknown duration.',
    deficit: {
      label: 'Free water deficit',
      value: freeWater !== null
        ? `approximately ${fmt(freeWater, 1)} L — about ${fmt(hourly, 0)} mL/hour over 24 hours, before adding maintenance and ongoing losses`
        : 'not calculable',
      note: freeWater !== null
        ? 'Deficit = total body water × (measured ÷ 140 − 1). Maintenance requirements and continuing losses must be added on top of this.'
        : weightNote,
    },
    prerequisites: [
      'Hypernatraemia in hospital almost always means a patient who could not obtain water. Check whether they can drink, swallow and reach a jug.',
      'Send paired serum and urine osmolality; a dilute urine in the face of hypernatraemia indicates diabetes insipidus.',
      'Review the drug chart for lithium, and check the blood glucose for an osmotic diuresis.',
    ],
    steps: [
      {
        indication: 'The patient can absorb enterally. Always preferred.',
        route: 'oral',
        preparation: 'Water, orally or by nasogastric tube.',
        dose: 'The calculated free water deficit, spread over 24–48 hours, plus maintenance and ongoing losses.',
        administration: 'In divided volumes through the day. Enteral water avoids the glucose load and the line entirely.',
        cautions: ['Confirm swallow safety before giving oral fluids to a patient with reduced consciousness.'],
      },
      {
        indication: 'Enteral route unavailable, or the deficit is large.',
        route: 'intravenous',
        preparation: 'Glucose 5% (electrolyte-free water once metabolised), or sodium chloride 0.45%.',
        dose: hourly !== null ? `Approximately ${fmt(hourly, 0)} mL/hour of 5% glucose, plus maintenance and ongoing losses.` : 'Titrated to the calculated deficit over 24–48 hours.',
        administration: 'Continuous infusion. Recheck the sodium at 4–6 hours and adjust — the calculation is a starting point, not a prescription to run unmonitored.',
        cautions: [
          'Large volumes of 5% glucose cause hyperglycaemia, which itself drives an osmotic diuresis and worsens the water deficit. Monitor the glucose.',
          'Where the patient is also volume depleted, restore circulating volume with 0.9% saline first, then address the water deficit.',
        ],
      },
    ],
    hardLimits: [
      'Maximum 10 mmol/L correction in 24 hours where the hypernatraemia is chronic or of unknown duration — cerebral oedema is the risk of going faster.',
      'Correction faster than 1 mmol/L/hour is acceptable only where the rise is known to have been acute, over hours.',
    ],
    monitoring: [
      'Sodium every 4–6 hours during correction.',
      'Strict fluid balance and daily weight.',
      'Blood glucose if large volumes of 5% glucose are used.',
      'Neurological observations.',
    ],
  };
}

// ─────────────────────────────── Magnesium ───────────────────────────────

function hypomagnesaemia(ctx: Ctx): CorrectionPlan {
  const mg = ctx.value('magnesium') ?? 0;
  const severe = mg < 0.5;
  const egfr = ctx.value('egfr');
  const renal = egfr !== null && egfr < 30;

  return {
    analyte: 'magnesium',
    title: 'Correction of hypomagnesaemia',
    measured: `Magnesium ${fmt(mg, 2)} mmol/L`,
    target: 'Restore to 0.7–1.0 mmol/L. Where the indication is arrhythmia or refractory hypokalaemia, aim for the upper half of the range.',
    deficit: {
      label: 'Note on the deficit',
      value: 'not reliably calculable from the serum level',
      note: 'Less than 1% of body magnesium is extracellular, so the serum concentration reflects stores poorly. Replacement is given empirically and titrated to the level and the clinical indication rather than to a computed deficit.',
    },
    prerequisites: [
      'Check potassium and calcium — both are frequently low alongside, and neither will correct until the magnesium does.',
      'Review the cause: loop and thiazide diuretics, proton pump inhibitors, alcohol excess, diarrhoea or high stoma output, refeeding, aminoglycosides, amphotericin, cisplatin.',
    ],
    steps: [
      {
        indication: severe
          ? 'Magnesium below 0.5 mmol/L, or any level with arrhythmia, seizures or refractory hypokalaemia.'
          : 'Moderate depletion where the enteral route is unavailable or replacement is urgent.',
        route: 'intravenous',
        preparation: 'Magnesium sulfate 50% (2 mmol of magnesium per mL) or 20% — dilute before administration.',
        dose: severe ? '20 mmol of magnesium sulfate.' : '8–12 mmol of magnesium sulfate.',
        administration: severe
          ? 'Diluted in 250–500 mL of 0.9% sodium chloride or 5% glucose, over 4–12 hours. Giving it faster than 4 hours is largely wasted — magnesium is renally excreted and a rapid infusion is passed in the urine.'
          : 'Diluted in 100–250 mL, over 2–4 hours.',
        access: 'Peripheral is acceptable when adequately diluted; concentrated magnesium sulfate is irritant.',
        cautions: [
          renal
            ? `Renal function is significantly impaired (eGFR ${fmt(egfr, 0)}). Halve the dose, infuse more slowly and check the level after each dose — magnesium accumulates and causes respiratory depression and cardiac arrest.`
            : 'Reduce the dose and monitor closely in renal impairment; magnesium is renally cleared and accumulates.',
          'In torsades de pointes, give 2 g (8 mmol) of magnesium sulfate over 10 minutes regardless of the serum level — the indication is the rhythm, not the number.',
          'Monitor deep tendon reflexes during rapid infusion; their loss is the earliest sign of toxicity.',
        ],
      },
      {
        indication: 'Mild depletion, patient absorbing enterally, no arrhythmia.',
        route: 'oral',
        preparation: 'Magnesium aspartate or magnesium glycerophosphate.',
        dose: '10–20 mmol daily in divided doses.',
        administration: 'With food. Effect is gradual over days.',
        cautions: ['Diarrhoea is dose-limiting and will itself perpetuate the losses.'],
      },
    ],
    hardLimits: [
      'Do not infuse faster than 20 mmol over 4 hours outside a peri-arrest or eclampsia protocol.',
      'In renal impairment, reduce the dose and check the level before each further dose.',
    ],
    monitoring: [
      'Magnesium daily during replacement, and before each further dose in renal impairment.',
      'Potassium and calcium alongside — both should begin to correct once magnesium is replaced.',
      'Deep tendon reflexes and respiratory rate during and after infusion.',
      'ECG where the indication was arrhythmia or QT prolongation.',
    ],
  };
}

// ─────────────────────────────── Calcium ───────────────────────────────

function hypocalcaemia(ctx: Ctx): CorrectionPlan {
  const ca = ctx.value('calcium') ?? 0;
  const alb = ctx.value('albumin');
  const corrected = alb !== null ? ca + 0.02 * (40 - alb) : ca;
  const severe = corrected < 1.9;
  const mg = ctx.value('magnesium');

  return {
    analyte: 'calcium',
    title: 'Correction of hypocalcaemia',
    measured: `${alb !== null ? 'Albumin-corrected calcium' : 'Calcium'} ${fmt(corrected, 2)} mmol/L`,
    target: 'Relieve symptoms and restore the corrected calcium above 2.0 mmol/L. Normalising the number fully is a slower, outpatient task.',
    prerequisites: [
      mg !== null && mg < 0.7
        ? `Magnesium is ${fmt(mg, 2)} mmol/L. Correct it — hypomagnesaemia impairs both parathyroid hormone secretion and its action, and the calcium will not respond until it is fixed.`
        : 'Check magnesium; hypocalcaemia resistant to replacement is usually magnesium-dependent.',
      'Send parathyroid hormone, vitamin D and phosphate before replacement where the cause is not already known.',
      'Obtain an ECG — hypocalcaemia prolongs the QT interval.',
    ],
    steps: [
      {
        indication: severe
          ? 'Symptomatic hypocalcaemia — tetany, carpopedal spasm, seizures, laryngospasm — or a corrected calcium below 1.9 mmol/L.'
          : 'Symptomatic hypocalcaemia at any level.',
        route: 'intravenous',
        preparation: 'Calcium gluconate 10% (10 mL contains 2.26 mmol of calcium).',
        dose: '10–20 mL of 10% calcium gluconate.',
        administration: 'Diluted in 50–100 mL of 5% glucose or 0.9% sodium chloride, over 10 minutes, with cardiac monitoring. Repeat until symptoms settle.',
        access: 'A large vein. Calcium gluconate is preferred to calcium chloride peripherally; extravasation causes tissue necrosis.',
        cautions: [
          'The effect of a bolus lasts only 2–3 hours, so an infusion usually follows.',
          'Do not give calcium in the same line as sodium bicarbonate or phosphate — both precipitate.',
          'Give more slowly, over 20 minutes, in a patient on digoxin.',
        ],
      },
      {
        indication: 'To hold the level after the initial bolus, where the cause is not immediately reversible.',
        route: 'intravenous',
        preparation: 'Calcium gluconate 10%, 100 mL (22.6 mmol of calcium) in 1 litre of 5% glucose or 0.9% sodium chloride.',
        dose: 'Titrated to the calcium, typically over 12–24 hours.',
        administration: 'Continuous infusion, commonly starting at 50–100 mL/hour of that dilution, adjusted by 4–6 hourly levels.',
        cautions: ['Never infuse undiluted calcium gluconate.'],
      },
      {
        indication: 'Mild or chronic hypocalcaemia, and to follow on from intravenous replacement.',
        route: 'oral',
        preparation: 'Calcium carbonate with colecalciferol; add alfacalcidol or calcitriol where there is renal impairment or hypoparathyroidism.',
        dose: 'Calcium 1–3 g of elemental calcium daily in divided doses, with alfacalcidol 0.25–1 microgram daily where indicated.',
        administration: 'Divided doses with food.',
        cautions: [
          'In renal impairment or hypoparathyroidism, plain vitamin D is ineffective — an activated form is required because 1-alpha-hydroxylation is impaired.',
        ],
      },
    ],
    hardLimits: [
      'Do not exceed 2 mL/minute of undiluted 10% calcium gluconate equivalent; always dilute for infusion.',
      'Cardiac monitoring during intravenous replacement in severe hypocalcaemia.',
    ],
    monitoring: [
      'Calcium 4–6 hourly during intravenous replacement.',
      'Magnesium, phosphate and renal function alongside.',
      'ECG for QT interval where the hypocalcaemia was severe.',
      'Watch for extravasation at the cannula site.',
    ],
  };
}

function hypercalcaemia(ctx: Ctx): CorrectionPlan {
  const ca = ctx.value('calcium') ?? 0;
  const alb = ctx.value('albumin');
  const corrected = alb !== null ? ca + 0.02 * (40 - alb) : ca;
  const egfr = ctx.value('egfr');

  return {
    analyte: 'calcium',
    title: 'Correction of hypercalcaemia',
    measured: `${alb !== null ? 'Albumin-corrected calcium' : 'Calcium'} ${fmt(corrected, 2)} mmol/L`,
    target: 'Restore intravascular volume first, then reduce bone resorption. Above 3.0 mmol/L, or with symptoms, treat urgently.',
    prerequisites: [
      'Send parathyroid hormone with the calcium sample, before treatment — it is the pivotal test and volume expansion alters the result.',
      'Stop thiazides, lithium, calcium and vitamin D supplements.',
      'Hypercalcaemia causes a nephrogenic diabetes insipidus, so these patients are almost always profoundly volume depleted.',
    ],
    steps: [
      {
        indication: 'First-line in every case. Volume depletion is what drives the calcium higher.',
        route: 'intravenous',
        preparation: 'Sodium chloride 0.9%.',
        dose: '3–4 litres over 24 hours, in a patient whose cardiac and renal function permit it.',
        administration: 'Continuous. Reassess fluid status regularly; in cardiac failure or oliguric renal impairment reduce the volume and involve the renal team.',
        cautions: [
          'Do not add a loop diuretic routinely. It is reserved for fluid overload developing during rehydration, not used as a calcium-lowering measure.',
          'Rehydration alone typically lowers the calcium by 0.3–0.5 mmol/L.',
        ],
      },
      {
        indication: 'After rehydration, where the calcium remains high or the cause is malignancy.',
        route: 'intravenous',
        preparation: 'Zoledronic acid 4 mg, or pamidronate 30–90 mg according to the calcium.',
        dose: 'Zoledronic acid 4 mg — reduce in renal impairment' + (egfr !== null && egfr < 60 ? ` (eGFR ${fmt(egfr, 0)}: dose reduction required)` : '') + '.',
        administration: 'Zoledronic acid in 100 mL of 0.9% sodium chloride over at least 15 minutes; pamidronate over 2–4 hours.',
        cautions: [
          'The effect takes 2–4 days and peaks at around a week — it does not treat the emergency, rehydration does.',
          'Give only after adequate rehydration; bisphosphonates are nephrotoxic in a volume-depleted patient.',
          'Avoid or dose-reduce where the eGFR is below 30. Check dental status where treatment will be prolonged.',
        ],
      },
      {
        indication: 'Where a rapid fall is needed while waiting for the bisphosphonate to work.',
        route: 'other',
        preparation: 'Calcitonin.',
        dose: '4 units/kg subcutaneously or intramuscularly, 12-hourly.',
        administration: 'Acts within 4–6 hours but tachyphylaxis develops within 48 hours.',
        cautions: ['A bridge only. It buys time; it is not definitive treatment.'],
      },
    ],
    hardLimits: [
      'Do not give a bisphosphonate before the patient is rehydrated.',
      'Loop diuretics are not a treatment for hypercalcaemia and worsen the volume depletion that caused it.',
    ],
    monitoring: [
      'Calcium and renal function every 12–24 hours during treatment.',
      'Strict fluid balance and urine output; watch for overload during aggressive rehydration.',
      'ECG — hypercalcaemia shortens the QT interval and potentiates digoxin.',
    ],
  };
}

// ─────────────────────────────── Phosphate ───────────────────────────────

function hypophosphataemia(ctx: Ctx): CorrectionPlan {
  const po4 = ctx.value('phosphate') ?? 0;
  const severe = po4 < 0.32;
  const egfr = ctx.value('egfr');

  return {
    analyte: 'phosphate',
    title: 'Correction of hypophosphataemia',
    measured: `Phosphate ${fmt(po4, 2)} mmol/L`,
    target: 'Restore above 0.8 mmol/L. Below 0.32 mmol/L, treat urgently — ATP generation fails and with it respiratory and cardiac muscle.',
    prerequisites: [
      'Check potassium, magnesium and calcium. Where refeeding syndrome is the cause all four fall together, and thiamine must be given before feeding is increased.',
      'Establish the cause: refeeding, alcohol excess, treatment of diabetic ketoacidosis, respiratory alkalosis, hyperparathyroidism, renal tubular loss.',
    ],
    steps: [
      {
        indication: severe
          ? 'Phosphate below 0.32 mmol/L, or symptomatic at any level — muscle weakness, failure to wean from ventilation, rhabdomyolysis, haemolysis.'
          : 'Phosphate 0.32–0.6 mmol/L where the enteral route is unavailable.',
        route: 'intravenous',
        preparation: 'Potassium phosphate or sodium glycerophosphate — check which preparation your unit stocks and how much potassium it carries.',
        dose: severe ? '20–50 mmol of phosphate.' : '20 mmol of phosphate.',
        administration: 'Diluted, over 12–24 hours. Infusing faster than 20 mmol over 6 hours risks acute hypocalcaemia, arrhythmia and metastatic calcification.',
        access: 'Peripheral is acceptable when diluted; the preparation is irritant.',
        cautions: [
          'Most preparations contain a substantial potassium load — count it towards the daily potassium and recheck the level.',
          egfr !== null && egfr < 30
            ? `Renal function is significantly impaired (eGFR ${fmt(egfr, 0)}). Halve the dose and recheck after each — phosphate accumulates rapidly.`
            : 'Reduce the dose in renal impairment.',
          'Do not run phosphate through the same line as calcium; they precipitate.',
        ],
      },
      {
        indication: 'Mild depletion with an intact gut.',
        route: 'oral',
        preparation: 'Phosphate effervescent tablets (Phosphate-Sandoz, 16.1 mmol of phosphate per tablet).',
        dose: '1–2 tablets three times daily.',
        administration: 'Dissolved in water, with food.',
        cautions: [
          'Diarrhoea is the dose-limiting effect.',
          'Each tablet also carries about 3 mmol of potassium and 20 mmol of sodium — significant in renal or cardiac disease.',
        ],
      },
    ],
    hardLimits: [
      'Do not exceed 20 mmol of phosphate over 6 hours.',
      'Avoid intravenous phosphate where the calcium is already low — correct the calcium first, or the calcium-phosphate product will precipitate.',
    ],
    monitoring: [
      'Phosphate, calcium, potassium and magnesium every 12 hours during replacement, and daily throughout refeeding.',
      'Renal function.',
      'Where refeeding syndrome is suspected: daily electrolytes for at least the first three days, with thiamine before feeding.',
    ],
  };
}

// ─────────────────────────────── Dispatcher ───────────────────────────────

/**
 * The correction plan for a given electrolyte finding, or null where the
 * abnormality does not have one — treating the cause is the whole treatment
 * for several of them.
 */
export function correctionPlan(findingId: string, ctx: Ctx): CorrectionPlan | null {
  switch (findingId) {
    case 'lyte.hypokalaemia': return hypokalaemia(ctx);
    case 'lyte.hyperkalaemia': return hyperkalaemia(ctx);
    case 'lyte.hyponatraemia': return hyponatraemia(ctx);
    case 'lyte.hypernatraemia': return hypernatraemia(ctx);
    case 'lyte.hypomagnesaemia': return hypomagnesaemia(ctx);
    case 'lyte.hypocalcaemia': return hypocalcaemia(ctx);
    case 'lyte.hypercalcaemia': return hypercalcaemia(ctx);
    case 'lyte.hypophosphataemia': return hypophosphataemia(ctx);
    default: return null;
  }
}

export const ROUTE_LABEL: Record<Route, string> = {
  oral: 'Oral',
  intravenous: 'Intravenous',
  either: 'Oral or intravenous',
  nebulised: 'Nebulised',
  other: 'Other',
};
