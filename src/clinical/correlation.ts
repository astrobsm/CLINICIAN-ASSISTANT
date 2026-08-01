/**
 * CLINICAL CORRELATION ENGINE
 *
 * Draws links across modules that no single module can see. Each rule fires on
 * a combination of extracted values, module findings and machine tags, and
 * produces a narrative with prioritised actions and its own severity — which
 * may exceed the severity of any contributing finding on its own.
 */
import type { ClinicalContext } from './context';
import { uniq } from './context';
import { fmt } from './units';
import type { Correlation, Finding, ModuleId, ModuleResult, Severity } from './types';
import { maxSeverity, severityRank } from './types';

export interface CorrEnv {
  ctx: ClinicalContext;
  modules: ModuleResult[];
  findings: Finding[];
  tags: Set<string>;
  has: (...tags: string[]) => boolean;
  hasAll: (...tags: string[]) => boolean;
  moduleSeverity: (m: ModuleId) => Severity;
}

interface CorrelationRule {
  id: string;
  title: string;
  modules: ModuleId[];
  when: (e: CorrEnv) => boolean;
  build: (e: CorrEnv) => { severity: Severity; narrative: string; actions: string[] };
}

const RULES: CorrelationRule[] = [
  // ── 1. Infection: white cell response + positive culture + fever ──────
  {
    id: 'corr.woundSepsis',
    title: 'Systemic inflammatory response with a positive culture — possible severe infection',
    modules: ['fbc', 'microbiology', 'inflammatory'],
    when: (e) =>
      e.has('culture-positive', 'likely-pathogen') &&
      (e.ctx.gt('wbc', 12) || e.ctx.lt('wbc', 4) || e.ctx.gt('crp', 100) || e.ctx.gt('procalcitonin', 0.5)) &&
      (e.ctx.patient.fever || e.ctx.gt('lactate', 2) || e.has('sepsis-pattern')),
    build: (e) => {
      const c = e.ctx;
      const org = e.findings.filter((f) => f.tags.includes('likely-pathogen')).map((f) => f.title.split(' — ')[0]);
      const lactate = c.v('lactate');
      const severity: Severity = (lactate !== null && lactate > 4) || c.lt('wbc', 1) ? 'life-threatening' : 'critical';
      return {
        severity,
        narrative:
          `A positive culture (${uniq(org).join(', ') || 'organism isolated'}) is accompanied by a systemic inflammatory response` +
          uniq([
            c.v('wbc') !== null ? `white cell count ${fmt(c.v('wbc'), 1)} ×10⁹/L` : '',
            c.v('crp') !== null ? `CRP ${fmt(c.v('crp'), 1)} mg/L` : '',
            c.v('procalcitonin') !== null ? `procalcitonin ${fmt(c.v('procalcitonin'), 2)} ng/mL` : '',
            lactate !== null ? `lactate ${fmt(lactate, 1)} mmol/L` : '',
          ]).length ? ` (${uniq([
            c.v('wbc') !== null ? `WBC ${fmt(c.v('wbc'), 1)} ×10⁹/L` : '',
            c.v('crp') !== null ? `CRP ${fmt(c.v('crp'), 1)} mg/L` : '',
            c.v('procalcitonin') !== null ? `PCT ${fmt(c.v('procalcitonin'), 2)} ng/mL` : '',
            lactate !== null ? `lactate ${fmt(lactate, 1)} mmol/L` : '',
          ]).join(', ')})` : '' +
          `${c.patient.fever ? ' and recorded fever' : ''}. ` +
          'Taken together these findings suggest an established infection with a systemic response, which requires urgent clinical assessment for sepsis and for adequacy of source control.' +
          (lactate !== null && lactate > 4 ? ' The lactate above 4 mmol/L identifies a high-risk patient requiring immediate resuscitation and senior review.' : ''),
        actions: uniq([
          'Urgent senior clinical review — assess against the local sepsis pathway.',
          'Confirm antimicrobial therapy covers the isolated organism and its reported susceptibilities.',
          'Review source control: debridement, drainage, or removal of any infected device.',
          lactate !== null && lactate > 2 ? 'Repeat lactate within 2 hours to assess response to resuscitation.' : 'Measure serum lactate.',
          'Hourly urine output and frequent physiological observations with an early warning score.',
          'Repeat cultures to document clearance where bacteraemia is present.',
        ]),
      };
    },
  },

  // ── 2. Hyperkalaemia + ECG changes ───────────────────────────────────
  {
    id: 'corr.hyperkEcg',
    title: 'Hyperkalaemia with electrocardiographic changes — life-threatening',
    modules: ['electrolytes', 'ecg'],
    when: (e) => e.ctx.gt('k', 5.5) && (e.has('ecg:hyperkalaemiaEcg') || e.has('electrolyte-ecg') || (e.ctx.gt('k', 6.0) && (e.has('bradyarrhythmia') || e.has('conduction-abnormality')))),
    build: (e) => ({
      severity: 'life-threatening',
      narrative:
        `Potassium ${fmt(e.ctx.v('k'), 1)} mmol/L with electrocardiographic changes attributable to hyperkalaemia. ` +
        'This combination indicates cardiac membrane instability and carries an immediate risk of malignant arrhythmia and cardiac arrest. It is a medical emergency requiring treatment now, without waiting for a repeat sample or for further investigations.',
      actions: [
        'Give intravenous calcium immediately for myocardial stabilisation — 10 mL of 10% calcium chloride or 30 mL of 10% calcium gluconate, repeated if ECG changes persist.',
        'Shift potassium intracellularly: 10 units of soluble insulin in 25 g of glucose intravenously; add nebulised salbutamol 10–20 mg.',
        'Remove potassium: a potassium binder, and urgent renal team discussion regarding dialysis if refractory or if the patient is anuric.',
        'Continuous cardiac monitoring in a resuscitation-capable area.',
        'Stop all potassium-containing fluids and all potassium-elevating drugs (ACE inhibitors, angiotensin receptor blockers, potassium-sparing diuretics, trimethoprim, NSAIDs).',
        'Recheck potassium at 1 hour, then 2–4 hourly; monitor glucose hourly for at least 6 hours after insulin.',
      ],
    }),
  },

  // ── 3. Anaemia + renal impairment ────────────────────────────────────
  {
    id: 'corr.renalAnaemia',
    title: 'Anaemia with renal impairment — consider renal anaemia',
    modules: ['fbc', 'renal'],
    when: (e) => e.has('anaemia') && (e.has('ckd') || e.has('renal-impairment') || e.ctx.lt('egfr', 60)),
    build: (e) => {
      const c = e.ctx;
      const egfr = c.v('egfr');
      const hb = c.v('hb');
      const mcv = c.v('mcv');
      return {
        severity: hb !== null && hb < 8 ? 'significant' : 'moderate',
        narrative:
          `Haemoglobin ${fmt(hb, 1)} g/dL in the context of impaired renal function${egfr !== null ? ` (eGFR ${fmt(egfr, 0)} mL/min/1.73m²)` : ''}. ` +
          'Erythropoietin deficiency is a common and treatable cause of anaemia in chronic kidney disease, typically producing a normocytic normochromic picture' +
          (mcv !== null ? ` — the MCV here is ${fmt(mcv, 1)} fL` : '') +
          '. Renal anaemia is a diagnosis of exclusion: iron deficiency, B12 and folate deficiency, blood loss and haemolysis must be excluded first, and iron status must be optimised before erythropoiesis-stimulating agents are considered.',
        actions: uniq([
          'Full iron studies: ferritin, transferrin saturation and CRP (ferritin is falsely raised by inflammation).',
          c.v('b12') === null ? 'Vitamin B12 and folate.' : '',
          'Reticulocyte count and blood film.',
          'Assess for gastrointestinal blood loss — frequent in chronic kidney disease and often occult.',
          'Nephrology discussion regarding iron replacement and consideration of an erythropoiesis-stimulating agent once iron replete.',
          'Avoid unnecessary phlebotomy, which contributes materially to inpatient anaemia.',
        ]),
      };
    },
  },

  // ── 4. Abnormal coagulation + planned surgery ────────────────────────
  {
    id: 'corr.periopBleeding',
    title: 'Abnormal haemostasis with planned surgery — increased perioperative bleeding risk',
    modules: ['coagulation', 'fbc'],
    when: (e) => e.ctx.patient.plannedSurgery && (e.has('bleeding-risk') || e.ctx.gt('inr', 1.4) || e.ctx.lt('plt', 100) || e.ctx.lt('fibrinogen', 1.5)),
    build: (e) => {
      const c = e.ctx;
      const inr = c.v('inr');
      const plt = c.v('plt');
      const hb = c.v('hb');
      return {
        severity: (inr !== null && inr > 2.5) || (plt !== null && plt < 50) ? 'critical' : 'significant',
        narrative:
          'Surgery is planned in the presence of abnormal haemostatic parameters' +
          uniq([
            inr !== null && inr > 1.2 ? `INR ${fmt(inr, 2)}` : '',
            plt !== null && plt < 150 ? `platelets ${fmt(plt, 0)} ×10⁹/L` : '',
            c.v('fibrinogen') !== null && c.lt('fibrinogen', 2) ? `fibrinogen ${fmt(c.v('fibrinogen'), 2)} g/L` : '',
            c.v('aptt') !== null && c.high('aptt') ? `aPTT ${fmt(c.v('aptt'), 1)} s` : '',
          ]).length ? ` (${uniq([
            inr !== null && inr > 1.2 ? `INR ${fmt(inr, 2)}` : '',
            plt !== null && plt < 150 ? `platelets ${fmt(plt, 0)} ×10⁹/L` : '',
            c.v('fibrinogen') !== null && c.lt('fibrinogen', 2) ? `fibrinogen ${fmt(c.v('fibrinogen'), 2)} g/L` : '',
            c.v('aptt') !== null && c.high('aptt') ? `aPTT ${fmt(c.v('aptt'), 1)} s` : '',
          ]).join(', ')})` : '' +
          '. This increases the risk of perioperative haemorrhage and constrains the choice of anaesthetic technique.' +
          (hb !== null && hb < 11 ? ` Pre-operative anaemia is also present (Hb ${fmt(hb, 1)} g/dL), which compounds the risk and independently predicts transfusion and adverse outcome.` : '') +
          (c.patient.onAnticoagulant ? ` The patient is recorded as taking ${c.patient.anticoagulantName || 'an anticoagulant'} — an interruption and bridging plan is required.` : ''),
        actions: uniq([
          'Discuss with the anaesthetic and surgical teams before the patient goes to theatre; consider deferring elective surgery until correctable abnormalities are addressed.',
          'Haematology advice on reversal and replacement strategy.',
          'Group and save with crossmatch appropriate to the anticipated blood loss.',
          'Neuraxial blockade is generally avoided with an INR above 1.4 or a platelet count below 80 ×10⁹/L.',
          c.patient.onAnticoagulant ? 'Document the anticoagulant interruption interval and the plan for restarting post-operatively.' : '',
          hb !== null && hb < 11 ? 'Investigate and treat pre-operative anaemia — intravenous iron may allow correction within the surgical timeframe.' : '',
          'Repeat full blood count and coagulation screen immediately pre-operatively.',
        ]),
      };
    },
  },

  // ── 5. Positive culture + renal impairment → dosing ──────────────────
  {
    id: 'corr.cultureRenalDosing',
    title: 'Positive culture with renal impairment — antimicrobial dose adjustment required',
    modules: ['microbiology', 'renal'],
    when: (e) => e.has('culture-positive') && (e.has('renal-impairment') || e.has('aki') || e.ctx.lt('egfr', 60)),
    build: (e) => {
      const c = e.ctx;
      const egfr = c.v('egfr');
      const aki = e.has('aki');
      return {
        severity: aki ? 'significant' : 'moderate',
        narrative:
          `An organism has been isolated in a patient with ${aki ? 'acute kidney injury' : 'impaired renal function'}${egfr !== null ? ` (eGFR ${fmt(egfr, 0)} mL/min/1.73m²)` : ''}. ` +
          'Most antimicrobials are renally cleared and require dose or interval adjustment; several are nephrotoxic and will worsen renal function if used without careful monitoring. ' +
          'Renal function is changing in acute kidney injury, so dosing must be reviewed daily rather than set once.' +
          (c.patient.weightKg === null || c.patient.age === null
            ? ' Age and body weight have not been entered, so a Cockcroft–Gault creatinine clearance — the basis of most dosing tables — cannot be calculated.'
            : ''),
        actions: uniq([
          'Review every antimicrobial against the local renal dosing guidance before the next dose is given.',
          'Avoid or minimise nephrotoxic agents: aminoglycosides, glycopeptides, amphotericin B and colistin.',
          'Therapeutic drug monitoring where a glycopeptide or aminoglycoside is used, with levels interpreted against renal function.',
          'Nitrofurantoin is ineffective and should be avoided where creatinine clearance is below 45 mL/min.',
          'Monitor renal function daily during therapy.',
          c.patient.weightKg === null || c.patient.age === null ? 'Enter age and body weight to enable creatinine clearance–based dosing prompts.' : '',
          'Discuss with pharmacy or microbiology where the correct dose is uncertain.',
        ]),
      };
    },
  },

  // ── Neutropenic sepsis ───────────────────────────────────────────────
  {
    id: 'corr.neutropenicSepsis',
    title: 'Neutropenia with fever — neutropenic sepsis until proven otherwise',
    modules: ['fbc'],
    when: (e) => e.ctx.lt('neut', 1.0) && (e.ctx.patient.fever || e.has('sepsis-pattern') || e.ctx.gt('crp', 50)),
    build: (e) => ({
      severity: 'life-threatening',
      narrative:
        `Absolute neutrophil count ${fmt(e.ctx.v('neut'), 2)} ×10⁹/L with fever or a systemic inflammatory response. ` +
        'Neutropenic sepsis is a medical emergency with substantial mortality. Time to the first dose of antibiotic is the principal modifiable determinant of outcome, and treatment must not await culture results, imaging or a repeat blood count.',
      actions: [
        'Give empirical broad-spectrum intravenous antibiotics within one hour of recognition, per the local neutropenic sepsis protocol.',
        'Take blood cultures — peripheral and from every lumen of any indwelling line — but do not delay antibiotics to obtain them.',
        'Full septic screen: urine, sputum, wound and stool as clinically indicated; chest radiograph.',
        'Urgent senior review and involvement of the haemato-oncology or acute oncology team.',
        'Serum lactate, renal function, liver function and coagulation screen.',
        'Protective isolation and strict hand hygiene.',
        'Consider G-CSF support per local protocol.',
      ],
    }),
  },

  // ── AKI with hyperkalaemia and acidosis ──────────────────────────────
  {
    id: 'corr.akiHyperkAcidosis',
    title: 'Acute kidney injury with hyperkalaemia and metabolic acidosis',
    modules: ['renal', 'electrolytes', 'abg'],
    when: (e) => e.has('aki') && e.ctx.gt('k', 5.5) && (e.ctx.lt('hco3', 20) || e.ctx.lt('ph', 7.32)),
    build: (e) => {
      const c = e.ctx;
      return {
        severity: 'life-threatening',
        narrative:
          `Acute kidney injury with potassium ${fmt(c.v('k'), 1)} mmol/L and metabolic acidosis${c.v('ph') !== null ? ` (pH ${fmt(c.v('ph'), 2)}` : ''}${c.v('hco3') !== null ? `${c.v('ph') !== null ? ', ' : ' ('}bicarbonate ${fmt(c.v('hco3'), 1)} mmol/L)` : c.v('ph') !== null ? ')' : ''}. ` +
          'This triad indicates failing renal excretory function with immediate cardiac risk. Acidosis drives potassium extracellularly and compounds the hyperkalaemia, and both are indications for consideration of urgent renal replacement therapy if they do not respond to medical management.',
        actions: [
          'Immediate 12-lead ECG and continuous cardiac monitoring.',
          'Treat hyperkalaemia now: intravenous calcium for cardiac protection, insulin–dextrose and salbutamol to shift, and a potassium binder to remove.',
          'Urgent renal team referral — refractory hyperkalaemia and refractory acidosis are established indications for renal replacement therapy.',
          'Stop all nephrotoxic drugs and all potassium-elevating drugs.',
          'Optimise volume status and perfusion pressure; exclude urinary obstruction with an urgent renal tract ultrasound.',
          'Strict hourly fluid balance with catheterisation.',
          'Recheck potassium and blood gas at 1 hour and then 2–4 hourly.',
        ],
      };
    },
  },

  // ── Consumptive coagulopathy in sepsis ───────────────────────────────
  {
    id: 'corr.sepsisDic',
    title: 'Sepsis with consumptive coagulopathy',
    modules: ['coagulation', 'fbc', 'microbiology'],
    when: (e) => (e.has('dic') || e.has('consumptive-coagulopathy')) && (e.has('sepsis-pattern') || e.has('culture-positive') || e.ctx.patient.fever || e.ctx.gt('lactate', 2)),
    build: (e) => ({
      severity: 'life-threatening',
      narrative:
        'Laboratory features of consumptive coagulopathy are present alongside evidence of infection. Sepsis is the commonest cause of disseminated intravascular coagulation, in which simultaneous microvascular thrombosis and consumption of clotting factors produce both organ dysfunction and bleeding. ' +
        'The coagulopathy will not resolve until the underlying infection is controlled.',
      actions: [
        'Urgent critical care and haematology involvement.',
        'Aggressive source control and appropriate antimicrobial therapy — this is the definitive treatment.',
        'Coagulation screen, fibrinogen, D-dimer and platelet count at least 6–12 hourly to track the ISTH score.',
        'Blood film for schistocytes to consider thrombotic microangiopathy as an alternative diagnosis.',
        'Blood product support guided by bleeding or planned procedures, not by laboratory values alone.',
        'Monitor for organ dysfunction, limb ischaemia and bleeding at any site.',
      ],
    }),
  },

  // ── Anaemia with raised urea:creatinine — GI bleed ───────────────────
  {
    id: 'corr.giBleed',
    title: 'Anaemia with a disproportionately raised urea — consider gastrointestinal haemorrhage',
    modules: ['fbc', 'renal'],
    when: (e) => {
      const urea = e.ctx.v('urea');
      const creat = e.ctx.v('creatinine');
      if (urea === null || creat === null) return false;
      return e.has('anaemia') && urea > 8 && urea / (creat / 1000) > 100;
    },
    build: (e) => {
      const c = e.ctx;
      return {
        severity: c.lt('hb', 8) ? 'critical' : 'significant',
        narrative:
          `Anaemia (Hb ${fmt(c.v('hb'), 1)} g/dL) with a urea of ${fmt(c.v('urea'), 1)} mmol/L that is disproportionate to the creatinine of ${fmt(c.v('creatinine'), 0)} µmol/L. ` +
          'A raised urea:creatinine ratio with anaemia is characteristic of upper gastrointestinal haemorrhage, in which digested blood provides a protein load, though hypovolaemia alone produces the same pattern.' +
          (c.patient.onAnticoagulant ? ` The patient is recorded as taking ${c.patient.anticoagulantName || 'an anticoagulant'}, which increases both the likelihood and the severity of gastrointestinal bleeding.` : ''),
        actions: uniq([
          'Assess directly for melaena or haematemesis, including digital rectal examination.',
          'Calculate a validated risk score (Blatchford or Rockall) and follow the local upper gastrointestinal bleeding pathway.',
          'Group and save with crossmatch; establish large-bore intravenous access.',
          'Serial haemoglobin — the initial value underestimates acute loss before equilibration.',
          'Urgent endoscopy according to risk score and haemodynamic status.',
          c.patient.onAnticoagulant ? 'Review the indication for anticoagulation and discuss reversal with haematology.' : '',
          'Withhold NSAIDs and consider proton pump inhibitor therapy per protocol.',
        ]),
      };
    },
  },

  // ── QT prolongation with electrolyte depletion ───────────────────────
  {
    id: 'corr.qtElectrolytes',
    title: 'QT prolongation with electrolyte depletion — torsades de pointes risk',
    modules: ['ecg', 'electrolytes'],
    when: (e) => e.has('qt-prolongation-risk') && (e.ctx.lt('k', 3.5) || e.ctx.lt('magnesium', 0.7) || e.ctx.lt('calcium', 2.2)),
    build: (e) => {
      const c = e.ctx;
      return {
        severity: 'critical',
        narrative:
          'QT prolongation is present together with electrolyte depletion' +
          ` (${uniq([
            c.lt('k', 3.5) ? `potassium ${fmt(c.v('k'), 1)} mmol/L` : '',
            c.lt('magnesium', 0.7) ? `magnesium ${fmt(c.v('magnesium'), 2)} mmol/L` : '',
            c.lt('calcium', 2.2) ? `calcium ${fmt(c.v('calcium'), 2)} mmol/L` : '',
          ]).join(', ')}). ` +
          'These risks are additive. The combination substantially increases the probability of torsades de pointes, and any QT-prolonging drug adds further risk.',
        actions: uniq([
          'Correct potassium to the upper half of the reference range (4.5–5.0 mmol/L).',
          'Replace magnesium intravenously even if the level is only borderline — magnesium is the treatment for torsades de pointes irrespective of the serum value.',
          c.lt('calcium', 2.2) ? 'Correct calcium; check the albumin-corrected or ionised value.' : '',
          'Review the drug chart against a QT-prolonging drug database and stop all non-essential culprits.',
          'Continuous cardiac monitoring while the QTc exceeds 500 ms.',
          'Repeat ECG after electrolyte correction and after stopping any culprit drug.',
        ]),
      };
    },
  },

  // ── Troponin with ischaemic ECG ──────────────────────────────────────
  {
    id: 'corr.troponinEcg',
    title: 'Raised troponin with ischaemic electrocardiographic changes',
    modules: ['cardiac', 'ecg'],
    when: (e) => e.has('myocardial-injury') && e.has('ischaemia'),
    build: (e) => {
      const c = e.ctx;
      const stemi = e.has('stemi');
      return {
        severity: stemi ? 'life-threatening' : 'critical',
        narrative:
          `Troponin ${fmt(c.v('troponin'), 0)} ng/L is raised in the presence of ischaemic electrocardiographic change. ` +
          (stemi
            ? 'With ST elevation this meets the criteria for ST-elevation myocardial infarction and requires immediate reperfusion — total ischaemic time is the principal determinant of myocardial salvage.'
            : 'This combination satisfies the criteria for acute myocardial infarction once a rise-and-fall pattern is demonstrated. Distinguishing type 1 (plaque event) from type 2 (supply–demand mismatch) determines management entirely, and requires the clinical context.') +
          (c.lt('hb', 9) ? ` Note the anaemia (Hb ${fmt(c.v('hb'), 1)} g/dL), which can precipitate type 2 infarction and also increases bleeding risk if antithrombotic therapy is given.` : '') +
          (c.high('creatinine') ? ' Renal impairment raises baseline troponin and increases bleeding risk with antithrombotic therapy.' : ''),
        actions: uniq([
          stemi ? 'Immediate discussion with the primary percutaneous coronary intervention centre — activate the local STEMI pathway now.' : 'Urgent cardiology review and risk stratification with the GRACE score.',
          'Serial troponin and serial 12-lead ECGs.',
          'Continuous cardiac monitoring in a defibrillator-equipped area.',
          'Echocardiography to assess regional wall motion and ventricular function.',
          c.lt('hb', 9) || c.lt('plt', 100) ? 'Balance antithrombotic therapy against the bleeding risk indicated by the full blood count — discuss with cardiology and haematology.' : '',
          'Identify and treat any precipitant of demand ischaemia: anaemia, hypoxaemia, sepsis, tachyarrhythmia, hypotension.',
        ]),
      };
    },
  },

  // ── Bacteraemia with a biofilm organism ──────────────────────────────
  {
    id: 'corr.bacteraemiaBiofilm',
    title: 'Bacteraemia with a biofilm-forming organism — assess indwelling devices',
    modules: ['microbiology'],
    when: (e) => e.hasAll('bacteraemia', 'biofilm'),
    build: () => ({
      severity: 'critical',
      narrative:
        'A biofilm-forming organism has been isolated from blood. Biofilm on intravascular lines, prosthetic valves, joints and other implanted material shields organisms from both antimicrobials and host defences. Antimicrobial therapy alone frequently fails, and relapse after apparently successful treatment is characteristic.',
      actions: [
        'Identify and assess every indwelling device: central and peripheral lines, urinary catheter, pacemaker, prosthetic joint or valve, and any surgical implant.',
        'Remove or exchange infected lines — this is usually essential for cure.',
        'Echocardiography to assess for endocarditis, with transoesophageal imaging where transthoracic is inconclusive or a prosthesis is present.',
        'Repeat blood cultures at 48–72 hours to document clearance.',
        'Infection specialist involvement for choice and duration of therapy — biofilm infection requires prolonged courses and sometimes rifampicin combination therapy.',
      ],
    }),
  },

  // ── Multidrug resistance + infection prevention ──────────────────────
  {
    id: 'corr.resistanceIpc',
    title: 'Resistant organism isolated — infection prevention and stewardship actions required',
    modules: ['microbiology'],
    when: (e) => [...e.tags].some((t) => t.startsWith('resistance:')),
    build: (e) => {
      const markers = [...e.tags].filter((t) => t.startsWith('resistance:')).map((t) => t.split(':')[1].toUpperCase());
      const critical = markers.some((m) => ['CRE', 'MDR', 'PVL'].includes(m));
      return {
        severity: critical ? 'critical' : 'significant',
        narrative:
          `Resistance marker${markers.length > 1 ? 's' : ''} identified: ${markers.join(', ')}. ` +
          'Beyond the individual patient, this has implications for other patients on the ward and requires an infection prevention response as well as a therapeutic one.' +
          (critical ? ' The markers identified are in the highest-concern category and require immediate specialist involvement.' : ''),
        actions: uniq([
          'Notify infection prevention and control.',
          'Apply the appropriate isolation precautions — single room with contact precautions for most resistant organisms.',
          critical ? 'Immediate discussion with a microbiologist or infection specialist before the next antimicrobial dose.' : 'Discuss the antimicrobial plan with microbiology.',
          'Review and document the indication, agent, dose, route and stop or review date for every antimicrobial.',
          'Consider screening of contacts where required by local policy.',
          'Reinforce hand hygiene and environmental decontamination.',
        ]),
      };
    },
  },

  // ── Rhabdomyolysis complex ───────────────────────────────────────────
  {
    id: 'corr.rhabdo',
    title: 'Rhabdomyolysis with renal and electrolyte complications',
    modules: ['cardiac', 'renal', 'electrolytes'],
    when: (e) => e.ctx.gt('ck', 5000) && (e.has('aki') || e.has('renal-impairment') || e.ctx.gt('k', 5.5) || e.ctx.gt('phosphate', 1.45)),
    build: (e) => {
      const c = e.ctx;
      return {
        severity: c.gt('k', 6.0) ? 'life-threatening' : 'critical',
        narrative:
          `Creatine kinase ${fmt(c.v('ck'), 0)} U/L with ${e.has('aki') ? 'acute kidney injury' : 'renal impairment'}` +
          (c.gt('k', 5.5) ? ` and hyperkalaemia (potassium ${fmt(c.v('k'), 1)} mmol/L)` : '') +
          '. Myoglobin released from damaged muscle is directly nephrotoxic and causes tubular obstruction, while intracellular potassium and phosphate are released into the circulation. Potassium can rise rapidly and unpredictably during ongoing muscle breakdown.',
        actions: uniq([
          'Aggressive intravenous fluid resuscitation targeting a urine output of 200–300 mL/hour.',
          'Immediate ECG and continuous cardiac monitoring if potassium is raised.',
          'Creatine kinase, potassium, calcium, phosphate and renal function every 6–12 hours until the creatine kinase is falling.',
          'Assess limbs for compartment syndrome — a missed compartment syndrome perpetuates the muscle injury.',
          'Do not correct early hypocalcaemia unless symptomatic; rebound hypercalcaemia occurs during recovery.',
          'Stop any precipitating drug (statins in particular) and review for a long lie, crush injury, seizures or extreme exertion.',
          'Renal team involvement where oliguria or refractory hyperkalaemia develops.',
        ]),
      };
    },
  },

  // ── Anticoagulated + falling haemoglobin ─────────────────────────────
  {
    id: 'corr.anticoagBleed',
    title: 'Anticoagulation with anaemia — assess for occult haemorrhage',
    modules: ['coagulation', 'fbc'],
    when: (e) => (e.ctx.patient.onAnticoagulant || e.has('warfarin-effect') || e.has('doac') || e.has('heparin-effect')) && e.has('anaemia'),
    build: (e) => {
      const c = e.ctx;
      return {
        severity: c.lt('hb', 8) || c.gt('inr', 4.5) ? 'critical' : 'significant',
        narrative:
          `Anaemia (Hb ${fmt(c.v('hb'), 1)} g/dL) in a patient who is anticoagulated${c.patient.anticoagulantName ? ` with ${c.patient.anticoagulantName}` : ''}` +
          (c.v('inr') !== null ? ` (INR ${fmt(c.v('inr'), 2)})` : '') +
          '. Anaemia in an anticoagulated patient should be treated as bleeding until proven otherwise. Occult sites — gastrointestinal, retroperitoneal, intramuscular and intracranial — may not be clinically obvious.',
        actions: uniq([
          'Examine for overt bleeding; digital rectal examination for melaena.',
          'Serial haemoglobin and haemodynamic observations.',
          'Consider imaging for retroperitoneal or intramuscular haematoma where there is flank, back or limb pain.',
          'Low threshold for CT head after any fall or head injury, even minor, and even with a normal conscious level.',
          'Review the indication for anticoagulation and the current level of anticoagulation; discuss reversal with haematology if bleeding is confirmed.',
          'Group and save; crossmatch if actively bleeding.',
          c.gt('inr', 4.5) ? 'The INR is above the usual therapeutic range — withhold further doses and consider vitamin K per protocol.' : '',
        ]),
      };
    },
  },

  // ── Liver failure composite ──────────────────────────────────────────
  {
    id: 'corr.liverFailure',
    title: 'Hepatic dysfunction with coagulopathy — assess for liver failure',
    modules: ['lft', 'coagulation'],
    when: (e) => (e.has('transaminitis') || e.has('jaundice') || e.has('liver-disease')) && (e.ctx.gt('inr', 1.5) || e.has('liver-coagulopathy')),
    build: (e) => {
      const c = e.ctx;
      const acute = c.gt('alt', 1000);
      return {
        severity: c.gt('inr', 2) ? 'critical' : 'significant',
        narrative:
          `Abnormal liver biochemistry with a prolonged INR of ${fmt(c.v('inr'), 2)}. ` +
          'The INR is the single most useful marker of hepatic synthetic function and a component of every prognostic score in liver disease. ' +
          (acute ? 'The magnitude of transaminase elevation indicates acute hepatocellular necrosis; acute liver failure — coagulopathy with encephalopathy in the absence of chronic liver disease — must be actively excluded.' : 'Assess whether this represents acute injury or decompensation of chronic disease.') +
          (c.lt('plt', 150) ? ` The thrombocytopenia (${fmt(c.v('plt'), 0)} ×10⁹/L) raises the possibility of portal hypertension.` : '') +
          (c.gt('creatinine', 130) ? ' Coexisting renal impairment raises the possibility of hepatorenal syndrome and worsens prognosis substantially.' : ''),
        actions: uniq([
          'Assess conscious level and look specifically for asterixis and encephalopathy.',
          'Check glucose, lactate and ammonia; hypoglycaemia is a marker of severe hepatic failure and must be corrected.',
          'Paracetamol level and a careful drug, herbal and alcohol history; start N-acetylcysteine without delay if paracetamol toxicity is possible.',
          'Full liver screen and urgent hepatic ultrasound with Doppler.',
          acute ? 'Discuss with a hepatology or transplant centre — apply the King\'s College criteria where paracetamol is implicated.' : 'Hepatology review.',
          'Give intravenous vitamin K where deficiency may contribute.',
          'Do not correct the INR prophylactically in stable liver disease — it removes a key prognostic marker and confers no benefit without bleeding.',
          'Daily INR, liver function, renal function and glucose.',
        ]),
      };
    },
  },

  // ── Hypoxaemia with acidosis ─────────────────────────────────────────
  {
    id: 'corr.respiratoryFailure',
    title: 'Hypoxaemia with acidaemia — decompensating respiratory failure',
    modules: ['abg'],
    when: (e) => e.ctx.lt('pao2', 8) && e.ctx.lt('ph', 7.35),
    build: (e) => {
      const c = e.ctx;
      const type2 = c.gt('paco2', 6.0);
      return {
        severity: c.lt('ph', 7.25) ? 'life-threatening' : 'critical',
        narrative:
          `PaO₂ ${fmt(c.v('pao2'), 1)} kPa with pH ${fmt(c.v('ph'), 2)}${type2 ? ` and PaCO₂ ${fmt(c.v('paco2'), 1)} kPa` : ''}. ` +
          (type2
            ? 'This is acute hypercapnic (type 2) respiratory failure with acidaemia — the patient is failing to ventilate adequately and requires ventilatory support.'
            : 'Hypoxaemic respiratory failure with acidaemia indicates a patient who is decompensating and at risk of respiratory arrest.'),
        actions: uniq([
          'Immediate senior and critical care review.',
          type2 ? 'Non-invasive ventilation is indicated for acute hypercapnic respiratory failure with a pH below 7.35 despite maximal medical therapy.' : 'Optimise oxygen delivery and treat the underlying cause; consider escalation of respiratory support.',
          'Controlled oxygen therapy to a documented target saturation range — 88–92% where there is a risk of hypercapnic respiratory failure.',
          'Repeat blood gas within 30–60 minutes of any change in therapy.',
          'Chest radiograph, ECG and treatment of the precipitating cause.',
          'Document a ceiling of care and escalation plan.',
        ]),
      };
    },
  },

  // ── Hyperglycaemia with acidosis and ketones ─────────────────────────
  {
    id: 'corr.dka',
    title: 'Hyperglycaemia with acidosis and ketosis — possible diabetic ketoacidosis',
    modules: ['electrolytes', 'abg', 'urinalysis'],
    when: (e) => (e.ctx.gt('glucose', 11) || e.has('possible-dka')) && (e.ctx.lt('hco3', 18) || e.ctx.lt('ph', 7.3)) && (e.has('ketonuria') || e.has('possible-dka') || e.has('raised-anion-gap')),
    build: (e) => {
      const c = e.ctx;
      return {
        severity: c.lt('ph', 7.1) || c.lt('k', 3.5) ? 'life-threatening' : 'critical',
        narrative:
          `Glucose ${fmt(c.v('glucose'), 1)} mmol/L with ${c.v('hco3') !== null ? `bicarbonate ${fmt(c.v('hco3'), 1)} mmol/L` : 'metabolic acidosis'}${c.v('ph') !== null ? ` and pH ${fmt(c.v('ph'), 2)}` : ''} and evidence of ketosis. This is the biochemical picture of diabetic ketoacidosis.` +
          (c.lt('k', 3.5) ? ` Potassium is ${fmt(c.v('k'), 1)} mmol/L — insulin must not be started until potassium is above 3.5 mmol/L, as it will drive potassium intracellularly and precipitate life-threatening hypokalaemia.` : ' Total body potassium is always depleted in ketoacidosis irrespective of the measured value, and will fall rapidly once insulin is started.'),
        actions: uniq([
          'Activate the local diabetic ketoacidosis protocol: fluid resuscitation first, then fixed-rate intravenous insulin infusion.',
          c.lt('k', 3.5) ? 'Withhold insulin and replace potassium first — this is the single most important safety step.' : 'Add potassium to replacement fluids once the potassium is below 5.5 mmol/L and the patient is passing urine.',
          'Hourly capillary glucose and ketones; venous blood gas and potassium at 1, 2, 4, 8, 12 and 24 hours.',
          'Continue any long-acting insulin; do not stop it.',
          'Identify the precipitant: infection, missed insulin, myocardial infarction, pancreatitis, new diagnosis.',
          'Senior review and consideration of critical care where the pH is below 7.1, potassium is below 3.5 mmol/L on admission, or the patient has a reduced conscious level.',
          'Note that SGLT2 inhibitors cause euglycaemic ketoacidosis — a modest glucose does not exclude the diagnosis.',
        ]),
      };
    },
  },

  // ── Hyponatraemia with hypovolaemia signals ──────────────────────────
  {
    id: 'corr.hypoNaRenal',
    title: 'Hyponatraemia with renal impairment',
    modules: ['electrolytes', 'renal'],
    when: (e) => e.ctx.lt('na', 130) && (e.has('aki') || e.has('renal-impairment')),
    build: (e) => {
      const c = e.ctx;
      return {
        severity: c.lt('na', 125) ? 'critical' : 'significant',
        narrative:
          `Sodium ${fmt(c.v('na'), 0)} mmol/L with impaired renal function. Volume status is the pivotal assessment: hypovolaemic hyponatraemia with a pre-renal picture requires volume repletion, whereas hypervolaemic hyponatraemia in cardiac, hepatic or renal failure requires fluid restriction. Giving the wrong one worsens the patient.`,
        actions: [
          'Careful clinical assessment of volume status before any fluid decision.',
          'Paired serum and urine osmolality with urine sodium — the single most informative investigation.',
          'Review all diuretics and other drugs implicated in hyponatraemia.',
          'Correct sodium at no more than 10 mmol/L in the first 24 hours to avoid osmotic demyelination.',
          'Sodium every 4–6 hours during active correction.',
          'Renal team discussion where the picture is unclear or the patient is oliguric.',
        ],
      };
    },
  },

  // ── Severe anaemia with hypoxaemia ───────────────────────────────────
  {
    id: 'corr.anaemiaHypoxia',
    title: 'Anaemia with impaired oxygenation — compounded reduction in oxygen delivery',
    modules: ['fbc', 'abg'],
    when: (e) => e.ctx.lt('hb', 9) && (e.ctx.lt('pao2', 9) || e.ctx.lt('sao2', 92)),
    build: (e) => {
      const c = e.ctx;
      return {
        severity: 'critical',
        narrative:
          `Haemoglobin ${fmt(c.v('hb'), 1)} g/dL with ${c.v('pao2') !== null ? `PaO₂ ${fmt(c.v('pao2'), 1)} kPa` : `saturations ${fmt(c.v('sao2'), 0)}%`}. ` +
          'Oxygen delivery is the product of cardiac output, haemoglobin concentration and saturation. Reduced haemoglobin and reduced saturation compound each other, so tissue oxygen delivery may be critically low even where each value alone appears tolerable.',
        actions: [
          'Urgent senior review — assess tissue perfusion, lactate and end-organ function.',
          'Correct oxygenation to a documented target saturation range.',
          'Consider red cell transfusion at a higher threshold than usual given the concurrent hypoxaemia, guided by symptoms and cardiac comorbidity.',
          'Identify and treat the cause of both the anaemia and the hypoxaemia.',
          'Serial lactate as a marker of adequacy of oxygen delivery.',
        ],
      };
    },
  },

  // ── Immunosuppression with infection ─────────────────────────────────
  {
    id: 'corr.immunosuppressed',
    title: 'Infection in an immunosuppressed patient — atypical presentation and broader differential',
    modules: ['microbiology', 'fbc', 'inflammatory'],
    when: (e) => e.ctx.patient.immunosuppressed && (e.has('culture-positive') || e.has('infection-risk') || e.has('sepsis-pattern')),
    build: () => ({
      severity: 'significant',
      narrative:
        'Evidence of infection in a patient recorded as immunosuppressed. Immunosuppression blunts the inflammatory response: fever, leucocytosis and localising signs may all be absent or minimal, and clinical deterioration can be abrupt. The differential extends to opportunistic organisms that would not otherwise be considered.',
      actions: [
        'Lower the threshold for investigation, imaging and empirical treatment.',
        'Broaden the differential to include fungal, viral and atypical organisms.',
        'Send additional specimens: fungal culture, galactomannan or beta-D-glucan, viral PCR, and consider mycobacterial culture where relevant.',
        'Involve the infection specialist and the team managing the immunosuppression early.',
        'Review whether immunosuppressive therapy can be safely reduced during the acute illness.',
        'Do not be reassured by a normal white cell count, normal temperature or a modest CRP.',
      ],
    }),
  },

  // ── Pancytopenia with infection ──────────────────────────────────────
  {
    id: 'corr.pancytopeniaInfection',
    title: 'Pancytopenia with evidence of infection — combined infection and bleeding risk',
    modules: ['fbc', 'microbiology'],
    when: (e) => e.has('pancytopenia') && (e.has('culture-positive') || e.has('infection-risk') || e.ctx.patient.fever),
    build: (e) => ({
      severity: 'life-threatening',
      narrative:
        'Pancytopenia in the presence of infection creates simultaneous and compounding risks: neutropenia removes the primary defence against bacterial and fungal invasion, thrombocytopenia confers bleeding risk that constrains invasive management, and anaemia limits oxygen delivery during a period of high metabolic demand.',
      actions: [
        'Treat as neutropenic sepsis — empirical broad-spectrum antibiotics within one hour.',
        'Urgent haematology involvement; bone marrow examination will be required once the acute episode allows.',
        'Protective isolation with bleeding precautions.',
        'Avoid intramuscular injections, NSAIDs and antiplatelet agents.',
        'Daily full blood count with transfusion support guided by thresholds and bleeding.',
        'Blood film, reticulocyte count, B12 and folate, viral screen and HLH markers.',
      ],
    }),
  },

  // ── Nephrotoxin awareness in AKI ─────────────────────────────────────
  {
    id: 'corr.akiMedication',
    title: 'Acute kidney injury — medication review required',
    modules: ['renal'],
    when: (e) => e.has('aki'),
    build: (e) => ({
      severity: 'significant',
      narrative:
        'Acute kidney injury is present. Medication review is one of the few immediately actionable interventions: nephrotoxins perpetuate the injury, and renally cleared drugs accumulate to toxic levels within a day or two of the fall in clearance.',
      actions: uniq([
        'Withhold nephrotoxins: NSAIDs, ACE inhibitors, angiotensin receptor blockers, aminoglycosides, and diuretics where the patient is volume deplete.',
        'Review and adjust every renally cleared drug: metformin, direct oral anticoagulants, opioids (particularly morphine and codeine), gabapentinoids, digoxin, antimicrobials, low molecular weight heparin.',
        'Hold metformin during acute illness with acute kidney injury because of lactic acidosis risk.',
        e.ctx.patient.onAnticoagulant ? 'Direct oral anticoagulant clearance is renally dependent — review the dose or consider switching while renal function is unstable.' : '',
        'Avoid intravenous contrast where an alternative exists.',
        'Repeat the medication review daily as renal function changes.',
      ]),
    }),
  },

  // ── Transfusion planning ─────────────────────────────────────────────
  {
    id: 'corr.transfusion',
    title: 'Severe anaemia — transfusion assessment',
    modules: ['fbc'],
    when: (e) => e.ctx.lt('hb', 7.5),
    build: (e) => {
      const c = e.ctx;
      return {
        severity: c.lt('hb', 6) ? 'critical' : 'significant',
        narrative:
          `Haemoglobin ${fmt(c.v('hb'), 1)} g/dL. Current transfusion guidance supports a restrictive strategy for stable patients, with a threshold around 70 g/L, or 80 g/L in acute coronary syndrome and chronic cardiovascular disease. Transfusion decisions should be driven by symptoms, ongoing losses and comorbidity rather than by the number alone.` +
          (c.has('myocardial-injury') ? ' Myocardial injury is present, which supports the higher threshold.' : '') +
          (c.patient.plannedSurgery ? ' Surgery is planned — pre-operative optimisation should be considered.' : ''),
        actions: uniq([
          'Group and save; crossmatch if transfusion is anticipated.',
          'Transfuse single units and reassess clinically between units in a non-bleeding patient.',
          'Identify and treat the cause of the anaemia in parallel — do not transfuse without investigating.',
          'Check haematinics before transfusion where feasible, as transfusion obscures subsequent interpretation.',
          'Document the indication and consent for transfusion.',
        ]),
      };
    },
  },
];

