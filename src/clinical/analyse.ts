/**
 * Analysis orchestrator.
 *
 * Runs every module against the extracted dataset, applies the correlation
 * engine, and composes the integrated clinical impression and suggested next
 * steps that head the report.
 */
import { ClinicalContext, uniq, type Extraction } from './context';
import { runCorrelations, overallSeverity } from './correlation';
import { analyseAbg } from './modules/abg';
import { analyseCardiac } from './modules/cardiac';
import { analyseCoagulation } from './modules/coagulation';
import { analyseEcg } from './modules/ecg';
import { analyseElectrolytes } from './modules/electrolytes';
import { analyseFbc } from './modules/fbc';
import { analyseInflammatory } from './modules/inflammatory';
import { analyseLft } from './modules/lft';
import { analyseMicrobiology } from './modules/microbiology';
import { analyseRenal } from './modules/renal';
import { analyseUrinalysis } from './modules/urinalysis';
import { SEVERITY_LABEL, severityRank, type AnalysisResult, type Correlation, type Finding, type ModuleResult, type PatientContext, type ScannedDocument } from './types';

const MODULE_ORDER = [
  analyseRenal,
  analyseElectrolytes,
  analyseFbc,
  analyseCoagulation,
  analyseLft,
  analyseAbg,
  analyseInflammatory,
  analyseCardiac,
  analyseEcg,
  analyseUrinalysis,
  analyseMicrobiology,
];

export function analyse(
  patient: PatientContext,
  extraction: Extraction,
  documents: ScannedDocument[],
): AnalysisResult {
  const ctx = new ClinicalContext(patient, extraction);
  const modules: ModuleResult[] = MODULE_ORDER.map((fn) => fn(ctx));
  const correlations = runCorrelations(ctx, modules);
  const severity = overallSeverity(modules, correlations);

  return {
    patient,
    documents,
    modules,
    correlations,
    overallSeverity: severity,
    impression: buildImpression(ctx, modules, correlations),
    nextSteps: buildNextSteps(ctx, modules, correlations),
    generatedAt: new Date().toISOString(),
  };
}

