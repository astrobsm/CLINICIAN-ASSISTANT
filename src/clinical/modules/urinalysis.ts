/**
 * URINALYSIS ANALYSIS MODULE
 *
 * Interprets dipstick and microscopy findings, which arrive as qualitative
 * observations keyed `urinalysis:<field>`.
 */
import type { ClinicalContext } from '../context';
import { uniq } from '../context';
import { fmt } from '../units';
import type { Finding, ModuleResult } from '../types';
import { finding } from '../types';
import { rollUp } from '../severity';

/** Normalise dipstick grading to a 0–4 scale. */
export function dipstickGrade(raw: string | null): number {
  if (!raw) return 0;
  const s = raw.toLowerCase().trim();
  if (/(^|\b)(neg|negative|nil|nad|absent|not detected|none)\b/.test(s)) return 0;
  if (/trace/.test(s)) return 1;
  const plus = (s.match(/\+/g) || []).length;
  if (plus) return Math.min(plus + 1, 4);
  const n = parseFloat(s);
  if (!Number.isNaN(n)) return n > 0 ? Math.min(Math.ceil(n), 4) : 0;
  if (/(large|heavy|marked|\bmany\b|\b3\b)/.test(s)) return 4;
  if (/(moderate|\b2\b)/.test(s)) return 3;
  if (/(small|few|slight|\b1\b)/.test(s)) return 2;
  if (/(present|positive|pos)\b/.test(s)) return 2;
  return 0;
}

const GRADE_TEXT = ['negative', 'trace', '1+', '2+', '3+ or greater'];

