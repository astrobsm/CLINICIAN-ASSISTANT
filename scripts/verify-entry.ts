/**
 * End-to-end verification of the parsing and clinical analysis engine using
 * realistic report text. Runs headlessly (no DOM) via scripts/verify.mjs.
 */
import { analyse } from '../src/clinical/analyse';
import { emptyExtraction } from '../src/clinical/context';
import { emptyPatient, SEVERITY_LABEL, type PatientContext } from '../src/clinical/types';
import { classifyReport } from '../src/parse/classify';
import { parseLabValues, resolvePercentages, parseDemographics } from '../src/parse/labParser';
import { parseEcg } from '../src/parse/ecgParser';
import { parseMicrobiology } from '../src/parse/microParser';

const FBC = `
CITY GENERAL HOSPITAL — HAEMATOLOGY
FULL BLOOD COUNT
Patient Name: SMITH, JOHN            Hospital No: H1234567
Age: 68        Sex: M                Collected: 01/08/2026 08:15

Test                        Result      Unit          Reference
Haemoglobin                 7.4         g/dL          13.0 - 17.0   L
Packed Cell Volume          23.1        %             40 - 52       L
Red Blood Cell Count        2.71        x10^12/L      4.5 - 6.5     L
Mean Cell Volume            72.4        fL            80 - 100      L
Mean Cell Haemoglobin       24.1        pg            27 - 32       L
MCHC                        31.2        g/dL          32 - 36       L
Red Cell Distribution Width 18.6        %             11.5 - 14.5   H
White Blood Cell Count      18.9        x10^9/L       4.0 - 11.0    H
Neutrophils                 16.2        x10^9/L       2.0 - 7.5     H
Lymphocytes                 1.4         x10^9/L       1.0 - 4.0
Monocytes                   0.9         x10^9/L       0.2 - 0.8     H
Eosinophils                 0.05        x10^9/L       0.04 - 0.40
Basophils                   0.02        x10^9/L       0.0 - 0.1
Platelet Count              612         x10^9/L       150 - 400     H
Immature Granulocytes       1.8         %             0 - 0.5       H
`;

const UE = `
BIOCHEMISTRY — UREA AND ELECTROLYTES / RENAL PROFILE
Sodium                 129    mmol/L    (135 - 145)
Potassium              6.4    mmol/L    (3.5 - 5.0)
Chloride               101    mmol/L    (98 - 107)
Bicarbonate            15     mmol/L    (22 - 29)
Urea                   28.4   mmol/L    (2.5 - 7.8)
Creatinine             342    umol/L    (60 - 110)
eGFR                   14     mL/min/1.73m2
Corrected Calcium      2.05   mmol/L
Magnesium              0.58   mmol/L    (0.70 - 1.00)
Phosphate              2.10   mmol/L    (0.80 - 1.45)
Albumin                26     g/L       (35 - 50)
C-Reactive Protein     214    mg/L      (< 5)
Lactate                4.6    mmol/L    (0.5 - 2.0)
`;

const COAG = `
COAGULATION SCREEN
Prothrombin Time        22.4   s      (11 - 14)
INR                     1.9
APTT                    52.3   s      (25 - 35)
Fibrinogen              0.9    g/L    (2.0 - 4.0)
D-Dimer                 8.4    mg/L FEU  (< 0.5)
`;

const ECG = `
12-LEAD ELECTROCARDIOGRAM
Vent. rate        108 BPM
PR interval       218 ms
QRS duration      142 ms
QT/QTc            442/512 ms
P-R-T axes        58  -46  120

Sinus tachycardia
Peaked T waves - consider hyperkalaemia
Nonspecific intraventricular conduction delay
Prolonged QT interval
`;

const MICRO = `
MICROBIOLOGY — WOUND SWAB MICROSCOPY, CULTURE & SENSITIVITY
Specimen: Wound swab, left lower limb ulcer
Collected: 01/08/2026

Microscopy: Numerous pus cells seen. Epithelial cells scanty.
Gram stain: Gram positive cocci in clusters

Culture: Heavy growth of Staphylococcus aureus (MRSA)

Sensitivity:
Flucloxacillin        R
Co-amoxiclav          R
Erythromycin          R
Ciprofloxacin         R
Gentamicin            S
Vancomycin            S
Teicoplanin           S
Linezolid             S
Doxycycline           S
Trimethoprim          S
Rifampicin            S
`;

