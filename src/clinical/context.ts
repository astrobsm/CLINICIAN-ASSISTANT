/**
 * Shared helpers every analysis module uses to read values out of the extracted
 * dataset without repeating null-handling.
 */
import { ANALYTE_BY_KEY, refForPatient } from './referenceRanges';
import { gradeValue } from './severity';
import type { Analyte, EcgData, MicrobiologyReport, Observation, PatientContext, Severity } from './types';

export interface Extraction {
  analytes: Analyte[];
  observations: Observation[];
  micro: MicrobiologyReport[];
  ecg: EcgData[];
}

export const emptyExtraction = (): Extraction => ({ analytes: [], observations: [], micro: [], ecg: [] });

/** Read-only façade over the extracted values for a single patient episode. */
export class ClinicalContext {
  readonly byKey = new Map<string, Analyte>();
  readonly obsByKey = new Map<string, Observation>();

  constructor(
    readonly patient: PatientContext,
    readonly extraction: Extraction,
  ) {
    // Later documents win, so a repeat sample supersedes an older one.
    for (const a of extraction.analytes) this.byKey.set(a.key, a);
    for (const o of extraction.observations) this.obsByKey.set(o.key, o);
  }

  /** Numeric value or null. */
  v(key: string): number | null {
    const a = this.byKey.get(key);
    return a ? a.value : null;
  }

  has(...keys: string[]): boolean {
    return keys.some((k) => this.byKey.has(k));
  }

  hasAll(...keys: string[]): boolean {
    return keys.every((k) => this.byKey.has(k));
  }

  analyte(key: string): Analyte | undefined {
    return this.byKey.get(key);
  }

  obs(key: string): string | null {
    return this.obsByKey.get(key)?.value ?? null;
  }

  /** True when value is above the upper reference limit. */
  high(key: string): boolean {
    return this.flag(key) === 'high';
  }

  low(key: string): boolean {
    return this.flag(key) === 'low';
  }

  flag(key: string): 'low' | 'high' | 'normal' | null {
    const a = this.byKey.get(key);
    const def = ANALYTE_BY_KEY[key];
    if (!a || !def) return null;
    return gradeValue(def, a.value, this.patient).flag;
  }

  severityOf(key: string): Severity {
    const a = this.byKey.get(key);
    const def = ANALYTE_BY_KEY[key];
    if (!a || !def) return 'normal';
    return gradeValue(def, a.value, this.patient).severity;
  }

  refLow(key: string): number | undefined {
    const def = ANALYTE_BY_KEY[key];
    return def ? refForPatient(def, this.patient)?.low : undefined;
  }

  refHigh(key: string): number | undefined {
    const def = ANALYTE_BY_KEY[key];
    return def ? refForPatient(def, this.patient)?.high : undefined;
  }

  /** Analytes belonging to one module, in dictionary order. */
  moduleAnalytes(module: string): Analyte[] {
    return [...this.byKey.values()].filter((a) => ANALYTE_BY_KEY[a.key]?.module === module);
  }

  moduleObservations(module: string): Observation[] {
    return [...this.obsByKey.values()].filter((o) => o.key.startsWith(`${module}:`));
  }

  /** Comparison against a threshold, false when the analyte is absent. */
  gt(key: string, n: number): boolean {
    const v = this.v(key);
    return v !== null && v > n;
  }

  lt(key: string, n: number): boolean {
    const v = this.v(key);
    return v !== null && v < n;
  }

  between(key: string, lo: number, hi: number): boolean {
    const v = this.v(key);
    return v !== null && v >= lo && v <= hi;
  }
}

/** Small helper for building deduplicated string lists in module output. */
export const uniq = (xs: string[]): string[] => [...new Set(xs.filter(Boolean))];
