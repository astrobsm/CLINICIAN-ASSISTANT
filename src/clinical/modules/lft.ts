/**
 * LIVER FUNCTION TEST ANALYSIS MODULE
 *
 * Separates hepatocellular from cholestatic injury using the R ratio, assesses
 * synthetic function, and grades hyperbilirubinaemia.
 */
import type { ClinicalContext } from '../context';
import { uniq } from '../context';
import { fmt } from '../units';
import type { Finding, ModuleResult, Severity } from '../types';
import { finding } from '../types';
import { rollUp } from '../severity';

const ALT_ULN = 40;
const ALP_ULN = 130;

export function analyseLft(ctx: ClinicalContext): ModuleResult {
  const findings: Finding[] = [];
  const derived: ModuleResult['derived'] = {};

  const alt = ctx.v('alt');
  const ast = ctx.v('ast');
  const alp = ctx.v('alp');
  const ggt = ctx.v('ggt');
  const bili = ctx.v('bilirubinTotal');
  const biliD = ctx.v('bilirubinDirect');
  const alb = ctx.v('albumin');
  const inr = ctx.v('inr');
  const plt = ctx.v('plt');

  // ── R ratio: pattern of injury ───────────────────────────────────────
  let pattern: 'hepatocellular' | 'cholestatic' | 'mixed' | null = null;
  if (alt !== null && alp !== null && alp > 0) {
    const r = (alt / ALT_ULN) / (alp / ALP_ULN);
    pattern = r > 5 ? 'hepatocellular' : r < 2 ? 'cholestatic' : 'mixed';
    derived.rRatio = {
      label: 'R ratio (pattern of liver injury)',
      value: `${fmt(r, 1)} — ${pattern}`,
      note: 'R = (ALT ÷ ULN) ÷ (ALP ÷ ULN). Greater than 5 indicates hepatocellular injury, less than 2 cholestatic, and 2–5 a mixed picture.',
    };
  }

  if (ast !== null && alt !== null && alt > 0) {
    const ratio = ast / alt;
    derived.astAltRatio = {
      label: 'AST : ALT ratio',
      value: fmt(ratio, 2),
      note: ratio > 2 ? 'Above 2 is characteristic of alcohol-related liver disease' : ratio > 1 ? 'Above 1 may indicate advanced fibrosis or cirrhosis' : 'Below 1 is typical of non-alcoholic fatty liver disease and viral hepatitis',
    };
  }

  if (bili !== null && biliD !== null && bili > 0) {
    const pct = (biliD / bili) * 100;
    derived.bilirubinFraction = {
      label: 'Conjugated fraction',
      value: `${fmt(pct, 0)}%`,
      note: pct > 50 ? 'Predominantly conjugated — hepatocellular or cholestatic cause' : pct < 20 ? 'Predominantly unconjugated — consider haemolysis or Gilbert syndrome' : 'Mixed',
    };
  }

  // ── TRANSAMINITIS ────────────────────────────────────────────────────
  const maxT = Math.max(alt ?? 0, ast ?? 0);
  if (maxT > ALT_ULN) {
    const fold = maxT / ALT_ULN;
    const sev: Severity = fold > 25 ? 'critical' : fold > 10 ? 'significant' : fold > 3 ? 'moderate' : 'minor';
    findings.push(finding({
      id: 'lft.transaminitis',
      module: 'lft',
      title: fold > 25 ? 'Marked transaminitis — acute hepatocellular injury' : fold > 3 ? 'Moderate transaminitis' : 'Mild transaminitis',
      severity: sev,
      interpretation:
        `Transaminases are raised${alt !== null ? ` (ALT ${fmt(alt, 0)} U/L` : ''}${ast !== null ? `${alt !== null ? ', ' : ' ('}AST ${fmt(ast, 0)} U/L` : ''}${alt !== null || ast !== null ? ')' : ''}, approximately ${fmt(fold, 1)}× the upper reference limit.` +
        (fold > 25 ? ' A rise of this magnitude is characteristic of acute hepatocellular necrosis — most often ischaemic hepatitis, paracetamol toxicity or acute viral hepatitis — and requires urgent assessment for acute liver failure.' : '') +
        (pattern ? ` The R ratio indicates a predominantly ${pattern} pattern.` : ''),
      basis: uniq([alt !== null ? 'alt' : '', ast !== null ? 'ast' : '']),
      differentials: fold > 25
        ? ['Ischaemic hepatitis ("shock liver")', 'Paracetamol or other drug-induced liver injury', 'Acute viral hepatitis A, B or E', 'Autoimmune hepatitis', 'Budd–Chiari syndrome', 'Acute biliary obstruction (transient marked rise)']
        : ['Non-alcoholic fatty liver disease', 'Alcohol-related liver disease', 'Drug-induced liver injury', 'Chronic viral hepatitis B or C', 'Autoimmune hepatitis', 'Haemochromatosis, Wilson disease, alpha-1 antitrypsin deficiency', 'Coeliac disease', 'Muscle injury (check creatine kinase — AST is also released from muscle)'],
      investigations: uniq([
        'Full liver screen: hepatitis A, B, C and E serology, autoantibodies, immunoglobulins, ferritin and transferrin saturation, caeruloplasmin, alpha-1 antitrypsin',
        'Paracetamol level and a careful drug and herbal supplement history',
        'Liver ultrasound with Doppler',
        inr === null ? 'INR and albumin to assess synthetic function' : '',
        'Creatine kinase if the AST rise is disproportionate',
        fold > 25 ? 'Urgent discussion with hepatology; assess for encephalopathy and check glucose, lactate and ammonia' : '',
      ]),
      implications: [
        fold > 25 ? 'Acute liver failure is defined by coagulopathy and encephalopathy in the absence of chronic liver disease and requires transplant-centre discussion.' : 'Persistent transaminitis warrants a systematic aetiological work-up rather than serial repetition alone.',
        'Review and stop potentially hepatotoxic medicines where possible.',
      ],
      monitoring: [fold > 10 ? 'Daily liver function, INR and glucose' : 'Repeat liver function in 1–4 weeks depending on magnitude and clinical context'],
      guidance: [
        'Use the King\'s College criteria to identify patients with paracetamol-induced acute liver failure who require transplant assessment.',
        'N-acetylcysteine should be started without delay where paracetamol toxicity is a possibility.',
      ],
      tags: ['transaminitis', fold > 25 ? 'acute-liver-injury' : '', 'liver-disease'],
    }));
  }

  // ── CHOLESTASIS ──────────────────────────────────────────────────────
  if (alp !== null && alp > ALP_ULN) {
    findings.push(finding({
      id: 'lft.cholestasis',
      module: 'lft',
      title: 'Raised alkaline phosphatase — cholestatic or infiltrative pattern',
      severity: alp > 500 ? 'significant' : 'moderate',
      interpretation:
        `Alkaline phosphatase ${fmt(alp, 0)} U/L is raised.` +
        (ggt !== null && ggt > 60 ? ` The concurrently raised gamma-GT (${fmt(ggt, 0)} U/L) confirms a hepatobiliary rather than bony source.` : ggt === null ? ' Gamma-GT should be measured to confirm a hepatobiliary source, as alkaline phosphatase also arises from bone, placenta and intestine.' : ' Gamma-GT is not raised, which points away from a hepatobiliary source — consider bone as the origin.'),
      basis: uniq(['alp', ggt !== null ? 'ggt' : '']),
      differentials: ['Extrahepatic biliary obstruction — gallstones, stricture, malignancy', 'Intrahepatic cholestasis — drugs, sepsis, total parenteral nutrition, pregnancy', 'Primary biliary cholangitis or primary sclerosing cholangitis', 'Infiltrative liver disease — metastases, lymphoma, granulomata, amyloid', 'Bone disease — Paget disease, metastases, osteomalacia, fracture healing', 'Physiological in pregnancy and adolescence'],
      investigations: ['Gamma-GT to confirm a hepatobiliary source', 'Liver ultrasound to assess for biliary dilatation', 'Antimitochondrial antibody if primary biliary cholangitis is considered', 'MRCP or endoscopic ultrasound if ducts are dilated or obstruction is suspected', 'Calcium, phosphate and vitamin D if a bony source is likely'],
      implications: [
        'Biliary obstruction with fever and jaundice constitutes ascending cholangitis and requires urgent antibiotics and biliary drainage.',
        'Prolonged cholestasis causes fat-soluble vitamin deficiency including vitamin K, with consequent coagulopathy.',
      ],
      monitoring: ['Repeat liver function according to the clinical course; trend is more informative than a single value'],
      guidance: ['Ultrasound is the appropriate first-line imaging investigation for cholestasis; the presence or absence of duct dilatation directs subsequent management.'],
      tags: ['cholestasis', 'liver-disease'],
    }));
  }

  // ── JAUNDICE ─────────────────────────────────────────────────────────
  if (bili !== null && bili > 21) {
    const sev: Severity = bili > 250 ? 'critical' : bili > 100 ? 'significant' : bili > 50 ? 'moderate' : 'minor';
    findings.push(finding({
      id: 'lft.hyperbilirubinaemia',
      module: 'lft',
      title: bili > 50 ? 'Jaundice (hyperbilirubinaemia)' : 'Raised bilirubin',
      severity: sev,
      interpretation:
        `Total bilirubin ${fmt(bili, 0)} µmol/L${biliD !== null ? ` with a conjugated fraction of ${fmt(biliD, 0)} µmol/L` : ''}. Jaundice becomes clinically apparent at approximately 50 µmol/L.` +
        (biliD !== null && bili > 0 && biliD / bili < 0.2 ? ' The predominantly unconjugated pattern points towards haemolysis, ineffective erythropoiesis or Gilbert syndrome.' : ''),
      basis: uniq(['bilirubinTotal', biliD !== null ? 'bilirubinDirect' : '']),
      differentials: ['Pre-hepatic: haemolysis, ineffective erythropoiesis, Gilbert syndrome, resolving haematoma', 'Hepatic: hepatitis of any cause, cirrhosis, drug-induced injury, sepsis', 'Post-hepatic: gallstones, malignant obstruction, stricture'],
      investigations: ['Split bilirubin (conjugated and unconjugated)', 'Full blood count, reticulocytes, LDH, haptoglobin and direct antiglobulin test if haemolysis is possible', 'Liver ultrasound', 'Full liver screen'],
      implications: ['Jaundice with fever and right upper quadrant pain suggests cholangitis — a surgical and infective emergency.'],
      monitoring: ['Serial bilirubin and liver function'],
      guidance: ['Determine whether the picture is obstructive using ultrasound before pursuing extensive serological testing.'],
      tags: ['jaundice', 'liver-disease'],
    }));
  }

  // ── SYNTHETIC FUNCTION ───────────────────────────────────────────────
  // Hepatic synthetic impairment is only a defensible reading when the liver
  // biochemistry itself is abnormal. With a low albumin alone, the honest
  // finding is hypoalbuminaemia, whose commonest causes are not hepatic.
  const liverBiochemAbnormal = maxT > ALT_ULN || (alp !== null && alp > ALP_ULN) || (bili !== null && bili > 21);
  const synthetic = liverBiochemAbnormal && ((alb !== null && alb < 35) || (inr !== null && inr > 1.3));

  if (!synthetic && alb !== null && alb < 35) {
    findings.push(finding({
      id: 'lft.hypoalbuminaemia',
      module: 'lft',
      title: alb < 25 ? 'Marked hypoalbuminaemia' : 'Hypoalbuminaemia',
      severity: alb < 20 ? 'significant' : alb < 25 ? 'moderate' : 'minor',
      interpretation:
        `Albumin ${fmt(alb, 0)} g/L with otherwise unremarkable liver biochemistry. Albumin is a negative acute phase reactant and falls rapidly in inflammation, sepsis and critical illness; it is also lowered by malnutrition, protein-losing states and volume expansion. In this context it is not evidence of hepatic synthetic failure.`,
      basis: ['albumin'],
      differentials: ['Acute inflammation or sepsis', 'Malnutrition', 'Nephrotic syndrome', 'Protein-losing enteropathy', 'Dilution from fluid administration', 'Chronic liver disease (usually with other abnormal liver biochemistry)'],
      investigations: ['C-reactive protein', 'Urine protein:creatinine ratio to exclude renal protein loss', 'Nutritional assessment', 'Full liver biochemistry if not already available'],
      implications: [
        'Alters the free fraction of highly protein-bound drugs including phenytoin.',
        'Calcium must be interpreted using the albumin-corrected or ionised value — see the electrolyte section.',
        'Independently associated with poorer outcomes in acute illness.',
      ],
      monitoring: ['Repeat albumin with the clinical course'],
      guidance: ['Albumin infusion is not indicated to correct the number alone; treat the underlying cause.'],
      tags: ['hypoalbuminaemia'],
    }));
  }

  if (synthetic) {
    findings.push(finding({
      id: 'lft.synthetic',
      module: 'lft',
      title: 'Impaired hepatic synthetic function',
      severity: (inr !== null && inr > 2) || (alb !== null && alb < 25) ? 'significant' : 'moderate',
      interpretation:
        uniq([
          alb !== null && alb < 35 ? `Albumin ${fmt(alb, 0)} g/L` : '',
          inr !== null && inr > 1.3 ? `INR ${fmt(inr, 2)}` : '',
        ]).join(' with ') +
        '. Both are markers of hepatic synthetic capacity, although albumin also falls in inflammation, malnutrition and protein-losing states, and INR is affected by anticoagulation and vitamin K status.' +
        (plt !== null && plt < 150 ? ` The coexisting thrombocytopenia (${fmt(plt, 0)} ×10⁹/L) raises the possibility of portal hypertension with hypersplenism.` : ''),
      basis: uniq([alb !== null ? 'albumin' : '', inr !== null ? 'inr' : '', plt !== null ? 'plt' : '']),
      differentials: ['Chronic liver disease with cirrhosis', 'Acute liver failure', 'Malnutrition', 'Protein-losing enteropathy or nephrotic syndrome', 'Systemic inflammation (albumin is a negative acute phase reactant)', 'Vitamin K deficiency or anticoagulation (INR)'],
      investigations: ['Liver ultrasound with assessment for portal hypertension', 'Urine protein:creatinine ratio to exclude renal protein loss', 'Nutritional assessment', 'Trial of vitamin K if deficiency may contribute', 'Consider fibrosis assessment (transient elastography, FIB-4)'],
      implications: [
        'Hypoalbuminaemia alters the protein binding and therefore the free fraction of many drugs, including phenytoin.',
        'Cirrhosis with synthetic impairment requires assessment of Child–Pugh and MELD scores for prognosis and procedural risk.',
      ],
      monitoring: ['Serial albumin, INR and liver function', 'Monitor for ascites, encephalopathy and variceal bleeding where cirrhosis is suspected'],
      guidance: ['Corrected calcium should be used for interpretation whenever albumin is abnormal — see the electrolyte section.'],
      tags: ['liver-synthetic-impairment', 'liver-disease', 'bleeding-risk'],
    }));
  }

  const analytes = ctx.moduleAnalytes('lft');
  const present = analytes.length > 0;
  const titles = uniq(findings.map((f) => f.title));

  return {
    module: 'lft',
    present,
    analytes,
    observations: ctx.moduleObservations('lft'),
    findings,
    summary: !present
      ? 'No liver function data available.'
      : titles.length ? `${titles.join('; ')}.` : 'Liver function tests are within the reference intervals applied.',
    severity: rollUp(findings.map((f) => f.severity)),
    derived,
  };
}
