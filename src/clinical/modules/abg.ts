/**
 * ARTERIAL BLOOD GAS ANALYSIS MODULE
 *
 * Applies a standard stepwise acid–base algorithm: identify the acidaemia or
 * alkalaemia, attribute it to a respiratory or metabolic primary disorder,
 * test whether compensation is appropriate, and compute the anion gap and
 * oxygenation indices. All tensions are handled in kPa.
 */
import type { ClinicalContext } from '../context';
import { uniq } from '../context';
import { fmt } from '../units';
import type { Finding, ModuleResult, Severity } from '../types';
import { finding } from '../types';
import { rollUp } from '../severity';

const KPA_PER_MMHG = 0.1333;

export interface AcidBase {
  primary: 'respiratory acidosis' | 'respiratory alkalosis' | 'metabolic acidosis' | 'metabolic alkalosis' | 'normal' | 'mixed';
  compensation: 'none' | 'appropriate' | 'inadequate' | 'excessive' | 'not-assessable';
  narrative: string;
}

export function interpretAcidBase(
  ph: number | null,
  paco2: number | null,
  hco3: number | null,
): AcidBase | null {
  if (ph === null || paco2 === null || hco3 === null) return null;

  const acidaemic = ph < 7.35;
  const alkalaemic = ph > 7.45;
  const co2High = paco2 > 6.0;
  const co2Low = paco2 < 4.7;
  const hco3High = hco3 > 29;
  const hco3Low = hco3 < 22;

  let primary: AcidBase['primary'] = 'normal';
  if (acidaemic) primary = co2High && !hco3Low ? 'respiratory acidosis' : hco3Low ? 'metabolic acidosis' : 'mixed';
  else if (alkalaemic) primary = co2Low && !hco3High ? 'respiratory alkalosis' : hco3High ? 'metabolic alkalosis' : 'mixed';
  else if (co2High && hco3High) primary = 'respiratory acidosis';
  else if (co2Low && hco3Low) primary = 'respiratory alkalosis';
  else if (co2High || co2Low || hco3High || hco3Low) primary = 'mixed';

  // Both the respiratory and metabolic axes deranged in opposing directions.
  if (acidaemic && co2High && hco3Low) primary = 'mixed';
  if (alkalaemic && co2Low && hco3High) primary = 'mixed';

  let compensation: AcidBase['compensation'] = 'not-assessable';
  let narrative = '';

  if (primary === 'metabolic acidosis') {
    // Winter's formula, converted to kPa.
    const expected = (1.5 * hco3 + 8) * KPA_PER_MMHG;
    const tol = 2 * KPA_PER_MMHG;
    compensation = paco2 > expected + tol ? 'inadequate' : paco2 < expected - tol ? 'excessive' : 'appropriate';
    narrative =
      `Expected PaCO₂ by Winter's formula is ${fmt(expected, 1)} kPa (±${fmt(tol, 1)}); measured ${fmt(paco2, 1)} kPa. ` +
      (compensation === 'appropriate'
        ? 'Respiratory compensation is appropriate.'
        : compensation === 'inadequate'
          ? 'PaCO₂ is higher than expected, indicating an additional respiratory acidosis — the patient may be tiring.'
          : 'PaCO₂ is lower than expected, indicating a concurrent respiratory alkalosis.');
  } else if (primary === 'metabolic alkalosis') {
    const expected = (0.7 * hco3 + 20) * KPA_PER_MMHG;
    const tol = 5 * KPA_PER_MMHG;
    compensation = paco2 > expected + tol ? 'excessive' : paco2 < expected - tol ? 'inadequate' : 'appropriate';
    narrative = `Expected PaCO₂ is approximately ${fmt(expected, 1)} kPa; measured ${fmt(paco2, 1)} kPa.`;
  } else if (primary === 'respiratory acidosis') {
    const excessCo2mmHg = (paco2 - 5.3) / KPA_PER_MMHG;
    const acuteExpected = 24 + (1 * excessCo2mmHg) / 10;
    const chronicExpected = 24 + (3.5 * excessCo2mmHg) / 10;
    compensation = hco3 >= chronicExpected - 2 ? 'appropriate' : hco3 <= acuteExpected + 2 ? 'none' : 'inadequate';
    narrative =
      `Acute compensation would give a bicarbonate of about ${fmt(acuteExpected, 0)} mmol/L and full chronic compensation about ${fmt(chronicExpected, 0)} mmol/L; measured ${fmt(hco3, 1)} mmol/L. ` +
      (compensation === 'appropriate'
        ? 'This suggests a chronic or partially compensated process.'
        : compensation === 'none'
          ? 'This suggests an acute respiratory acidosis with little metabolic compensation.'
          : 'This suggests an acute-on-chronic picture.');
  } else if (primary === 'respiratory alkalosis') {
    const deficitmmHg = (5.3 - paco2) / KPA_PER_MMHG;
    const acuteExpected = 24 - (2 * deficitmmHg) / 10;
    const chronicExpected = 24 - (5 * deficitmmHg) / 10;
    compensation = hco3 <= chronicExpected + 2 ? 'appropriate' : hco3 >= acuteExpected - 2 ? 'none' : 'inadequate';
    narrative = `Acute compensation would give a bicarbonate of about ${fmt(acuteExpected, 0)} mmol/L, chronic about ${fmt(chronicExpected, 0)} mmol/L; measured ${fmt(hco3, 1)} mmol/L.`;
  } else if (primary === 'normal') {
    narrative = 'pH, PaCO₂ and bicarbonate are all within the reference intervals; a compensated mixed disorder cannot be excluded on these values alone.';
  } else {
    narrative = 'The respiratory and metabolic axes are deranged in opposing directions, indicating a mixed acid–base disorder.';
  }

  return { primary, compensation, narrative };
}

