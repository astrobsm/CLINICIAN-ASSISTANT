/**
 * Assisted extraction client.
 *
 * Off unless the clinician turns it on, and never automatic. The application's
 * whole analysis path runs on the device; this is an optional aid for reports
 * that on-device recognition reads poorly, and every use transmits an image to
 * a third party. That is stated at the point of use, not in documentation.
 */
import type { Analyte, PatientContext } from '../clinical/types';
import { ANALYTE_BY_KEY, refForPatient } from '../clinical/referenceRanges';
import { toCanonical, round } from '../clinical/units';

const ENDPOINT = new URL('api/extract', document.baseURI).href;
const CONSENT_KEY = 'nexora.clinician-assistant.ai-consent.v1';
const ENABLED_KEY = 'nexora.clinician-assistant.ai-enabled.v1';

export interface AiAvailability {
  /** The deployment exposes the endpoint and has a key configured. */
  available: boolean;
  /** The clinician has switched the feature on. */
  enabled: boolean;
  /** Consent has been given in this browser. */
  consented: boolean;
  reason: string;
}

export interface AiExtractedValue {
  key: string;
  value: number;
  unit: string;
  printedText: string;
  refLow: number | null;
  refHigh: number | null;
  confidence: number;
}

export interface AiExtraction {
  model: string;
  values: AiExtractedValue[];
  differentialPercentages: { key: string; percent: number }[];
  unreadable: string[];
}

let cachedAvailability: boolean | null = null;

export function isEnabled(): boolean {
  try { return localStorage.getItem(ENABLED_KEY) === '1'; } catch { return false; }
}

export function setEnabled(on: boolean): void {
  try {
    if (on) localStorage.setItem(ENABLED_KEY, '1');
    else localStorage.removeItem(ENABLED_KEY);
  } catch { /* private mode */ }
}

export function hasConsented(): boolean {
  try { return localStorage.getItem(CONSENT_KEY) === '1'; } catch { return false; }
}

export function recordConsent(given: boolean): void {
  try {
    if (given) localStorage.setItem(CONSENT_KEY, '1');
    else localStorage.removeItem(CONSENT_KEY);
  } catch { /* private mode */ }
}

/**
 * Whether the deployment can serve assisted extraction.
 *
 * Probed rather than assumed: the same build runs from a static host with no
 * functions at all, and from a phone with no signal.
 */
export async function checkAvailability(): Promise<AiAvailability> {
  const enabled = isEnabled();
  const consented = hasConsented();

  if (!navigator.onLine) {
    return { available: false, enabled, consented, reason: 'This device is offline. On-device recognition is unaffected.' };
  }
  if (cachedAvailability !== null) {
    return {
      available: cachedAvailability,
      enabled,
      consented,
      reason: cachedAvailability ? 'Available on this deployment.' : 'This deployment does not provide assisted extraction.',
    };
  }

  try {
    const res = await fetch(ENDPOINT, { method: 'GET', cache: 'no-store' });
    if (!res.ok) {
      cachedAvailability = false;
      return { available: false, enabled, consented, reason: 'This deployment does not provide assisted extraction.' };
    }
    const data = (await res.json()) as { available?: boolean };
    cachedAvailability = Boolean(data.available);
    return {
      available: cachedAvailability,
      enabled,
      consented,
      reason: cachedAvailability
        ? 'Available on this deployment.'
        : 'The deployment has no extraction key configured.',
    };
  } catch {
    cachedAvailability = false;
    return { available: false, enabled, consented, reason: 'The extraction service could not be reached.' };
  }
}

export async function extractFromImage(
  imageDataUrl: string,
  context: string,
): Promise<AiExtraction> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageDataUrl, context }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `Extraction failed (${res.status}).`);
  }
  return data as AiExtraction;
}

/**
 * Convert transcribed values into analytes, applying the same unit
 * normalisation and plausibility guards as a locally read value.
 *
 * Provenance is recorded on every entry: a clinician reviewing the table must
 * be able to see at a glance which numbers a model produced.
 */
export function toAnalytes(
  extraction: AiExtraction,
  patient: PatientContext,
  sourceId: string,
): { analytes: Analyte[]; rejected: string[] } {
  const analytes: Analyte[] = [];
  const rejected: string[] = [];

  const wbcEntry = extraction.values.find((v) => v.key === 'wbc');

  const add = (key: string, rawValue: number, rawUnit: string, printed: string, conf: number, refLow: number | null, refHigh: number | null) => {
    const def = ANALYTE_BY_KEY[key];
    if (!def) return;

    const conv = toCanonical(def.unitRule, rawValue, rawUnit || undefined);
    const plaus = def.plausible;
    if (plaus) {
      const v = conv.value;
      const outside = (plaus.low !== undefined && v < plaus.low) || (plaus.high !== undefined && v > plaus.high);
      if (outside) {
        rejected.push(`${def.label}: ${rawValue} ${rawUnit} is outside the plausible range and was discarded.`);
        return;
      }
    }

    const builtIn = refForPatient(def, patient);
    const printedUsable = refLow !== null || refHigh !== null;

    analytes.push({
      key: def.key,
      label: def.label,
      value: round(conv.value, 4),
      unit: conv.unit || def.unit,
      rawText: printed || `${rawValue} ${rawUnit}`.trim(),
      rawValue,
      rawUnit: rawUnit || undefined,
      confidence: Math.max(0, Math.min(1, conf)),
      edited: false,
      refLow: printedUsable ? refLow ?? builtIn?.low : builtIn?.low,
      refHigh: printedUsable ? refHigh ?? builtIn?.high : builtIn?.high,
      printedRefLow: printedUsable ? refLow ?? undefined : undefined,
      printedRefHigh: printedUsable ? refHigh ?? undefined : undefined,
      refSource: printedUsable ? 'report' : 'built-in',
      sourceId,
    });
  };

  for (const v of extraction.values) {
    add(v.key, v.value, v.unit, v.printedText, v.confidence, v.refLow, v.refHigh);
  }

  // Differentials given as percentages become absolute counts only when a
  // white cell count is available to derive them from.
  if (wbcEntry) {
    const wbcAnalyte = analytes.find((a) => a.key === 'wbc');
    const wbc = wbcAnalyte?.value;
    if (wbc !== undefined) {
      for (const d of extraction.differentialPercentages) {
        if (analytes.some((a) => a.key === d.key)) continue;
        const def = ANALYTE_BY_KEY[d.key];
        if (!def) continue;
        const builtIn = refForPatient(def, patient);
        analytes.push({
          key: def.key,
          label: `${def.label} (derived from ${d.percent}% × WBC)`,
          value: round((d.percent / 100) * wbc, 3),
          unit: def.unit,
          rawText: `${d.percent}% of ${wbc} ×10⁹/L`,
          rawValue: d.percent,
          rawUnit: '%',
          confidence: 0.85,
          edited: false,
          refLow: builtIn?.low,
          refHigh: builtIn?.high,
          refSource: 'built-in',
          sourceId,
        });
      }
    }
  }

  return { analytes, rejected };
}
