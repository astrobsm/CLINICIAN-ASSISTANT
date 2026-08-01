/**
 * Institution configuration — hospital branding and local overrides.
 *
 * This holds no patient data, so it is safe to persist to localStorage. It
 * carries the hospital name and crest used on printed reports, and any local
 * reference-interval overrides so laboratory-specific ranges take priority over
 * the built-in defaults.
 */
import { ANALYTE_BY_KEY, type Range } from '../clinical/referenceRanges';

const STORAGE_KEY = 'nexora.clinician-assistant.institution.v1';

export interface InstitutionConfig {
  hospitalName: string;
  departmentName: string;
  addressLine: string;
  /** Data URL of a crest/logo the institution supplies. */
  logoDataUrl: string;
  /** Footer text printed on every page of the report. */
  footerNote: string;
  /** Local reference-interval overrides, keyed by analyte key. */
  rangeOverrides: Record<string, Range>;
}

export const DEFAULT_INSTITUTION: InstitutionConfig = {
  hospitalName: '',
  departmentName: '',
  addressLine: '',
  logoDataUrl: '',
  footerNote: 'Clinical decision support output — verify all values against source documents before acting.',
  rangeOverrides: {},
};

export function loadInstitution(): InstitutionConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_INSTITUTION };
    return { ...DEFAULT_INSTITUTION, ...(JSON.parse(raw) as Partial<InstitutionConfig>) };
  } catch {
    return { ...DEFAULT_INSTITUTION };
  }
}

export function saveInstitution(cfg: InstitutionConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    /* storage unavailable (private mode) — configuration is simply not retained */
  }
  applyRangeOverrides(cfg.rangeOverrides);
}

/**
 * Applies local laboratory intervals over the built-in defaults. Called on
 * start-up and whenever the configuration is saved.
 */
export function applyRangeOverrides(overrides: Record<string, Range>): void {
  for (const [key, range] of Object.entries(overrides)) {
    const def = ANALYTE_BY_KEY[key];
    if (!def) continue;
    def.ref = { ...range };
    // A single institutional interval supersedes the sex-specific defaults.
    delete def.refMale;
    delete def.refFemale;
  }
}
