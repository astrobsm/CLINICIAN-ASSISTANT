/**
 * Reconciliation of computed measurements against those printed on the report.
 *
 * The two are kept side by side rather than one overriding the other. The
 * printed values come from the recording equipment's own analysis of the raw
 * digital signal and are generally more accurate than anything recoverable
 * from paper; the computed values are independent and are available when the
 * printout carries no measurements at all. Where they disagree materially the
 * clinician is told, and adjudicates.
 */
import type { Discrepancy, WaveformAnalysis } from './types';

interface Field {
  key: string;
  label: string;
  unit: string;
  /** Difference beyond which the disagreement is worth raising. */
  tolerance: number;
  computed: (w: WaveformAnalysis) => number | null;
  printed: (p: PrintedMeasurements) => number | null;
}

export interface PrintedMeasurements {
  rateBpm: number | null;
  prMs: number | null;
  qrsMs: number | null;
  qtMs: number | null;
  qtcMs: number | null;
  axisDegrees: number | null;
}

const FIELDS: Field[] = [
  { key: 'rate', label: 'Heart rate', unit: ' bpm', tolerance: 8, computed: (w) => w.measurements.heartRateBpm, printed: (p) => p.rateBpm },
  { key: 'pr', label: 'PR interval', unit: ' ms', tolerance: 30, computed: (w) => w.measurements.prMs, printed: (p) => p.prMs },
  { key: 'qrs', label: 'QRS duration', unit: ' ms', tolerance: 25, computed: (w) => w.measurements.qrsMs, printed: (p) => p.qrsMs },
  { key: 'qt', label: 'QT interval', unit: ' ms', tolerance: 40, computed: (w) => w.measurements.qtMs, printed: (p) => p.qtMs },
  { key: 'qtc', label: 'QTc interval', unit: ' ms', tolerance: 40, computed: (w) => w.measurements.qtcBazettMs, printed: (p) => p.qtcMs },
  { key: 'axis', label: 'Cardiac axis', unit: '°', tolerance: 30, computed: (w) => w.measurements.axisDeg, printed: (p) => p.axisDegrees },
];

export function reconcile(waveform: WaveformAnalysis, printed: PrintedMeasurements): Discrepancy[] {
  const out: Discrepancy[] = [];

  for (const f of FIELDS) {
    const computed = f.computed(waveform);
    const p = f.printed(printed);
    if (computed === null || p === null) continue;

    const diff = Math.abs(computed - p);
    const significant = diff > f.tolerance;
    if (!significant) continue;

    out.push({
      field: f.label,
      computed,
      printed: p,
      unit: f.unit.trim(),
      significant,
      note:
        `Computed ${Math.round(computed)}${f.unit} from the digitised trace against ${Math.round(p)}${f.unit} printed on the report ` +
        `(difference ${Math.round(diff)}${f.unit}). ` +
        (waveform.quality.score < 0.6
          ? 'Digitisation quality is low, so the printed value should generally be preferred; verify against the tracing.'
          : 'Both values were derived independently. The printed value comes from the recorder\'s own digital signal and is usually the more accurate; check the tracing where the difference would change management.'),
    });
  }

  return out;
}

/**
 * Features present in the printed statements but absent from the signal
 * analysis, and the reverse. Both directions matter: a machine statement the
 * signal does not support is worth a second look, and a signal finding the
 * machine did not report is worth reading the tracing for.
 */
export function reconcileFeatures(
  computed: string[],
  printed: string[],
): { onlyComputed: string[]; onlyPrinted: string[]; agreed: string[] } {
  const c = new Set(computed);
  const p = new Set(printed);
  return {
    onlyComputed: [...c].filter((x) => !p.has(x)),
    onlyPrinted: [...p].filter((x) => !c.has(x)),
    agreed: [...c].filter((x) => p.has(x)),
  };
}
