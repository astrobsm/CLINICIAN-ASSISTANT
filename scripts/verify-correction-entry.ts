/**
 * Verification of the electrolyte correction and administration guidance.
 *
 * Two things are checked here, and the second matters more than the first.
 *
 * The arithmetic — deficits, free water, weight- and renal-dependent doses —
 * is checked against values computed by hand, because a wrong figure carrying
 * the authority of a computed number is worse than no figure at all.
 *
 * The safety invariants are checked because they are what stops the guidance
 * killing someone: potassium never bolused, calcium before insulin in
 * hyperkalaemia, the 8 mmol/L ceiling when a patient is at risk of osmotic
 * demyelination, a dose reduction whenever renal clearance is impaired.
 * Every one of these is an error a real prescriber has made.
 */
import { analyse } from '../src/clinical/analyse';
import { emptyExtraction } from '../src/clinical/context';
import { emptyPatient, type Analyte, type Finding, type PatientContext } from '../src/clinical/types';
import type { CorrectionPlan } from '../src/clinical/replacement';
import { buildReportBody } from '../src/report/reportHtml';
import { DEFAULT_INSTITUTION } from '../src/config/institution';

let failures = 0;
let checks = 0;
const line = (c = '─') => console.log(`  ${c.repeat(76)}`);

function check(label: string, ok: boolean, detail?: unknown) {
  checks++;
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${!ok && detail !== undefined ? `  → ${JSON.stringify(detail)}` : ''}`);
}

/** Run the whole engine over a set of values and return the findings. */
function run(values: Record<string, number>, patient: Partial<PatientContext> = {}): Finding[] {
  const extraction = emptyExtraction();
  extraction.analytes = Object.entries(values).map(([key, value]): Analyte => ({
    key,
    label: key,
    value,
    unit: '',
    rawText: String(value),
    confidence: 1,
    edited: false,
    manual: true,
    sourceId: 'verify',
  }));
  const result = analyse({ ...emptyPatient(), ...patient }, extraction, []);
  return result.modules.flatMap((m) => m.findings);
}

const planFor = (findings: Finding[], id: string): CorrectionPlan | undefined =>
  findings.find((f) => f.id === id)?.correction;

/** Every word of a plan, for invariant searches. */
const flat = (p: CorrectionPlan): string =>
  [
    p.title, p.measured, p.target,
    p.deficit?.label, p.deficit?.value, p.deficit?.note,
    ...p.hardLimits, ...p.monitoring, ...(p.prerequisites ?? []),
    ...p.steps.flatMap((s) => [s.indication, s.preparation, s.dose, s.administration, s.access ?? '', ...(s.cautions ?? [])]),
  ].join(' ');

console.log('\n  ELECTROLYTE CORRECTION AND ADMINISTRATION — VERIFICATION');
line('═');

// ───────────────────────── coverage ─────────────────────────
console.log('\n  Coverage — a plan is produced for every correctable disturbance');
line();
{
  const cases: [string, Record<string, number>][] = [
    ['lyte.hypokalaemia', { k: 2.7 }],
    ['lyte.hyperkalaemia', { k: 6.8 }],
    ['lyte.hyponatraemia', { na: 118 }],
    ['lyte.hypernatraemia', { na: 158 }],
    ['lyte.hypomagnesaemia', { magnesium: 0.42 }],
    ['lyte.hypocalcaemia', { calcium: 1.72, albumin: 40 }],
    ['lyte.hypercalcaemia', { calcium: 3.4, albumin: 40 }],
    ['lyte.hypophosphataemia', { phosphate: 0.28 }],
  ];
  for (const [id, values] of cases) {
    const plan = planFor(run(values, { weightKg: 70, age: 60, sex: 'male' }), id);
    check(`${id} carries a correction plan`, !!plan);
    if (!plan) continue;
    check(`  ${id}: states a target`, plan.target.length > 20);
    check(`  ${id}: has at least one hard limit`, plan.hardLimits.length > 0);
    check(`  ${id}: has monitoring`, plan.monitoring.length > 0);
    check(`  ${id}: every step names a preparation, dose and rate`,
      plan.steps.every((s) => s.preparation.length > 5 && s.dose.length > 3 && s.administration.length > 10));
  }
}

// ───────────────────────── arithmetic ─────────────────────────
console.log('\n  Arithmetic — computed against values worked by hand');
line();
{
  // Male, 70 kg, age 60 → TBW = 70 × 0.6 = 42 L.
  // Free water deficit at Na 160 = 42 × (160/140 − 1) = 42 × 0.142857 = 6.0 L.
  const plan = planFor(run({ na: 160 }, { weightKg: 70, age: 60, sex: 'male' }), 'lyte.hypernatraemia')!;
  check('free water deficit at Na 160, 70 kg male = 6.0 L', /\b6\.0 L\b/.test(plan.deficit!.value), plan.deficit!.value);
  // 6000 mL over 24 h = 250 mL/h.
  check('hourly rate derived from the deficit = 250 mL/hour', /250 mL\/hour/.test(plan.deficit!.value), plan.deficit!.value);
  check('the same rate appears in the intravenous step',
    plan.steps.some((s) => s.route === 'intravenous' && /250 mL\/hour/.test(s.dose)));
}
{
  // Female, 70 kg, age 70 → TBW = 70 × 0.45 = 31.5 L.
  // Sodium to reach 130 from 118 = 31.5 × 12 = 378 mmol.
  const plan = planFor(run({ na: 118 }, { weightKg: 70, age: 70, sex: 'female' }), 'lyte.hyponatraemia')!;
  check('sodium deficit, elderly female 70 kg, Na 118 → 378 mmol', /\b378 mmol\b/.test(plan.deficit!.value), plan.deficit!.value);
}
{
  // K 2.7 → (3.5 − 2.7)/0.3 × 100 = 266.7, ×1.5 = 400.0; to the nearest 10.
  const plan = planFor(run({ k: 2.7 }, { weightKg: 70 }), 'lyte.hypokalaemia')!;
  check('potassium deficit at K 2.7 spans 270–400 mmol', /270[–-]400 mmol/.test(plan.deficit!.value), plan.deficit!.value);
  check('the estimate is not dressed in false precision', !/\d{2}[13-9] mmol/.test(plan.deficit!.value), plan.deficit!.value);
  check('the deficit is explicitly not a dose to give at once',
    /not a dose to be given at once/i.test(plan.deficit!.note));
}
{
  // Without a weight, a deficit must be declined rather than guessed.
  const plan = planFor(run({ na: 118 }), 'lyte.hyponatraemia')!;
  check('no weight → deficit is refused, not invented', plan.deficit!.value === 'not calculable', plan.deficit!.value);
  check('no weight → the plan says how to enable it', /weight/i.test(plan.deficit!.note));
}

// ─────────────────── safety invariants ───────────────────
console.log('\n  Safety invariants — the errors that kill people');
line();
{
  const plan = planFor(run({ k: 2.4 }, { weightKg: 70 }), 'lyte.hypokalaemia')!;
  const text = flat(plan);
  check('potassium: never bolused, stated explicitly', /Never give a bolus or push of potassium/i.test(text));
  check('potassium: undiluted concentrate prohibited by any route', /[Uu]ndiluted potassium chloride must never be given by any route/.test(text));
  check('potassium: peripheral ceiling of 10 mmol/hour is a hard limit',
    plan.hardLimits.some((l) => /[Pp]eripheral/.test(l) && /10 mmol\/hour/.test(l)));
  check('potassium: peripheral concentration ceiling of 40 mmol/L is a hard limit',
    plan.hardLimits.some((l) => /40 mmol\/L/.test(l)));
  check('potassium: central access named as the condition for a faster rate',
    /[Cc]entral/.test(text) && /20 mmol\/hour/.test(text));
  check('severe hypokalaemia offers no oral-only route',
    plan.steps.some((s) => s.route === 'intravenous'));
}
{
  // Magnesium not measured, and measured low — the plan must say so both ways.
  const unknownMg = planFor(run({ k: 2.8 }, { weightKg: 70 }), 'lyte.hypokalaemia')!;
  check('hypokalaemia with no magnesium result: prompts measuring it',
    unknownMg.prerequisites!.some((p) => /[Mm]easure magnesium/.test(p)), unknownMg.prerequisites);

  const lowMg = planFor(run({ k: 2.8, magnesium: 0.5 }, { weightKg: 70 }), 'lyte.hypokalaemia')!;
  check('hypokalaemia with magnesium 0.5: correct magnesium first, with the value quoted',
    lowMg.prerequisites!.some((p) => /0\.50 mmol\/L/.test(p) && /first or alongside/i.test(p)), lowMg.prerequisites);
  check('and explains why replacement fails without it',
    lowMg.prerequisites!.some((p) => /will not hold|wasting continues/i.test(p)));
}
{
  const plan = planFor(run({ k: 7.1 }), 'lyte.hyperkalaemia')!;
  const first = plan.steps[0];
  check('hyperkalaemia: calcium is the first step', /calcium/i.test(first.preparation), first.preparation);
  check('hyperkalaemia: calcium explicitly stated not to lower potassium',
    first.cautions!.some((c) => /does not lower the potassium/i.test(c)));
  check('hyperkalaemia: calcium first is also a hard limit',
    plan.hardLimits.some((l) => /[Cc]alcium first/.test(l)));
  const insulin = plan.steps.find((s) => /insulin/i.test(s.preparation))!;
  check('hyperkalaemia: insulin is paired with glucose in the preparation', /glucose/i.test(insulin.preparation));
  check('hyperkalaemia: hypoglycaemia monitoring is mandated for at least 6 hours',
    /hourly for at least 6 hours/i.test(flat(plan)));
  check('hyperkalaemia: insulin without glucose is bounded by a hard limit',
    plan.hardLimits.some((l) => /insulin without glucose/i.test(l)));
  check('hyperkalaemia: salbutamol is stated never to be the only shifting agent',
    plan.steps.some((s) => s.route === 'nebulised' && s.cautions!.some((c) => /never be the only shifting agent/i.test(c))));
  check('hyperkalaemia: binders positioned after the emergency measures',
    plan.steps.some((s) => /binder/i.test(flat({ ...plan, steps: [s] })) && (s.cautions ?? []).some((c) => /after, not instead of/i.test(c))));
  check('hyperkalaemia: rebound after treatment is stated',
    plan.monitoring.some((m) => /rebound/i.test(m)));
  check('hyperkalaemia: contributing drugs stopped as a prerequisite',
    plan.prerequisites!.some((p) => /ACE inhibitor/i.test(p) && /[Ss]top/.test(p)));
}
{
  // Osmotic demyelination: the ceiling must tighten for a patient at risk.
  const ordinary = planFor(run({ na: 122 }, { weightKg: 70 }), 'lyte.hyponatraemia')!;
  check('hyponatraemia, no risk factor: 10 mmol/L in 24 hours',
    /10 mmol\/L in the first 24 hours/.test(ordinary.hardLimits[0]), ordinary.hardLimits[0]);

  const atRisk = planFor(run({ na: 122, k: 3.0 }, { weightKg: 70 }), 'lyte.hyponatraemia')!;
  check('hyponatraemia with hypokalaemia: ceiling tightens to 8 mmol/L in 24 hours',
    /[Mm]aximum rise 8 mmol\/L in any 24 hours/.test(atRisk.hardLimits[0]), atRisk.hardLimits[0]);
  check('and the reason is named',
    /osmotic demyelination/i.test(atRisk.hardLimits.join(' ')));

  const ckd = planFor(run({ na: 122 }, { weightKg: 70, knownCKD: true }), 'lyte.hyponatraemia')!;
  check('hyponatraemia in known CKD: ceiling also tightens to 8 mmol/L',
    /[Mm]aximum rise 8 mmol\/L/.test(ckd.hardLimits[0]), ckd.hardLimits[0]);

  check('severe hyponatraemia: hypertonic saline is 100–150 mL over 20 minutes',
    ordinary.steps.some((s) => /3%/.test(s.preparation) && /100[–-]150 mL/.test(s.dose) && /20 minutes/.test(s.administration)));
  check('and stops on symptom resolution, not on a normal number',
    ordinary.steps.some((s) => (s.cautions ?? []).some((c) => /not to normalise the number/i.test(c))));
  check('hyponatraemia: over-correction after volume repletion is warned about',
    /ADH switches off|switches off antidiuretic hormone/i.test(flat(ordinary)));
  check('hyponatraemia: saline named as harmful in established SIAD',
    /[Dd]o not give 0\.9% saline in established SIAD/.test(flat(ordinary)));
  check('hyponatraemia: osmolality sent before treatment starts',
    ordinary.prerequisites!.some((p) => /before treatment starts/i.test(p)));
}
{
  const plan = planFor(run({ na: 162 }, { weightKg: 80, age: 55, sex: 'male' }), 'lyte.hypernatraemia')!;
  check('hypernatraemia: 10 mmol/L per 24 hours ceiling', /10 mmol\/L correction in 24 hours/.test(plan.hardLimits[0]));
  check('hypernatraemia: cerebral oedema named as the risk of going faster',
    /cerebral oedema/i.test(plan.hardLimits.join(' ')));
  check('hypernatraemia: enteral water preferred over intravenous',
    plan.steps[0].route === 'oral' && /[Aa]lways preferred/.test(plan.steps[0].indication));
  check('hypernatraemia: volume depletion treated before the water deficit',
    /restore circulating volume with 0\.9% saline first/i.test(flat(plan)));
}
{
  // Renal impairment must visibly change the dose, not just add a caveat.
  const normal = planFor(run({ magnesium: 0.38, creatinine: 70 }, { weightKg: 70, age: 40, sex: 'male' }), 'lyte.hypomagnesaemia')!;
  const impaired = planFor(run({ magnesium: 0.38, creatinine: 420 }, { weightKg: 70, age: 40, sex: 'male' }), 'lyte.hypomagnesaemia')!;
  check('magnesium in normal renal function: no eGFR-specific warning', !/eGFR \d/.test(flat(normal)));
  check('magnesium in renal impairment: the actual eGFR is quoted back', /eGFR \d+/.test(flat(impaired)), flat(impaired).match(/eGFR \d+/)?.[0]);
  check('magnesium in renal impairment: dose halved', /[Hh]alve the dose/.test(flat(impaired)));
  check('magnesium in renal impairment: consequence named', /respiratory depression|cardiac arrest/i.test(flat(impaired)));
  check('magnesium: torsades dosed on the rhythm, not the level',
    /the indication is the rhythm, not the number/i.test(flat(normal)));
  check('magnesium: reflex loss named as the earliest toxicity sign',
    /deep tendon reflexes/i.test(flat(normal)));
  check('magnesium: serum level stated to be a poor guide to stores',
    /reflects stores poorly|not reliably calculable/i.test(`${normal.deficit?.note} ${normal.deficit?.value}`));
}
{
  // Albumin correction must drive the calcium plan, not the raw value.
  const plan = planFor(run({ calcium: 1.90, albumin: 20 }, { weightKg: 70 }), 'lyte.hypocalcaemia')!;
  // 1.90 + 0.02 × (40 − 20) = 2.30 → not hypocalcaemic once corrected.
  check('calcium 1.90 with albumin 20 corrects to 2.30 and raises no plan', plan === undefined || !/1\.90/.test(plan.measured), plan?.measured);
}
{
  const plan = planFor(run({ calcium: 1.60, albumin: 40 }, { weightKg: 70 }), 'lyte.hypocalcaemia')!;
  check('hypocalcaemia: the albumin-corrected value is what is quoted', /corrected calcium 1\.60/i.test(plan.measured), plan.measured);
  check('hypocalcaemia: calcium gluconate strength is stated', /10 mL contains 2\.26 mmol/.test(flat(plan)));
  check('hypocalcaemia: diluted, over 10 minutes, with monitoring',
    plan.steps.some((s) => /50[–-]100 mL/.test(s.administration) && /10 minutes/.test(s.administration)));
  check('hypocalcaemia: bicarbonate and phosphate line incompatibility flagged',
    /precipitate/i.test(flat(plan)));
  check('hypocalcaemia: bolus effect stated to be short-lived',
    /lasts only 2[–-]3 hours/.test(flat(plan)));
  check('hypocalcaemia: activated vitamin D required in renal impairment',
    /alfacalcidol|calcitriol/i.test(flat(plan)) && /1-alpha-hydroxylation/.test(flat(plan)));
}
{
  const plan = planFor(run({ calcium: 3.6, albumin: 40 }, { weightKg: 70, age: 70, sex: 'female' }), 'lyte.hypercalcaemia')!;
  check('hypercalcaemia: rehydration is the first step', /sodium chloride/i.test(plan.steps[0].preparation));
  check('hypercalcaemia: bisphosphonate only after rehydration, as a hard limit',
    plan.hardLimits.some((l) => /before the patient is rehydrated/i.test(l)));
  check('hypercalcaemia: loop diuretics explicitly not a treatment',
    plan.hardLimits.some((l) => /not a treatment for hypercalcaemia/i.test(l)));
  check('hypercalcaemia: PTH sent before treatment', plan.prerequisites!.some((p) => /parathyroid hormone/i.test(p) && /before treatment/i.test(p)));
  check('hypercalcaemia: calcitonin described as a bridge only', /bridge only/i.test(flat(plan)));
}
{
  const plan = planFor(run({ phosphate: 0.25, creatinine: 480 }, { weightKg: 70, age: 65, sex: 'male' }), 'lyte.hypophosphataemia')!;
  check('phosphate: 20 mmol per 6 hours is a hard limit', plan.hardLimits.some((l) => /20 mmol of phosphate over 6 hours/.test(l)));
  check('phosphate: withheld when calcium is low, as a hard limit',
    plan.hardLimits.some((l) => /calcium is already low/i.test(l)));
  check('phosphate: potassium load of the preparation flagged', /potassium load/i.test(flat(plan)));
  check('phosphate in renal impairment: dose halved with the eGFR quoted', /[Hh]alve the dose/.test(flat(plan)) && /eGFR \d+/.test(flat(plan)));
  check('phosphate: refeeding prompts thiamine before feeding', /thiamine/i.test(flat(plan)));
}

// ─────────────────── it reaches the report ───────────────────
console.log('\n  The guidance reaches the exported report');
line();
{
  const extraction = emptyExtraction();
  extraction.analytes = [
    { key: 'k', label: 'Potassium', value: 2.6, unit: 'mmol/L', rawText: '2.6', confidence: 1, edited: false, manual: true, sourceId: 'v' },
    { key: 'na', label: 'Sodium', value: 121, unit: 'mmol/L', rawText: '121', confidence: 1, edited: false, manual: true, sourceId: 'v' },
    { key: 'magnesium', label: 'Magnesium', value: 0.48, unit: 'mmol/L', rawText: '0.48', confidence: 1, edited: false, manual: true, sourceId: 'v' },
  ];
  const result = analyse({ ...emptyPatient(), weightKg: 72, age: 64, sex: 'male' }, extraction, []);
  const html = buildReportBody(result, { institution: DEFAULT_INSTITUTION });

  check('report HTML contains a correction plan block', html.includes('class="rxplan"'));
  check('report HTML shows the "Do not exceed" limits', html.includes('Do not exceed'));
  check('report HTML carries a computed dose', /class="dose"/.test(html));
  check('report HTML names a route', /class="rxroute"/.test(html));
  check('report HTML states the potassium peripheral ceiling', /10 mmol\/hour/.test(html));
  check('report HTML carries the not-a-prescription statement', /Decision support only/.test(html));
  check('report HTML escapes correctly — no raw tag leakage in plan text', !/<script/i.test(html));

  const plans = (html.match(/class="rxplan"/g) ?? []).length;
  check('one plan per correctable finding present (3 expected)', plans === 3, plans);
}

line('═');
console.log(`  ${checks} checks, ${failures} failed`);
if (failures) {
  console.log('  RESULT: FAILED');
  process.exitCode = 1;
} else {
  console.log('  RESULT: ALL CHECKS PASSED');
}
line('═');