export function analyseUrinalysis(ctx: ClinicalContext): ModuleResult {
  const findings: Finding[] = [];
  const derived: ModuleResult['derived'] = {};
  const p = ctx.patient;

  const protein = dipstickGrade(ctx.obs('urinalysis:protein'));
  const blood = dipstickGrade(ctx.obs('urinalysis:blood'));
  const leuk = dipstickGrade(ctx.obs('urinalysis:leucocytes'));
  const nitrite = dipstickGrade(ctx.obs('urinalysis:nitrite'));
  const glucose = dipstickGrade(ctx.obs('urinalysis:glucose'));
  const ketones = dipstickGrade(ctx.obs('urinalysis:ketones'));
  const bilirubin = dipstickGrade(ctx.obs('urinalysis:bilirubin'));
  const urobilinogen = dipstickGrade(ctx.obs('urinalysis:urobilinogen'));
  const microscopy = ctx.obs('urinalysis:microscopy') ?? '';
  const casts = /cast/i.test(microscopy) ? microscopy : '';

  const ph = ctx.v('uPh');
  const sg = ctx.v('uSg');
  const acr = ctx.v('uAcr');
  const pcr = ctx.v('uPcr');

  const anyResult = [protein, blood, leuk, nitrite, glucose, ketones, bilirubin, urobilinogen].some((g) => g > 0)
    || ph !== null || sg !== null || acr !== null || pcr !== null || microscopy.length > 0;

  if (protein || blood || leuk || nitrite) {
    derived.dipstick = {
      label: 'Dipstick summary',
      value: uniq([
        protein ? `protein ${GRADE_TEXT[protein]}` : '',
        blood ? `blood ${GRADE_TEXT[blood]}` : '',
        leuk ? `leucocyte esterase ${GRADE_TEXT[leuk]}` : '',
        nitrite ? `nitrite ${GRADE_TEXT[nitrite]}` : '',
        glucose ? `glucose ${GRADE_TEXT[glucose]}` : '',
        ketones ? `ketones ${GRADE_TEXT[ketones]}` : '',
      ]).join(', ') || 'No positive dipstick findings',
    };
  }

  // ── URINARY TRACT INFECTION ──────────────────────────────────────────
  if (nitrite >= 2 || leuk >= 2) {
    const both = nitrite >= 2 && leuk >= 2;
    findings.push(finding({
      id: 'urine.uti',
      module: 'urinalysis',
      title: both ? 'Dipstick strongly suggestive of urinary tract infection' : 'Dipstick findings consistent with possible urinary tract infection',
      severity: p.fever || both ? 'significant' : 'moderate',
      interpretation:
        `${nitrite >= 2 ? `Nitrite ${GRADE_TEXT[nitrite]}` : 'Nitrite negative'} with ${leuk >= 2 ? `leucocyte esterase ${GRADE_TEXT[leuk]}` : 'leucocyte esterase negative'}.` +
        (both ? ' The combination has a high positive predictive value for bacteriuria in symptomatic patients.' : ' Leucocyte esterase alone is non-specific and occurs with any cause of pyuria.') +
        ' Dipstick testing should not be used to diagnose urinary tract infection in patients over 65 years, or in those with a urinary catheter, in whom asymptomatic bacteriuria is common and does not require treatment.',
      basis: uniq(['urinalysis:nitrite', 'urinalysis:leucocytes']),
      differentials: ['Bacterial urinary tract infection', 'Asymptomatic bacteriuria', 'Catheter-associated bacteriuria or colonisation', 'Sterile pyuria — tuberculosis, chlamydia, interstitial nephritis, renal stones, recently treated infection', 'Contamination'],
      investigations: uniq([
        'Send urine for microscopy, culture and sensitivity before starting antimicrobials',
        p.fever ? 'Blood cultures — fever with urinary findings raises the possibility of urosepsis or pyelonephritis' : '',
        'Assess for loin pain, rigors and systemic upset to distinguish upper from lower tract infection',
        'Renal tract imaging where there is obstruction, recurrent infection or failure to respond',
      ]),
      implications: [
        'Treat the patient, not the dipstick — asymptomatic bacteriuria should not be treated except in pregnancy or before urological instrumentation.',
        p.fever ? 'Fever with urinary findings and systemic illness warrants assessment for urosepsis, which requires prompt antimicrobial therapy and source control.' : '',
      ].filter(Boolean),
      monitoring: ['Review the culture and sensitivity result at 48 hours and rationalise antimicrobial therapy accordingly', 'Monitor observations and renal function'],
      guidance: [
        'Follow local antimicrobial guidance for empirical treatment, then narrow the spectrum once sensitivities are available.',
        'Obstructed and infected urinary tracts require urgent decompression in addition to antimicrobials.',
      ],
      tags: ['uti-suspected', 'infection-risk', 'culture-indicated'],
    }));
  }

  // ── PROTEINURIA ──────────────────────────────────────────────────────
  if (protein >= 2 || (acr !== null && acr > 3) || (pcr !== null && pcr > 15)) {
    const nephrotic = (pcr !== null && pcr > 300) || (acr !== null && acr > 250) || protein >= 4;
    findings.push(finding({
      id: 'urine.proteinuria',
      module: 'urinalysis',
      title: nephrotic ? 'Heavy proteinuria — nephrotic range' : 'Proteinuria',
      severity: nephrotic ? 'significant' : 'moderate',
      interpretation:
        uniq([
          protein ? `Dipstick protein ${GRADE_TEXT[protein]}` : '',
          acr !== null ? `albumin:creatinine ratio ${fmt(acr, 1)} mg/mmol` : '',
          pcr !== null ? `protein:creatinine ratio ${fmt(pcr, 1)} mg/mmol` : '',
        ]).join(', ') +
        '. Quantification on an early morning sample is required — dipstick protein is semi-quantitative and affected by urine concentration.' +
        (nephrotic ? ' Values in this range indicate nephrotic-range proteinuria and require nephrology assessment.' : ''),
      basis: uniq(['urinalysis:protein', acr !== null ? 'uAcr' : '', pcr !== null ? 'uPcr' : '']),
      differentials: ['Diabetic nephropathy', 'Glomerulonephritis', 'Hypertensive nephropathy', 'Pre-eclampsia in pregnancy', 'Myeloma and amyloidosis', 'Transient — fever, exercise, heart failure', 'Orthostatic proteinuria in young people'],
      investigations: uniq([
        'Quantify with an early morning urine albumin:creatinine ratio',
        'Renal function and albumin',
        'Blood pressure',
        nephrotic ? 'Lipid profile, immunoglobulins and serum free light chains, autoimmune and viral screen, renal ultrasound and consideration of renal biopsy' : '',
        p.pregnant ? 'Urgent assessment for pre-eclampsia — blood pressure, platelets, liver function and fetal assessment' : '',
      ]),
      implications: [
        'Proteinuria is an independent predictor of progressive kidney disease and cardiovascular risk.',
        nephrotic ? 'Nephrotic syndrome carries risks of thromboembolism, infection and hyperlipidaemia.' : '',
        p.pregnant ? 'New proteinuria after 20 weeks of gestation with hypertension defines pre-eclampsia.' : '',
      ].filter(Boolean),
      monitoring: ['Repeat quantification to confirm persistence', 'Monitor renal function and blood pressure'],
      guidance: ['ACE inhibition or angiotensin receptor blockade reduces proteinuria and slows progression where albuminuria is confirmed and blood pressure permits.'],
      tags: ['proteinuria', nephrotic ? 'nephrotic-range' : '', 'renal-impairment'],
    }));
  }

  // ── HAEMATURIA ───────────────────────────────────────────────────────
  if (blood >= 2) {
    const withProtein = protein >= 2;
    findings.push(finding({
      id: 'urine.haematuria',
      module: 'urinalysis',
      title: withProtein ? 'Haematuria with proteinuria — possible glomerular origin' : 'Haematuria',
      severity: withProtein ? 'significant' : 'moderate',
      interpretation:
        `Dipstick blood ${GRADE_TEXT[blood]}${casts ? `, with microscopy reporting: ${casts}` : ''}.` +
        (withProtein ? ' The combination of haematuria and proteinuria suggests a glomerular source and warrants nephrology assessment.' : ' Isolated haematuria requires exclusion of a urological cause.') +
        ' Dipstick blood also reacts with free haemoglobin and myoglobin, so microscopy is required to confirm the presence of red cells.',
      basis: uniq(['urinalysis:blood', withProtein ? 'urinalysis:protein' : '']),
      differentials: withProtein
        ? ['Glomerulonephritis — IgA nephropathy, post-infectious, ANCA-associated vasculitis, anti-GBM disease', 'Lupus nephritis', 'Thrombotic microangiopathy']
        : ['Urinary tract infection', 'Renal or ureteric calculi', 'Urological malignancy — bladder, renal, prostate', 'Benign prostatic enlargement', 'Trauma or recent instrumentation', 'Menstrual contamination', 'Rhabdomyolysis or haemolysis producing a false positive', 'Anticoagulation unmasking a lesion'],
      investigations: uniq([
        'Urine microscopy for red cell morphology and casts — dysmorphic cells and red cell casts indicate a glomerular source',
        'Urine culture to exclude infection',
        withProtein ? 'Renal function, complement, ANA, ANCA, anti-GBM and immunoglobulins; urgent nephrology referral' : 'Renal tract imaging (CT urogram or ultrasound) and cystoscopy according to local haematuria pathways',
        'Creatine kinase if rhabdomyolysis is possible',
        'Blood pressure',
      ]),
      implications: [
        'Visible haematuria in an adult requires urgent urological assessment to exclude malignancy, irrespective of anticoagulation.',
        withProtein ? 'A rapidly rising creatinine with an active urinary sediment suggests rapidly progressive glomerulonephritis — a nephrological emergency.' : '',
      ].filter(Boolean),
      monitoring: ['Repeat urinalysis after treatment of any infection', 'Monitor renal function and blood pressure'],
      guidance: ['Refer under the urgent suspected cancer pathway where visible haematuria occurs in adults, or non-visible haematuria with risk factors.'],
      tags: ['haematuria', withProtein ? 'glomerular-pattern' : '', 'renal-impairment'],
    }));
  }

  // ── KETONES / GLUCOSE ────────────────────────────────────────────────
  if (ketones >= 2) {
    findings.push(finding({
      id: 'urine.ketones',
      module: 'urinalysis',
      title: 'Ketonuria',
      severity: ketones >= 3 && glucose >= 3 ? 'significant' : 'moderate',
      interpretation:
        `Urinary ketones ${GRADE_TEXT[ketones]}${glucose ? ` with glycosuria ${GRADE_TEXT[glucose]}` : ''}. Urinary ketone testing detects acetoacetate rather than beta-hydroxybutyrate, which predominates in diabetic ketoacidosis; capillary or serum beta-hydroxybutyrate is the preferred measurement.`,
      basis: uniq(['urinalysis:ketones', glucose ? 'urinalysis:glucose' : '']),
      differentials: ['Diabetic ketoacidosis', 'Starvation or prolonged fasting', 'Alcoholic ketoacidosis', 'Vomiting', 'Low carbohydrate diet', 'Euglycaemic ketoacidosis on SGLT2 inhibitor therapy'],
      investigations: ['Capillary or serum ketones', 'Blood glucose and venous blood gas', 'Renal function and electrolytes'],
      implications: ['SGLT2 inhibitors can cause euglycaemic ketoacidosis — a normal glucose does not exclude the diagnosis.'],
      monitoring: ['Serial ketones and blood gas if ketoacidosis is being treated'],
      guidance: ['Manage confirmed diabetic ketoacidosis with the local protocol: fixed-rate intravenous insulin, fluid resuscitation and careful potassium replacement.'],
      tags: ['ketonuria', glucose >= 3 ? 'possible-dka' : ''],
    }));
  }

  if (glucose >= 2 && ketones < 2) {
    findings.push(finding({
      id: 'urine.glycosuria',
      module: 'urinalysis',
      title: 'Glycosuria',
      severity: 'minor',
      interpretation: `Urinary glucose ${GRADE_TEXT[glucose]}. Glycosuria usually indicates a blood glucose above the renal threshold of approximately 10 mmol/L, but occurs at normal glucose levels with SGLT2 inhibitors and in renal glycosuria.`,
      basis: ['urinalysis:glucose'],
      differentials: ['Diabetes mellitus', 'SGLT2 inhibitor therapy', 'Renal glycosuria', 'Pregnancy (lowered renal threshold)'],
      investigations: ['Blood glucose and HbA1c', 'Medication review'],
      implications: ['Persistent glycosuria warrants formal assessment for diabetes if not already diagnosed.'],
      monitoring: ['HbA1c'],
      guidance: ['Diagnose diabetes on blood glucose or HbA1c criteria, not on urinalysis.'],
      tags: ['glycosuria'],
    }));
  }

  if (casts) {
    findings.push(finding({
      id: 'urine.casts',
      module: 'urinalysis',
      title: 'Urinary casts reported on microscopy',
      severity: /red cell|rbc|granular|muddy/i.test(casts) ? 'significant' : 'moderate',
      interpretation: `Microscopy reports: ${casts}. Red cell casts are effectively diagnostic of glomerular bleeding; muddy brown granular casts are characteristic of acute tubular necrosis; white cell casts suggest pyelonephritis or interstitial nephritis.`,
      basis: ['urinalysis:microscopy'],
      differentials: ['Glomerulonephritis (red cell casts)', 'Acute tubular necrosis (granular casts)', 'Pyelonephritis or interstitial nephritis (white cell casts)', 'Hyaline casts — non-specific, seen in concentrated urine'],
      investigations: ['Renal function and urine protein quantification', 'Immunology screen if a glomerular process is suspected', 'Urgent nephrology discussion for red cell casts'],
      implications: ['Casts localise the pathology to the kidney rather than the lower urinary tract.'],
      monitoring: ['Serial renal function'],
      guidance: ['Red cell casts with renal impairment require same-day nephrology involvement.'],
      tags: ['urinary-casts', 'renal-impairment'],
    }));
  }

  if (sg !== null && sg > 1.030) {
    findings.push(finding({
      id: 'urine.concentrated',
      module: 'urinalysis',
      title: 'Highly concentrated urine',
      severity: 'minor',
      interpretation: `Specific gravity ${fmt(sg, 3)} indicates concentrated urine, most often reflecting reduced fluid intake or volume depletion with intact tubular concentrating ability.`,
      basis: ['uSg'],
      differentials: ['Dehydration or hypovolaemia', 'Reduced intake', 'Syndrome of inappropriate antidiuresis', 'Glycosuria or contrast media (falsely raise specific gravity)'],
      investigations: ['Assess volume status', 'Renal function and sodium'],
      implications: ['Supports a pre-renal picture where renal function is impaired.'],
      monitoring: ['Fluid balance'],
      guidance: [],
      tags: ['hypovolaemia'],
    }));
  }

  const analytes = ctx.moduleAnalytes('urinalysis');
  const observations = ctx.moduleObservations('urinalysis');
  const present = analytes.length > 0 || observations.length > 0 || anyResult;
  const titles = uniq(findings.map((f) => f.title));

  return {
    module: 'urinalysis',
    present,
    analytes,
    observations,
    findings,
    summary: !present
      ? 'No urinalysis data available.'
      : titles.length ? `${titles.join('; ')}.` : 'Urinalysis shows no significant abnormality on the parameters reported.',
    severity: rollUp(findings.map((f) => f.severity)),
    derived,
  };
}