function line(t = '─', n = 78) { console.log(t.repeat(n)); }

const patient: PatientContext = {
  ...emptyPatient(),
  name: 'SMITH, JOHN',
  hospitalNumber: 'H1234567',
  age: 68,
  sex: 'male',
  weightKg: 78,
  ward: 'Ward 12 — Acute Medicine',
  consultant: 'Dr A Reynolds',
  diagnosis: 'Infected diabetic foot ulcer',
  fever: true,
  plannedSurgery: true,
  baselineCreatinine: 96,
  allergies: ['penicillin'],
  collectedAt: '01/08/2026 08:15',
};

const extraction = emptyExtraction();
const docs: string[] = [];
let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

line('═');
console.log('  CLINICIAN ASSISTANT — ENGINE VERIFICATION');
line('═');

for (const [name, text] of Object.entries({ FBC, UE, COAG, ECG, MICRO })) {
  console.log(`\n▸ ${name}`);
  const cls = classifyReport(text);
  console.log(`  classified as: ${cls.modules.join(', ')} (primary: ${cls.primary})`);

  const lab = parseLabValues(text, patient, `doc_${name}`, 0.93);
  const derived = resolvePercentages(lab, patient, `doc_${name}`, 0.93);
  const all = [...lab.analytes, ...derived];
  if (all.length) {
    console.log(`  ${all.length} analytes: ${all.map((a) => `${a.key}=${a.value}${a.unit}`).join(', ')}`);
  }
  for (const a of all) {
    const i = extraction.analytes.findIndex((x) => x.key === a.key);
    if (i >= 0) extraction.analytes[i] = a; else extraction.analytes.push(a);
  }
  extraction.observations.push(...lab.observations);

  if (cls.modules.includes('ecg')) {
    const e = parseEcg(text);
    if (e) {
      extraction.ecg.push(e);
      console.log(`  ECG: rate=${e.rateBpm} PR=${e.prMs} QRS=${e.qrsMs} QT=${e.qtMs} QTc=${e.qtcMs} axis=${e.axisDegrees}`);
      console.log(`  ECG features: ${Object.keys(e.features).join(', ') || '(none)'}`);
    }
  }
  if (cls.modules.includes('microbiology')) {
    const m = parseMicrobiology(text);
    if (m) {
      extraction.micro.push(m);
      console.log(`  Micro: ${m.specimenType} · organisms=${m.organisms.map((o) => o.name).join(', ')}`);
      for (const o of m.organisms) {
        console.log(`    ${o.name}: S=${o.susceptibilities.filter((s) => s.result === 'S').length} R=${o.susceptibilities.filter((s) => s.result === 'R').length} markers=${o.resistanceMarkers.join(',') || '—'}`);
      }
    }
  }
  docs.push(name);
}

console.log('\n▸ Demographics parsed from FBC header');
console.log(' ', JSON.stringify(parseDemographics(FBC)));

// ─────────────────────────── Parser assertions ───────────────────────────
console.log('\n▸ PARSER CHECKS');
const v = (k: string) => extraction.analytes.find((a) => a.key === k)?.value;
check('Haemoglobin 7.4 g/dL', v('hb') === 7.4, `got ${v('hb')}`);
check('MCV 72.4 fL', v('mcv') === 72.4, `got ${v('mcv')}`);
check('WBC 18.9 (not the 4.0 reference bound)', v('wbc') === 18.9, `got ${v('wbc')}`);
check('Platelets 612', v('plt') === 612, `got ${v('plt')}`);
check('Potassium 6.4 (bracketed range ignored)', v('k') === 6.4, `got ${v('k')}`);
check('Sodium 129', v('na') === 129, `got ${v('na')}`);
check('Creatinine 342 µmol/L', v('creatinine') === 342, `got ${v('creatinine')}`);
check('Magnesium 0.58', v('magnesium') === 0.58, `got ${v('magnesium')}`);
check('CRP 214 mg/L', v('crp') === 214, `got ${v('crp')}`);
check('Lactate 4.6', v('lactate') === 4.6, `got ${v('lactate')}`);
check('INR 1.9', v('inr') === 1.9, `got ${v('inr')}`);
check('Fibrinogen 0.9 g/L', v('fibrinogen') === 0.9, `got ${v('fibrinogen')}`);
check('D-dimer 8.4', v('ddimer') === 8.4, `got ${v('ddimer')}`);
check('ECG QTc 512 ms parsed from "QT/QTc 442/512"', extraction.ecg[0]?.qtcMs === 512, `got ${extraction.ecg[0]?.qtcMs}`);
check('ECG QRS axis -46 from P-R-T axes', extraction.ecg[0]?.axisDegrees === -46, `got ${extraction.ecg[0]?.axisDegrees}`);
check('ECG hyperkalaemia feature detected', !!extraction.ecg[0]?.features.hyperkalaemiaEcg);
check('ECG long QT feature detected', !!extraction.ecg[0]?.features.longQt);
check('MRSA organism identified', extraction.micro[0]?.organisms[0]?.name.includes('MRSA') === true, extraction.micro[0]?.organisms[0]?.name);
check('Vancomycin recorded sensitive', extraction.micro[0]?.organisms[0]?.susceptibilities.some((s) => s.key === 'vancomycin' && s.result === 'S') === true);
check('Flucloxacillin recorded resistant', extraction.micro[0]?.organisms[0]?.susceptibilities.some((s) => s.key === 'flucloxacillin' && s.result === 'R') === true);

