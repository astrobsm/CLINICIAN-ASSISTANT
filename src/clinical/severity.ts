/**
 * Priority Alert System.
 *
 * Grades a numeric result against its reference interval and, where defined,
 * against critical / life-threatening action thresholds. Where no action
 * threshold exists the grade is derived from fractional deviation outside the
 * interval, so an analyte 5% out of range never reads the same as one 3x out.
 */
import type { AnalyteDef, Range } from './referenceRanges';
import { refForPatient } from './referenceRanges';
import type { Analyte, PatientContext, Severity } from './types';
import { maxSeverity, severityRank } from './types';

export interface Grade {
  severity: Severity;
  flag: 'low' | 'high' | 'normal';
  /** Fractional distance outside the interval (0 = inside). */
  deviation: number;
  ref?: Range;
}

/** Width used to normalise deviation when only one bound is defined. */
function spanOf(ref: Range, value: number): number {
  if (ref.low !== undefined && ref.high !== undefined) return Math.max(ref.high - ref.low, 1e-9);
  const bound = ref.high ?? ref.low ?? value;
  return Math.max(Math.abs(bound) * 0.5, 1e-9);
}

export function gradeValue(def: AnalyteDef, value: number, patient: PatientContext): Grade {
  const ref = refForPatient(def, patient);
  if (!ref || (ref.low === undefined && ref.high === undefined)) {
    return { severity: 'normal', flag: 'normal', deviation: 0, ref };
  }

  const high = ref.high;
  const low = ref.low;
  let flag: Grade['flag'] = 'normal';
  let excess = 0;

  if (high !== undefined && value > high) {
    flag = 'high';
    excess = value - high;
  } else if (low !== undefined && value < low) {
    flag = 'low';
    excess = low - value;
  }

  if (flag === 'normal') return { severity: 'normal', flag, deviation: 0, ref };

  const deviation = excess / spanOf(ref, value);

  // Explicit action thresholds always win.
  const lt = def.lifeThreat;
  if (lt) {
    if (lt.high !== undefined && value >= lt.high) return { severity: 'life-threatening', flag, deviation, ref };
    if (lt.low !== undefined && value <= lt.low) return { severity: 'life-threatening', flag, deviation, ref };
  }
  const crit = def.crit;
  if (crit) {
    if (crit.high !== undefined && value >= crit.high) return { severity: 'critical', flag, deviation, ref };
    if (crit.low !== undefined && value <= crit.low) return { severity: 'critical', flag, deviation, ref };
  }

  // Graded fallback on deviation outside the interval.
  let severity: Severity;
  if (deviation < 0.15) severity = 'minor';
  else if (deviation < 0.5) severity = 'moderate';
  else if (deviation < 1.5) severity = 'significant';
  else severity = 'critical';

  return { severity, flag, deviation, ref };
}

/** Attach reference interval + flag to an analyte in place and return it. */
export function annotate(a: Analyte, def: AnalyteDef, patient: PatientContext): Analyte {
  const g = gradeValue(def, a.value, patient);
  a.refLow = g.ref?.low;
  a.refHigh = g.ref?.high;
  a.flag = g.flag;
  return a;
}

/** Roll a set of severities up to the highest present. */
export function rollUp(severities: Severity[]): Severity {
  return severities.length ? maxSeverity(...severities) : 'normal';
}

export const isAlerting = (s: Severity): boolean => severityRank(s) >= severityRank('critical');

export const SEVERITY_COLOR: Record<Severity, string> = {
  normal: '#3ddc97',
  minor: '#8fd3ff',
  moderate: '#ffd166',
  significant: '#ff9f43',
  critical: '#ff5b5b',
  'life-threatening': '#ff2d6f',
};