export function analyseAbg(ctx: ClinicalContext): ModuleResult {
  const findings: Finding[] = [];
  const derived: ModuleResult['derived'] = {};
  const p = ctx.patient;

  const ph = ctx.v('ph');
  const paco2 = ctx.v('paco2');
  const pao2 = ctx.v('pao2');
  const hco3 = ctx.v('hco3');
  const be = ctx.v('baseExcess');
  const lac = ctx.v('lactate');
  const sao2 = ctx.v('sao2');
  const fio2 = ctx.v('fio2');
  const na = ctx.v('na');
  const cl = ctx.v('cl');
  const alb = ctx.v('albumin');
  const glu = ctx.v('glucose');
  const cohb = ctx.v('cohb');
  const methb = ctx.v('methb');

  const ab = interpretAcidBase(ph, paco2, hco3);
  if (ab) {
    derived.acidBase = {
      label: 'Acid–base interpretation',
      value: ab.primary === 'normal' ? 'No primary acid–base disturbance' : ab.primary.replace(/^./, (c) => c.toUpperCase()),
      note: ab.narrative,
    };
  }

  // Anion gap on the gas sample.
  let ag: number | null = null;
  if (na !== null && cl !== null && hco3 !== null) {
    ag = na - (cl + hco3);
    const agc = alb !== null ? ag + 0.25 * (40 - alb) : ag;
    derived.anionGapAbg = {
      label: 'Anion gap (gas sample)',
      value: `${fmt(ag, 1)} mmol/L${alb !== null ? ` (albumin-corrected ${fmt(agc, 1)})` : ''}`,
      note: agc > 16 ? 'Raised anion gap — consider lactate, ketones, uraemia, toxic alcohols, salicylate' : 'Normal anion gap',
    };
  }

  // Oxygenation indices.
  if (pao2 !== null && fio2 !== null && fio2 > 0) {
    const pf = pao2 / (fio2 / 100);
    derived.pfRatio = {
      label: 'PaO₂ / FiO₂ ratio',
      value: `${fmt(pf, 0)} kPa (${fmt(pf / KPA_PER_MMHG, 0)} mmHg)`,
      note: pf < 13.3 ? 'Severe hypoxaemic respiratory failure (ARDS severe range)' : pf < 26.6 ? 'Moderate impairment of oxygenation' : pf < 40 ? 'Mild impairment of oxygenation' : 'Within the normal range',
    };
    const pAO2 = (fio2 / 100) * (101.3 - 6.3) - (paco2 ?? 5.3) / 0.8;
    const aa = pAO2 - pao2;
    const expectedAa = ((p.age ?? 40) / 4 + 4) * KPA_PER_MMHG;
    derived.aaGradient = {
      label: 'Alveolar–arterial oxygen gradient',
      value: `${fmt(aa, 1)} kPa`,
      note: `Age-predicted upper limit approximately ${fmt(expectedAa, 1)} kPa. ${aa > expectedAa ? 'A raised gradient indicates a gas exchange abnormality (V/Q mismatch, shunt or diffusion defect) rather than pure hypoventilation.' : 'A normal gradient with hypoxaemia points to hypoventilation or a low inspired oxygen fraction.'}`,
    };
  }

  // ── ACIDAEMIA / ALKALAEMIA ───────────────────────────────────────────
  if (ph !== null && ph < 7.35) {
    const sev: Severity = ph < 7.10 ? 'life-threatening' : ph < 7.20 ? 'critical' : ph < 7.30 ? 'significant' : 'moderate';
    const raisedGap = ag !== null && ag + (alb !== null ? 0.25 * (40 - alb) : 0) > 16;
    findings.push(finding({
      id: 'abg.acidaemia',
      module: 'abg',
      title: `Acidaemia — ${ab?.primary ?? 'undetermined primary disorder'}`,
      severity: sev,
      interpretation:
        `pH ${fmt(ph, 2)} with PaCO₂ ${fmt(paco2, 1)} kPa and bicarbonate ${fmt(hco3, 1)} mmol/L. ${ab?.narrative ?? ''}` +
        (raisedGap ? ' The anion gap is raised, which narrows the differential considerably.' : ag !== null ? ' The anion gap is normal, favouring bicarbonate loss or a hyperchloraemic cause.' : '') +
        (lac !== null && lac > 2 ? ` Lactate is ${fmt(lac, 1)} mmol/L.` : ''),
      basis: uniq(['ph', paco2 !== null ? 'paco2' : '', hco3 !== null ? 'hco3' : '', lac !== null ? 'lactate' : '']),
      differentials: raisedGap
        ? ['Lactic acidosis — sepsis, hypoperfusion, ischaemic bowel, metformin, thiamine deficiency', 'Ketoacidosis — diabetic, alcoholic, starvation', 'Renal failure (uraemic acidosis)', 'Toxic alcohols — methanol, ethylene glycol', 'Salicylate poisoning', 'Pyroglutamic acidosis (chronic paracetamol)']
        : ab?.primary === 'respiratory acidosis'
          ? ['Type 2 respiratory failure — COPD, neuromuscular weakness, chest wall disease', 'Opioid or sedative toxicity', 'Airway obstruction', 'Exhaustion in severe asthma (a pre-terminal sign)', 'Central hypoventilation']
          : ['Gastrointestinal bicarbonate loss — diarrhoea, high-output stoma, pancreatic fistula', 'Renal tubular acidosis', 'Excessive 0.9% sodium chloride administration (hyperchloraemic acidosis)', 'Carbonic anhydrase inhibitors', 'Ureteric diversion'],
      investigations: uniq([
        lac === null ? 'Serum lactate' : '',
        raisedGap ? 'Ketones (capillary or serum), renal function, osmolar gap, salicylate level' : 'Urinary anion gap and urine pH to differentiate renal from gastrointestinal bicarbonate loss',
        ab?.primary === 'respiratory acidosis' ? 'Chest radiograph, assessment of conscious level and respiratory effort, and consideration of non-invasive ventilation' : '',
        'Full blood count, renal function and glucose',
        'Identify and treat the underlying cause — acidosis is a consequence, not a diagnosis',
      ]),
      implications: [
        ph < 7.20 ? 'Severe acidaemia impairs myocardial contractility, reduces the response to catecholamines and predisposes to arrhythmia. Senior and critical care review is indicated.' : '',
        ab?.compensation === 'inadequate' ? 'Compensation is inadequate, which may signal exhaustion or an additional disorder — reassess frequently.' : '',
        'Acidaemia shifts potassium extracellularly; the potassium may fall abruptly with correction.',
      ].filter(Boolean),
      monitoring: [ph < 7.20 ? 'Repeat blood gas within 30–60 minutes and after each intervention' : 'Repeat blood gas within 1–2 hours', 'Continuous monitoring of respiratory rate, conscious level and saturations'],
      guidance: [
        'Treat the underlying cause. Sodium bicarbonate is not routinely indicated in lactic acidosis and may be considered only in specific circumstances such as severe hyperkalaemia or certain poisonings.',
        ab?.primary === 'respiratory acidosis' ? 'Non-invasive ventilation is indicated for acute hypercapnic respiratory failure with a pH below 7.35 despite maximal medical therapy.' : '',
      ].filter(Boolean),
      tags: ['acidaemia', raisedGap ? 'raised-anion-gap' : '', ab?.primary === 'respiratory acidosis' ? 'type2-respiratory-failure' : '', ph < 7.20 ? 'critical' : ''],
    }));
  }

  if (ph !== null && ph > 7.45) {
    findings.push(finding({
      id: 'abg.alkalaemia',
      module: 'abg',
      title: `Alkalaemia — ${ab?.primary ?? 'undetermined primary disorder'}`,
      severity: ph > 7.60 ? 'critical' : ph > 7.55 ? 'significant' : 'moderate',
      interpretation: `pH ${fmt(ph, 2)} with PaCO₂ ${fmt(paco2, 1)} kPa and bicarbonate ${fmt(hco3, 1)} mmol/L. ${ab?.narrative ?? ''}`,
      basis: uniq(['ph', paco2 !== null ? 'paco2' : '', hco3 !== null ? 'hco3' : '']),
      differentials: ab?.primary === 'respiratory alkalosis'
        ? ['Anxiety or pain with hyperventilation', 'Hypoxaemia of any cause', 'Pulmonary embolism', 'Sepsis (early)', 'Salicylate toxicity', 'Hepatic failure', 'Pregnancy', 'Central nervous system disease', 'Excessive mechanical ventilation']
        : ['Vomiting or nasogastric aspiration', 'Diuretic therapy', 'Hypokalaemia', 'Hyperaldosteronism, Cushing syndrome, liquorice', 'Excess alkali administration', 'Post-hypercapnic alkalosis'],
      investigations: ['Potassium, chloride and magnesium', 'Urinary chloride to separate saline-responsive from saline-resistant metabolic alkalosis', 'Consider salicylate level and pulmonary embolism where respiratory alkalosis is unexplained'],
      implications: ['Alkalaemia reduces ionised calcium and can cause paraesthesiae, tetany and arrhythmia; it also shifts potassium intracellularly.'],
      monitoring: ['Repeat gas and electrolytes after intervention'],
      guidance: ['Saline-responsive metabolic alkalosis (urinary chloride below 20 mmol/L) is corrected by volume and chloride repletion with potassium replacement.'],
      tags: ['alkalaemia'],
    }));
  }

  // ── OXYGENATION ──────────────────────────────────────────────────────
  if (pao2 !== null && pao2 < 10.6) {
    const sev: Severity = pao2 < 6 ? 'life-threatening' : pao2 < 8 ? 'critical' : 'significant';
    findings.push(finding({
      id: 'abg.hypoxaemia',
      module: 'abg',
      title: pao2 < 8 ? 'Severe hypoxaemia — respiratory failure' : 'Hypoxaemia',
      severity: sev,
      interpretation:
        `PaO₂ ${fmt(pao2, 1)} kPa${fio2 !== null ? ` on FiO₂ ${fmt(fio2, 0)}%` : ''}${sao2 !== null ? `, saturations ${fmt(sao2, 0)}%` : ''}.` +
        (pao2 < 8 ? ' A PaO₂ below 8 kPa breathing air defines respiratory failure.' : '') +
        (paco2 !== null && paco2 > 6.0 ? ' The raised PaCO₂ indicates type 2 (hypercapnic) respiratory failure.' : paco2 !== null ? ' The PaCO₂ is not raised, indicating type 1 (hypoxaemic) respiratory failure.' : ''),
      basis: uniq(['pao2', sao2 !== null ? 'sao2' : '', paco2 !== null ? 'paco2' : '']),
      differentials: ['Pneumonia', 'Pulmonary oedema', 'Pulmonary embolism', 'COPD or asthma exacerbation', 'Pneumothorax', 'Atelectasis', 'ARDS', 'Interstitial lung disease', 'Right-to-left shunt'],
      investigations: ['Chest radiograph', 'ECG', 'Full blood count, CRP, renal function', 'CT pulmonary angiography if embolism is suspected', 'Echocardiography where cardiac failure or shunt is possible'],
      implications: [
        'Requires controlled oxygen therapy titrated to a target saturation range — 94–98% for most patients, or 88–92% for those at risk of hypercapnic respiratory failure.',
        pao2 < 8 ? 'Escalate to senior and critical care review; consider respiratory support.' : '',
      ].filter(Boolean),
      monitoring: ['Continuous pulse oximetry', 'Repeat blood gas after any change in oxygen delivery, typically within 30–60 minutes'],
      guidance: ['Prescribe oxygen to a target saturation range and document it on the drug chart.'],
      tags: ['hypoxaemia', paco2 !== null && paco2 > 6 ? 'type2-respiratory-failure' : 'type1-respiratory-failure'],
    }));
  }

  if (lac !== null && lac > 2) {
    findings.push(finding({
      id: 'abg.lactate',
      module: 'abg',
      title: lac > 4 ? 'Significant hyperlactataemia' : 'Raised lactate',
      severity: lac > 10 ? 'life-threatening' : lac > 4 ? 'critical' : 'significant',
      interpretation:
        `Lactate ${fmt(lac, 1)} mmol/L.` +
        (lac > 4 ? ' A lactate above 4 mmol/L in the context of suspected infection identifies a high-risk patient and mandates immediate resuscitation and senior review.' : ' A modestly raised lactate is non-specific but should prompt assessment of perfusion.'),
      basis: uniq(['lactate', ph !== null ? 'ph' : '']),
      differentials: ['Type A — tissue hypoperfusion: sepsis, shock, ischaemic bowel, severe hypoxaemia', 'Type B — metformin, alcohol, thiamine deficiency, liver failure, malignancy, seizures, beta-agonists'],
      investigations: ['Repeat lactate after resuscitation', 'Full septic screen and source identification', 'Assess perfusion — capillary refill, urine output, mentation', 'Consider imaging for mesenteric ischaemia where abdominal signs are present', 'Medication review including metformin'],
      implications: ['Persistent or rising lactate despite resuscitation is associated with substantially increased mortality and indicates inadequate source control or ongoing hypoperfusion.'],
      monitoring: ['Repeat lactate within 2 hours of the initial value and after each resuscitation intervention', 'Hourly urine output'],
      guidance: ['Lactate clearance is a recognised marker of resuscitation adequacy in sepsis; a failure to clear should trigger reassessment and escalation.'],
      tags: ['hyperlactataemia', lac > 4 ? 'shock-risk' : '', 'sepsis-pattern'],
    }));
  }

  if (cohb !== null && cohb > 5) {
    findings.push(finding({
      id: 'abg.cohb',
      module: 'abg',
      title: 'Raised carboxyhaemoglobin',
      severity: cohb > 25 ? 'life-threatening' : cohb > 15 ? 'critical' : 'significant',
      interpretation: `Carboxyhaemoglobin ${fmt(cohb, 1)}%. Pulse oximetry is falsely reassuring in carbon monoxide poisoning because it cannot distinguish carboxyhaemoglobin from oxyhaemoglobin.`,
      basis: ['cohb'],
      differentials: ['Carbon monoxide exposure — faulty heating, fire, exhaust fumes', 'Heavy smoking (typically up to 10%)', 'Methylene chloride exposure'],
      investigations: ['Detailed exposure history including other household members', 'ECG and troponin', 'Consider CT head if neurological signs persist'],
      implications: ['Delayed neuropsychiatric sequelae may occur days to weeks after apparent recovery.'],
      monitoring: ['Serial carboxyhaemoglobin during treatment', 'Neurological observation'],
      guidance: ['Give high-flow oxygen through a non-rebreathe mask; discuss hyperbaric oxygen with the local toxicology service in severe poisoning, pregnancy or neurological involvement.'],
      tags: ['co-poisoning'],
    }));
  }

  if (methb !== null && methb > 3) {
    findings.push(finding({
      id: 'abg.methb',
      module: 'abg',
      title: 'Raised methaemoglobin',
      severity: methb > 30 ? 'life-threatening' : methb > 20 ? 'critical' : 'significant',
      interpretation: `Methaemoglobin ${fmt(methb, 1)}%. Characteristic features are cyanosis unresponsive to oxygen with a saturation gap between pulse oximetry and the arterial blood gas.`,
      basis: ['methb'],
      differentials: ['Drugs — dapsone, local anaesthetics (prilocaine, benzocaine), nitrates, primaquine', 'Nitrite exposure', 'Congenital methaemoglobinaemia'],
      investigations: ['Medication and exposure review', 'G6PD status before considering methylene blue'],
      implications: ['Methylene blue is contraindicated in G6PD deficiency and may precipitate haemolysis.'],
      monitoring: ['Serial methaemoglobin levels'],
      guidance: ['Discuss with toxicology; methylene blue 1–2 mg/kg is the specific treatment for symptomatic or severe methaemoglobinaemia.'],
      tags: ['methaemoglobinaemia'],
    }));
  }

  const analytes = ctx.moduleAnalytes('abg');
  const present = analytes.length > 0;
  const titles = uniq(findings.map((f) => f.title));

  return {
    module: 'abg',
    present,
    analytes,
    observations: ctx.moduleObservations('abg'),
    findings,
    summary: !present
      ? 'No blood gas data available.'
      : titles.length ? `${titles.join('; ')}.` : 'Blood gas parameters are within the reference intervals applied.',
    severity: rollUp(findings.map((f) => f.severity)),
    derived,
  };
}