// ─────────────────────────── Analysis ───────────────────────────
const result = analyse(patient, extraction, docs.map((d, i) => ({
  id: `doc_${d}`, fileName: `${d}.txt`, mime: 'text/plain', pageCount: 1,
  rawText: '', meanConfidence: 0.93, detectedModules: [], addedAt: new Date(0).toISOString(),
  status: 'done' as const,
})));

line('═');
console.log(`  OVERALL PRIORITY: ${SEVERITY_LABEL[result.overallSeverity]}`);
line('═');

for (const m of result.modules.filter((x) => x.present)) {
  console.log(`\n▸ ${m.module.toUpperCase()} [${SEVERITY_LABEL[m.severity]}]`);
  console.log(`  ${m.summary}`);
  for (const [, d] of Object.entries(m.derived)) console.log(`   · ${d.label}: ${d.value}`);
  for (const f of m.findings) console.log(`   ! ${f.title} [${f.severity}]`);
}

console.log('\n═══ CORRELATIONS ═══');
for (const c of result.correlations) {
  console.log(`\n [${c.severity.toUpperCase()}] ${c.title}`);
  console.log(`   ${c.narrative.slice(0, 300)}${c.narrative.length > 300 ? '…' : ''}`);
  console.log(`   actions: ${c.actions.length}`);
}

console.log('\n═══ IMPRESSION ═══');
for (const p of result.impression) console.log(` • ${p}`);

console.log('\n═══ NEXT STEPS (first 14) ═══');
for (const s of result.nextSteps.slice(0, 14)) console.log(` • ${s}`);

// ─────────────────────────── Analysis assertions ───────────────────────────
console.log('\n▸ ANALYSIS CHECKS');
const ids = result.modules.flatMap((m) => m.findings).map((f) => f.id);
const corrIds = result.correlations.map((c) => c.id);
const mod = (id: string) => result.modules.find((m) => m.module === id)!;

