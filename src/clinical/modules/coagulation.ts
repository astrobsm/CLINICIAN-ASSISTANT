/**
 * COAGULATION PROFILE ANALYSIS MODULE
 *
 * Separates prolonged clotting times into their characteristic patterns
 * (anticoagulant effect, hepatic synthetic failure, vitamin K deficiency,
 * consumption), scores overt DIC using the ISTH criteria, and expresses the
 * result as explicit bleeding and thrombotic risk with perioperative
 * implications.
 */
import type { ClinicalContext } from '../context';
import { uniq } from '../context';
import { fmt } from '../units';
import type { Finding, ModuleResult, Severity } from '../types';
import { finding } from '../types';
import { rollUp } from '../severity';

/** ISTH overt-DIC score. Returns null when insufficient data. */
export function isthDicScore(ctx: ClinicalContext): { score: number; components: string[] } | null {
  const plt = ctx.v('plt');
  const dd = ctx.v('ddimer');
  const pt = ctx.v('pt');
  const fib = ctx.v('fibrinogen');
  if (plt === null && dd === null && pt === null && fib === null) return null;

  let score = 0;
  const components: string[] = [];

  if (plt !== null) {
    const s = plt < 50 ? 2 : plt < 100 ? 1 : 0;
    score += s;
    components.push(`Platelets ${fmt(plt, 0)} ×10⁹/L → ${s}`);
  }
  if (dd !== null) {
    const s = dd >= 5 ? 3 : dd >= 1 ? 2 : 0;
    score += s;
    components.push(`D-dimer ${fmt(dd, 2)} mg/L FEU → ${s}`);
  }
  if (pt !== null) {
    const ptExcess = pt - 14; // seconds above the upper reference limit
    const s = ptExcess >= 6 ? 2 : ptExcess >= 3 ? 1 : 0;
    score += s;
    components.push(`PT prolongation ${fmt(Math.max(ptExcess, 0), 1)} s → ${s}`);
  }
  if (fib !== null) {
    const s = fib < 1.0 ? 1 : 0;
    score += s;
    components.push(`Fibrinogen ${fmt(fib, 2)} g/L → ${s}`);
  }
  return { score, components };
}

