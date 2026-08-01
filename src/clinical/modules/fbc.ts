/**
 * FULL BLOOD COUNT ANALYSIS MODULE
 *
 * Classifies anaemia by red cell indices, characterises white cell and platelet
 * abnormalities, and recognises composite patterns (sepsis, marrow suppression,
 * acute blood loss, anaemia of chronic disease, pancytopenia).
 */
import type { ClinicalContext } from '../context';
import { uniq } from '../context';
import { fmt } from '../units';
import type { Finding, ModuleResult, Severity } from '../types';
import { finding, maxSeverity } from '../types';
import { rollUp } from '../severity';

export function analyseFbc(ctx: ClinicalContext): ModuleResult {
  const findings: Finding[] = [];
  const derived: ModuleResult['derived'] = {};
  const p = ctx.patient;

  const hb = ctx.v('hb');
  const mcv = ctx.v('mcv');
  const mch = ctx.v('mch');
  const rdw = ctx.v('rdw');
  const wbc = ctx.v('wbc');
  const neut = ctx.v('neut');
  const lymph = ctx.v('lymph');
  const mono = ctx.v('mono');
  const eos = ctx.v('eos');
  const plt = ctx.v('plt');
  const retic = ctx.v('retic');
  const ferritin = ctx.v('ferritin');
  const tsat = ctx.v('tsat');
  const b12 = ctx.v('b12');
  const folate = ctx.v('folate');
  const crp = ctx.v('crp');
  const ig = ctx.v('ig');
  const bands = ctx.v('bands');
  const nrbc = ctx.v('nrbc');
  const blasts = ctx.v('blasts');

  const hbLow = ctx.low('hb');
  const anaemic = hbLow && hb !== null;

  // ── Derived indices ──────────────────────────────────────────────────
  if (neut !== null && lymph !== null && lymph > 0) {
    const nlr = neut / lymph;
    derived.nlr = {
      label: 'Neutrophil : Lymphocyte Ratio',
      value: fmt(nlr, 1),
      note: nlr > 9 ? 'Markedly raised — consistent with significant physiological stress or bacterial infection'
        : nlr > 5 ? 'Raised — non-specific marker of inflammatory stress' : 'Within usual range',
    };
  }
  if (hb !== null && ctx.v('hct') !== null && ctx.v('rbc') !== null) {
    derived.indicesConsistency = {
      label: 'Red cell index consistency',
      value: Math.abs((ctx.v('hct')! / 3) - hb) < 2.0 ? 'Consistent' : 'Check — Hb/PCV discordant',
      note: 'PCV should approximate 3 × haemoglobin (g/dL); discordance may indicate a sampling or transcription issue.',
    };
  }

  // ── ANAEMIA + MORPHOLOGICAL CLASSIFICATION ───────────────────────────
  if (anaemic) {
    const sev: Severity =
      hb! < 5 ? 'life-threatening' :
      hb! < 7 ? 'critical' :
      hb! < 8 ? 'significant' :
      hb! < 10 ? 'moderate' : 'minor';
    const grade = hb! < 8 ? 'severe' : hb! < 10 ? 'moderate' : 'mild';

    let morphology = 'Normocytic';
    if (mcv !== null && mcv < 80) morphology = 'Microcytic';
    else if (mcv !== null && mcv > 100) morphology = 'Macrocytic';

    const hypo = mch !== null && mch < 27 ? ' hypochromic' : '';

    findings.push(finding({
      id: 'fbc.anaemia',
      module: 'fbc',
      title: `${morphology}${hypo} anaemia — ${grade}`,
      severity: sev,
      interpretation:
        `Haemoglobin ${fmt(hb, 1)} g/dL is below the reference interval for this patient` +
        (mcv !== null ? `, with an MCV of ${fmt(mcv, 1)} fL indicating a ${morphology.toLowerCase()} picture` : '') +
        `. This represents ${grade} anaemia.` +
        (hb! < 7 ? ' Haemoglobin at this level warrants urgent clinical assessment and consideration of transfusion in the context of symptoms, ongoing losses and comorbidity.' : ''),
      basis: uniq(['hb', mcv !== null ? 'mcv' : '', mch !== null ? 'mch' : '']),
      differentials:
        morphology === 'Microcytic'
          ? ['Iron deficiency (blood loss, poor intake, malabsorption)', 'Thalassaemia trait', 'Anaemia of chronic disease (late)', 'Sideroblastic anaemia', 'Lead exposure']
          : morphology === 'Macrocytic'
            ? ['Vitamin B12 deficiency', 'Folate deficiency', 'Alcohol excess', 'Hypothyroidism', 'Liver disease', 'Myelodysplastic syndrome', 'Drug effect (methotrexate, hydroxycarbamide, zidovudine)', 'Reticulocytosis from haemolysis or recent bleeding']
            : ['Acute blood loss', 'Anaemia of chronic disease', 'Renal anaemia (erythropoietin deficiency)', 'Haemolysis', 'Bone marrow infiltration or failure', 'Mixed deficiency', 'Dilutional anaemia'],
      investigations: uniq([
        morphology === 'Microcytic' && ferritin === null ? 'Iron studies: ferritin, serum iron, transferrin saturation, TIBC' : '',
        morphology === 'Macrocytic' && b12 === null ? 'Vitamin B12 and folate' : '',
        morphology === 'Macrocytic' ? 'Thyroid function, liver function, alcohol history' : '',
        retic === null ? 'Reticulocyte count to separate hypoproliferative from haemolytic/blood-loss anaemia' : '',
        'Blood film examination',
        morphology === 'Normocytic' ? 'Renal function, inflammatory markers, haemolysis screen (LDH, haptoglobin, bilirubin, DCT)' : '',
        'Assess for overt or occult gastrointestinal blood loss',
        p.sex === 'female' && (p.age ?? 99) < 55 ? 'Menstrual and obstetric history' : '',
      ]),
      implications: uniq([
        hb! < 8 ? 'Reduced oxygen-carrying capacity — poor tolerance of further blood loss or physiological stress' : 'May contribute to fatigue, dyspnoea and reduced exercise tolerance',
        p.plannedSurgery ? 'Pre-operative anaemia is an independent predictor of transfusion and of adverse perioperative outcome — address before elective surgery where possible' : '',
        hb! < 7 ? 'Consider red cell transfusion, guided by symptoms and restrictive transfusion thresholds rather than the number alone' : '',
      ]),
      monitoring: uniq([
        hb! < 8 ? 'Repeat FBC within 12–24 hours, or sooner if active bleeding is suspected' : 'Repeat FBC in 1–2 weeks, or per clinical course',
        'Monitor haemodynamic status and symptoms of anaemia',
        'Document trend rather than reacting to a single value',
      ]),
      guidance: [
        'Restrictive transfusion thresholds (commonly 70 g/L, or 80 g/L in acute coronary syndrome or chronic cardiovascular disease) are supported by current transfusion guidance for stable patients.',
        'Investigate the cause of anaemia rather than treating the number alone; iron replacement without a cause is inappropriate in adults.',
      ],
      tags: ['anaemia', `anaemia:${morphology.toLowerCase()}`, hb! < 8 ? 'anaemia:severe' : 'anaemia:nonsevere'],
    }));

    // Iron deficiency pattern
    const irondef =
      (mcv !== null && mcv < 80 && mch !== null && mch < 27) ||
      (ferritin !== null && ferritin < 30) ||
      (tsat !== null && tsat < 20 && ferritin !== null && ferritin < 100);
    if (irondef) {
      findings.push(finding({
        id: 'fbc.irondeficiency',
        module: 'fbc',
        title: 'Iron deficiency pattern',
        severity: 'moderate',
        interpretation:
          'The combination of ' +
          uniq([
            mcv !== null && mcv < 80 ? `low MCV (${fmt(mcv, 1)} fL)` : '',
            mch !== null && mch < 27 ? `low MCH (${fmt(mch, 1)} pg)` : '',
            rdw !== null && rdw > 14.5 ? `raised RDW (${fmt(rdw, 1)}%)` : '',
            ferritin !== null && ferritin < 30 ? `low ferritin (${fmt(ferritin, 0)} µg/L)` : '',
            tsat !== null && tsat < 20 ? `low transferrin saturation (${fmt(tsat, 0)}%)` : '',
          ]).join(', ') +
          ' is consistent with iron deficiency. In adults iron deficiency is a symptom, not a diagnosis — a source of blood loss should be sought.',
        basis: uniq(['mcv', 'mch', rdw !== null ? 'rdw' : '', ferritin !== null ? 'ferritin' : '', tsat !== null ? 'tsat' : '']),
        differentials: ['Gastrointestinal blood loss (including occult malignancy)', 'Menstrual loss', 'Malabsorption including coeliac disease', 'Dietary insufficiency', 'Chronic haematuria', 'Frequent phlebotomy in inpatients'],
        investigations: uniq([
          ferritin === null ? 'Ferritin (with CRP — ferritin is an acute phase reactant and may be falsely normal in inflammation)' : '',
          'Coeliac serology',
          'Faecal immunochemical testing / consideration of upper and lower GI endoscopy in adults',
          'Urinalysis for haematuria',
        ]),
        implications: [
          'Iron deficiency without an identified source in an adult mandates investigation for gastrointestinal blood loss.',
          crp !== null && crp > 10 ? 'CRP is raised — ferritin may be falsely elevated; interpret iron studies with caution and consider transferrin saturation.' : '',
        ].filter(Boolean),
        monitoring: ['Recheck FBC and ferritin 4 weeks after commencing replacement, then at 3 months', 'Expect a haemoglobin rise of approximately 1–2 g/dL over 4 weeks with adequate oral replacement'],
        guidance: [
          'Oral iron given on alternate days improves fractional absorption and tolerability compared with multiple daily doses.',
          'Intravenous iron is appropriate where oral iron is not tolerated, absorption is impaired, or rapid correction is needed (for example before surgery).',
        ],
        tags: ['iron-deficiency'],
      }));
    }

    // B12 / folate pattern
    const macro = mcv !== null && mcv > 100;
    if (macro || (b12 !== null && b12 < 200) || (folate !== null && folate < 3)) {
      findings.push(finding({
        id: 'fbc.b12folate',
        module: 'fbc',
        title: 'Possible vitamin B12 / folate deficiency pattern',
        severity: (b12 !== null && b12 < 150) || (mcv !== null && mcv > 115) ? 'significant' : 'moderate',
        interpretation:
          uniq([
            macro ? `Macrocytosis (MCV ${fmt(mcv, 1)} fL)` : '',
            b12 !== null && b12 < 200 ? `low vitamin B12 (${fmt(b12, 0)} ng/L)` : '',
            folate !== null && folate < 3 ? `low folate (${fmt(folate, 1)} µg/L)` : '',
          ]).join(' with ') +
          ' raises the possibility of megaloblastic anaemia. Hypersegmented neutrophils on the blood film would support this.',
        basis: uniq([macro ? 'mcv' : '', b12 !== null ? 'b12' : '', folate !== null ? 'folate' : '']),
        differentials: ['Pernicious anaemia', 'Dietary B12 deficiency (vegan diet)', 'Metformin or proton pump inhibitor therapy', 'Terminal ileal disease or resection', 'Folate deficiency (alcohol, poor intake, pregnancy, haemolysis, methotrexate)', 'Myelodysplasia', 'Hypothyroidism'],
        investigations: uniq([
          b12 === null ? 'Serum vitamin B12' : '',
          folate === null ? 'Serum and red cell folate' : '',
          'Blood film for hypersegmented neutrophils and oval macrocytes',
          'Intrinsic factor antibodies if B12 is low',
          'Thyroid function tests',
          'Lactate dehydrogenase and bilirubin (ineffective erythropoiesis raises both)',
        ]),
        implications: [
          'Untreated B12 deficiency can cause irreversible subacute combined degeneration of the cord — neurological features may precede anaemia.',
          'Replace B12 before folate where both are deficient, to avoid precipitating neurological deterioration.',
        ],
        monitoring: ['Reticulocyte response at 1 week after starting replacement', 'Repeat FBC at 8 weeks to confirm normalisation'],
        guidance: ['Where deficiency is confirmed, treat according to national haematology guidance; do not treat borderline results in isolation without supporting evidence.'],
        tags: ['macrocytosis', 'b12-folate'],
      }));
    }

    // Anaemia of chronic disease / inflammation
    if (!irondef && mcv !== null && mcv >= 80 && mcv <= 100 && ((crp !== null && crp > 20) || (ferritin !== null && ferritin > 100 && tsat !== null && tsat < 20))) {
      findings.push(finding({
        id: 'fbc.chronicdisease',
        module: 'fbc',
        title: 'Possible anaemia of chronic disease / inflammation',
        severity: 'moderate',
        interpretation:
          'Normocytic anaemia in the presence of an active inflammatory response is characteristic of anaemia of chronic disease, in which iron is sequestered and erythropoiesis is blunted by inflammatory cytokines.',
        basis: uniq(['hb', 'mcv', crp !== null ? 'crp' : '', ferritin !== null ? 'ferritin' : '']),
        differentials: ['Chronic infection', 'Malignancy', 'Autoimmune / connective tissue disease', 'Chronic kidney disease', 'Coexisting iron deficiency (mixed picture)'],
        investigations: ['Transferrin saturation and soluble transferrin receptor to separate from true iron deficiency', 'Renal function', 'Screen for an underlying inflammatory or neoplastic process'],
        implications: ['Anaemia typically improves only with treatment of the underlying condition; iron replacement alone is usually ineffective unless true deficiency coexists.'],
        monitoring: ['Repeat FBC and inflammatory markers with the clinical course'],
        guidance: ['Distinguish from iron deficiency before starting iron: ferritin >100 µg/L with low transferrin saturation favours inflammation.'],
        tags: ['chronic-disease-anaemia'],
      }));
    }
  }

  // ── POLYCYTHAEMIA ────────────────────────────────────────────────────
  if (ctx.high('hb') || ctx.high('hct')) {
    const sev = maxSeverity(ctx.severityOf('hb'), ctx.severityOf('hct'));
    findings.push(finding({
      id: 'fbc.polycythaemia',
      module: 'fbc',
      title: 'Polycythaemia (raised haemoglobin / haematocrit)',
      severity: maxSeverity(sev, 'moderate'),
      interpretation:
        `Haemoglobin ${fmt(hb, 1)} g/dL${ctx.v('hct') !== null ? ` and PCV ${fmt(ctx.v('hct'), 1)}%` : ''} are above the reference interval. This may be an absolute erythrocytosis or a relative (apparent) polycythaemia due to reduced plasma volume.`,
      basis: uniq(['hb', 'hct']),
      differentials: ['Dehydration / relative polycythaemia', 'Chronic hypoxia (COPD, obstructive sleep apnoea, high altitude, cyanotic heart disease)', 'Smoking', 'Polycythaemia vera', 'Erythropoietin-secreting tumour', 'Testosterone or erythropoietin therapy'],
      investigations: ['Repeat after rehydration', 'Erythropoietin level', 'JAK2 V617F mutation analysis', 'Oxygen saturation and consideration of sleep study', 'Abdominal imaging for renal or hepatic lesions'],
      implications: ['Raised haematocrit increases blood viscosity and thrombotic risk, particularly above 0.54 L/L.'],
      monitoring: ['Repeat FBC after correcting volume status', 'Monitor for thrombotic events'],
      guidance: ['Where polycythaemia vera is confirmed, haematocrit is generally maintained below 0.45 L/L alongside cytoreduction and antiplatelet therapy as indicated.'],
      tags: ['polycythaemia', 'thrombotic-risk'],
    }));
  }

  // ── WHITE CELL ABNORMALITIES ─────────────────────────────────────────
  if (ctx.high('wbc')) {
    findings.push(finding({
      id: 'fbc.leucocytosis',
      module: 'fbc',
      title: wbc !== null && wbc > 50 ? 'Marked leucocytosis' : 'Leucocytosis',
      severity: wbc !== null && wbc > 50 ? 'critical' : ctx.severityOf('wbc'),
      interpretation:
        `Total white cell count ${fmt(wbc, 1)} ×10⁹/L is raised.` +
        (neut !== null && neut > 7.5 ? ' The rise is neutrophil-predominant.' : '') +
        (lymph !== null && lymph > 4 ? ' There is an associated lymphocytosis.' : '') +
        (wbc !== null && wbc > 50 ? ' A count at this level requires urgent haematological assessment to exclude a leukaemic process and leucostasis.' : ''),
      basis: uniq(['wbc', neut !== null ? 'neut' : '', lymph !== null ? 'lymph' : '']),
      differentials: ['Bacterial infection', 'Tissue inflammation or necrosis', 'Corticosteroid therapy', 'Physiological stress, trauma, surgery', 'Myeloproliferative neoplasm', 'Acute or chronic leukaemia', 'Post-splenectomy'],
      investigations: uniq([
        'Blood film examination',
        crp === null ? 'C-reactive protein' : '',
        'Cultures (blood, urine, wound) if infection is suspected',
        wbc !== null && wbc > 30 ? 'Urgent haematology referral and consideration of flow cytometry' : '',
      ]),
      implications: [
        wbc !== null && wbc > 100 ? 'Risk of leucostasis with respiratory and neurological compromise — this is a haematological emergency.' : '',
        'Interpret alongside the differential; a raised total count alone does not confirm infection.',
      ].filter(Boolean),
      monitoring: ['Repeat FBC with differential to establish a trend', 'Monitor temperature and observations'],
      guidance: ['Correlate with clinical findings and inflammatory markers before attributing leucocytosis to infection.'],
      tags: ['leucocytosis', wbc !== null && wbc > 50 ? 'leukaemoid' : ''],
    }));
  }

  if (ctx.low('wbc')) {
    findings.push(finding({
      id: 'fbc.leucopenia',
      module: 'fbc',
      title: 'Leucopenia',
      severity: ctx.severityOf('wbc'),
      interpretation: `Total white cell count ${fmt(wbc, 1)} ×10⁹/L is below the reference interval, indicating reduced circulating leucocytes.`,
      basis: ['wbc'],
      differentials: ['Viral infection', 'Overwhelming sepsis', 'Drug-induced marrow suppression', 'Bone marrow failure or infiltration', 'Autoimmune disease (SLE, Felty syndrome)', 'Hypersplenism', 'Nutritional deficiency (B12, folate, copper)'],
      investigations: ['Blood film', 'Repeat FBC to confirm', 'Medication review for marrow-suppressive agents', 'Vitamin B12, folate', 'Autoimmune screen if clinically indicated'],
      implications: ['Reduced capacity to mount a response to infection, particularly if the neutrophil count is also low.'],
      monitoring: ['Repeat FBC in 24–72 hours depending on severity and clinical state'],
      guidance: ['Assess the differential — it is the absolute neutrophil count, not the total white count, that determines infection risk.'],
      tags: ['leucopenia'],
    }));
  }

  if (neut !== null && ctx.high('neut')) {
    findings.push(finding({
      id: 'fbc.neutrophilia',
      module: 'fbc',
      title: 'Neutrophilia',
      // Neutrophilia is common and rarely critical in its own right; the
      // composite sepsis pattern carries the urgency instead.
      severity: neut > 25 ? 'critical' : neut > 12 ? 'significant' : 'moderate',
      interpretation:
        `Absolute neutrophil count ${fmt(neut, 2)} ×10⁹/L is raised, most commonly reflecting bacterial infection, tissue injury, inflammation or corticosteroid effect.` +
        ((ig !== null && ig > 0.5) || (bands !== null && bands > 6) ? ' Immature granulocytes / band forms are present, indicating a left shift and accelerated marrow output.' : ''),
      basis: uniq(['neut', ig !== null ? 'ig' : '', bands !== null ? 'bands' : '']),
      differentials: ['Bacterial infection', 'Tissue necrosis (infarction, burns, surgery)', 'Corticosteroids or G-CSF', 'Acute stress response', 'Chronic myeloid leukaemia', 'Smoking', 'Pregnancy'],
      investigations: ['C-reactive protein and/or procalcitonin', 'Cultures directed by clinical site', 'Blood film if the count is markedly raised or left-shifted'],
      implications: ['Supports an active inflammatory or infective process — correlate with the clinical picture and localising signs.'],
      monitoring: ['Serial FBC and inflammatory markers to assess response to treatment'],
      guidance: ['A left shift with toxic granulation supports bacterial sepsis but is not diagnostic in isolation.'],
      tags: ['neutrophilia', (ig !== null && ig > 0.5) || (bands !== null && bands > 6) ? 'left-shift' : ''],
    }));
  }

  if (neut !== null && ctx.low('neut')) {
    const sev: Severity = neut < 0.2 ? 'life-threatening' : neut < 0.5 ? 'critical' : neut < 1.0 ? 'significant' : 'moderate';
    findings.push(finding({
      id: 'fbc.neutropenia',
      module: 'fbc',
      title: neut < 0.5 ? 'Severe neutropenia' : 'Neutropenia',
      severity: p.fever && neut < 1.0 ? 'life-threatening' : sev,
      interpretation:
        `Absolute neutrophil count ${fmt(neut, 2)} ×10⁹/L.` +
        (neut < 0.5 ? ' This is severe neutropenia with a high risk of overwhelming bacterial and fungal infection.' : '') +
        (p.fever && neut < 1.0 ? ' In the presence of fever this constitutes neutropenic sepsis until proven otherwise — a medical emergency requiring empirical broad-spectrum antibiotics within one hour.' : ''),
      basis: ['neut'],
      differentials: ['Chemotherapy or other drug-induced marrow suppression', 'Viral infection', 'Overwhelming sepsis with consumption', 'Bone marrow failure or infiltration', 'Autoimmune neutropenia', 'Benign ethnic neutropenia', 'B12/folate deficiency'],
      investigations: uniq([
        p.fever ? 'Blood cultures (peripheral and from any indwelling line) before antibiotics — do not delay treatment' : 'Repeat FBC to confirm and establish trend',
        'Blood film',
        'Medication review',
        'Consider haematology referral and marrow examination if unexplained and persistent',
      ]),
      implications: [
        neut < 0.5 ? 'Protective isolation precautions and prompt treatment of any suspected infection are required.' : 'Increased susceptibility to bacterial infection.',
        p.fever ? 'Neutropenic sepsis carries substantial mortality; time to first antibiotic dose is the key modifiable factor.' : '',
      ].filter(Boolean),
      monitoring: ['Daily FBC while severely neutropenic', 'Four-hourly observations with a sepsis-aware early warning score'],
      guidance: [
        'Neutropenic sepsis: give empirical broad-spectrum antibiotics within one hour of recognition, without waiting for the white count.',
        'Consider G-CSF support in line with local haemato-oncology protocols.',
      ],
      tags: ['neutropenia', neut < 0.5 ? 'neutropenia:severe' : '', p.fever ? 'neutropenic-fever' : ''],
    }));
  }

  if (lymph !== null && ctx.high('lymph')) {
    findings.push(finding({
      id: 'fbc.lymphocytosis',
      module: 'fbc',
      title: 'Lymphocytosis',
      severity: lymph > 20 ? 'significant' : ctx.severityOf('lymph'),
      interpretation: `Absolute lymphocyte count ${fmt(lymph, 2)} ×10⁹/L is raised.` + (lymph > 20 ? ' A sustained lymphocytosis at this level requires exclusion of a lymphoproliferative disorder.' : ''),
      basis: ['lymph'],
      differentials: ['Viral infection (EBV, CMV, hepatitis, HIV seroconversion)', 'Pertussis', 'Toxoplasmosis', 'Chronic lymphocytic leukaemia', 'Lymphoma with a leukaemic phase', 'Post-splenectomy', 'Stress lymphocytosis'],
      investigations: ['Blood film for atypical lymphocytes or smear cells', 'Viral serology as clinically indicated', lymph > 5 ? 'Peripheral blood flow cytometry / immunophenotyping' : ''].filter(Boolean),
      implications: ['A reactive lymphocytosis resolves with the precipitant; a persistent clonal lymphocytosis requires haematology assessment.'],
      monitoring: ['Repeat FBC in 4–6 weeks if the patient is well and the count is modestly raised'],
      guidance: ['Smear cells on the film with a persistent mature lymphocytosis raise the possibility of CLL and warrant immunophenotyping.'],
      tags: ['lymphocytosis'],
    }));
  }

  if (lymph !== null && ctx.low('lymph')) {
    findings.push(finding({
      id: 'fbc.lymphopenia',
      module: 'fbc',
      title: 'Lymphopenia',
      severity: lymph < 0.5 ? 'significant' : ctx.severityOf('lymph'),
      interpretation: `Absolute lymphocyte count ${fmt(lymph, 2)} ×10⁹/L is reduced. Marked lymphopenia is a recognised feature of severe acute infection, corticosteroid therapy and immunodeficiency.`,
      basis: ['lymph'],
      differentials: ['Acute severe infection including viral illness and sepsis', 'Corticosteroid therapy', 'HIV infection', 'Malnutrition', 'Lymphoma / chemotherapy / radiotherapy', 'Autoimmune disease', 'Renal or hepatic failure'],
      investigations: ['Repeat FBC', 'HIV testing where risk factors or unexplained persistence', 'Immunoglobulins and lymphocyte subsets if persistent', 'Medication review'],
      implications: ['Impaired cell-mediated immunity with increased risk of opportunistic infection when persistent and severe.'],
      monitoring: ['Repeat FBC after the acute episode resolves to determine whether the lymphopenia persists'],
      guidance: ['Persistent unexplained lymphopenia should prompt investigation for an underlying immunodeficiency or lymphoproliferative disorder.'],
      tags: ['lymphopenia', p.immunosuppressed ? 'immunosuppressed' : ''],
    }));
  }

  if (eos !== null && ctx.high('eos')) {
    findings.push(finding({
      id: 'fbc.eosinophilia',
      module: 'fbc',
      title: eos > 1.5 ? 'Marked eosinophilia' : 'Eosinophilia',
      severity: eos > 1.5 ? 'significant' : 'minor',
      interpretation: `Absolute eosinophil count ${fmt(eos, 2)} ×10⁹/L is raised.` + (eos > 1.5 ? ' Counts above 1.5 ×10⁹/L risk end-organ eosinophilic infiltration, particularly cardiac.' : ''),
      basis: ['eos'],
      differentials: ['Atopy — asthma, eczema, allergic rhinitis', 'Drug hypersensitivity (including DRESS)', 'Parasitic infection', 'Vasculitis (eosinophilic granulomatosis with polyangiitis)', 'Adrenal insufficiency', 'Hypereosinophilic syndrome', 'Haematological malignancy'],
      investigations: ['Medication review with attention to recently started drugs', 'Stool for ova, cysts and parasites; strongyloides serology where relevant', 'IgE, ANCA if vasculitis suspected', eos > 1.5 ? 'Troponin and echocardiography to assess for eosinophilic cardiac involvement' : ''].filter(Boolean),
      implications: [eos > 1.5 ? 'Sustained marked eosinophilia can cause endomyocardial fibrosis, thromboembolism and neuropathy.' : 'Usually reactive and benign.'],
      monitoring: ['Repeat FBC to determine whether the eosinophilia is transient or sustained'],
      guidance: ['Exclude strongyloides before starting corticosteroids in patients from endemic areas, to avoid hyperinfection syndrome.'],
      tags: ['eosinophilia', 'drug-reaction-possible'],
    }));
  }

  if (mono !== null && ctx.high('mono')) {
    findings.push(finding({
      id: 'fbc.monocytosis',
      module: 'fbc',
      title: 'Monocytosis',
      severity: 'minor',
      interpretation: `Absolute monocyte count ${fmt(mono, 2)} ×10⁹/L is raised, a common feature of chronic inflammation, recovery from marrow suppression and certain chronic infections.`,
      basis: ['mono'],
      differentials: ['Chronic infection (tuberculosis, endocarditis, brucellosis)', 'Recovery phase following neutropenia', 'Chronic inflammatory or autoimmune disease', 'Chronic myelomonocytic leukaemia', 'Malignancy'],
      investigations: ['Blood film', 'Consider infective and inflammatory screen guided by the clinical picture', 'Persistent monocytosis >1 ×10⁹/L for over 3 months warrants haematology assessment'],
      implications: ['Non-specific in isolation; interpret alongside the clinical context and the remainder of the differential.'],
      monitoring: ['Repeat FBC to establish persistence'],
      guidance: ['Persistent monocytosis in older adults should prompt consideration of chronic myelomonocytic leukaemia.'],
      tags: ['monocytosis'],
    }));
  }

  if (blasts !== null && blasts > 0) {
    findings.push(finding({
      id: 'fbc.blasts',
      module: 'fbc',
      title: 'Blast cells reported on differential',
      severity: 'critical',
      interpretation: `Blast cells reported at ${fmt(blasts, 1)}%. Circulating blasts require urgent haematological evaluation to exclude acute leukaemia.`,
      basis: ['blasts'],
      differentials: ['Acute myeloid leukaemia', 'Acute lymphoblastic leukaemia', 'Blast transformation of a chronic myeloproliferative neoplasm', 'Severe marrow stress with leucoerythroblastic response'],
      investigations: ['Urgent blood film review by a haematologist', 'Flow cytometry / immunophenotyping', 'Coagulation screen including fibrinogen and D-dimer (to exclude DIC in acute promyelocytic leukaemia)', 'Bone marrow aspirate and trephine', 'LDH, urate, renal function for tumour lysis risk'],
      implications: ['Potential haematological emergency. Acute promyelocytic leukaemia is associated with life-threatening coagulopathy and requires immediate specialist involvement.'],
      monitoring: ['Continuous clinical monitoring pending haematology review', 'Tumour lysis bloods 6–12 hourly if a high tumour burden is suspected'],
      guidance: ['Discuss with haematology on the same day. Avoid transfusion decisions in isolation where leucostasis is a possibility.'],
      tags: ['blasts', 'haematological-emergency'],
    }));
  }

  if (nrbc !== null && nrbc > 0) {
    findings.push(finding({
      id: 'fbc.nrbc',
      module: 'fbc',
      title: 'Nucleated red cells present',
      severity: 'significant',
      interpretation: `Nucleated red cells reported at ${fmt(nrbc, 1)} per 100 white cells. In adults this is abnormal and, with immature granulocytes, constitutes a leucoerythroblastic film.`,
      basis: uniq(['nrbc', ig !== null ? 'ig' : '']),
      differentials: ['Bone marrow infiltration (metastatic carcinoma, lymphoma, myelofibrosis)', 'Severe sepsis', 'Severe haemolysis', 'Profound hypoxia', 'Massive haemorrhage', 'Post-splenectomy'],
      investigations: ['Blood film review', 'Consider bone marrow examination if the cause is not apparent', 'Imaging for occult malignancy where clinically appropriate'],
      implications: ['Nucleated red cells in critically ill adults are associated with increased mortality and warrant careful assessment.'],
      monitoring: ['Repeat FBC and film'],
      guidance: ['A leucoerythroblastic picture always requires an explanation — discuss with haematology.'],
      tags: ['leucoerythroblastic'],
    }));
  }

  // ── PLATELETS ────────────────────────────────────────────────────────
  if (plt !== null && ctx.low('plt')) {
    const sev: Severity = plt < 10 ? 'life-threatening' : plt < 20 ? 'critical' : plt < 50 ? 'significant' : plt < 100 ? 'moderate' : 'minor';
    findings.push(finding({
      id: 'fbc.thrombocytopenia',
      module: 'fbc',
      title: plt < 50 ? 'Severe thrombocytopenia' : 'Thrombocytopenia',
      severity: sev,
      interpretation:
        `Platelet count ${fmt(plt, 0)} ×10⁹/L.` +
        (plt < 20 ? ' At this level there is a risk of spontaneous haemorrhage, including intracranial bleeding.' : plt < 50 ? ' Invasive procedures and surgery carry a materially increased bleeding risk at this level.' : ' Bleeding risk with normal platelet function is low at this level but the trend matters.') +
        ' Pseudothrombocytopenia from EDTA-induced platelet clumping should be excluded on the film before acting on an unexpected result.',
      basis: ['plt'],
      differentials: ['Sepsis / disseminated intravascular coagulation', 'Immune thrombocytopenia', 'Drug-induced (heparin, many antibiotics, antiepileptics)', 'Bone marrow failure or infiltration', 'Hypersplenism', 'Liver disease with portal hypertension', 'Thrombotic microangiopathy (TTP, HUS)', 'Dilutional following massive transfusion', 'EDTA-induced pseudothrombocytopenia'],
      investigations: uniq([
        'Blood film to exclude platelet clumping and to look for schistocytes',
        'Coagulation screen with fibrinogen and D-dimer',
        'Liver function tests',
        'Medication review — in particular heparin exposure',
        plt < 50 ? 'Consider urgent haematology discussion' : '',
        'LDH, reticulocytes and haptoglobin if a microangiopathy is suspected',
      ]),
      implications: [
        plt < 20 ? 'Consider platelet transfusion for bleeding or before invasive procedures, guided by cause — platelet transfusion is contraindicated in TTP and generally avoided in HIT.' : '',
        p.plannedSurgery ? 'Significant implications for planned surgery — most procedures require a platelet count above 50 ×10⁹/L, and neuraxial anaesthesia typically above 80 ×10⁹/L.' : '',
        'Avoid intramuscular injections, antiplatelet agents and NSAIDs where possible.',
      ].filter(Boolean),
      monitoring: [plt < 50 ? 'Repeat FBC daily or more frequently' : 'Repeat FBC in 24–72 hours', 'Monitor for petechiae, mucosal bleeding and neurological change'],
      guidance: [
        'Schistocytes with thrombocytopenia and anaemia suggest a thrombotic microangiopathy — this is a haematological emergency and platelet transfusion may cause harm.',
        'If heparin-induced thrombocytopenia is suspected, stop all heparin and use an alternative anticoagulant while awaiting testing.',
      ],
      tags: ['thrombocytopenia', plt < 50 ? 'thrombocytopenia:severe' : '', 'bleeding-risk'],
    }));
  }

  if (plt !== null && ctx.high('plt')) {
    findings.push(finding({
      id: 'fbc.thrombocytosis',
      module: 'fbc',
      title: plt > 1000 ? 'Extreme thrombocytosis' : 'Thrombocytosis',
      severity: plt > 1000 ? 'critical' : plt > 600 ? 'significant' : 'minor',
      interpretation:
        `Platelet count ${fmt(plt, 0)} ×10⁹/L is raised. Most thrombocytosis in hospital practice is reactive; a sustained count above 450 ×10⁹/L without an inflammatory cause warrants consideration of a myeloproliferative neoplasm.`,
      basis: ['plt'],
      differentials: ['Reactive — infection, inflammation, tissue damage, surgery', 'Iron deficiency', 'Post-splenectomy or hyposplenism', 'Malignancy', 'Essential thrombocythaemia or other myeloproliferative neoplasm', 'Rebound following marrow suppression'],
      investigations: ['C-reactive protein and ferritin', 'Blood film', plt > 600 ? 'JAK2 V617F, CALR and MPL mutation analysis if reactive causes are excluded' : ''].filter(Boolean),
      implications: [plt > 1000 ? 'Extreme thrombocytosis carries both thrombotic and, paradoxically, bleeding risk through acquired von Willebrand syndrome.' : 'Reactive thrombocytosis alone is not usually an indication for antiplatelet therapy.'],
      monitoring: ['Repeat FBC after resolution of the acute illness to determine whether the count normalises'],
      guidance: ['In confirmed essential thrombocythaemia, treatment is directed by thrombotic risk stratification rather than the platelet count alone.'],
      tags: ['thrombocytosis', plt > 1000 ? 'thrombotic-risk' : ''],
    }));
  }

  // ── COMPOSITE PATTERNS ───────────────────────────────────────────────
  const cytopenias = [
    hb !== null && ctx.low('hb'),
    wbc !== null && ctx.low('wbc'),
    plt !== null && ctx.low('plt'),
  ].filter(Boolean).length;

  if (cytopenias >= 3) {
    findings.push(finding({
      id: 'fbc.pancytopenia',
      module: 'fbc',
      title: 'Pancytopenia',
      severity: 'critical',
      interpretation:
        `Reduction across all three cell lines (Hb ${fmt(hb, 1)} g/dL, WBC ${fmt(wbc, 1)} ×10⁹/L, platelets ${fmt(plt, 0)} ×10⁹/L). Pancytopenia reflects either failure of marrow production, peripheral destruction or sequestration, and always requires an explanation.`,
      basis: ['hb', 'wbc', 'plt'],
      differentials: ['Bone marrow failure — aplastic anaemia, myelodysplasia', 'Marrow infiltration — leukaemia, lymphoma, myeloma, metastatic carcinoma, myelofibrosis', 'Megaloblastic anaemia (B12/folate deficiency)', 'Drug or radiation induced marrow suppression', 'Hypersplenism', 'Overwhelming sepsis', 'Haemophagocytic lymphohistiocytosis', 'Viral infection including HIV and parvovirus B19'],
      investigations: ['Urgent blood film review', 'Reticulocyte count', 'Vitamin B12 and folate', 'Liver function, LDH, ferritin, triglycerides (HLH screen)', 'Viral screen including HIV and hepatitis', 'Bone marrow aspirate and trephine biopsy', 'Urgent haematology referral'],
      implications: ['Combined risk of infection, bleeding and symptomatic anaemia. Neutropenic precautions and bleeding precautions should be considered.'],
      monitoring: ['Daily FBC', 'Close observation for infection and bleeding'],
      guidance: ['Pancytopenia with no obvious reversible cause requires bone marrow examination; do not transfuse indiscriminately before diagnostic samples are taken where the patient is stable.'],
      tags: ['pancytopenia', 'marrow-failure', 'bleeding-risk', 'infection-risk'],
    }));
  } else if (cytopenias === 2) {
    findings.push(finding({
      id: 'fbc.bicytopenia',
      module: 'fbc',
      title: 'Bicytopenia — possible bone marrow suppression pattern',
      severity: 'significant',
      interpretation: 'Two cell lines are reduced. This may represent early marrow suppression, peripheral consumption or a nutritional deficiency, and should be tracked closely.',
      basis: uniq([ctx.low('hb') ? 'hb' : '', ctx.low('wbc') ? 'wbc' : '', ctx.low('plt') ? 'plt' : '']),
      differentials: ['Drug-induced marrow suppression', 'Sepsis', 'B12 or folate deficiency', 'Early marrow infiltration or myelodysplasia', 'Hypersplenism', 'Autoimmune destruction'],
      investigations: ['Blood film', 'Reticulocyte count', 'B12 and folate', 'Medication review', 'Repeat FBC to establish trajectory'],
      implications: ['Progression to pancytopenia would materially change management — track the trend.'],
      monitoring: ['Repeat FBC in 24–72 hours'],
      guidance: ['Persistent unexplained bicytopenia warrants haematology input.'],
      tags: ['marrow-suppression'],
    }));
  }

  // Possible sepsis pattern
  const sepsisSignals = [
    wbc !== null && (wbc > 12 || wbc < 4),
    neut !== null && neut > 7.5,
    ig !== null && ig > 0.5,
    bands !== null && bands > 6,
    plt !== null && plt < 150,
    crp !== null && crp > 100,
    ctx.gt('procalcitonin', 0.5),
    ctx.gt('lactate', 2),
    p.fever,
  ].filter(Boolean).length;

  if (sepsisSignals >= 3) {
    findings.push(finding({
      id: 'fbc.sepsispattern',
      module: 'fbc',
      title: 'Possible sepsis pattern',
      severity: sepsisSignals >= 5 || ctx.gt('lactate', 4) ? 'critical' : 'significant',
      interpretation:
        'The haematological profile shows multiple features associated with a systemic response to infection' +
        uniq([
          wbc !== null && (wbc > 12 || wbc < 4) ? ` (white cell count ${fmt(wbc, 1)} ×10⁹/L` : '',
        ]).join('') +
        (wbc !== null && (wbc > 12 || wbc < 4) ? ')' : '') +
        '. Sepsis is a clinical diagnosis — these findings support, but do not establish, it.',
      basis: uniq(['wbc', neut !== null ? 'neut' : '', plt !== null ? 'plt' : '', crp !== null ? 'crp' : '', ig !== null ? 'ig' : '']),
      differentials: ['Bacterial sepsis', 'Severe localised infection', 'Major tissue injury or postoperative inflammatory response', 'Pancreatitis', 'Non-infective systemic inflammatory response'],
      investigations: ['Blood cultures before antimicrobials', 'Serum lactate', 'Cultures from all plausible sources (urine, wound, sputum, line tips)', 'Imaging directed at the suspected source', 'Full septic screen and source identification'],
      implications: ['Time-critical. Early antimicrobial therapy and source control are the principal determinants of outcome.'],
      monitoring: ['Repeat lactate within 2 hours if initially raised', 'Hourly urine output', 'Continuous or frequent physiological observations with an early warning score'],
      guidance: [
        'Apply the local sepsis pathway: cultures, antibiotics, fluids, lactate, urine output and oxygen as clinically indicated, with senior review.',
        'De-escalate antimicrobials once culture and sensitivity results are available.',
      ],
      tags: ['sepsis-pattern', 'infection-risk'],
    }));
  }

  // Acute blood loss pattern
  if (anaemic && retic !== null && retic > 2.5 && mcv !== null && mcv >= 80 && plt !== null && plt > 400) {
    findings.push(finding({
      id: 'fbc.bloodloss',
      module: 'fbc',
      title: 'Possible acute blood loss pattern',
      severity: 'significant',
      interpretation: 'Normocytic anaemia with reticulocytosis and reactive thrombocytosis is characteristic of acute or recent blood loss with an intact marrow response.',
      basis: ['hb', 'retic', 'plt'],
      differentials: ['Gastrointestinal haemorrhage', 'Surgical or traumatic blood loss', 'Occult retroperitoneal bleeding', 'Haemolysis (also causes reticulocytosis)'],
      investigations: ['Assess for overt bleeding; digital rectal examination', 'Group and save / crossmatch', 'Serial haemoglobin', 'Haemolysis screen to distinguish from haemolytic anaemia', 'Consider urgent endoscopy or imaging'],
      implications: ['Haemoglobin may lag behind acute loss before equilibration — a normal value early does not exclude significant haemorrhage.'],
      monitoring: ['Serial FBC every 4–6 hours during active bleeding', 'Continuous haemodynamic monitoring'],
      guidance: ['Activate the major haemorrhage protocol where bleeding is uncontrolled or the patient is haemodynamically unstable.'],
      tags: ['blood-loss', 'bleeding-risk'],
    }));
  }

  const analytes = ctx.moduleAnalytes('fbc');
  const present = analytes.length > 0;
  const severity = rollUp(findings.map((f) => f.severity));

  const summaryBits = uniq(findings.map((f) => f.title));
  const summary = !present
    ? 'No full blood count data available.'
    : summaryBits.length
      ? `${summaryBits.join('; ')}.`
      : 'Full blood count parameters are within the reference intervals applied.';

  return {
    module: 'fbc',
    present,
    analytes,
    observations: ctx.moduleObservations('fbc'),
    findings,
    summary,
    severity,
    derived,
  };
}