check('Overall severity is life-threatening', result.overallSeverity === 'life-threatening', result.overallSeverity);
check('Microcytic anaemia identified', ids.includes('fbc.anaemia'));
check('Iron deficiency pattern identified', ids.includes('fbc.irondeficiency'));
check('Leucocytosis identified', ids.includes('fbc.leucocytosis'));
check('Thrombocytosis identified', ids.includes('fbc.thrombocytosis'));
check('Sepsis pattern identified', ids.includes('fbc.sepsispattern'));
check('Severe hyperkalaemia identified', ids.includes('lyte.hyperkalaemia'));
check('Hyponatraemia identified', ids.includes('lyte.hyponatraemia'));
check('Hypomagnesaemia identified', ids.includes('lyte.hypomagnesaemia'));
check('AKI staged', ids.includes('renal.aki'));
check('AKI stage 3 (342 vs baseline 96)', mod('renal').derived.aki?.value === 'Stage 3', mod('renal').derived.aki?.value);
check('eGFR computed', !!mod('renal').derived.egfr?.value, mod('renal').derived.egfr?.value);
check('Creatinine clearance computed', !!mod('renal').derived.crcl?.value, mod('renal').derived.crcl?.value);
check('DIC identified from ISTH score', ids.includes('coag.dic'));
check('Hypofibrinogenaemia identified', ids.includes('coag.hypofibrinogenaemia'));
check('Perioperative bleeding risk flagged', ids.includes('coag.periop'));
check('ECG hyperkalaemia finding', ids.includes('ecg.hyperkalaemiaEcg'));
check('ECG urgency = immediate', mod('ecg').derived.urgency?.value.includes('IMMEDIATE') === true, mod('ecg').derived.urgency?.value);
check('MRSA organism finding', ids.some((i) => i.startsWith('micro.org.')));
check('Correlation: hyperkalaemia + ECG', corrIds.includes('corr.hyperkEcg'));
check('Correlation: culture + systemic response', corrIds.includes('corr.woundSepsis'));
check('Correlation: AKI + hyperK + acidosis', corrIds.includes('corr.akiHyperkAcidosis'));
check('Correlation: sepsis with DIC', corrIds.includes('corr.sepsisDic'));
check('Correlation: renal anaemia', corrIds.includes('corr.renalAnaemia'));
check('Correlation: perioperative bleeding', corrIds.includes('corr.periopBleeding'));
check('Correlation: culture + renal dosing', corrIds.includes('corr.cultureRenalDosing'));
// Urea 28.4 with creatinine 342 gives a ratio of 83 — proportionate for renal
// failure rather than the disproportionate rise that suggests GI bleeding, so
// this rule should correctly NOT fire on this dataset.
check('Correlation: GI bleed correctly NOT fired (ratio 83, proportionate)', !corrIds.includes('corr.giBleed'));
check('Correlation: hepatic failure correctly NOT fired (no liver biochemistry)', !corrIds.includes('corr.liverFailure'));
check('Hypoalbuminaemia reported rather than hepatic synthetic failure', ids.includes('lft.hypoalbuminaemia') && !ids.includes('lft.synthetic'));
check('Neutrophilia graded significant, not critical', mod('fbc').findings.find((f) => f.id === 'fbc.neutrophilia')?.severity === 'significant');
check('Demographics name parsed cleanly', parseDemographics(FBC).name === 'SMITH, JOHN', parseDemographics(FBC).name);
{
  const d = parseDemographics('Ward: Ward 12 Acute Medicine             Consultant: Dr A Reynolds\nHospital No: H1234567   Age: 68');
  check('Ward trimmed at column gap', d.ward === 'Ward 12 Acute Medicine', d.ward);
  check('Consultant parsed', d.consultant === 'Dr A Reynolds', d.consultant);
  check('Hospital number trimmed', d.hospitalNumber === 'H1234567', d.hospitalNumber);
}
{
  // A name containing a word that also appears in the field-label list must
  // survive intact; labels are only recognised when followed by a colon.
  const d = parseDemographics('Patient Name: DEMONSTRATION, PATIENT     Hospital No: DEMO-0001');
  check('name containing a label word kept whole', d.name === 'DEMONSTRATION, PATIENT', d.name);
  check('hospital number still separated', d.hospitalNumber === 'DEMO-0001', d.hospitalNumber);
}
{
  const d = parseDemographics('Name: WARD, REGINALD No: A99');
  check('single-space label boundary still cut', d.name === 'WARD, REGINALD', d.name);
}
check('Correlation: anaemia transfusion assessment', corrIds.includes('corr.transfusion'));

const microMod = mod('microbiology');
const therapyKeys = Object.keys(microMod.derived).filter((k) => k.startsWith('therapy.'));
check('Antimicrobial options produced', therapyKeys.length > 0);
const therapyNote = therapyKeys.map((k) => microMod.derived[k].note ?? '').join(' ');
check('Renal dose prompt present for a renally cleared agent', /Dose adjustment required|Avoid —|check renal dosing/i.test(therapyNote), therapyNote.slice(0, 160));
check('Vancomycin TDM prompt present', /Therapeutic drug monitoring/i.test(therapyNote));

const nextStepsText = result.nextSteps.join(' ');
check('Next steps include escalation', /IMMEDIATE senior clinical review/i.test(nextStepsText));
check('Next steps include nephrology referral', /Nephrology referral/i.test(nextStepsText));
check('Next steps include infection control', /infection prevention and control/i.test(nextStepsText));
check('Next steps include medication review', /Medication review/i.test(nextStepsText));

line('═');
if (failures) {
  console.log(`  RESULT: ${failures} CHECK(S) FAILED`);
  process.exitCode = 1;
} else {
  console.log('  RESULT: ALL CHECKS PASSED');
}
line('═');
