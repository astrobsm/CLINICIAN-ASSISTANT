/**
 * Laboratory value extraction from OCR text.
 *
 * Handles the layouts encountered in practice: label/value/unit/reference on
 * one row, label on one row with the value beneath, values expressed in SI or
 * conventional units, differentials given as percentages, and the assorted
 * character confusions OCR produces on printed reports.
 *
 * Every extracted value keeps its original text so the clinician review step
 * can show exactly what was read before normalisation.
 */
import { SYNONYM_INDEX, ANALYTE_BY_KEY, refForPatient, type AnalyteDef } from '../clinical/referenceRanges';
import { toCanonical, round } from '../clinical/units';
import type { Analyte, Observation, PatientContext } from '../clinical/types';

/** Repair the character confusions Tesseract makes inside numeric tokens. */
export function repairNumeric(token: string): string {
  return token
    .replace(/[Oo]/g, '0')
    .replace(/[lI|]/g, '1')
    .replace(/[Ss]/g, '5')
    .replace(/[Bb]/g, '8')
    .replace(/[Zz]/g, '2')
    .replace(/[Gg]/g, '6')
    .replace(/,/g, '.');
}

const NUM = /[<>]?\s*[-+]?\d{1,7}(?:[.,]\d{1,4})?/g;
const RANGE_SEP = /^\s*(?:-|–|—|~|to|:)\s*$/i;
const FLAG_TOKENS = /^(?:h|l|hh|ll|n|a|abn|abnormal|normal|high|low|crit|critical|\*+|\^+|\+|↑|↓)$/i;

/** Tokens that are never units. */
const NON_UNITS = new Set([
  'ref', 'range', 'reference', 'result', 'normal', 'value', 'flag', 'previous', 'prev',
  'high', 'low', 'and', 'to', 'or', 'the', 'of', 'in', 'on', 'at', 'by', 'per',
]);

function looksLikeUnit(tok: string): boolean {
  const t = tok.replace(/[(),;]/g, '').trim();
  if (!t) return false;
  if (NON_UNITS.has(t.toLowerCase())) return false;
  if (FLAG_TOKENS.test(t)) return false;
  if (/^\d+(?:\.\d+)?$/.test(t)) return false;
  return /[a-zA-Zµμ%^]/.test(t) && t.length <= 16;
}

/** Strip bracketed reference ranges, retaining them for display. */
function splitRefRange(rest: string): { body: string; refText: string } {
  let refText = '';
  const body = rest.replace(/[([]([^)\]]*?)[)\]]/g, (_m, inner: string) => {
    if (/\d\s*(?:-|–|—|to)\s*\d/.test(inner) || /^[<>]\s*\d/.test(inner.trim())) {
      refText = refText || inner.trim();
      return ' ';
    }
    return ` ${inner} `;
  });
  return { body, refText };
}

interface ExtractedNumber {
  value: number;
  raw: string;
  unit: string;
  index: number;
}