/** Findings at or above a severity, most severe first. */
export function alertingFindings(modules: ModuleResult[], min = 'critical'): Finding[] {
  const threshold = severityRank(min as never);
  return modules
    .flatMap((m) => m.findings)
    .filter((f) => severityRank(f.severity) >= threshold)
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

// ─────────────────────── Integrated clinical impression ───────────────────────

function buildImpression(
  ctx: ClinicalContext,
  modules: ModuleResult[],
  correlations: Correlation[],
): string[] {
  const out: string[] = [];
  const present = modules.filter((m) => m.present);

  if (!present.length) {
    return ['No investigations have been scanned or entered. The clinical summary will populate once results are added.'];
  }

  // Opening line: scope and headline severity.
  const overall = overallSeverity(modules, correlations);
  const moduleNames = present.map((m) => m.module);
  out.push(
    `Integrated interpretation of ${present.length} investigation ${present.length === 1 ? 'group' : 'groups'} ` +
    `(${moduleNames.map((m) => MODULE_SHORT[m] ?? m).join(', ')}). ` +
    `The highest priority classification across all findings is: ${SEVERITY_LABEL[overall]}.`,
  );

  // Life-threatening and critical findings, stated first and plainly.
  const alerts = alertingFindings(modules, 'critical');
  if (alerts.length) {
    out.push(
      `Findings requiring immediate attention: ${uniq(alerts.map((f) => f.title)).join('; ')}. ` +
      'These are listed in full in the priority alerts section and should be acted on before the remainder of this report is worked through.',
    );
  }

  // The principal abnormality per module, in clinical order.
  const perModule = present
    .filter((m) => m.findings.length)
    .map((m) => {
      const top = [...m.findings].sort((a, b) => severityRank(b.severity) - severityRank(a.severity))[0];
      return `${MODULE_SHORT[m.module] ?? m.module}: ${top.title.toLowerCase()}`;
    });
  if (perModule.length) {
    out.push(`Principal abnormality in each group — ${perModule.join('; ')}.`);
  }

  const quiet = present.filter((m) => !m.findings.length).map((m) => MODULE_SHORT[m.module] ?? m.module);
  if (quiet.length) {
    out.push(`No abnormality identified on the parameters available for: ${quiet.join(', ')}.`);
  }

  // Relationships between findings.
  if (correlations.length) {
    out.push(
      `Relationships identified across investigations: ${correlations.map((c) => c.title.replace(/ —.*$/, '')).join('; ')}. ` +
      'Each is set out with its rationale and suggested actions in the clinical correlation section.',
    );
  } else if (present.length > 1) {
    out.push('No cross-modality correlation rules were triggered by the current combination of results.');
  }

  // Context-sensitive closing observations.
  const closing: string[] = [];
  if (ctx.patient.plannedSurgery) closing.push('surgery is planned, so haemostatic and haemoglobin parameters carry additional weight');
  if (ctx.patient.fever) closing.push('the patient is recorded as febrile, which raises the significance of any inflammatory or microbiological finding');
  if (ctx.patient.immunosuppressed) closing.push('immunosuppression is recorded, so normal inflammatory markers should not be taken as reassurance');
  if (ctx.patient.pregnant) closing.push('pregnancy-adjusted reference intervals have been applied where they differ');
  if (ctx.patient.onAnticoagulant) closing.push(`anticoagulation with ${ctx.patient.anticoagulantName || 'an unspecified agent'} is recorded and has been taken into account`);
  if (closing.length) {
    out.push(`Clinical context taken into account: ${closing.join('; ')}.`);
  }

  // Data quality caveat where OCR confidence was poor.
  out.push(
    'All values in this report were extracted on this device and should be verified against the source documents before any clinical decision is made. ' +
    'This report is clinical decision support and does not replace clinical assessment or specialist advice.',
  );

  return out;
}

const MODULE_SHORT: Record<string, string> = {
  fbc: 'full blood count',
  coagulation: 'coagulation',
  renal: 'renal function',
  electrolytes: 'electrolytes',
  lft: 'liver function',
  abg: 'blood gas',
  urinalysis: 'urinalysis',
  inflammatory: 'inflammatory markers',
  cardiac: 'cardiac biomarkers',
  ecg: 'ECG',
  microbiology: 'microbiology',
  other: 'other investigations',
};

// ─────────────────────────── Suggested next steps ───────────────────────────

interface Step {
  text: string;
  priority: number; // lower is more urgent
  category: string;
}

function buildNextSteps(
  ctx: ClinicalContext,
  modules: ModuleResult[],
  correlations: Correlation[],
): string[] {
  const steps: Step[] = [];
  const push = (priority: number, category: string, text: string) => {
    if (text) steps.push({ priority, category, text });
  };

  const p = ctx.patient;
  const alerts = alertingFindings(modules, 'critical');
  const lifeThreatening = alerts.filter((f) => f.severity === 'life-threatening');

  // 1. Escalation
  if (lifeThreatening.length) {
    push(0, 'Escalation', `IMMEDIATE senior clinical review is required for: ${uniq(lifeThreatening.map((f) => f.title)).join('; ')}.`);
  } else if (alerts.length) {
    push(1, 'Escalation', `Urgent clinical review is required for: ${uniq(alerts.map((f) => f.title)).join('; ')}.`);
  }
  for (const c of correlations.filter((x) => x.severity === 'life-threatening')) {
    push(0, 'Escalation', `${c.title} — ${c.actions[0] ?? 'urgent review required'}`);
  }

  // 2. Immediate investigations drawn from the highest-severity findings.
  const urgentInvestigations = uniq(alerts.flatMap((f) => f.investigations).slice(0, 8));
  for (const inv of urgentInvestigations) push(2, 'Investigations', inv);

  // 3. Investigations from the remaining findings.
  const otherFindings = modules
    .flatMap((m) => m.findings)
    .filter((f) => severityRank(f.severity) >= severityRank('moderate') && severityRank(f.severity) < severityRank('critical'));
  for (const inv of uniq(otherFindings.flatMap((f) => f.investigations)).slice(0, 12)) {
    push(4, 'Investigations', inv);
  }

  // 4. Monitoring
  const monitoring = uniq(modules.flatMap((m) => m.findings).flatMap((f) => f.monitoring)).slice(0, 12);
  for (const m of monitoring) push(5, 'Monitoring', m);

  // 5. Specialist referral triggers
  const tags = new Set(modules.flatMap((m) => m.findings).flatMap((f) => f.tags));
  if (tags.has('aki:stage3') || ctx.lt('egfr', 30)) push(3, 'Referral', 'Nephrology referral — stage 3 acute kidney injury or eGFR below 30 mL/min/1.73m².');
  if (tags.has('haematological-emergency') || tags.has('pancytopenia') || tags.has('blasts')) push(3, 'Referral', 'Same-day haematology referral — blast cells, pancytopenia or suspected haematological emergency.');
  if (tags.has('acs') || tags.has('stemi')) push(0, 'Referral', 'Immediate cardiology / primary PCI centre discussion.');
  if (tags.has('dic')) push(0, 'Referral', 'Urgent haematology and critical care involvement for suspected disseminated intravascular coagulation.');
  if ([...tags].some((t) => t.startsWith('resistance:'))) push(3, 'Referral', 'Microbiology / infection specialist discussion for the resistant organism identified.');
  if (tags.has('acute-liver-injury')) push(3, 'Referral', 'Hepatology discussion; consider transplant-centre referral where acute liver failure criteria are met.');
  if (tags.has('pacing-consideration')) push(2, 'Referral', 'Cardiology referral for consideration of temporary or permanent pacing.');
  if (tags.has('neutropenic-fever')) push(0, 'Referral', 'Acute oncology / haematology team involvement for neutropenic sepsis.');

  // 6. Infection control
  const ipc: string[] = [];
  if ([...tags].some((t) => t.startsWith('resistance:'))) ipc.push('Notify infection prevention and control and apply the appropriate isolation precautions for the resistant organism identified.');
  if (tags.has('neutropenia:severe')) ipc.push('Protective isolation precautions for severe neutropenia.');
  if (modules.some((m) => m.findings.some((f) => /difficile/i.test(f.title)))) ipc.push('Enteric precautions and single-room isolation for Clostridioides difficile.');
  if (modules.some((m) => m.findings.some((f) => /tuberculosis/i.test(f.title)))) ipc.push('Airborne isolation and public health notification for suspected tuberculosis.');
  for (const i of ipc) push(3, 'Infection control', i);

  // 7. Medication review
  const meds: string[] = [];
  if (tags.has('renal-dose-consideration') || tags.has('aki') || tags.has('ckd')) {
    meds.push('Review every prescribed medicine against renal function; withhold nephrotoxins and adjust renally cleared drugs.');
  }
  if (tags.has('hyperkalaemia')) meds.push('Stop potassium-elevating drugs: ACE inhibitors, angiotensin receptor blockers, potassium-sparing diuretics, trimethoprim and NSAIDs.');
  if (tags.has('qt-prolongation-risk')) meds.push('Review the drug chart against a QT-prolonging drug database and stop all non-essential culprits.');
  if (tags.has('bleeding-risk') && p.onAnticoagulant) meds.push('Review the indication, agent and dose of anticoagulation against current bleeding risk.');
  if (tags.has('culture-positive')) meds.push('Review antimicrobial therapy against the reported susceptibilities: de-escalate to the narrowest effective agent and document a stop or review date.');
  if (tags.has('drug-reaction-possible')) meds.push('Review recently started medicines as a possible cause of the eosinophilia.');
  for (const m of meds) push(3, 'Medication review', m);

  // 8. Repeat testing intervals
  const repeats: string[] = [];
  if (tags.has('aki')) repeats.push('Urea, creatinine and electrolytes daily, or more often while deteriorating.');
  if (tags.has('hyperkalaemia') || tags.has('hypokalaemia')) repeats.push('Potassium 1 hour after treatment, then 2–4 hourly until stable.');
  if (tags.has('anaemia:severe') || tags.has('blood-loss')) repeats.push('Full blood count every 4–6 hours during active bleeding, otherwise 12–24 hourly.');
  if (tags.has('dic') || tags.has('consumptive-coagulopathy')) repeats.push('Coagulation screen, fibrinogen, D-dimer and platelets 6–12 hourly.');
  if (tags.has('sepsis-pattern') || tags.has('hyperlactataemia')) repeats.push('Lactate within 2 hours of the initial value, and after each resuscitation intervention.');
  if (tags.has('raised-crp')) repeats.push('CRP every 48–72 hours — daily testing adds little because the marker changes slowly.');
  if (tags.has('myocardial-injury')) repeats.push('Troponin at the assay-specific interval to establish a rise-and-fall pattern.');
  if (tags.has('bacteraemia')) repeats.push('Repeat blood cultures at 48–72 hours to document clearance.');
  if (!repeats.length && modules.some((m) => m.present)) repeats.push('Repeat abnormal results according to the clinical course; a single value is less informative than a trend.');
  for (const r of repeats) push(6, 'Repeat monitoring', r);

  // 9. Patient monitoring priorities
  const obs: string[] = [];
  if (severityRank(overallSeverity(modules, correlations)) >= severityRank('critical')) {
    obs.push('Increase the frequency of physiological observations and ensure an early warning score is calculated and escalated.');
  }
  if (tags.has('arrhythmia-risk') || tags.has('hyperkalaemia') || tags.has('qt-prolongation-risk')) obs.push('Continuous cardiac monitoring.');
  if (tags.has('aki') || tags.has('sepsis-pattern')) obs.push('Strict hourly fluid balance with urine output measurement.');
  if (tags.has('bleeding-risk')) obs.push('Observe for bleeding at all sites, including neurological observations after any head injury.');
  if (tags.has('hypoxaemia')) obs.push('Continuous pulse oximetry with a documented target saturation range.');
  for (const o of obs) push(5, 'Patient monitoring', o);

  // 10. Data-quality actions
  const lowConf = ctx.extraction.analytes.filter((a) => a.confidence < 0.7 && !a.edited);
  if (lowConf.length) {
    push(2, 'Data quality', `${lowConf.length} value${lowConf.length === 1 ? ' was' : 's were'} extracted with low recognition confidence — verify against the source document before acting: ${uniq(lowConf.map((a) => a.label)).slice(0, 8).join(', ')}.`);
  }
  if (!p.age || !p.weightKg) {
    push(4, 'Data quality', 'Enter patient age and body weight to enable creatinine clearance calculation, renal drug dosing prompts and deficit estimates.');
  }
  if (p.sex === 'unspecified') {
    push(4, 'Data quality', 'Patient sex is not recorded — sex-specific reference intervals have been widened, which reduces the sensitivity of the analysis.');
  }
  if (!p.baselineCreatinine && ctx.v('creatinine') !== null) {
    push(4, 'Data quality', 'Enter a baseline creatinine to allow KDIGO acute kidney injury staging; without it, acute injury cannot be distinguished from chronic impairment.');
  }

  const seen = new Set<string>();
  return steps
    .sort((a, b) => a.priority - b.priority)
    .filter((s) => {
      const k = s.text.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((s) => `[${s.category}] ${s.text}`);
}
