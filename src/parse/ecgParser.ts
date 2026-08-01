/**
 * ECG report parser.
 *
 * Extracts the printed measurement block and the interpretive statement lines
 * produced by ECG machines and reporting systems. Handles the common layouts
 * from GE/Marquette, Philips, Mortara and Schiller devices as well as free-text
 * reports.
 */
import type { EcgData } from '../clinical/types';
import { emptyEcg } from '../clinical/modules/ecg';
import { detectEcgFeatures } from '../clinical/modules/ecgFeatures';

const num = (s: string | undefined): number | null => {
  if (!s) return null;
  const n = parseFloat(s.replace(/[^\d.\-]/g, ''));
  return Number.isNaN(n) ? null : n;
};

/** Lines that are measurement rows rather than interpretive statements. */
const MEASUREMENT_LINE =
  /^(?:vent|atrial|ventricular)?\.?\s*(?:rate|rhythm|pr|qrs|qt|qtc|p-?r-?t|axis|interval|duration)/i;

const NOISE_LINE =
  /^(?:\s*|page \d|confirmed by|unconfirmed|technician|referred by|room|speed|\d+\s*mm\/s|\d+\s*mm\/mv|hb\s*\d|filter)/i;

export function parseEcg(text: string): EcgData | null {
  if (!text.trim()) return null;
  const data = emptyEcg();
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const joined = lines.join('\n');

  // ── Measurements ─────────────────────────────────────────────────────
  data.rateBpm =
    num(/(?:vent(?:ricular)?\.?\s*rate|heart\s*rate|ventricular\s*rate|\bhr\b)\s*[:\-]?\s*(\d{2,3})/i.exec(joined)?.[1]) ??
    num(/(\d{2,3})\s*(?:bpm|\/min|beats\/min)/i.exec(joined)?.[1]);

  data.prMs =
    num(/p-?r\s*(?:interval)?\s*[:\-]?\s*(\d{2,3})\s*(?:ms|msec)?/i.exec(joined)?.[1]) ??
    num(/\bpr\b\s*[:\-]?\s*(\d{2,3})\s*ms/i.exec(joined)?.[1]);

  data.qrsMs =
    num(/qrs\s*(?:duration|interval)?\s*[:\-]?\s*(\d{2,3})\s*(?:ms|msec)?/i.exec(joined)?.[1]);

  // "QT/QTc  384/431 ms" is the commonest combined form.
  const qtPair = /qt\s*\/\s*qtc?[a-z]?\s*[:\-]?\s*(\d{2,3})\s*\/\s*(\d{2,3})/i.exec(joined);
  if (qtPair) {
    data.qtMs = num(qtPair[1]);
    data.qtcMs = num(qtPair[2]);
  } else {
    data.qtMs = num(/\bqt\b\s*(?:interval)?\s*[:\-]?\s*(\d{2,3})\s*(?:ms|msec)?/i.exec(joined)?.[1]);
    data.qtcMs = num(/\bqtc[bf]?\b\s*(?:interval)?\s*[:\-]?\s*(\d{2,3})\s*(?:ms|msec)?/i.exec(joined)?.[1]);
  }

  // "P-R-T axes 52 41 38" — the middle value is the QRS axis.
  const axes = /p-?\s*r-?\s*t\s*axes\s*[:\-]?\s*(-?\d{1,3})\s+(-?\d{1,3})\s+(-?\d{1,3})/i.exec(joined);
  if (axes) {
    data.axisDegrees = num(axes[2]);
  } else {
    data.axisDegrees =
      num(/(?:qrs\s*axis|cardiac\s*axis|axis)\s*[:\-]?\s*(-?\d{1,3})\s*(?:°|deg)?/i.exec(joined)?.[1]);
  }
  const axisText = /(normal axis|left axis deviation|right axis deviation|extreme axis|north-?west axis|indeterminate axis)/i.exec(joined);
  if (axisText) data.axisText = axisText[1];

  // ── Rhythm statement ─────────────────────────────────────────────────
  const rhythm =
    /(normal sinus rhythm|sinus rhythm|sinus bradycardia|sinus tachycardia|sinus arrhythmia|atrial fibrillation|atrial flutter|paced rhythm|junctional rhythm|idioventricular rhythm|supraventricular tachycardia|ventricular tachycardia|complete heart block)/i.exec(joined);
  if (rhythm) data.rhythm = rhythm[1].replace(/^./, (c) => c.toUpperCase());

  // ── Interpretive statements ──────────────────────────────────────────
  const interpIdx = lines.findIndex((l) => /^(?:interpretation|conclusion|report|findings|comment|summary)\b/i.test(l));
  const candidates = interpIdx >= 0 ? lines.slice(interpIdx) : lines;

  for (const line of candidates) {
    if (NOISE_LINE.test(line)) continue;
    if (MEASUREMENT_LINE.test(line) && /\d/.test(line) && line.length < 40) continue;
    if (line.length < 6 || line.length > 160) continue;
    // Keep anything that reads as a clinical statement.
    if (/[a-z]{4}/i.test(line) && !/^\d/.test(line)) {
      data.statements.push(line.replace(/^(?:interpretation|conclusion|report|findings|comment|summary)\s*[:\-]?\s*/i, '').trim());
    }
  }
  data.statements = [...new Set(data.statements.filter(Boolean))].slice(0, 24);

  // Seed the feature flags from the statements so the review panel opens pre-ticked.
  for (const key of detectEcgFeatures(joined)) data.features[key] = true;

  const leadMatch = /(12[\s-]?lead|rhythm strip|telemetry|monitor|single lead|3[\s-]?lead|5[\s-]?lead)/i.exec(joined);
  data.leadDetail = leadMatch ? leadMatch[1] : '';

  const anything =
    data.rateBpm !== null || data.prMs !== null || data.qrsMs !== null ||
    data.qtMs !== null || data.qtcMs !== null || data.axisDegrees !== null ||
    !!data.rhythm || data.statements.length > 0 || Object.keys(data.features).length > 0;

  return anything ? data : null;
}
