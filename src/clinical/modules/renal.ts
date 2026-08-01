/**
 * RENAL FUNCTION ANALYSIS MODULE
 *
 * Computes CKD-EPI 2021 eGFR and Cockcroft–Gault creatinine clearance, assigns
 * a KDIGO CKD category and, where a baseline creatinine is supplied, a KDIGO
 * AKI stage. Renal function drives antimicrobial dosing elsewhere in the
 * engine, so this module also publishes a machine-readable clearance value.
 */
import type { ClinicalContext } from '../context';
import { uniq } from '../context';
import { fmt } from '../units';
import type { Finding, ModuleResult, PatientContext, Severity } from '../types';
import { finding } from '../types';
import { rollUp } from '../severity';

/** CKD-EPI 2021 (race-free). Creatinine in µmol/L, returns mL/min/1.73m². */
export function ckdEpi2021(creatUmol: number, age: number, sex: PatientContext['sex']): number | null {
  if (!creatUmol || !age || age < 18) return null;
  const scr = creatUmol / 88.4; // mg/dL
  const female = sex === 'female';
  const k = female ? 0.7 : 0.9;
  const a = female ? -0.241 : -0.302;
  const ratio = scr / k;
  const egfr =
    142 *
    Math.pow(Math.min(ratio, 1), a) *
    Math.pow(Math.max(ratio, 1), -1.2) *
    Math.pow(0.9938, age) *
    (female ? 1.012 : 1);
  return Math.round(egfr);
}

/** Cockcroft–Gault creatinine clearance (mL/min) — the basis of most drug dosing tables. */
export function cockcroftGault(
  creatUmol: number,
  age: number,
  weightKg: number,
  sex: PatientContext['sex'],
): number | null {
  if (!creatUmol || !age || !weightKg) return null;
  const scr = creatUmol / 88.4;
  const crcl = ((140 - age) * weightKg * (sex === 'female' ? 0.85 : 1)) / (72 * scr);
  return Math.round(crcl);
}

export function ckdStage(egfr: number): { stage: string; description: string } {
  if (egfr >= 90) return { stage: 'G1', description: 'Normal or high GFR (CKD only if other markers of kidney damage present)' };
  if (egfr >= 60) return { stage: 'G2', description: 'Mildly reduced GFR (CKD only if other markers of kidney damage present)' };
  if (egfr >= 45) return { stage: 'G3a', description: 'Mild to moderately reduced GFR' };
  if (egfr >= 30) return { stage: 'G3b', description: 'Moderately to severely reduced GFR' };
  if (egfr >= 15) return { stage: 'G4', description: 'Severely reduced GFR' };
  return { stage: 'G5', description: 'Kidney failure — renal replacement therapy usually required' };
}

/** KDIGO AKI staging on creatinine criteria (urine output criteria applied separately). */
export function akiStage(
  currentUmol: number,
  baselineUmol: number | null,
  urineOutput: number | null,
): { stage: 0 | 1 | 2 | 3; basis: string } | null {
  let creatStage: 0 | 1 | 2 | 3 = 0;
  let basis = '';

  if (baselineUmol && baselineUmol > 0) {
    const ratio = currentUmol / baselineUmol;
    const absRise = currentUmol - baselineUmol;
    if (ratio >= 3 || currentUmol >= 354) {
      creatStage = 3;
      basis = ratio >= 3 ? `creatinine ${fmt(ratio, 1)}× baseline` : 'creatinine ≥354 µmol/L';
    } else if (ratio >= 2) {
      creatStage = 2;
      basis = `creatinine ${fmt(ratio, 1)}× baseline`;
    } else if (ratio >= 1.5 || absRise >= 26.5) {
      creatStage = 1;
      basis = ratio >= 1.5 ? `creatinine ${fmt(ratio, 1)}× baseline` : `creatinine rise of ${fmt(absRise, 0)} µmol/L`;
    }
  } else if (currentUmol >= 354) {
    creatStage = 3;
    basis = 'creatinine ≥354 µmol/L (no baseline available)';
  }

  let uoStage: 0 | 1 | 2 | 3 = 0;
  let uoBasis = '';
  if (urineOutput !== null) {
    if (urineOutput < 0.3) {
      uoStage = 3;
      uoBasis = `urine output ${fmt(urineOutput, 2)} mL/kg/h`;
    } else if (urineOutput < 0.5) {
      uoStage = 2;
      uoBasis = `urine output ${fmt(urineOutput, 2)} mL/kg/h`;
    }
  }

  const stage = Math.max(creatStage, uoStage) as 0 | 1 | 2 | 3;
  if (stage === 0) return null;
  return { stage, basis: uniq([basis, uoBasis]).join('; ') || 'KDIGO criteria met' };
}