export function analyseCoagulation(ctx: ClinicalContext): ModuleResult {
  const findings: Finding[] = [];
  const derived: ModuleResult['derived'] = {};
  const p = ctx.patient;

  const pt = ctx.v('pt');
  const inr = ctx.v('inr');
  const aptt = ctx.v('aptt');
  const apttR = ctx.v('apttRatio');
  const tt = ctx.v('tt');
  const fib = ctx.v('fibrinogen');
  const dd = ctx.v('ddimer');
  const antixa = ctx.v('antixa');
  const plt = ctx.v('plt');
  const alt = ctx.v('alt');
  const alb = ctx.v('albumin');
  const bili = ctx.v('bilirubinTotal');

  const ptHigh = ctx.high('pt') || (inr !== null && inr > 1.2);
  const apttHigh = ctx.high('aptt') || (apttR !== null && apttR > 1.2);
  const anticoag = (p.anticoagulantName || '').toLowerCase();

  // ── Derived risk expression ──────────────────────────────────────────
  const dic = isthDicScore(ctx);
  if (dic) {
    derived.isthDic = {
      label: 'ISTH overt-DIC score',
      value: `${dic.score} / 8`,
      note: dic.score >= 5
        ? 'Compatible with overt disseminated intravascular coagulation — repeat daily'
        : 'Not compatible with overt DIC; repeat if the clinical picture evolves',
    };
  }
  if (inr !== null) {
    derived.bleedingRisk = {
      label: 'Estimated bleeding risk',
      value: inr > 4.5 || (plt !== null && plt < 50) || (fib !== null && fib < 1.0) ? 'High'
        : inr > 1.5 || (plt !== null && plt < 100) ? 'Moderate' : 'Low',
      note: 'Composite of INR, platelet count and fibrinogen — clinical bleeding and drug history remain decisive.',
    };
  }
  if (dd !== null || fib !== null) {
    derived.thromboticRisk = {
      label: 'Thrombotic risk signals',
      value: (dd !== null && dd > 0.5) || (fib !== null && fib > 4.5) ? 'Present' : 'Not evident on these parameters',
      note: 'D-dimer is highly sensitive but poorly specific; a raised value in an inpatient is common and rarely diagnostic on its own.',
    };
  }

  // ── ANTICOAGULANT EFFECT PATTERNS ────────────────────────────────────
  const warfarinPattern = inr !== null && inr > 1.5 && (!apttHigh || (aptt !== null && aptt < 45));
  if (warfarinPattern && (anticoag.includes('warfarin') || anticoag.includes('acenocoumarol') || p.onAnticoagulant || inr > 2)) {
    const sev: Severity = inr! >= 8 ? 'life-threatening' : inr! >= 5 ? 'critical' : inr! > 4 ? 'significant' : 'moderate';
    findings.push(finding({
      id: 'coag.warfarin',
      module: 'coagulation',
      title: inr! >= 5 ? 'Markedly raised INR — vitamin K antagonist effect' : 'Raised INR consistent with vitamin K antagonist effect',
      severity: sev,
      interpretation:
        `INR ${fmt(inr, 2)} with a relatively preserved aPTT is the characteristic pattern of vitamin K antagonist therapy, which depletes factors II, VII, IX and X.` +
        (inr! >= 8 ? ' At this level the risk of major and intracranial haemorrhage is substantially increased and reversal is indicated irrespective of bleeding.' : inr! >= 5 ? ' Withholding further doses and considering oral vitamin K is appropriate.' : ''),
      basis: uniq(['inr', pt !== null ? 'pt' : '']),
      differentials: ['Vitamin K antagonist therapy', 'Drug interaction potentiating warfarin (antibiotics, amiodarone, azoles)', 'Intercurrent illness with reduced intake', 'Hepatic impairment', 'Vitamin K deficiency'],
      investigations: ['Confirm the anticoagulant, indication and target INR range', 'Assess for overt bleeding', 'Liver function tests', 'Medication review for interacting drugs', 'Full blood count'],
      implications: [
        'Increased bleeding risk proportional to the degree of INR elevation.',
        p.plannedSurgery ? 'Elective surgery should not proceed at this INR without a documented reversal and bridging plan agreed with the responsible teams.' : '',
        'Avoid intramuscular injections and NSAIDs.',
      ].filter(Boolean),
      monitoring: [inr! >= 5 ? 'Repeat INR within 12–24 hours after any intervention' : 'Repeat INR within 24–72 hours', 'Observe for bleeding at any site, including neurological observation after head injury'],
      guidance: [
        'Major bleeding on a vitamin K antagonist: stop the drug, give intravenous vitamin K and prothrombin complex concentrate in accordance with local haematology protocol.',
        'INR above 8 without bleeding: withhold the drug and give oral vitamin K, repeating the INR the following day.',
        'INR 5–8 without bleeding: withhold one or two doses and reduce the maintenance dose.',
      ],
      tags: ['warfarin-effect', 'bleeding-risk', inr! >= 5 ? 'reversal-consideration' : ''],
    }));
  }

  const heparinPattern = apttHigh && (inr === null || inr <= 1.5) ;
  if (heparinPattern) {
    findings.push(finding({
      id: 'coag.heparin',
      module: 'coagulation',
      title: 'Isolated aPTT prolongation — heparin effect or intrinsic pathway abnormality',
      severity: aptt !== null && aptt > 90 ? 'critical' : aptt !== null && aptt > 60 ? 'significant' : 'moderate',
      interpretation:
        `aPTT ${fmt(aptt, 1)} s${apttR !== null ? ` (ratio ${fmt(apttR, 2)})` : ''} is prolonged with a preserved PT/INR. Unfractionated heparin is the commonest cause in hospital practice.` +
        (tt !== null && tt > 19 ? ' The thrombin time is also prolonged, which supports a heparin effect or a fibrinogen abnormality.' : '') +
        (antixa !== null ? ` Anti-Xa activity is ${fmt(antixa, 2)} IU/mL.` : ''),
      basis: uniq(['aptt', apttR !== null ? 'apttRatio' : '', tt !== null ? 'tt' : '', antixa !== null ? 'antixa' : '']),
      differentials: ['Unfractionated heparin therapy', 'Contamination of the sample from a heparinised line', 'Lupus anticoagulant (prolongs aPTT but is prothrombotic)', 'Haemophilia A or B, or von Willebrand disease', 'Factor XII deficiency (no bleeding tendency)', 'Acquired factor inhibitor'],
      investigations: uniq([
        'Confirm heparin exposure and check the sampling site — repeat from a peripheral vein',
        antixa === null ? 'Anti-Xa activity if on low molecular weight heparin' : '',
        'aPTT mixing study to distinguish factor deficiency from an inhibitor',
        'Lupus anticoagulant and antiphospholipid antibodies if unexplained',
        'Factor assays if a congenital deficiency is suspected',
      ]),
      implications: [
        'If therapeutic heparinisation is intended, confirm the value against the local target range before altering the infusion.',
        'A prolonged aPTT from lupus anticoagulant is associated with thrombosis, not bleeding — do not treat it as a bleeding risk.',
        p.plannedSurgery ? 'Perioperative implications: unfractionated heparin infusions are typically stopped 4–6 hours pre-operatively; treatment-dose low molecular weight heparin requires a 24-hour interval.' : '',
      ].filter(Boolean),
      monitoring: ['Repeat aPTT 6 hours after any infusion rate change', 'Daily platelet count while on heparin to detect heparin-induced thrombocytopenia'],
      guidance: ['Where a heparin infusion is running, titrate to the local aPTT ratio or anti-Xa target rather than the absolute seconds.'],
      tags: ['heparin-effect', 'bleeding-risk'],
    }));
  }

  if (anticoag.match(/apixaban|rivaroxaban|edoxaban|dabigatran/)) {
    const isDabi = anticoag.includes('dabigatran');
    findings.push(finding({
      id: 'coag.doac',
      module: 'coagulation',
      title: 'Direct oral anticoagulant in use — routine coagulation tests are unreliable for monitoring',
      severity: (ptHigh || apttHigh) ? 'moderate' : 'minor',
      interpretation:
        `The patient is recorded as taking ${p.anticoagulantName}. Standard PT/INR and aPTT do not reliably quantify direct oral anticoagulant effect. ` +
        (isDabi
          ? 'For dabigatran, a normal thrombin time effectively excludes a clinically relevant drug level; dilute thrombin time or ecarin clotting time provides quantification.'
          : 'For factor Xa inhibitors, a drug-calibrated anti-Xa assay is required; a normal PT does not exclude a clinically significant level.') +
        (tt !== null && isDabi ? ` The measured thrombin time is ${fmt(tt, 1)} s.` : '') +
        (antixa !== null && !isDabi ? ` Anti-Xa activity is reported as ${fmt(antixa, 2)} IU/mL — confirm the assay is calibrated for this agent.` : ''),
      basis: uniq([pt !== null ? 'pt' : '', aptt !== null ? 'aptt' : '', tt !== null ? 'tt' : '', antixa !== null ? 'antixa' : '']),
      differentials: [],
      investigations: uniq([
        isDabi ? 'Thrombin time (qualitative) and dilute thrombin time (quantitative)' : 'Drug-calibrated anti-Xa assay',
        'Renal function — direct oral anticoagulant clearance is renally dependent, most markedly for dabigatran',
        'Confirm the timing of the last dose',
      ]),
      implications: [
        'Renal impairment prolongs drug effect and increases bleeding risk.',
        p.plannedSurgery ? 'Perioperative interruption is based on the agent, renal function and procedural bleeding risk — commonly 24–48 hours, extended in renal impairment or high-risk surgery.' : '',
        isDabi ? 'Specific reversal with idarucizumab is available for dabigatran.' : 'Andexanet alfa or prothrombin complex concentrate may be considered for factor Xa inhibitor–associated major bleeding, per local protocol.',
      ].filter(Boolean),
      monitoring: ['Renal function at least annually, and more often when impaired or during acute illness', 'Full blood count periodically'],
      guidance: ['Do not adjust direct oral anticoagulant dosing on the basis of PT, INR or aPTT.'],
      tags: ['doac', 'bleeding-risk', 'renal-dose-consideration'],
    }));
  }

  // ── DIC ──────────────────────────────────────────────────────────────
  if (dic && dic.score >= 5) {
    findings.push(finding({
      id: 'coag.dic',
      module: 'coagulation',
      title: 'Possible disseminated intravascular coagulation (ISTH score compatible with overt DIC)',
      severity: 'life-threatening',
      interpretation:
        `ISTH overt-DIC score ${dic.score}/8 (${dic.components.join('; ')}). This pattern — consumption of platelets and fibrinogen with prolonged clotting times and raised fibrin degradation products — is compatible with disseminated intravascular coagulation. DIC is always secondary; the precipitating illness must be identified and treated.`,
      basis: uniq(['plt', 'ddimer', 'pt', 'fibrinogen']),
      differentials: ['Sepsis', 'Major trauma or burns', 'Obstetric catastrophe (abruption, amniotic fluid embolism, pre-eclampsia)', 'Malignancy, particularly acute promyelocytic leukaemia and mucinous adenocarcinoma', 'Severe transfusion or immunological reaction', 'Severe liver failure (overlapping picture)', 'Thrombotic microangiopathy (alternative diagnosis)'],
      investigations: ['Repeat coagulation screen including fibrinogen and D-dimer at least daily', 'Blood film for schistocytes', 'Identify and investigate the precipitating illness urgently', 'Blood cultures and septic screen', 'Urgent haematology involvement'],
      implications: [
        'Simultaneous risk of bleeding and of microvascular thrombosis with organ dysfunction.',
        'Blood product support is guided by bleeding or planned procedures rather than by laboratory numbers alone.',
      ],
      monitoring: ['Coagulation screen, fibrinogen and platelets 6–12 hourly during active disease', 'Monitor for bleeding, organ dysfunction and limb ischaemia'],
      guidance: [
        'Treat the underlying cause — this is the only intervention that reverses DIC.',
        'In bleeding DIC, consider platelets, fresh frozen plasma and fibrinogen replacement (cryoprecipitate or fibrinogen concentrate) per local protocol.',
        'Discuss urgently with haematology; involve critical care.',
      ],
      tags: ['dic', 'consumptive-coagulopathy', 'bleeding-risk', 'thrombotic-risk', 'critical'],
    }));
  } else if (dic && dic.score >= 3) {
    findings.push(finding({
      id: 'coag.dicnonovert',
      module: 'coagulation',
      title: 'Coagulation abnormalities suggestive of evolving consumptive coagulopathy',
      severity: 'significant',
      interpretation: `ISTH score ${dic.score}/8 — below the threshold for overt DIC but abnormal. Serial testing is required as non-overt DIC may progress.`,
      basis: uniq(['plt', 'ddimer', 'pt', 'fibrinogen']),
      differentials: ['Early or compensated DIC', 'Sepsis-associated coagulopathy', 'Liver disease', 'Dilutional coagulopathy'],
      investigations: ['Repeat coagulation screen and fibrinogen in 6–12 hours', 'Blood film', 'Identify the underlying precipitant'],
      implications: ['A falling fibrinogen or platelet count on serial testing is more informative than any single value.'],
      monitoring: ['Serial coagulation profile 12-hourly'],
      guidance: ['Trend the ISTH components; a rising score indicates progression.'],
      tags: ['consumptive-coagulopathy', 'bleeding-risk'],
    }));
  }

  // ── HEPATIC vs VITAMIN K ─────────────────────────────────────────────
  // Hypoalbuminaemia alone does not indicate hepatic failure — it is at least
  // as often inflammatory or nutritional. The hepatic pattern requires actual
  // liver biochemistry to be abnormal.
  const liverSignals = (alt !== null && alt > 80) || (bili !== null && bili > 40);
  if (ptHigh && liverSignals) {
    findings.push(finding({
      id: 'coag.liverpattern',
      module: 'coagulation',
      title: 'Coagulopathy with a hepatic synthetic failure pattern',
      severity: inr !== null && inr > 2 ? 'critical' : 'significant',
      interpretation:
        `Prolonged PT/INR (${inr !== null ? `INR ${fmt(inr, 2)}` : `PT ${fmt(pt, 1)} s`}) in the presence of abnormal liver biochemistry` +
        (alb !== null ? ` and albumin ${fmt(alb, 0)} g/L` : '') +
        '. The liver synthesises all clotting factors except factor VIII; INR is therefore a sensitive marker of synthetic function and is a component of prognostic scores in liver disease.',
      basis: uniq(['inr', 'pt', alt !== null ? 'alt' : '', bili !== null ? 'bilirubinTotal' : '', alb !== null ? 'albumin' : '']),
      differentials: ['Acute liver failure', 'Decompensated chronic liver disease', 'Paracetamol or other hepatotoxic injury', 'Ischaemic hepatitis', 'Vitamin K deficiency complicating cholestasis', 'Coexisting DIC'],
      investigations: ['Factor V level (reduced in hepatic failure, preserved in isolated vitamin K deficiency)', 'Full liver screen including viral serology and paracetamol level', 'Hepatic ultrasound with Doppler', 'Ammonia and glucose if encephalopathy is suspected', 'Trial of intravenous vitamin K to exclude a reversible component'],
      implications: [
        'INR in liver disease reflects synthetic function but does not reliably predict bleeding — patients are simultaneously deficient in procoagulant and anticoagulant factors and are not auto-anticoagulated.',
        'Rising INR with encephalopathy in acute liver failure meets criteria for urgent discussion with a transplant centre.',
      ],
      monitoring: ['INR at least daily in acute liver injury', 'Monitor glucose, lactate, ammonia, renal function and conscious level'],
      guidance: [
        'Do not correct the INR prophylactically in stable liver disease; reserve product support for bleeding or planned procedures.',
        'Give intravenous vitamin K where deficiency may contribute, particularly in cholestasis or malnutrition.',
      ],
      tags: ['liver-coagulopathy', 'bleeding-risk'],
    }));
  } else if (ptHigh && !liverSignals && (fib === null || fib >= 1.5) && (plt === null || plt >= 100)) {
    findings.push(finding({
      id: 'coag.vitk',
      module: 'coagulation',
      title: 'Possible vitamin K deficiency pattern',
      severity: inr !== null && inr > 2 ? 'significant' : 'moderate',
      interpretation:
        `Prolonged PT/INR with preserved fibrinogen, platelet count and liver biochemistry is characteristic of vitamin K deficiency, which selectively depletes factors II, VII, IX and X.` +
        (apttHigh ? ' The aPTT is also prolonged, consistent with more advanced deficiency.' : ' Factor VII has the shortest half-life, so the PT prolongs first.'),
      basis: uniq(['inr', 'pt', fib !== null ? 'fibrinogen' : '']),
      differentials: ['Poor nutritional intake or prolonged fasting', 'Broad-spectrum antibiotic therapy', 'Malabsorption or biliary obstruction (fat-soluble vitamin deficiency)', 'Occult vitamin K antagonist exposure', 'Coeliac disease or pancreatic insufficiency'],
      investigations: ['Dietary and medication history including any anticoagulant exposure', 'Liver function tests', 'Assess for malabsorption', 'Repeat INR 24 hours after intravenous vitamin K — correction supports the diagnosis'],
      implications: ['Usually rapidly correctable with vitamin K replacement, with substantial improvement within 12–24 hours of an intravenous dose.'],
      monitoring: ['Repeat INR 24 hours after replacement', 'Reassess nutritional status'],
      guidance: ['Give intravenous rather than oral vitamin K where absorption is uncertain or correction is needed promptly.'],
      tags: ['vitamin-k-deficiency', 'bleeding-risk'],
    }));
  }

  // ── FIBRINOGEN / D-DIMER standalone ──────────────────────────────────
  if (fib !== null && fib < 1.5) {
    findings.push(finding({
      id: 'coag.hypofibrinogenaemia',
      module: 'coagulation',
      title: fib < 1.0 ? 'Critical hypofibrinogenaemia' : 'Hypofibrinogenaemia',
      severity: fib < 1.0 ? 'critical' : 'significant',
      interpretation: `Fibrinogen ${fmt(fib, 2)} g/L. Fibrinogen is the first factor to fall to critical levels in major haemorrhage and is a key determinant of clot strength.`,
      basis: ['fibrinogen'],
      differentials: ['Major haemorrhage with dilution and consumption', 'Disseminated intravascular coagulation', 'Advanced liver disease', 'Thrombolytic therapy', 'Congenital fibrinogen disorder', 'L-asparaginase therapy'],
      investigations: ['Repeat fibrinogen after replacement', 'Full coagulation screen and D-dimer', 'Viscoelastic testing (ROTEM/TEG) where available'],
      implications: ['Substantially increased bleeding risk, particularly during surgery or obstetric haemorrhage.'],
      monitoring: ['Repeat fibrinogen after each replacement dose and at least 6-hourly during active bleeding'],
      guidance: [
        'In major haemorrhage, replace fibrinogen to maintain a level above 1.5 g/L (above 2 g/L in obstetric haemorrhage) using cryoprecipitate or fibrinogen concentrate.',
      ],
      tags: ['hypofibrinogenaemia', 'bleeding-risk'],
    }));
  }

  if (fib !== null && fib > 4.5) {
    findings.push(finding({
      id: 'coag.hyperfibrinogenaemia',
      module: 'coagulation',
      title: 'Raised fibrinogen — acute phase response / hypercoagulable signal',
      severity: 'minor',
      interpretation: `Fibrinogen ${fmt(fib, 2)} g/L is above the reference interval. Fibrinogen is an acute phase reactant and rises in inflammation, infection, malignancy and pregnancy; a sustained elevation contributes to a prothrombotic state.`,
      basis: ['fibrinogen'],
      differentials: ['Acute phase response', 'Infection or inflammation', 'Malignancy', 'Pregnancy', 'Nephrotic syndrome'],
      investigations: ['C-reactive protein', 'Assess for an underlying inflammatory or neoplastic process'],
      implications: ['Contributes to thrombotic risk alongside immobility, surgery and malignancy.'],
      monitoring: ['Repeat after resolution of the acute illness'],
      guidance: ['Ensure venous thromboembolism prophylaxis is prescribed and appropriate unless contraindicated.'],
      tags: ['hypercoagulable', 'thrombotic-risk'],
    }));
  }

  if (dd !== null && dd > 0.5) {
    const marked = dd > 5;
    findings.push(finding({
      id: 'coag.ddimer',
      module: 'coagulation',
      title: marked ? 'Markedly raised D-dimer' : 'Raised D-dimer',
      severity: marked ? 'significant' : 'minor',
      interpretation:
        `D-dimer ${fmt(dd, 2)} mg/L FEU is above the reference threshold. D-dimer has high sensitivity but low specificity for venous thromboembolism; it is raised by infection, surgery, trauma, malignancy, pregnancy and increasing age. Its principal value is a negative result excluding thromboembolism in a patient with low or intermediate pre-test probability.`,
      basis: ['ddimer'],
      differentials: ['Venous thromboembolism', 'Recent surgery or trauma', 'Infection or sepsis', 'Malignancy', 'Disseminated intravascular coagulation', 'Pregnancy', 'Aortic dissection', 'Advanced age'],
      investigations: uniq([
        'Apply a validated clinical probability score (Wells / PERC) before acting on the result',
        'CT pulmonary angiography or leg vein ultrasound where thromboembolism is clinically suspected',
        marked ? 'Consider DIC screen — platelets, fibrinogen, PT' : '',
      ]),
      implications: ['A raised D-dimer in an inpatient rarely establishes a diagnosis on its own; it must be interpreted with pre-test probability.'],
      monitoring: ['Repeat only if it will change management'],
      guidance: ['Do not request D-dimer in patients with high clinical probability of thromboembolism — proceed directly to imaging.'],
      tags: ['ddimer-raised', 'thrombotic-risk'],
    }));
  }

  if (tt !== null && ctx.high('tt') && !heparinPattern) {
    findings.push(finding({
      id: 'coag.tt',
      module: 'coagulation',
      title: 'Prolonged thrombin time',
      severity: 'moderate',
      interpretation: `Thrombin time ${fmt(tt, 1)} s is prolonged, indicating impaired conversion of fibrinogen to fibrin.`,
      basis: ['tt'],
      differentials: ['Heparin contamination or therapy', 'Dabigatran', 'Hypofibrinogenaemia or dysfibrinogenaemia', 'Raised fibrin degradation products (DIC)', 'Paraproteinaemia'],
      investigations: ['Reptilase time to distinguish heparin from a fibrinogen abnormality', 'Fibrinogen level', 'Confirm sampling technique and anticoagulant exposure'],
      implications: ['Interpretation depends heavily on drug exposure — confirm the medication chart before further testing.'],
      monitoring: ['Repeat on a cleanly drawn peripheral sample'],
      guidance: ['A normal thrombin time effectively excludes clinically relevant dabigatran levels.'],
      tags: ['tt-prolonged'],
    }));
  }

  // ── PERIOPERATIVE FLAG ───────────────────────────────────────────────
  if (p.plannedSurgery && ((inr !== null && inr > 1.5) || (plt !== null && plt < 100) || (fib !== null && fib < 1.5) || apttHigh)) {
    findings.push(finding({
      id: 'coag.periop',
      module: 'coagulation',
      title: 'Abnormal coagulation with planned surgery — increased perioperative bleeding risk',
      severity: (inr !== null && inr > 2.5) || (plt !== null && plt < 50) ? 'critical' : 'significant',
      interpretation:
        'Surgery is planned in the presence of abnormal haemostatic parameters ' +
        uniq([
          inr !== null && inr > 1.5 ? `INR ${fmt(inr, 2)}` : '',
          plt !== null && plt < 100 ? `platelets ${fmt(plt, 0)} ×10⁹/L` : '',
          fib !== null && fib < 1.5 ? `fibrinogen ${fmt(fib, 2)} g/L` : '',
          apttHigh ? `aPTT ${fmt(aptt, 1)} s` : '',
        ]).join(', ') +
        '. This materially increases the risk of perioperative haemorrhage and constrains regional anaesthetic technique.',
      basis: uniq([inr !== null ? 'inr' : '', plt !== null ? 'plt' : '', fib !== null ? 'fibrinogen' : '', aptt !== null ? 'aptt' : '']),
      differentials: [],
      investigations: ['Repeat coagulation screen and full blood count immediately pre-operatively', 'Group and save with crossmatch appropriate to the procedure', 'Discuss with haematology and anaesthesia', 'Viscoelastic testing intra-operatively where available'],
      implications: [
        'Neuraxial blockade is generally avoided with INR above 1.4 or platelets below 80 ×10⁹/L.',
        'A documented reversal, replacement and anticoagulant-bridging plan should be in place before the patient goes to theatre.',
        'Ensure blood products are available and the major haemorrhage protocol is known to the team.',
      ],
      monitoring: ['Coagulation screen immediately pre-operatively and post-operatively', 'Close monitoring of drains, wound and haemodynamic status'],
      guidance: ['Elective surgery should generally be deferred until correctable coagulopathy has been addressed.'],
      tags: ['perioperative-bleeding-risk', 'bleeding-risk'],
    }));
  }

  const analytes = ctx.moduleAnalytes('coagulation');
  const present = analytes.length > 0;
  const severity = rollUp(findings.map((f) => f.severity));
  const titles = uniq(findings.map((f) => f.title));

  return {
    module: 'coagulation',
    present,
    analytes,
    observations: ctx.moduleObservations('coagulation'),
    findings,
    summary: !present
      ? 'No coagulation data available.'
      : titles.length ? `${titles.join('; ')}.` : 'Coagulation parameters are within the reference intervals applied.',
    severity,
    derived,
  };
}
