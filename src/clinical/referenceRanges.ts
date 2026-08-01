/**
 * Analyte dictionary: canonical keys, OCR synonyms, adult reference intervals,
 * and critical / life-threatening action thresholds.
 *
 * Reference intervals are typical adult values and are intended as decision
 * support only. Institutions can override them via `applyRangeOverrides()`
 * (see src/config/institution.ts) so local laboratory intervals take priority.
 */
import type { ModuleId, PatientContext, Sex } from './types';

export interface Range {
  low?: number;
  high?: number;
}

export interface AnalyteDef {
  key: string;
  label: string;
  module: ModuleId;
  /** Key into UNIT_RULES for unit normalisation. */
  unitRule: string;
  unit: string;
  /** Lower-case fragments matched against OCR text, longest-first. */
  synonyms: string[];
  ref?: Range;
  refMale?: Range;
  refFemale?: Range;
  /** Critical Result thresholds. */
  crit?: Range;
  /** Life-Threatening Finding thresholds. */
  lifeThreat?: Range;
  decimals?: number;
  /** Plausibility guard — OCR misreads outside this are rejected. */
  plausible?: Range;
}

const D = (d: AnalyteDef): AnalyteDef => d;

export const ANALYTES: AnalyteDef[] = [
  // ─────────────────────────── FULL BLOOD COUNT ───────────────────────────
  D({
    key: 'hb', label: 'Haemoglobin', module: 'fbc', unitRule: 'hb', unit: 'g/dL',
    synonyms: ['haemoglobin', 'hemoglobin', 'haemoglobin (hb)', 'hgb', 'hb'],
    refMale: { low: 13.0, high: 17.0 }, refFemale: { low: 11.5, high: 15.5 },
    crit: { low: 7.0, high: 20.0 }, lifeThreat: { low: 5.0, high: 22.0 },
    decimals: 1, plausible: { low: 1, high: 30 },
  }),
  D({
    key: 'hct', label: 'Packed Cell Volume (PCV/Haematocrit)', module: 'fbc', unitRule: 'hct', unit: '%',
    synonyms: ['packed cell volume', 'haematocrit', 'hematocrit', 'heamatocrit', 'haematocrit (pcv)', 'pcv', 'hct'],
    refMale: { low: 40, high: 52 }, refFemale: { low: 36, high: 47 },
    crit: { low: 21, high: 60 }, decimals: 1, plausible: { low: 5, high: 80 },
  }),
  D({
    key: 'rbc', label: 'Red Blood Cell Count', module: 'fbc', unitRule: 'rbc', unit: 'x10^12/L',
    synonyms: ['red blood cell count', 'red cell count', 'erythrocyte count', 'rbc count', 'rbc'],
    refMale: { low: 4.5, high: 6.5 }, refFemale: { low: 3.8, high: 5.8 },
    decimals: 2, plausible: { low: 0.5, high: 12 },
  }),
  D({
    key: 'mcv', label: 'Mean Cell Volume', module: 'fbc', unitRule: 'mcv', unit: 'fL',
    synonyms: ['mean cell volume', 'mean corpuscular volume', 'mcv'],
    ref: { low: 80, high: 100 }, decimals: 1, plausible: { low: 40, high: 160 },
  }),
  D({
    key: 'mch', label: 'Mean Cell Haemoglobin', module: 'fbc', unitRule: 'mch', unit: 'pg',
    synonyms: ['mean cell haemoglobin concentration', 'mean cell haemoglobin', 'mean corpuscular hemoglobin', 'mch'],
    ref: { low: 27, high: 32 }, decimals: 1, plausible: { low: 10, high: 50 },
  }),
  D({
    key: 'mchc', label: 'Mean Cell Haemoglobin Concentration', module: 'fbc', unitRule: 'mchc', unit: 'g/dL',
    synonyms: ['mean cell haemoglobin concentration', 'mean corpuscular hemoglobin concentration', 'mchc'],
    ref: { low: 32, high: 36 }, decimals: 1, plausible: { low: 20, high: 45 },
  }),
  D({
    key: 'rdw', label: 'Red Cell Distribution Width', module: 'fbc', unitRule: 'rdw', unit: '%',
    synonyms: ['red cell distribution width', 'rdw-cv', 'rdw cv', 'rdw-sd', 'rdw'],
    ref: { low: 11.5, high: 14.5 }, decimals: 1, plausible: { low: 8, high: 40 },
  }),
  D({
    key: 'wbc', label: 'White Blood Cell Count', module: 'fbc', unitRule: 'wbc', unit: 'x10^9/L',
    synonyms: ['white blood cell count', 'white cell count', 'total leucocyte count', 'total leukocyte count', 'leucocyte count', 'wbc count', 'tlc', 'wbc'],
    ref: { low: 4.0, high: 11.0 },
    crit: { low: 1.5, high: 30 }, lifeThreat: { low: 0.5, high: 100 },
    decimals: 1, plausible: { low: 0.05, high: 500 },
  }),
  D({
    key: 'neut', label: 'Neutrophils (absolute)', module: 'fbc', unitRule: 'wbc', unit: 'x10^9/L',
    synonyms: ['absolute neutrophil count', 'neutrophils absolute', 'neutrophil count', 'neutrophils', 'neutrophil', 'anc'],
    ref: { low: 2.0, high: 7.5 },
    crit: { low: 0.5 }, lifeThreat: { low: 0.2 },
    decimals: 2, plausible: { low: 0, high: 300 },
  }),
  D({
    key: 'lymph', label: 'Lymphocytes (absolute)', module: 'fbc', unitRule: 'wbc', unit: 'x10^9/L',
    synonyms: ['absolute lymphocyte count', 'lymphocytes absolute', 'lymphocyte count', 'lymphocytes', 'lymphocyte'],
    ref: { low: 1.0, high: 4.0 }, decimals: 2, plausible: { low: 0, high: 300 },
  }),
  D({
    key: 'mono', label: 'Monocytes (absolute)', module: 'fbc', unitRule: 'wbc', unit: 'x10^9/L',
    synonyms: ['monocyte count', 'monocytes', 'monocyte'],
    ref: { low: 0.2, high: 0.8 }, decimals: 2, plausible: { low: 0, high: 100 },
  }),
  D({
    key: 'eos', label: 'Eosinophils (absolute)', module: 'fbc', unitRule: 'wbc', unit: 'x10^9/L',
    synonyms: ['eosinophil count', 'eosinophils', 'eosinophil'],
    ref: { low: 0.04, high: 0.40 }, decimals: 2, plausible: { low: 0, high: 100 },
  }),
  D({
    key: 'baso', label: 'Basophils (absolute)', module: 'fbc', unitRule: 'wbc', unit: 'x10^9/L',
    synonyms: ['basophil count', 'basophils', 'basophil'],
    ref: { low: 0, high: 0.10 }, decimals: 2, plausible: { low: 0, high: 50 },
  }),
  D({
    key: 'plt', label: 'Platelet Count', module: 'fbc', unitRule: 'plt', unit: 'x10^9/L',
    synonyms: ['platelet count', 'platelets', 'platelet', 'thrombocyte count', 'thrombocytes', 'plt'],
    ref: { low: 150, high: 400 },
    crit: { low: 50, high: 1000 }, lifeThreat: { low: 20, high: 1500 },
    decimals: 0, plausible: { low: 1, high: 3000 },
  }),
  D({
    key: 'mpv', label: 'Mean Platelet Volume', module: 'fbc', unitRule: 'mcv', unit: 'fL',
    synonyms: ['mean platelet volume', 'mpv'], ref: { low: 7.5, high: 11.5 }, decimals: 1,
    plausible: { low: 3, high: 25 },
  }),
  D({
    key: 'pdw', label: 'Platelet Distribution Width', module: 'fbc', unitRule: 'percent', unit: '%',
    synonyms: ['platelet distribution width', 'pdw'], ref: { low: 9, high: 17 }, decimals: 1,
    plausible: { low: 2, high: 40 },
  }),
  D({
    key: 'pct', label: 'Plateletcrit', module: 'fbc', unitRule: 'percent', unit: '%',
    synonyms: ['plateletcrit', 'pct%'], ref: { low: 0.17, high: 0.35 }, decimals: 2,
    plausible: { low: 0, high: 3 },
  }),
  D({
    key: 'retic', label: 'Reticulocyte Count', module: 'fbc', unitRule: 'percent', unit: '%',
    synonyms: ['reticulocyte count', 'reticulocytes', 'retic count', 'retics'],
    ref: { low: 0.5, high: 2.5 }, decimals: 2, plausible: { low: 0, high: 60 },
  }),
  D({
    key: 'nrbc', label: 'Nucleated Red Cells', module: 'fbc', unitRule: 'ratio', unit: '/100 WBC',
    synonyms: ['nucleated red blood cells', 'nucleated red cells', 'nucleated rbc', 'nrbc'],
    ref: { low: 0, high: 0 }, decimals: 1, plausible: { low: 0, high: 500 },
  }),
  D({
    key: 'ig', label: 'Immature Granulocytes', module: 'fbc', unitRule: 'percent', unit: '%',
    synonyms: ['immature granulocytes', 'immature granulocyte', 'ig%', 'ig'],
    ref: { low: 0, high: 0.5 }, decimals: 2, plausible: { low: 0, high: 60 },
  }),
  D({
    key: 'blasts', label: 'Blast Cells', module: 'fbc', unitRule: 'percent', unit: '%',
    synonyms: ['blast cells', 'blasts'], ref: { low: 0, high: 0 }, decimals: 1,
    plausible: { low: 0, high: 100 },
  }),
  D({
    key: 'bands', label: 'Band Forms', module: 'fbc', unitRule: 'percent', unit: '%',
    synonyms: ['band forms', 'band cells', 'stab cells', 'bands'], ref: { low: 0, high: 6 },
    decimals: 1, plausible: { low: 0, high: 80 },
  }),

  // ─────────────────────────── COAGULATION ───────────────────────────
  D({
    key: 'pt', label: 'Prothrombin Time', module: 'coagulation', unitRule: 'seconds', unit: 's',
    synonyms: ['prothrombin time', 'pt (prothrombin time)', 'pro-time', 'pt'],
    ref: { low: 11, high: 14 }, crit: { high: 30 }, decimals: 1, plausible: { low: 5, high: 200 },
  }),
  D({
    key: 'inr', label: 'INR', module: 'coagulation', unitRule: 'ratio', unit: '',
    synonyms: ['international normalised ratio', 'international normalized ratio', 'inr'],
    ref: { low: 0.8, high: 1.2 }, crit: { high: 4.5 }, lifeThreat: { high: 8.0 },
    decimals: 2, plausible: { low: 0.4, high: 20 },
  }),
  D({
    key: 'aptt', label: 'aPTT', module: 'coagulation', unitRule: 'seconds', unit: 's',
    synonyms: ['activated partial thromboplastin time', 'partial thromboplastin time', 'aptt', 'appt', 'ptt'],
    ref: { low: 25, high: 35 }, crit: { high: 90 }, decimals: 1, plausible: { low: 8, high: 300 },
  }),
  D({
    key: 'apttRatio', label: 'aPTT Ratio', module: 'coagulation', unitRule: 'ratio', unit: '',
    synonyms: ['aptt ratio', 'appt ratio', 'ptt ratio'], ref: { low: 0.8, high: 1.2 },
    decimals: 2, plausible: { low: 0.3, high: 12 },
  }),
  D({
    key: 'tt', label: 'Thrombin Time', module: 'coagulation', unitRule: 'seconds', unit: 's',
    synonyms: ['thrombin time', 'tt'], ref: { low: 14, high: 19 }, decimals: 1,
    plausible: { low: 5, high: 200 },
  }),
  D({
    key: 'fibrinogen', label: 'Fibrinogen', module: 'coagulation', unitRule: 'fibrinogen', unit: 'g/L',
    synonyms: ['fibrinogen level', 'fibrinogen'], ref: { low: 2.0, high: 4.0 },
    crit: { low: 1.0 }, lifeThreat: { low: 0.5 }, decimals: 2, plausible: { low: 0.05, high: 15 },
  }),
  D({
    key: 'ddimer', label: 'D-Dimer', module: 'coagulation', unitRule: 'ddimer', unit: 'mg/L FEU',
    synonyms: ['d-dimer', 'd dimer', 'ddimer'], ref: { high: 0.5 }, decimals: 2,
    plausible: { low: 0, high: 200 },
  }),
  D({
    key: 'antixa', label: 'Anti-Xa Activity', module: 'coagulation', unitRule: 'antixa', unit: 'IU/mL',
    synonyms: ['anti-xa activity', 'anti xa level', 'anti-factor xa', 'anti-xa', 'anti xa'],
    ref: { low: 0.5, high: 1.0 }, decimals: 2, plausible: { low: 0, high: 5 },
  }),
  D({
    key: 'bleedingTime', label: 'Bleeding Time', module: 'coagulation', unitRule: 'ratio', unit: 'min',
    synonyms: ['bleeding time', 'bt (bleeding time)'], ref: { low: 2, high: 7 }, decimals: 1,
    plausible: { low: 0, high: 60 },
  }),
  D({
    key: 'clottingTime', label: 'Clotting Time', module: 'coagulation', unitRule: 'ratio', unit: 'min',
    synonyms: ['clotting time', 'coagulation time', 'ct (clotting time)'], ref: { low: 4, high: 10 },
    decimals: 1, plausible: { low: 0, high: 60 },
  }),

  // ─────────────────────────── RENAL ───────────────────────────
  D({
    key: 'creatinine', label: 'Creatinine', module: 'renal', unitRule: 'creatinine', unit: 'umol/L',
    synonyms: ['serum creatinine', 'creatinine (serum)', 'creat', 'creatinine'],
    refMale: { low: 60, high: 110 }, refFemale: { low: 45, high: 90 },
    crit: { high: 350 }, lifeThreat: { high: 700 }, decimals: 0, plausible: { low: 5, high: 3000 },
  }),
  D({
    key: 'urea', label: 'Urea', module: 'renal', unitRule: 'urea', unit: 'mmol/L',
    synonyms: ['blood urea nitrogen', 'serum urea', 'urea nitrogen', 'urea', 'bun'],
    ref: { low: 2.5, high: 7.8 }, crit: { high: 30 }, decimals: 1, plausible: { low: 0.2, high: 120 },
  }),
  D({
    key: 'egfr', label: 'eGFR (reported)', module: 'renal', unitRule: 'ratio', unit: 'mL/min/1.73m²',
    synonyms: ['estimated gfr', 'egfr (ckd-epi)', 'egfr (mdrd)', 'gfr estimated', 'egfr', 'gfr'],
    ref: { low: 90 }, crit: { low: 15 }, decimals: 0, plausible: { low: 1, high: 200 },
  }),
  D({
    key: 'cystatinC', label: 'Cystatin C', module: 'renal', unitRule: 'ratio', unit: 'mg/L',
    synonyms: ['cystatin c', 'cystatin-c'], ref: { low: 0.6, high: 1.0 }, decimals: 2,
    plausible: { low: 0.1, high: 12 },
  }),
  D({
    key: 'uricAcid', label: 'Uric Acid', module: 'renal', unitRule: 'creatinine', unit: 'umol/L',
    synonyms: ['uric acid', 'urate'], refMale: { low: 200, high: 430 }, refFemale: { low: 140, high: 360 },
    decimals: 0, plausible: { low: 10, high: 2000 },
  }),
  D({
    key: 'urineOutput', label: 'Urine Output', module: 'renal', unitRule: 'ratio', unit: 'mL/kg/h',
    synonyms: ['urine output', 'uo (ml/kg/h)'], ref: { low: 0.5 }, decimals: 2,
    plausible: { low: 0, high: 10 },
  }),

  // ─────────────────────────── ELECTROLYTES ───────────────────────────
  D({
    key: 'na', label: 'Sodium', module: 'electrolytes', unitRule: 'calcium', unit: 'mmol/L',
    synonyms: ['serum sodium', 'sodium (na)', 'sodium', 'na+', 'na'],
    ref: { low: 135, high: 145 }, crit: { low: 125, high: 155 }, lifeThreat: { low: 120, high: 160 },
    decimals: 0, plausible: { low: 90, high: 200 },
  }),
  D({
    key: 'k', label: 'Potassium', module: 'electrolytes', unitRule: 'calcium', unit: 'mmol/L',
    synonyms: ['serum potassium', 'potassium (k)', 'potassium', 'k+', 'k'],
    ref: { low: 3.5, high: 5.0 }, crit: { low: 2.5, high: 6.0 }, lifeThreat: { low: 2.0, high: 6.5 },
    decimals: 1, plausible: { low: 1, high: 12 },
  }),
  D({
    key: 'cl', label: 'Chloride', module: 'electrolytes', unitRule: 'calcium', unit: 'mmol/L',
    synonyms: ['serum chloride', 'chloride (cl)', 'chloride', 'cl-', 'cl'],
    ref: { low: 98, high: 107 }, decimals: 0, plausible: { low: 50, high: 160 },
  }),
  D({
    key: 'hco3', label: 'Bicarbonate', module: 'electrolytes', unitRule: 'calcium', unit: 'mmol/L',
    synonyms: ['bicarbonate', 'total co2', 'tco2', 'hco3-', 'hco3'],
    ref: { low: 22, high: 29 }, crit: { low: 10, high: 40 }, decimals: 1, plausible: { low: 2, high: 60 },
  }),
  D({
    key: 'calcium', label: 'Calcium (total)', module: 'electrolytes', unitRule: 'calcium', unit: 'mmol/L',
    synonyms: ['total calcium', 'serum calcium', 'calcium (total)', 'calcium', 'ca2+', 'ca'],
    ref: { low: 2.20, high: 2.60 }, crit: { low: 1.80, high: 3.00 }, lifeThreat: { low: 1.60, high: 3.50 },
    decimals: 2, plausible: { low: 0.5, high: 6 },
  }),
  D({
    key: 'ionisedCalcium', label: 'Ionised Calcium', module: 'electrolytes', unitRule: 'calcium', unit: 'mmol/L',
    synonyms: ['ionised calcium', 'ionized calcium', 'free calcium', 'ica'],
    ref: { low: 1.15, high: 1.30 }, crit: { low: 0.9, high: 1.6 }, decimals: 2,
    plausible: { low: 0.2, high: 3 },
  }),
  D({
    key: 'magnesium', label: 'Magnesium', module: 'electrolytes', unitRule: 'magnesium', unit: 'mmol/L',
    synonyms: ['serum magnesium', 'magnesium (mg)', 'magnesium', 'mg2+'],
    ref: { low: 0.70, high: 1.00 }, crit: { low: 0.40, high: 2.00 }, decimals: 2,
    plausible: { low: 0.05, high: 6 },
  }),
  D({
    key: 'phosphate', label: 'Phosphate', module: 'electrolytes', unitRule: 'phosphate', unit: 'mmol/L',
    synonyms: ['inorganic phosphate', 'serum phosphate', 'phosphorus', 'phosphate', 'po4'],
    ref: { low: 0.80, high: 1.45 }, crit: { low: 0.32 }, decimals: 2, plausible: { low: 0.05, high: 8 },
  }),
  D({
    key: 'osmolality', label: 'Serum Osmolality', module: 'electrolytes', unitRule: 'ratio', unit: 'mOsm/kg',
    synonyms: ['serum osmolality', 'plasma osmolality', 'osmolality'],
    ref: { low: 275, high: 295 }, decimals: 0, plausible: { low: 200, high: 450 },
  }),
  D({
    key: 'glucose', label: 'Glucose', module: 'electrolytes', unitRule: 'glucose', unit: 'mmol/L',
    synonyms: ['random blood glucose', 'blood glucose', 'serum glucose', 'glucose', 'rbs'],
    ref: { low: 3.9, high: 7.8 }, crit: { low: 3.0, high: 20 }, lifeThreat: { low: 2.2, high: 30 },
    decimals: 1, plausible: { low: 0.3, high: 80 },
  }),

  // ─────────────────────────── LIVER ───────────────────────────
  D({
    key: 'alt', label: 'ALT', module: 'lft', unitRule: 'enzyme', unit: 'U/L',
    synonyms: ['alanine aminotransferase', 'alanine transaminase', 'sgpt', 'alt'],
    ref: { low: 0, high: 40 }, crit: { high: 1000 }, decimals: 0, plausible: { low: 0, high: 20000 },
  }),
  D({
    key: 'ast', label: 'AST', module: 'lft', unitRule: 'enzyme', unit: 'U/L',
    synonyms: ['aspartate aminotransferase', 'aspartate transaminase', 'sgot', 'ast'],
    ref: { low: 0, high: 40 }, crit: { high: 1000 }, decimals: 0, plausible: { low: 0, high: 20000 },
  }),
  D({
    key: 'alp', label: 'Alkaline Phosphatase', module: 'lft', unitRule: 'enzyme', unit: 'U/L',
    synonyms: ['alkaline phosphatase', 'alk phos', 'alk. phos', 'alp'], ref: { low: 30, high: 130 },
    decimals: 0, plausible: { low: 2, high: 5000 },
  }),
  D({
    key: 'ggt', label: 'Gamma GT', module: 'lft', unitRule: 'enzyme', unit: 'U/L',
    synonyms: ['gamma glutamyl transpeptidase', 'gamma glutamyl transferase', 'gamma-glutamyl transferase', 'gamma gt', 'gamma-gt', 'g-gt', 'ggt'],
    refMale: { low: 10, high: 71 }, refFemale: { low: 6, high: 42 }, decimals: 0,
    plausible: { low: 1, high: 5000 },
  }),
  D({
    key: 'bilirubinTotal', label: 'Bilirubin (total)', module: 'lft', unitRule: 'bilirubinTotal', unit: 'umol/L',
    synonyms: ['total bilirubin', 'bilirubin total', 'serum bilirubin', 'bilirubin'],
    ref: { low: 3, high: 21 }, crit: { high: 250 }, decimals: 0, plausible: { low: 0, high: 1200 },
  }),
  D({
    key: 'bilirubinDirect', label: 'Bilirubin (conjugated)', module: 'lft', unitRule: 'bilirubinDirect', unit: 'umol/L',
    synonyms: ['direct bilirubin', 'conjugated bilirubin', 'bilirubin direct'],
    ref: { low: 0, high: 7 }, decimals: 0, plausible: { low: 0, high: 1000 },
  }),
  D({
    key: 'albumin', label: 'Albumin', module: 'lft', unitRule: 'albumin', unit: 'g/L',
    synonyms: ['serum albumin', 'albumin'], ref: { low: 35, high: 50 }, crit: { low: 20 },
    decimals: 0, plausible: { low: 3, high: 90 },
  }),
  D({
    key: 'totalProtein', label: 'Total Protein', module: 'lft', unitRule: 'totalProtein', unit: 'g/L',
    synonyms: ['total protein', 'serum protein'], ref: { low: 60, high: 80 }, decimals: 0,
    plausible: { low: 10, high: 140 },
  }),

  // ─────────────────────────── ARTERIAL BLOOD GAS ───────────────────────────
  D({
    key: 'ph', label: 'pH', module: 'abg', unitRule: 'ratio', unit: '',
    synonyms: ['blood ph', 'ph'], ref: { low: 7.35, high: 7.45 },
    crit: { low: 7.20, high: 7.55 }, lifeThreat: { low: 7.10, high: 7.60 },
    decimals: 2, plausible: { low: 6.5, high: 8.0 },
  }),
  D({
    key: 'paco2', label: 'PaCO₂', module: 'abg', unitRule: 'gasTension', unit: 'kPa',
    synonyms: ['pco2', 'paco2', 'p co2', 'carbon dioxide tension'],
    ref: { low: 4.7, high: 6.0 }, crit: { low: 3.0, high: 8.0 }, lifeThreat: { high: 10.0 },
    decimals: 1, plausible: { low: 0.5, high: 25 },
  }),
  D({
    key: 'pao2', label: 'PaO₂', module: 'abg', unitRule: 'gasTension', unit: 'kPa',
    synonyms: ['po2', 'pao2', 'p o2', 'oxygen tension'],
    ref: { low: 10.6, high: 13.3 }, crit: { low: 8.0 }, lifeThreat: { low: 6.0 },
    decimals: 1, plausible: { low: 1, high: 90 },
  }),
  D({
    key: 'baseExcess', label: 'Base Excess', module: 'abg', unitRule: 'calcium', unit: 'mmol/L',
    synonyms: ['base excess', 'standard base excess', 'abe', 'sbe', 'be'],
    ref: { low: -2, high: 2 }, crit: { low: -10, high: 10 }, decimals: 1,
    plausible: { low: -40, high: 40 },
  }),
  D({
    key: 'lactate', label: 'Lactate', module: 'abg', unitRule: 'lactate', unit: 'mmol/L',
    synonyms: ['serum lactate', 'blood lactate', 'lactate', 'lac'],
    ref: { low: 0.5, high: 2.0 }, crit: { high: 4.0 }, lifeThreat: { high: 10.0 },
    decimals: 1, plausible: { low: 0, high: 40 },
  }),
  D({
    key: 'sao2', label: 'Oxygen Saturation', module: 'abg', unitRule: 'percent', unit: '%',
    synonyms: ['oxygen saturation', 'o2 saturation', 'spo2', 'sao2', 'so2'],
    ref: { low: 94, high: 100 }, crit: { low: 88 }, lifeThreat: { low: 80 },
    decimals: 0, plausible: { low: 20, high: 100 },
  }),
  D({
    key: 'fio2', label: 'FiO₂', module: 'abg', unitRule: 'percent', unit: '%',
    synonyms: ['inspired oxygen', 'fio2'], ref: { low: 21, high: 21 }, decimals: 0,
    plausible: { low: 21, high: 100 },
  }),
  D({
    key: 'cohb', label: 'Carboxyhaemoglobin', module: 'abg', unitRule: 'percent', unit: '%',
    synonyms: ['carboxyhaemoglobin', 'carboxyhemoglobin', 'cohb'], ref: { low: 0, high: 2 },
    crit: { high: 15 }, decimals: 1, plausible: { low: 0, high: 90 },
  }),
  D({
    key: 'methb', label: 'Methaemoglobin', module: 'abg', unitRule: 'percent', unit: '%',
    synonyms: ['methaemoglobin', 'methemoglobin', 'methb'], ref: { low: 0, high: 1.5 },
    crit: { high: 20 }, decimals: 1, plausible: { low: 0, high: 90 },
  }),

  // ─────────────────────────── URINALYSIS (numeric) ───────────────────────────
  D({
    key: 'uPh', label: 'Urine pH', module: 'urinalysis', unitRule: 'ratio', unit: '',
    synonyms: ['urine ph'], ref: { low: 4.5, high: 8.0 }, decimals: 1, plausible: { low: 3, high: 10 },
  }),
  D({
    key: 'uSg', label: 'Urine Specific Gravity', module: 'urinalysis', unitRule: 'ratio', unit: '',
    synonyms: ['specific gravity', 'sp. gravity', 'sg'], ref: { low: 1.005, high: 1.030 },
    decimals: 3, plausible: { low: 1.0, high: 1.06 },
  }),
  D({
    key: 'uAcr', label: 'Urine Albumin:Creatinine Ratio', module: 'urinalysis', unitRule: 'ratio', unit: 'mg/mmol',
    synonyms: ['albumin creatinine ratio', 'albumin:creatinine ratio', 'acr'],
    ref: { high: 3 }, decimals: 1, plausible: { low: 0, high: 2000 },
  }),
  D({
    key: 'uPcr', label: 'Urine Protein:Creatinine Ratio', module: 'urinalysis', unitRule: 'ratio', unit: 'mg/mmol',
    synonyms: ['protein creatinine ratio', 'protein:creatinine ratio', 'pcr'],
    ref: { high: 15 }, decimals: 1, plausible: { low: 0, high: 3000 },
  }),

  // ─────────────────────────── INFLAMMATORY ───────────────────────────
  D({
    key: 'crp', label: 'C-Reactive Protein', module: 'inflammatory', unitRule: 'crp', unit: 'mg/L',
    synonyms: ['c-reactive protein', 'c reactive protein', 'hs-crp', 'crp'],
    ref: { high: 5 }, crit: { high: 200 }, decimals: 1, plausible: { low: 0, high: 800 },
  }),
  D({
    key: 'esr', label: 'ESR', module: 'inflammatory', unitRule: 'ratio', unit: 'mm/hr',
    synonyms: ['erythrocyte sedimentation rate', 'sedimentation rate', 'esr'],
    refMale: { high: 15 }, refFemale: { high: 20 }, decimals: 0, plausible: { low: 0, high: 200 },
  }),
  D({
    key: 'procalcitonin', label: 'Procalcitonin', module: 'inflammatory', unitRule: 'procalcitonin', unit: 'ng/mL',
    synonyms: ['procalcitonin', 'pct (procalcitonin)'], ref: { high: 0.5 }, crit: { high: 10 },
    decimals: 2, plausible: { low: 0, high: 1000 },
  }),
  D({
    key: 'ferritin', label: 'Ferritin', module: 'inflammatory', unitRule: 'ferritin', unit: 'ug/L',
    synonyms: ['serum ferritin', 'ferritin'], refMale: { low: 30, high: 400 }, refFemale: { low: 15, high: 200 },
    decimals: 0, plausible: { low: 1, high: 100000 },
  }),
  D({
    key: 'iron', label: 'Serum Iron', module: 'inflammatory', unitRule: 'creatinine', unit: 'umol/L',
    synonyms: ['serum iron', 'iron'], ref: { low: 10, high: 30 }, decimals: 1, plausible: { low: 0.5, high: 200 },
  }),
  D({
    key: 'tsat', label: 'Transferrin Saturation', module: 'inflammatory', unitRule: 'percent', unit: '%',
    synonyms: ['transferrin saturation', 'tsat', 'iron saturation'], ref: { low: 20, high: 45 },
    decimals: 0, plausible: { low: 0, high: 100 },
  }),
  D({
    key: 'b12', label: 'Vitamin B12', module: 'inflammatory', unitRule: 'ratio', unit: 'ng/L',
    synonyms: ['vitamin b12', 'vit b12', 'cobalamin', 'b12'], ref: { low: 200, high: 900 },
    decimals: 0, plausible: { low: 20, high: 5000 },
  }),
  D({
    key: 'folate', label: 'Serum Folate', module: 'inflammatory', unitRule: 'ratio', unit: 'ug/L',
    synonyms: ['serum folate', 'folate'], ref: { low: 3.0, high: 20 }, decimals: 1,
    plausible: { low: 0.1, high: 60 },
  }),

  // ─────────────────────────── CARDIAC ───────────────────────────
  D({
    key: 'troponin', label: 'Troponin (high sensitivity)', module: 'cardiac', unitRule: 'troponin', unit: 'ng/L',
    synonyms: ['high sensitivity troponin t', 'high sensitivity troponin i', 'hs-troponin t', 'hs-troponin i', 'hs-ctnt', 'hs-ctni', 'troponin t', 'troponin i', 'troponin'],
    ref: { high: 14 }, crit: { high: 100 }, decimals: 0, plausible: { low: 0, high: 500000 },
  }),
  D({
    key: 'ckmb', label: 'CK-MB', module: 'cardiac', unitRule: 'enzyme', unit: 'U/L',
    synonyms: ['ck-mb', 'ck mb', 'creatine kinase mb'], ref: { high: 25 }, decimals: 0,
    plausible: { low: 0, high: 3000 },
  }),
  D({
    key: 'ck', label: 'Creatine Kinase', module: 'cardiac', unitRule: 'enzyme', unit: 'U/L',
    synonyms: ['creatine kinase', 'creatinine kinase', 'cpk', 'ck'],
    refMale: { low: 40, high: 320 }, refFemale: { low: 25, high: 200 },
    crit: { high: 5000 }, decimals: 0, plausible: { low: 5, high: 500000 },
  }),
  D({
    key: 'bnp', label: 'BNP', module: 'cardiac', unitRule: 'bnp', unit: 'pg/mL',
    synonyms: ['b-type natriuretic peptide', 'brain natriuretic peptide', 'bnp'],
    ref: { high: 100 }, decimals: 0, plausible: { low: 0, high: 40000 },
  }),
  D({
    key: 'ntprobnp', label: 'NT-proBNP', module: 'cardiac', unitRule: 'ntprobnp', unit: 'pg/mL',
    synonyms: ['nt-probnp', 'nt probnp', 'n-terminal probnp', 'probnp'],
    ref: { high: 125 }, decimals: 0, plausible: { low: 0, high: 100000 },
  }),

  // ─────────────────────────── ECG (numeric) ───────────────────────────
  D({
    key: 'ecgRate', label: 'Heart Rate', module: 'ecg', unitRule: 'ratio', unit: 'bpm',
    synonyms: ['ventricular rate', 'heart rate', 'atrial rate', 'rate'],
    ref: { low: 60, high: 100 }, crit: { low: 40, high: 150 }, lifeThreat: { low: 30, high: 180 },
    decimals: 0, plausible: { low: 10, high: 320 },
  }),
  D({
    key: 'ecgPr', label: 'PR Interval', module: 'ecg', unitRule: 'ratio', unit: 'ms',
    synonyms: ['pr interval', 'p-r interval', 'pr'], ref: { low: 120, high: 200 },
    decimals: 0, plausible: { low: 40, high: 600 },
  }),
  D({
    key: 'ecgQrs', label: 'QRS Duration', module: 'ecg', unitRule: 'ratio', unit: 'ms',
    synonyms: ['qrs duration', 'qrs interval', 'qrs'], ref: { low: 60, high: 110 },
    crit: { high: 160 }, decimals: 0, plausible: { low: 30, high: 400 },
  }),
  D({
    key: 'ecgQt', label: 'QT Interval', module: 'ecg', unitRule: 'ratio', unit: 'ms',
    synonyms: ['qt interval', 'qt'], ref: { low: 350, high: 450 }, decimals: 0,
    plausible: { low: 150, high: 800 },
  }),
  D({
    key: 'ecgQtc', label: 'QTc Interval', module: 'ecg', unitRule: 'ratio', unit: 'ms',
    synonyms: ['qtc interval', 'qtcb', 'qtcf', 'qtc'],
    refMale: { low: 350, high: 450 }, refFemale: { low: 350, high: 470 },
    crit: { high: 500 }, lifeThreat: { high: 550 }, decimals: 0, plausible: { low: 200, high: 900 },
  }),
  D({
    key: 'ecgAxis', label: 'QRS Axis', module: 'ecg', unitRule: 'ratio', unit: '°',
    synonyms: ['qrs axis', 'p-r-t axes', 'cardiac axis', 'axis'], ref: { low: -30, high: 90 },
    decimals: 0, plausible: { low: -180, high: 180 },
  }),
];

