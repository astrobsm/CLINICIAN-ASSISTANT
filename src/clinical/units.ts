/**
 * Unit normalisation. Laboratory reports arrive in SI or conventional units
 * depending on the issuing laboratory; every analyte is converted to a single
 * canonical unit before interpretation so the rule engine never has to branch
 * on units.
 */

export interface UnitRule {
  /** Canonical unit for this analyte. */
  canonical: string;
  /**
   * Map of recognised source unit (lower-cased, punctuation-stripped) to a
   * multiplier that converts the source value into the canonical unit.
   */
  convert: Record<string, number>;
}

/** Strip decoration so "10^9/L", "x10*9/l" and "10e9/L" all collapse together. */
export function normaliseUnitToken(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/µ|μ/g, 'u')
    .replace(/[×x]\s*10\s*[\^*e]?\s*/g, '10^')
    .replace(/10\s*[\^*e]\s*/g, '10^')
    .replace(/\bcells?\b/g, '')
    .replace(/[()[\]]/g, '')
    .replace(/percent/g, '%')
    .replace(/litre|liter/g, 'l')
    .replace(/\/cumm|\/mm3|\/mm³/g, '/mm3')
    .replace(/[.,]$/g, '');
}

/**
 * Canonical units used throughout the engine:
 *   Haemoglobin            g/dL
 *   Cell counts            x10^9/L  (RBC: x10^12/L)
 *   Creatinine, bilirubin  µmol/L
 *   Urea, glucose, lactate mmol/L
 *   Electrolytes           mmol/L
 *   Enzymes                U/L
 *   CRP                    mg/L
 *   Troponin               ng/L
 *   Gas tensions           kPa
 */