/** Parse "4.5 - 17.0", "< 5" or "> 90" into bounds. */
function parseRefText(refText: string): { low?: number; high?: number } | undefined {
  if (!refText) return undefined;
  const pair = /(-?\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(-?\d+(?:\.\d+)?)/.exec(refText);
  if (pair) {
    const low = parseFloat(pair[1]);
    const high = parseFloat(pair[2]);
    if (Number.isFinite(low) && Number.isFinite(high) && high > low) return { low, high };
    return undefined;
  }
  const upper = /^[\s(]*[<≤]\s*(-?\d+(?:\.\d+)?)/.exec(refText);
  if (upper) return { high: parseFloat(upper[1]) };
  const lower = /^[\s(]*[>≥]\s*(-?\d+(?:\.\d+)?)/.exec(refText);
  if (lower) return { low: parseFloat(lower[1]) };
  return undefined;
}

/** Pull the reported value (not the reference range) out of the tail of a line. */
function extractValues(rest: string): ExtractedNumber[] {
  const { body } = splitRefRange(rest);
  const matches = [...body.matchAll(NUM)];
  const out: ExtractedNumber[] = [];

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const next = matches[i + 1];
    if (next) {
      const between = body.slice((m.index ?? 0) + m[0].length, next.index ?? 0);
      if (RANGE_SEP.test(between)) {
        // This pair is a reference interval — skip both.
        i++;
        continue;
      }
    }
    const rawText = m[0].trim();
    const numeric = parseFloat(rawText.replace(/[<>\s]/g, '').replace(',', '.'));
    if (Number.isNaN(numeric)) continue;

    // Unit is whatever follows, up to two tokens (handles "x10^9 /L").
    const after = body.slice((m.index ?? 0) + m[0].length);
    const tokens = after.trim().split(/\s+/).slice(0, 2);
    let unit = '';
    if (tokens[0] && looksLikeUnit(tokens[0])) {
      unit = tokens[0].replace(/[(),;]/g, '');
      if (tokens[1] && /^\/[a-zA-Z]/.test(tokens[1])) unit += tokens[1];
    }
    out.push({ value: numeric, raw: rawText, unit, index: m.index ?? 0 });
  }
  return out;
}

interface LabelHit {
  def: AnalyteDef;
  endIndex: number;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Strip table furniture from the start of a row.
 *
 * Printed laboratory tables carry a leading "Investigation" column — "FBC",
 * "U&E", "LFT" — and cell borders that recognition reads as pipes or dashes.
 * Anything before the parameter name has to come off, or a three-letter
 * analyte can never be at the start of the line where it is looked for.
 */
const ROW_PREFIX = /^[\s|*•·.\-–—]*(?:(?:fbc|cbc|u&e|ue|lft|lfts|rft|abg|mcs|bio|chem|haem|heam|test|investigation)\b[\s|:.\-–—]*)?/i;

function matchLabel(line: string): LabelHit | null {
  const prefix = ROW_PREFIX.exec(line)?.[0] ?? '';
  const body = line.slice(prefix.length);
  const lower = body.toLowerCase();

  // Token starts, so a short synonym can be required to be a whole word near
  // the beginning of the parameter name rather than at character zero.
  const tokenStarts: number[] = [];
  let inToken = false;
  for (let i = 0; i < body.length; i++) {
    const isSep = /[\s|:]/.test(body[i]);
    if (!isSep && !inToken) { tokenStarts.push(i); inToken = true; }
    else if (isSep) inToken = false;
  }
  const thirdTokenEnd = tokenStarts[3] ?? body.length;

  for (const { phrase, def } of SYNONYM_INDEX) {
    if (phrase.length <= 2) {
      // One and two letter synonyms (k, na, cl, ca, pt, tt, ig, ph) stay
      // anchored: "mg" and "pt" occur inside units and ordinary words often
      // enough that a loose match would mislabel whole rows.
      const m = new RegExp(`^[\\s*•.\\-]*${escapeRe(phrase)}\\b`, 'i').exec(body);
      if (m) return { def, endIndex: prefix.length + m[0].length };
      continue;
    }

    if (phrase.length === 3) {
      // Three-letter abbreviations must be a whole word inside the first few
      // tokens — enough to survive a leading category column, tight enough
      // that a stray match later in the row cannot claim the value.
      const re = new RegExp(`\\b${escapeRe(phrase)}\\b`, 'i');
      const m = re.exec(body);
      if (m && (m.index ?? 0) < thirdTokenEnd) {
        return { def, endIndex: prefix.length + (m.index ?? 0) + m[0].length };
      }
      continue;
    }

    const idx = lower.indexOf(phrase);
    if (idx >= 0 && idx <= 28) {
      return { def, endIndex: prefix.length + idx + phrase.length };
    }
  }
  return null;
}

export interface LabParseResult {
  analytes: Analyte[];
  /** Differential percentages held back for conversion once WBC is known. */
  percentages: { key: string; percent: number; raw: string }[];
  observations: Observation[];
}

/** Dipstick / qualitative fields captured as observations. */
const QUALITATIVE: { key: string; label: string; patterns: RegExp[] }[] = [
  { key: 'urinalysis:protein', label: 'Urine protein', patterns: [/^\s*(?:urine\s+)?protein\b/i] },
  { key: 'urinalysis:blood', label: 'Urine blood', patterns: [/^\s*(?:urine\s+)?(?:blood|haemoglobin \(dipstick\))\b/i, /^\s*erythrocytes?\b/i] },
  { key: 'urinalysis:leucocytes', label: 'Leucocyte esterase', patterns: [/^\s*(?:urine\s+)?(?:leu[ck]ocytes?|leu[ck]ocyte esterase|pus cells)\b/i] },
  { key: 'urinalysis:nitrite', label: 'Nitrite', patterns: [/^\s*nitrites?\b/i] },
  { key: 'urinalysis:glucose', label: 'Urine glucose', patterns: [/^\s*(?:urine\s+)?glucose\b/i] },
  { key: 'urinalysis:ketones', label: 'Urine ketones', patterns: [/^\s*ketones?\b/i] },
  { key: 'urinalysis:bilirubin', label: 'Urine bilirubin', patterns: [/^\s*(?:urine\s+)?bilirubin\b/i] },
  { key: 'urinalysis:urobilinogen', label: 'Urobilinogen', patterns: [/^\s*urobilinogen\b/i] },
  { key: 'urinalysis:microscopy', label: 'Urine microscopy', patterns: [/^\s*(?:urine\s+)?microscopy\b/i, /^\s*casts?\b/i, /^\s*epithelial cells?\b/i] },
];

const QUALITATIVE_VALUE = /(negative|neg\b|nil\b|not detected|absent|trace|positive|pos\b|\+{1,4}|[0-3]\s*\+|present|few|moderate|many|occasional|numerous|large|small|\bnad\b)/i;

export function parseLabValues(
  text: string,
  patient: PatientContext,
  sourceId: string,
  confidence: number,
): LabParseResult {
  const analytes: Analyte[] = [];
  const percentages: LabParseResult['percentages'] = [];
  const observations: Observation[] = [];
  const seen = new Set<string>();

  const rawLines = text.split(/\r?\n/);
  const lines = rawLines.map((l) => l.replace(/\s+/g, ' ').trim());

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.length < 2) continue;

    // ── Qualitative / dipstick fields ────────────────────────────────
    const qual = QUALITATIVE.find((q) => q.patterns.some((p) => p.test(line)));
    if (qual && !/\d+\.\d/.test(line)) {
      const vm = QUALITATIVE_VALUE.exec(line);
      if (vm && !observations.some((o) => o.key === qual.key)) {
        observations.push({
          key: qual.key,
          label: qual.label,
          value: vm[0].trim(),
          rawText: line,
          confidence,
          edited: false,
          sourceId,
        });
        continue;
      }
      if (qual.key === 'urinalysis:microscopy') {
        const tail = line.replace(/^\s*(?:urine\s+)?microscopy\b\s*[:\-]?\s*/i, '').trim();
        if (tail && !observations.some((o) => o.key === qual.key)) {
          observations.push({ key: qual.key, label: qual.label, value: tail, rawText: line, confidence, edited: false, sourceId });
          continue;
        }
      }
    }

    // ── Numeric analytes ─────────────────────────────────────────────
    const hit = matchLabel(line);
    if (!hit) continue;

    let rest = line.slice(hit.endIndex);
    // Values sometimes sit on the following line in two-column layouts, with
    // the unit on the line after that. Both are pulled in, because a
    // differential read without its unit is indistinguishable from an absolute
    // count and would be graded on the wrong scale entirely.
    if (!/\d/.test(rest) && lines[i + 1] && /^\s*[<>]?\s*[-+]?\d/.test(lines[i + 1])) {
      rest = lines[i + 1];
      const after = lines[i + 2];
      if (after && !/\d/.test(after) && looksLikeUnit(after.trim()) && after.trim().length <= 12) {
        rest = `${rest} ${after.trim()}`;
      }
    }
    if (!/\d/.test(rest)) continue;

    const values = extractValues(rest);
    if (!values.length) continue;

    const def = hit.def;
    let chosen = values[0];

    // Differentials: prefer the absolute count over the percentage.
    const isDifferential = ['neut', 'lymph', 'mono', 'eos', 'baso'].includes(def.key);
    if (isDifferential && values.length > 1) {
      const abs = values.find((v) => /10[\^*e]?9|10\^9|k\/ul|th\/ul|\/mm3/i.test(v.unit));
      if (abs) chosen = abs;
      else if (/%/.test(values[0].unit) && !/%/.test(values[1].unit)) chosen = values[1];
    }

    // A percentage-only differential is deferred until WBC is known.
    if (isDifferential && /%/.test(chosen.unit)) {
      percentages.push({ key: def.key, percent: chosen.value, raw: line });
      continue;
    }

    // A differential reported without any unit is ambiguous. Treat it as a
    // percentage when it cannot be an absolute count — a subset of the white
    // cells cannot outnumber the total, and no differential reaches 100 ×10⁹/L
    // in practice. Reading 68.6% as 68.6 ×10⁹/L would otherwise be reported as
    // a leukaemoid reaction requiring urgent haematology review.
    if (isDifferential && !chosen.unit) {
      const wbcSoFar = analytes.find((a) => a.key === 'wbc')?.value;
      const impossibleAsAbsolute =
        (wbcSoFar !== undefined && chosen.value > wbcSoFar * 1.05) || chosen.value > 100;
      if (impossibleAsAbsolute && chosen.value <= 100) {
        percentages.push({ key: def.key, percent: chosen.value, raw: line });
        continue;
      }
    }

    const conv = toCanonical(def.unitRule, chosen.value, chosen.unit || undefined);

    // Plausibility guard against OCR misreads (decimal point loss is the classic).
    const plaus = def.plausible;
    if (plaus) {
      let v = conv.value;
      if ((plaus.low !== undefined && v < plaus.low) || (plaus.high !== undefined && v > plaus.high)) {
        // Try the common failure: a lost decimal point.
        const alt = v / 10;
        const alt2 = v * 10;
        const ok = (x: number) => (plaus.low === undefined || x >= plaus.low) && (plaus.high === undefined || x <= plaus.high);
        if (ok(alt)) v = alt;
        else if (ok(alt2)) v = alt2;
        else continue; // reject implausible reading entirely
        conv.value = round(v, 4);
      }
    }

    if (seen.has(def.key)) continue;
    seen.add(def.key);

    const ref = refForPatient(def, patient);

    // The interval printed beside the result belongs to the assay that
    // produced it, so it is preferred over the built-in default for grading.
    // It is only trusted when it is in the same units as the value — a range
    // that would call this very result absurd is a misread, not a range.
    const printed = parseRefText(splitRefRange(line.slice(hit.endIndex)).refText);
    const printedUsable =
      printed !== undefined &&
      (printed.low === undefined || conv.value >= printed.low * 0.05) &&
      (printed.high === undefined || conv.value <= printed.high * 20);

    analytes.push({
      key: def.key,
      label: def.label,
      value: round(conv.value, 4),
      unit: conv.unit || def.unit,
      rawText: line,
      rawValue: chosen.value,
      rawUnit: chosen.unit || undefined,
      confidence,
      edited: false,
      refLow: printedUsable ? printed!.low ?? ref?.low : ref?.low,
      refHigh: printedUsable ? printed!.high ?? ref?.high : ref?.high,
      printedRefLow: printedUsable ? printed!.low : undefined,
      printedRefHigh: printedUsable ? printed!.high : undefined,
      refSource: printedUsable ? 'report' : 'built-in',
      sourceId,
    });
  }

  return { analytes, percentages, observations };
}

/** Convert deferred differential percentages into absolute counts using WBC. */
export function resolvePercentages(
  result: LabParseResult,
  patient: PatientContext,
  sourceId: string,
  confidence: number,
): Analyte[] {
  const wbc = result.analytes.find((a) => a.key === 'wbc');
  if (!wbc) {
    // Without a total white cell count the absolute values cannot be derived.
    // The percentages are still recorded, rather than discarded, so the
    // clinician can see what was on the report and enter the white count.
    for (const p of result.percentages) {
      const def = ANALYTE_BY_KEY[p.key];
      if (!def || result.observations.some((o) => o.key === `fbc:${p.key}pct`)) continue;
      result.observations.push({
        key: `fbc:${p.key}pct`,
        label: `${def.label.replace(' (absolute)', '')} (percentage)`,
        value: `${p.percent}%`,
        rawText: `${p.raw} — absolute count not derivable without a white cell count`,
        confidence,
        edited: false,
        sourceId,
      });
    }
    return [];
  }
  // A differential adds up to 100%. A sum well away from that means one of the
  // percentages was misread, and a lost decimal point is by far the commonest
  // way for that to happen — "1.1" read as "11". Where dividing exactly one
  // value by ten restores the total, that value is corrected and marked as
  // needing verification; where the discrepancy cannot be pinned on a single
  // value, nothing is changed and the clinician is told the sum is wrong.
  const total = result.percentages.reduce((a, p) => a + p.percent, 0);
  if (result.percentages.length >= 4 && Math.abs(total - 100) > 3) {
    const candidates = result.percentages.filter(
      (p) => Math.abs(total - p.percent * 0.9 - 100) <= 1.5,
    );
    if (candidates.length === 1) {
      const c = candidates[0];
      const def = ANALYTE_BY_KEY[c.key];
      result.observations.push({
        key: `fbc:${c.key}corrected`,
        label: `${def?.label.replace(' (absolute)', '') ?? c.key} percentage corrected`,
        value: `${c.percent}% → ${round(c.percent / 10, 2)}%`,
        rawText: `The differential summed to ${round(total, 1)}%. Dividing this value by ten restores the total to 100%, which is the signature of a decimal point lost in recognition. Verify against the report.`,
        confidence: 0.4,
        edited: false,
        sourceId,
      });
      c.percent = round(c.percent / 10, 3);
    } else {
      result.observations.push({
        key: 'fbc:differentialsum',
        label: 'Differential does not sum to 100%',
        value: `${round(total, 1)}%`,
        rawText: 'The white cell differential percentages read from the report do not total 100%. At least one was misread — check each against the source before relying on the absolute counts.',
        confidence: 0.4,
        edited: false,
        sourceId,
      });
    }
  }

  const out: Analyte[] = [];
  for (const p of result.percentages) {
    if (result.analytes.some((a) => a.key === p.key)) continue;
    const def = ANALYTE_BY_KEY[p.key];
    if (!def) continue;
    const abs = round((p.percent / 100) * wbc.value, 3);
    const ref = refForPatient(def, patient);
    out.push({
      key: def.key,
      label: `${def.label} (derived from ${p.percent}% × WBC)`,
      value: abs,
      unit: def.unit,
      rawText: p.raw,
      rawValue: p.percent,
      rawUnit: '%',
      confidence: confidence * 0.9,
      edited: false,
      refLow: ref?.low,
      refHigh: ref?.high,
      sourceId,
    });
  }
  return out;
}

// ───────────────────────── Demographics ─────────────────────────

export interface ParsedDemographics {
  name?: string;
  hospitalNumber?: string;
  age?: number;
  sex?: 'male' | 'female';
  collectedAt?: string;
  ward?: string;
  consultant?: string;
}

export function parseDemographics(text: string): ParsedDemographics {
  const out: ParsedDemographics = {};
  const grab = (re: RegExp): string | undefined => {
    const m = re.exec(text);
    return m?.[1]?.trim() || undefined;
  };

  // Report headers place several fields on one line, so cut the captured name
  // at a column gap or at the next field label.
  //
  // A trailing label is only recognised when it is followed by a colon or dash.
  // Matching the bare word would truncate any name that happens to contain one
  // — "PATIENT", "Reg", "Ward" and "No" all occur in real surnames and
  // forenames, and silently shortening a patient's name on a clinical report
  // is not an acceptable failure.
  const LABEL_TAIL = /\s+(?:hospital|hosp|mrn|nhs|dob|d\.o\.b|age|sex|gender|ward|location|unit|reg|patient|id|no|number|collected|reported|date|specimen|consultant|clinician)\s*(?:no\.?|number)?\s*[:#\-–]\s*\S.*$/i;
  // The capture deliberately runs past the value and into any following label,
  // colon included, because the trimming below can only recognise a label by
  // its colon. Stopping the capture at the colon would hide the very evidence
  // needed to know where the value ends.
  const rawName = grab(/(?:patient\s*name|patient|name)\s*[:\-]\s*([A-Za-z][A-Za-z0-9 '`\-,.:#/]{2,80})/i);
  if (rawName) {
    out.name = rawName
      .split(/\s{2,}/)[0]
      .replace(LABEL_TAIL, '')
      .replace(/[\s,.\-]+$/, '')
      .trim() || undefined;
  }
  // Report headers pack several fields onto one line separated by column gaps;
  // trim each captured value at a gap or at the next field label.
  const trimField = (v: string | undefined): string | undefined => {
    if (!v) return undefined;
    return v
      .split(/\s{2,}/)[0]
      .replace(LABEL_TAIL, '')
      .replace(/[\s,.:;\-]+$/, '')
      .trim() || undefined;
  };

  out.hospitalNumber = trimField(grab(/(?:hospital\s*(?:no|number|#)|hosp\s*no|mrn|nhs\s*(?:no|number)|patient\s*id|unit\s*no|reg\s*no)\s*[:\-]?\s*([A-Za-z0-9\- ]{4,24})/i));
  out.ward = trimField(grab(/(?:ward|location|clinical location|unit)\s*[:\-]\s*([A-Za-z0-9 '\-/,.:#]{2,60})/i));
  out.consultant = trimField(grab(/(?:consultant|clinician|requesting (?:doctor|clinician)|referred by)\s*[:\-]\s*([A-Za-z0-9 .'\-,:#]{3,60})/i));

  const ageStr = grab(/\bage\s*[:\-]?\s*(\d{1,3})\s*(?:y(?:ea)?rs?)?/i) ?? grab(/\b(\d{1,3})\s*(?:y\/?o|yrs?|years?)\b/i);
  if (ageStr) {
    const n = parseInt(ageStr, 10);
    if (n > 0 && n < 130) out.age = n;
  }

  const sexStr = grab(/\b(?:sex|gender)\s*[:\-]?\s*(male|female|m|f)\b/i);
  if (sexStr) out.sex = /^m/i.test(sexStr) ? 'male' : 'female';

  const dateStr =
    grab(/(?:collect(?:ed|ion)|sample|specimen|taken|drawn)\s*(?:date|date\/time|on)?\s*[:\-]?\s*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}(?:\s+\d{1,2}:\d{2})?)/i) ??
    grab(/(?:report(?:ed)?|date)\s*[:\-]?\s*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}(?:\s+\d{1,2}:\d{2})?)/i);
  if (dateStr) out.collectedAt = dateStr;

  return out;
}