/** Fast lookup by canonical key. */
export const ANALYTE_BY_KEY: Record<string, AnalyteDef> = Object.fromEntries(
  ANALYTES.map((a) => [a.key, a]),
);

/**
 * Synonym index, longest phrase first so "mean cell haemoglobin concentration"
 * wins over "mean cell haemoglobin".
 */
export const SYNONYM_INDEX: { phrase: string; def: AnalyteDef }[] = ANALYTES
  .flatMap((def) => def.synonyms.map((phrase) => ({ phrase: phrase.toLowerCase(), def })))
  .sort((a, b) => b.phrase.length - a.phrase.length);

/** Resolve the sex-appropriate reference interval. */
export function refFor(def: AnalyteDef, sex: Sex): Range | undefined {
  if (sex === 'male' && def.refMale) return def.refMale;
  if (sex === 'female' && def.refFemale) return def.refFemale;
  if (def.ref) return def.ref;
  // Sex unspecified: widen to the union of both intervals so we never
  // over-call an abnormality on a patient whose sex was not recorded.
  if (def.refMale && def.refFemale) {
    return {
      low: Math.min(def.refMale.low ?? Infinity, def.refFemale.low ?? Infinity) || undefined,
      high: Math.max(def.refMale.high ?? -Infinity, def.refFemale.high ?? -Infinity) || undefined,
    };
  }
  return def.refMale ?? def.refFemale;
}

export function refForPatient(def: AnalyteDef, p: PatientContext): Range | undefined {
  const base = refFor(def, p.sex);
  if (!base) return base;
  // Pregnancy shifts a handful of intervals materially.
  if (p.pregnant) {
    if (def.key === 'hb') return { low: 10.5, high: 14.0 };
    if (def.key === 'ddimer') return { high: 1.5 };
    if (def.key === 'fibrinogen') return { low: 3.0, high: 6.0 };
    if (def.key === 'creatinine') return { low: 35, high: 75 };
  }
  // ESR rises with age (Miller: age/2, or (age+10)/2 in women).
  if (def.key === 'esr' && p.age && p.age > 50) {
    const high = p.sex === 'female' ? (p.age + 10) / 2 : p.age / 2;
    return { high: Math.max(high, base.high ?? 0) };
  }
  return base;
}

export function describeRange(r: Range | undefined, decimals = 1): string {
  if (!r) return '—';
  const f = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(decimals));
  if (r.low !== undefined && r.high !== undefined) return `${f(r.low)}–${f(r.high)}`;
  if (r.high !== undefined) return `< ${f(r.high)}`;
  if (r.low !== undefined) return `> ${f(r.low)}`;
  return '—';
}