export function runCorrelations(ctx: ClinicalContext, modules: ModuleResult[]): Correlation[] {
  const findings = modules.flatMap((m) => m.findings);
  const tags = new Set<string>(findings.flatMap((f) => f.tags).filter(Boolean));

  const env: CorrEnv = {
    ctx,
    modules,
    findings,
    tags,
    has: (...t) => t.some((x) => tags.has(x)),
    hasAll: (...t) => t.every((x) => tags.has(x)),
    moduleSeverity: (m) => modules.find((x) => x.module === m)?.severity ?? 'normal',
  };

  const out: Correlation[] = [];
  for (const rule of RULES) {
    let fires = false;
    try {
      fires = rule.when(env);
    } catch {
      fires = false;
    }
    if (!fires) continue;
    const built = rule.build(env);
    out.push({
      id: rule.id,
      title: rule.title,
      severity: built.severity,
      narrative: built.narrative.replace(/\s+/g, ' ').trim(),
      modules: rule.modules.filter((m) => modules.some((x) => x.module === m && x.present)),
      contributingFindings: findings
        .filter((f) => rule.modules.includes(f.module))
        .map((f) => f.id),
      actions: uniq(built.actions),
    });
  }

  return out.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

export const overallSeverity = (modules: ModuleResult[], correlations: Correlation[]): Severity =>
  maxSeverity(
    ...modules.map((m) => m.severity),
    ...correlations.map((c) => c.severity),
    'normal',
  );