export const UNIT_RULES: Record<string, UnitRule> = {
  hb: { canonical: 'g/dL', convert: { 'g/dl': 1, 'gm/dl': 1, 'g%': 1, 'g/l': 0.1, 'gm/l': 0.1, 'mmol/l': 1.611 } },
  hct: { canonical: '%', convert: { '%': 1, 'l/l': 100, '': 1 } },
  rbc: { canonical: 'x10^12/L', convert: { '10^12/l': 1, '10^6/ul': 1, 'm/ul': 1, 'mill/cumm': 1, '/mm3': 1e-6 } },
  mcv: { canonical: 'fL', convert: { fl: 1, um3: 1, 'u^3': 1 } },
  mch: { canonical: 'pg', convert: { pg: 1 } },
  mchc: { canonical: 'g/dL', convert: { 'g/dl': 1, 'g/l': 0.1, '%': 1 } },
  rdw: { canonical: '%', convert: { '%': 1, fl: 1 } },
  wbc: { canonical: 'x10^9/L', convert: { '10^9/l': 1, '10^3/ul': 1, 'k/ul': 1, 'th/ul': 1, '/mm3': 0.001, '/ul': 0.001 } },
  plt: { canonical: 'x10^9/L', convert: { '10^9/l': 1, '10^3/ul': 1, 'k/ul': 1, 'th/ul': 1, '/mm3': 0.001, '/ul': 0.001, 'lakhs/cumm': 100 } },
  creatinine: { canonical: 'umol/L', convert: { 'umol/l': 1, 'mg/dl': 88.4, 'mg/l': 8.84, 'mmol/l': 1000 } },
  urea: { canonical: 'mmol/L', convert: { 'mmol/l': 1, 'mg/dl': 0.1665, 'g/l': 16.65 } },
  bun: { canonical: 'mmol/L', convert: { 'mg/dl': 0.357, 'mmol/l': 1 } },
  glucose: { canonical: 'mmol/L', convert: { 'mmol/l': 1, 'mg/dl': 0.0555 } },
  lactate: { canonical: 'mmol/L', convert: { 'mmol/l': 1, 'mg/dl': 0.111 } },
  bilirubinTotal: { canonical: 'umol/L', convert: { 'umol/l': 1, 'mg/dl': 17.1 } },
  bilirubinDirect: { canonical: 'umol/L', convert: { 'umol/l': 1, 'mg/dl': 17.1 } },
  calcium: { canonical: 'mmol/L', convert: { 'mmol/l': 1, 'mg/dl': 0.25, 'meq/l': 0.5 } },
  magnesium: { canonical: 'mmol/L', convert: { 'mmol/l': 1, 'mg/dl': 0.4114, 'meq/l': 0.5 } },
  phosphate: { canonical: 'mmol/L', convert: { 'mmol/l': 1, 'mg/dl': 0.3229 } },
  albumin: { canonical: 'g/L', convert: { 'g/l': 1, 'g/dl': 10 } },
  totalProtein: { canonical: 'g/L', convert: { 'g/l': 1, 'g/dl': 10 } },
  fibrinogen: { canonical: 'g/L', convert: { 'g/l': 1, 'mg/dl': 0.01 } },
  ddimer: { canonical: 'mg/L FEU', convert: { 'mg/lfeu': 1, 'mg/l': 1, 'ug/ml': 1, 'ng/ml': 0.001, 'ug/mlfeu': 1, 'ng/mlfeu': 0.001, 'ug/l': 0.001 } },
  crp: { canonical: 'mg/L', convert: { 'mg/l': 1, 'mg/dl': 10 } },
  procalcitonin: { canonical: 'ng/mL', convert: { 'ng/ml': 1, 'ug/l': 1 } },
  ferritin: { canonical: 'ug/L', convert: { 'ug/l': 1, 'ng/ml': 1 } },
  troponin: { canonical: 'ng/L', convert: { 'ng/l': 1, 'pg/ml': 1, 'ng/ml': 1000, 'ug/l': 1000 } },
  bnp: { canonical: 'pg/mL', convert: { 'pg/ml': 1, 'ng/l': 1 } },
  ntprobnp: { canonical: 'pg/mL', convert: { 'pg/ml': 1, 'ng/l': 1 } },
  gasTension: { canonical: 'kPa', convert: { kpa: 1, mmhg: 0.1333, torr: 0.1333 } },
  enzyme: { canonical: 'U/L', convert: { 'u/l': 1, 'iu/l': 1, 'ku/l': 1000 } },
  percent: { canonical: '%', convert: { '%': 1 } },
  seconds: { canonical: 's', convert: { s: 1, sec: 1, secs: 1, seconds: 1 } },
  ratio: { canonical: '', convert: { '': 1, ratio: 1 } },
  antixa: { canonical: 'IU/mL', convert: { 'iu/ml': 1, 'u/ml': 1, 'iu/l': 0.001 } },
};

/**
 * Convert a raw (value, unit) pair into the canonical unit for `ruleKey`.
 * Returns the original value unchanged when the unit is unrecognised — the
 * clinician review step surfaces the raw text so this stays visible.
 */
export function toCanonical(
  ruleKey: string,
  value: number,
  rawUnit: string | undefined,
): { value: number; unit: string; converted: boolean } {
  const rule = UNIT_RULES[ruleKey];
  if (!rule) return { value, unit: rawUnit ?? '', converted: false };
  if (!rawUnit) return { value, unit: rule.canonical, converted: false };

  const token = normaliseUnitToken(rawUnit);
  const direct = rule.convert[token];
  if (direct !== undefined) {
    return { value: round(value * direct), unit: rule.canonical, converted: direct !== 1 };
  }
  // Tolerate a trailing/leading qualifier such as "mg/dL (calc)".
  for (const [k, mult] of Object.entries(rule.convert)) {
    if (k && token.includes(k)) {
      return { value: round(value * mult), unit: rule.canonical, converted: mult !== 1 };
    }
  }
  return { value, unit: rule.canonical, converted: false };
}

export const round = (n: number, dp = 3): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/** Format a number for display without exposing float noise. */
export function fmt(n: number | null | undefined, dp?: number): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  if (dp !== undefined) return n.toFixed(dp);
  const abs = Math.abs(n);
  if (abs >= 100) return n.toFixed(0);
  if (abs >= 10) return n.toFixed(1);
  if (abs >= 1) return n.toFixed(2).replace(/0$/, '');
  return n.toFixed(3).replace(/0$/, '');
}
