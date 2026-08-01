/**
 * INFLAMMATORY MARKER ANALYSIS MODULE
 *
 * CRP, ESR, procalcitonin and ferritin, interpreted together with the white
 * cell response rather than in isolation.
 */
import type { ClinicalContext } from '../context';
import { uniq } from '../context';
import { fmt } from '../units';
import type { Finding, ModuleResult, Severity } from '../types';
import { finding } from '../types';
import { rollUp } from '../severity';

export function analyseInflammatory(ctx: ClinicalContext): ModuleResult {
  const findings: Finding[] = [];
  const derived: ModuleResult['derived'] = {};
  const p = ctx.patient;

  const crp = ctx.v('crp');
  const esr = ctx.v('esr');
  const pct = ctx.v('procalcitonin');
  const ferritin = ctx.v('ferritin');
  const wbc = ctx.v('wbc');
  const neut = ctx.v('neut');
  const tsat = ctx.v('tsat');

  if (crp !== null && esr !== null) {
    derived.crpEsr = {
      label: 'CRP / ESR pattern',
      value: crp > 20 && esr <= 30 ? 'Acute — CRP-predominant'
        : crp <= 10 && esr > 50 ? 'Chronic or paraprotein-driven — ESR-predominant'
          : crp > 20 && esr > 50 ? 'Both markedly raised' : 'No discordant pattern',
      note: 'CRP rises and falls within hours to days; ESR changes over weeks and is influenced by anaemia, age, pregnancy and paraproteins. Marked ESR elevation with a normal CRP should prompt consideration of myeloma or a paraproteinaemia.',
    };
  }

  if (crp !== null && crp > 5) {
    const sev: Severity = crp > 200 ? 'significant' : crp > 100 ? 'moderate' : crp > 40 ? 'moderate' : 'minor';
    findings.push(finding({
      id: 'infl.crp',
      module: 'inflammatory',
      title: crp > 100 ? 'Markedly raised C-reactive protein' : 'Raised C-reactive protein',
      severity: p.fever && crp > 100 ? 'significant' : sev,
      interpretation:
        `CRP ${fmt(crp, 1)} mg/L.` +
        (crp > 100 ? ' Values above 100 mg/L are most commonly associated with bacterial infection, though major tissue injury, surgery and some inflammatory conditions produce comparable rises.' : ' A modest rise is non-specific and occurs with any inflammatory stimulus, including viral infection.') +
        (wbc !== null || neut !== null ? ` The white cell response is ${wbc !== null ? `WBC ${fmt(wbc, 1)} ×10⁹/L` : ''}${neut !== null ? `${wbc !== null ? ', ' : ''}neutrophils ${fmt(neut, 2)} ×10⁹/L` : ''}.` : '') +
        ' CRP lags the clinical picture by 12–24 hours; a normal value early in an illness does not exclude serious infection.',
      basis: uniq(['crp', wbc !== null ? 'wbc' : '', neut !== null ? 'neut' : '']),
      differentials: ['Bacterial infection', 'Viral infection (usually lower values)', 'Surgery, trauma or burns', 'Autoimmune and connective tissue disease', 'Malignancy', 'Venous thromboembolism', 'Myocardial infarction', 'Pancreatitis'],
      investigations: uniq([
        'Cultures directed at the likely source before antimicrobials',
        'Imaging appropriate to the suspected site',
        pct === null && crp > 100 ? 'Consider procalcitonin where the distinction between bacterial and non-bacterial inflammation would change management' : '',
        'Full blood count with differential',
      ]),
      implications: ['Serial values are far more informative than any single measurement — a falling CRP supports response to treatment.'],
      monitoring: ['Repeat CRP every 48–72 hours during treatment rather than daily, as the marker changes slowly'],
      guidance: ['CRP should support, not replace, clinical assessment; it does not distinguish infection from other inflammation reliably enough to direct antimicrobial decisions alone.'],
      tags: ['raised-crp', crp > 100 ? 'infection-risk' : ''],
    }));
  }

  if (pct !== null && pct > 0.5) {
    findings.push(finding({
      id: 'infl.pct',
      module: 'inflammatory',
      title: pct > 10 ? 'Markedly raised procalcitonin' : 'Raised procalcitonin',
      severity: pct > 10 ? 'significant' : 'moderate',
      interpretation:
        `Procalcitonin ${fmt(pct, 2)} ng/mL. Procalcitonin is more specific than CRP for bacterial infection and rises within 3–6 hours. Values above 2 ng/mL are associated with a high probability of bacterial sepsis; values above 10 ng/mL with severe sepsis or septic shock.` +
        ' It is also raised in major trauma, surgery, burns, cardiogenic shock and renal impairment.',
      basis: ['procalcitonin'],
      differentials: ['Bacterial sepsis', 'Severe bacterial infection', 'Major surgery or trauma', 'Cardiogenic shock', 'Renal failure', 'Medullary thyroid carcinoma'],
      investigations: ['Blood cultures and site-directed cultures', 'Lactate', 'Source identification and imaging'],
      implications: ['Serial procalcitonin can support safe discontinuation of antimicrobials — an 80% fall from peak, or a value below 0.5 ng/mL, is a commonly used threshold.'],
      monitoring: ['Repeat procalcitonin every 24–48 hours where it is being used to guide antimicrobial duration'],
      guidance: ['Procalcitonin-guided algorithms reduce antimicrobial exposure without increasing mortality in respiratory infection and sepsis, but should never override clinical judgement.'],
      tags: ['raised-procalcitonin', 'infection-risk', 'antimicrobial-stewardship'],
    }));
  }

  if (esr !== null && ctx.high('esr')) {
    findings.push(finding({
      id: 'infl.esr',
      module: 'inflammatory',
      title: esr > 100 ? 'Markedly raised ESR' : 'Raised ESR',
      severity: esr > 100 ? 'significant' : 'minor',
      interpretation:
        `ESR ${fmt(esr, 0)} mm/hr.` +
        (esr > 100 ? ' An ESR above 100 mm/hr has a narrow differential: infection, malignancy (particularly myeloma), and connective tissue disease including giant cell arteritis.' : '') +
        (crp !== null && crp < 10 ? ' The normal CRP alongside this raised ESR is a discordant pattern that should prompt consideration of a paraproteinaemia.' : ''),
      basis: uniq(['esr', crp !== null ? 'crp' : '']),
      differentials: ['Infection', 'Multiple myeloma or other paraproteinaemia', 'Malignancy', 'Giant cell arteritis and polymyalgia rheumatica', 'Connective tissue disease', 'Anaemia (raises ESR independently)', 'Chronic kidney disease', 'Pregnancy'],
      investigations: uniq([
        esr > 100 ? 'Serum protein electrophoresis, serum free light chains and urinary Bence Jones protein' : '',
        'Full blood count and film',
        'Renal function, calcium and bone profile',
        (p.age ?? 0) >= 50 ? 'Consider giant cell arteritis where there is headache, jaw claudication or visual symptoms — this requires same-day assessment' : '',
      ]),
      implications: ['Suspected giant cell arteritis with visual symptoms is a sight-threatening emergency requiring immediate high-dose corticosteroid and urgent ophthalmology referral.'],
      monitoring: ['Repeat ESR at intervals of weeks rather than days'],
      guidance: ['Do not delay treatment of suspected giant cell arteritis while awaiting temporal artery biopsy.'],
      tags: ['raised-esr', esr > 100 ? 'myeloma-consideration' : ''],
    }));
  }

  if (ferritin !== null) {
    if (ferritin < 30) {
      findings.push(finding({
        id: 'infl.ferritinlow',
        module: 'inflammatory',
        title: 'Low ferritin — iron deficiency',
        severity: 'moderate',
        interpretation: `Ferritin ${fmt(ferritin, 0)} µg/L. A ferritin below 30 µg/L is highly specific for depleted iron stores. Because ferritin is an acute phase reactant, a value in the normal range does not exclude deficiency when inflammation is present.`,
        basis: uniq(['ferritin', tsat !== null ? 'tsat' : '', crp !== null ? 'crp' : '']),
        differentials: ['Chronic blood loss', 'Malabsorption', 'Dietary insufficiency', 'Increased demand — pregnancy, growth'],
        investigations: ['Full iron studies including transferrin saturation', 'Investigation for a source of blood loss in adults', 'Coeliac serology'],
        implications: ['See the full blood count module for the associated anaemia assessment.'],
        monitoring: ['Repeat ferritin and full blood count after 4 weeks of replacement'],
        guidance: ['Do not treat iron deficiency in an adult without investigating the cause.'],
        tags: ['iron-deficiency'],
      }));
    } else if (ferritin > 1000) {
      findings.push(finding({
        id: 'infl.ferritinhigh',
        module: 'inflammatory',
        title: ferritin > 10000 ? 'Extremely raised ferritin' : 'Markedly raised ferritin',
        severity: ferritin > 10000 ? 'significant' : 'moderate',
        interpretation:
          `Ferritin ${fmt(ferritin, 0)} µg/L.` +
          (ferritin > 10000 ? ' Values at this level are strongly associated with haemophagocytic lymphohistiocytosis, adult-onset Still disease and severe hepatocellular necrosis, and warrant urgent specialist input.' : ' Marked elevation is most often an acute phase response, but iron overload and liver disease should be considered.'),
        basis: uniq(['ferritin', crp !== null ? 'crp' : '']),
        differentials: ['Acute phase response / severe inflammation', 'Haemophagocytic lymphohistiocytosis', 'Adult-onset Still disease', 'Hereditary haemochromatosis or transfusional iron overload', 'Liver disease including alcohol-related', 'Malignancy'],
        investigations: uniq([
          'Transferrin saturation — above 45% suggests iron overload rather than inflammation',
          ferritin > 10000 ? 'HLH screen: triglycerides, fibrinogen, soluble CD25, LDH, blood film, and haematology referral' : '',
          'Liver function tests',
          'HFE genotyping where iron overload is suspected',
        ]),
        implications: ['Ferritin is unreliable as an iron store marker in the presence of inflammation — interpret with transferrin saturation.'],
        monitoring: ['Repeat after resolution of the acute illness'],
        guidance: ['A ferritin above 10 000 µg/L in an unwell patient should prompt consideration of haemophagocytic lymphohistiocytosis, which has high mortality if unrecognised.'],
        tags: ['raised-ferritin', ferritin > 10000 ? 'hlh-consideration' : ''],
      }));
    }
  }

  // Discordance: high inflammatory markers with a normal white count.
  if (crp !== null && crp > 100 && wbc !== null && wbc >= 4 && wbc <= 11 && !findings.some((f) => f.id === 'infl.pct')) {
    findings.push(finding({
      id: 'infl.discordant',
      module: 'inflammatory',
      title: 'Markedly raised CRP with a normal white cell count',
      severity: 'moderate',
      interpretation: 'A high CRP with a normal white cell count does not exclude significant bacterial infection — the white cell response may be blunted in the elderly, in immunosuppression, and in overwhelming sepsis.',
      basis: ['crp', 'wbc'],
      differentials: ['Bacterial infection with a blunted marrow response', 'Deep-seated collection or abscess', 'Inflammatory or autoimmune disease', 'Malignancy', 'Venous thromboembolism'],
      investigations: ['Careful source-directed examination and imaging', 'Blood cultures', 'Consider cross-sectional imaging for an occult collection'],
      implications: [p.immunosuppressed ? 'This patient is recorded as immunosuppressed, where a normal white count is expected despite significant infection.' : 'Do not be reassured by a normal white cell count.'],
      monitoring: ['Serial CRP and clinical reassessment'],
      guidance: ['Clinical assessment outranks any single laboratory marker.'],
      tags: ['infection-risk'],
    }));
  }

  const analytes = ctx.moduleAnalytes('inflammatory');
  const present = analytes.length > 0;
  const titles = uniq(findings.map((f) => f.title));

  return {
    module: 'inflammatory',
    present,
    analytes,
    observations: ctx.moduleObservations('inflammatory'),
    findings,
    summary: !present
      ? 'No inflammatory marker data available.'
      : titles.length ? `${titles.join('; ')}.` : 'Inflammatory markers are within the reference intervals applied.',
    severity: rollUp(findings.map((f) => f.severity)),
    derived,
  };
}