export function analyseRenal(ctx: ClinicalContext): ModuleResult {
  const findings: Finding[] = [];
  const derived: ModuleResult['derived'] = {};
  const p = ctx.patient;

  const creat = ctx.v('creatinine');
  const urea = ctx.v('urea');
  const reportedEgfr = ctx.v('egfr');
  const uo = ctx.v('urineOutput');
  const k = ctx.v('k');
  const hb = ctx.v('hb');

  // ── Derived renal function ───────────────────────────────────────────
  let egfr: number | null = reportedEgfr;
  if (creat !== null && p.age) {
    const calc = ckdEpi2021(creat, p.age, p.sex);
    if (calc !== null) {
      egfr = egfr ?? calc;
      derived.egfr = {
        label: 'eGFR (CKD-EPI 2021, calculated)',
        value: `${calc} mL/min/1.73m²`,
        note: reportedEgfr !== null && Math.abs(reportedEgfr - calc) > 10
          ? `Laboratory reported ${fmt(reportedEgfr, 0)} — equations and assays differ; use the local value for dosing.`
          : 'Race-free equation. Not validated in acute kidney injury, extremes of body habitus, or pregnancy.',
      };
    }
  } else if (reportedEgfr !== null) {
    derived.egfr = { label: 'eGFR (laboratory reported)', value: `${fmt(reportedEgfr, 0)} mL/min/1.73m²` };
  } else if (creat !== null && !p.age) {
    derived.egfr = { label: 'eGFR', value: 'Not calculable', note: 'Patient age is required for the CKD-EPI equation — enter age in the patient panel.' };
  }

  let crcl: number | null = null;
  if (creat !== null && p.age && p.weightKg) {
    crcl = cockcroftGault(creat, p.age, p.weightKg, p.sex);
    if (crcl !== null) {
      derived.crcl = {
        label: 'Creatinine clearance (Cockcroft–Gault)',
        value: `${crcl} mL/min`,
        note: 'Most renal drug-dosing tables, including antimicrobials and direct oral anticoagulants, are indexed to this value.',
      };
    }
  } else if (creat !== null) {
    derived.crcl = {
      label: 'Creatinine clearance (Cockcroft–Gault)',
      value: 'Not calculable',
      note: 'Requires age and body weight — enter both to enable renal dose adjustment prompts.',
    };
  }

  if (egfr !== null) {
    const stage = ckdStage(egfr);
    derived.ckd = { label: 'CKD category (KDIGO GFR)', value: stage.stage, note: stage.description };
  }

  if (urea !== null && creat !== null) {
    const ratio = urea / (creat / 1000); // mmol/L ÷ mmol/L
    derived.ureaCreatRatio = {
      label: 'Urea : creatinine ratio',
      value: fmt(ratio, 0),
      note: ratio > 100
        ? 'Disproportionately raised urea — consider hypovolaemia, gastrointestinal haemorrhage, corticosteroids or a high protein load'
        : ratio < 40 ? 'Low ratio — consider low protein intake, liver disease or over-hydration' : 'Within the usual range',
    };
  }

  const aki = creat !== null ? akiStage(creat, p.baselineCreatinine, uo) : null;
  if (aki) {
    derived.aki = { label: 'AKI stage (KDIGO)', value: `Stage ${aki.stage}`, note: aki.basis };
  } else if (creat !== null && p.baselineCreatinine) {
    derived.aki = { label: 'AKI stage (KDIGO)', value: 'No AKI by creatinine criteria' };
  } else if (creat !== null) {
    derived.aki = {
      label: 'AKI stage (KDIGO)',
      value: 'Indeterminate',
      note: 'No baseline creatinine supplied — AKI cannot be excluded on a single value. Enter a baseline in the patient panel.',
    };
  }

  // ── ACUTE KIDNEY INJURY ──────────────────────────────────────────────
  if (aki) {
    const sev: Severity = aki.stage === 3 ? 'critical' : aki.stage === 2 ? 'significant' : 'moderate';
    findings.push(finding({
      id: 'renal.aki',
      module: 'renal',
      title: `Acute kidney injury — KDIGO stage ${aki.stage}`,
      severity: k !== null && k > 6.0 ? 'life-threatening' : sev,
      interpretation:
        `Creatinine ${fmt(creat, 0)} µmol/L meets KDIGO criteria for stage ${aki.stage} acute kidney injury (${aki.basis}).` +
        (aki.stage === 3 ? ' Stage 3 AKI requires urgent senior review and assessment of the need for renal replacement therapy.' : '') +
        (k !== null && k > 6.0 ? ` Potassium is ${fmt(k, 1)} mmol/L — hyperkalaemia in AKI is an emergency and an indication for urgent treatment.` : ''),
      basis: uniq(['creatinine', urea !== null ? 'urea' : '', uo !== null ? 'urineOutput' : '']),
      differentials: [
        'Pre-renal: hypovolaemia, sepsis, cardiac failure, hepatorenal syndrome',
        'Renal: acute tubular necrosis, interstitial nephritis, glomerulonephritis, rhabdomyolysis, contrast or drug nephrotoxicity',
        'Post-renal: bladder outflow obstruction, ureteric obstruction, blocked catheter',
      ],
      investigations: uniq([
        'Urinalysis for blood and protein — an active sediment suggests intrinsic renal disease',
        'Urgent renal tract ultrasound to exclude obstruction, particularly in stage 2–3',
        'Fluid balance assessment, including standing and lying blood pressure and passive leg raise where appropriate',
        'Full medication review for nephrotoxins (NSAIDs, ACE inhibitors, ARBs, diuretics, aminoglycosides, contrast)',
        'Creatine kinase if rhabdomyolysis is possible',
        'Venous blood gas for acidosis and potassium',
        aki.stage >= 2 ? 'Immunology screen (ANA, ANCA, anti-GBM, complement) if intrinsic renal disease is suspected' : '',
      ]),
      implications: [
        'All renally cleared drugs require dose review; nephrotoxins should be withheld.',
        'Risk of hyperkalaemia, metabolic acidosis, fluid overload and uraemic complications.',
        aki.stage === 3 ? 'Indications for renal replacement: refractory hyperkalaemia, refractory acidosis, refractory fluid overload, uraemic pericarditis or encephalopathy, and certain poisonings.' : '',
        p.knownCKD ? 'Pre-existing chronic kidney disease increases the risk of non-recovery and of progression to end-stage disease.' : '',
      ].filter(Boolean),
      monitoring: [
        'Daily urea, creatinine and electrolytes — more frequently if deteriorating',
        'Strict hourly fluid balance with catheterisation where appropriate',
        'Daily weight',
        'Repeat ECG and potassium if hyperkalaemic',
      ],
      guidance: [
        'Apply the KDIGO bundle: optimise volume status and perfusion pressure, stop nephrotoxins, exclude obstruction, and identify and treat the underlying cause.',
        'Avoid intravenous contrast where alternatives exist; where unavoidable, ensure adequate hydration.',
        'Refer to nephrology for stage 3 AKI, AKI with an unclear cause, or suspected intrinsic renal disease.',
      ],
      tags: ['aki', `aki:stage${aki.stage}`, 'renal-impairment', 'renal-dose-consideration'],
    }));
  }

  // ── CHRONIC KIDNEY DISEASE / REDUCED eGFR ────────────────────────────
  if (egfr !== null && egfr < 60 && !aki) {
    const stage = ckdStage(egfr);
    const sev: Severity = egfr < 15 ? 'critical' : egfr < 30 ? 'significant' : 'moderate';
    findings.push(finding({
      id: 'renal.ckd',
      module: 'renal',
      title: `Reduced glomerular filtration rate — ${stage.stage} (eGFR ${fmt(egfr, 0)} mL/min/1.73m²)`,
      severity: sev,
      interpretation:
        `${stage.description}. A diagnosis of chronic kidney disease requires this to be present for at least three months; a single value cannot distinguish chronic impairment from acute kidney injury.` +
        (p.knownCKD ? ' Chronic kidney disease is already documented for this patient.' : ' If no previous results are available, repeat testing is required to establish chronicity.'),
      basis: uniq(['creatinine', reportedEgfr !== null ? 'egfr' : '']),
      differentials: ['Diabetic nephropathy', 'Hypertensive nephrosclerosis', 'Glomerulonephritis', 'Polycystic kidney disease', 'Chronic obstructive uropathy', 'Chronic interstitial nephritis including analgesic nephropathy', 'Renovascular disease', 'Superimposed acute kidney injury'],
      investigations: uniq([
        'Urine albumin:creatinine ratio for albuminuria staging',
        'Compare with historical creatinine values to establish chronicity',
        'Renal tract ultrasound',
        'Haemoglobin, calcium, phosphate, parathyroid hormone and vitamin D for CKD–mineral bone disorder and renal anaemia',
        'Blood pressure and diabetic control review',
      ]),
      implications: [
        'Dose adjustment is required for renally cleared medicines, including many antimicrobials, direct oral anticoagulants, metformin and opioids.',
        'Increased cardiovascular risk — the leading cause of death in chronic kidney disease.',
        egfr < 30 ? 'Avoid nephrotoxins and gadolinium-based contrast; nephrology involvement is appropriate.' : '',
        hb !== null && hb < 11 ? 'Coexisting anaemia may be renal in origin — see the correlation section.' : '',
      ].filter(Boolean),
      monitoring: [
        egfr < 30 ? 'Renal function every 3 months or sooner' : 'Renal function every 6 months',
        'Blood pressure at each contact',
        'Annual urine albumin:creatinine ratio',
      ],
      guidance: [
        'Blood pressure and albuminuria control with an ACE inhibitor or angiotensin receptor blocker slows progression where albuminuria is present.',
        'SGLT2 inhibitors reduce progression in chronic kidney disease with albuminuria, with or without diabetes.',
        'Refer to nephrology for eGFR below 30, rapidly declining function, significant albuminuria, or an uncertain diagnosis.',
      ],
      tags: ['ckd', 'renal-impairment', 'renal-dose-consideration', egfr < 30 ? 'severe-renal-impairment' : ''],
    }));
  }

  if (creat !== null && ctx.high('creatinine') && !aki && (egfr === null || egfr >= 60)) {
    findings.push(finding({
      id: 'renal.creatinine',
      module: 'renal',
      title: 'Raised creatinine',
      severity: ctx.severityOf('creatinine'),
      interpretation: `Creatinine ${fmt(creat, 0)} µmol/L is above the reference interval. Creatinine is influenced by muscle mass, diet and certain drugs (trimethoprim, cimetidine) that inhibit tubular secretion without affecting true GFR.`,
      basis: ['creatinine'],
      differentials: ['Reduced glomerular filtration', 'High muscle mass or recent intense exercise', 'High protein or creatine intake', 'Drugs inhibiting tubular creatinine secretion', 'Dehydration'],
      investigations: ['Compare against previous values', 'Urea and electrolytes', 'Urinalysis', 'Medication review'],
      implications: ['Consider renal dose adjustment of prescribed medicines.'],
      monitoring: ['Repeat renal function to establish the trend'],
      guidance: ['A single raised creatinine should be repeated before conclusions are drawn.'],
      tags: ['renal-impairment', 'renal-dose-consideration'],
    }));
  }

  if (urea !== null && ctx.high('urea') && creat !== null) {
    const ratio = urea / (creat / 1000);
    if (ratio > 100) {
      findings.push(finding({
        id: 'renal.ureaout',
        module: 'renal',
        title: 'Disproportionately raised urea relative to creatinine',
        severity: 'moderate',
        interpretation: `Urea ${fmt(urea, 1)} mmol/L with creatinine ${fmt(creat, 0)} µmol/L gives a urea:creatinine ratio of ${fmt(ratio, 0)}. A high ratio suggests a pre-renal state or an increased nitrogen load rather than intrinsic renal disease.`,
        basis: ['urea', 'creatinine'],
        differentials: ['Hypovolaemia / dehydration', 'Upper gastrointestinal haemorrhage', 'High protein intake or catabolic state', 'Corticosteroid or tetracycline therapy', 'Cardiac failure with reduced renal perfusion'],
        investigations: ['Assess volume status', 'Full blood count and digital rectal examination if gastrointestinal bleeding is suspected', 'Review fluid balance charts and recent weights'],
        implications: ['Volume repletion may improve renal function if pre-renal — but assess for fluid overload first.'],
        monitoring: ['Repeat urea and electrolytes after fluid resuscitation'],
        guidance: ['An isolated raised urea with normal creatinine in a patient with melaena or anaemia should prompt assessment for upper gastrointestinal haemorrhage.'],
        tags: ['pre-renal', 'hypovolaemia'],
      }));
    }
  }

  const analytes = ctx.moduleAnalytes('renal');
  const present = analytes.length > 0;
  const titles = uniq(findings.map((f) => f.title));

  return {
    module: 'renal',
    present,
    analytes,
    observations: ctx.moduleObservations('renal'),
    findings,
    summary: !present
      ? 'No renal function data available.'
      : titles.length ? `${titles.join('; ')}.` : 'Renal function is within the reference intervals applied.',
    severity: rollUp(findings.map((f) => f.severity)),
    derived,
  };
}
