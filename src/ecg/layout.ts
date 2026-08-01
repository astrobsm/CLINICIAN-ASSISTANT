/**
 * Lead panel segmentation.
 *
 * A 12-lead printout is a mosaic of panels, each holding a different lead over
 * a different slice of time. Getting the mapping wrong would attribute findings
 * to the wrong territory, so the segmentation prefers hard evidence — the lead
 * labels located by OCR — and falls back to standard layout geometry only when
 * labels are unavailable.
 */
import type { LeadName, PanelBounds } from './types';
import type { Masks } from './grid';

export interface OcrWord {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  confidence: number;
}

export interface Panel {
  lead: LeadName;
  bounds: PanelBounds;
  /** Where this panel sits in the recording timeline, seconds. */
  startSec: number;
  /** Evidence for the lead assignment. */
  labelled: boolean;
}

export interface LayoutResult {
  panels: Panel[];
  layout: string;
  rows: number;
  columns: number;
  notes: string[];
}

const LAYOUT_4x3: LeadName[][] = [
  ['I', 'aVR', 'V1', 'V4'],
  ['II', 'aVL', 'V2', 'V5'],
  ['III', 'aVF', 'V3', 'V6'],
];

const LAYOUT_2x6: LeadName[][] = [
  ['I', 'V1'],
  ['II', 'V2'],
  ['III', 'V3'],
  ['aVR', 'V4'],
  ['aVL', 'V5'],
  ['aVF', 'V6'],
];

const LAYOUT_1x12: LeadName[][] = [
  ['I'], ['II'], ['III'], ['aVR'], ['aVL'], ['aVF'],
  ['V1'], ['V2'], ['V3'], ['V4'], ['V5'], ['V6'],
];

const LEAD_TOKEN = /^(i{1,3}|avr|avl|avf|v[1-6])$/i;

function canonicalLead(token: string): LeadName | null {
  const t = token.replace(/[^a-zA-Z0-9]/g, '');
  if (!LEAD_TOKEN.test(t)) return null;
  const lower = t.toLowerCase();
  if (lower === 'i') return 'I';
  if (lower === 'ii') return 'II';
  if (lower === 'iii') return 'III';
  if (lower === 'avr') return 'aVR';
  if (lower === 'avl') return 'aVL';
  if (lower === 'avf') return 'aVF';
  return (`V${lower[1]}`) as LeadName;
}

/**
 * Horizontal bands of trace activity. Each band holds one row of panels.
 * Text regions found by OCR are excluded first, since printed labels and header
 * text are dark and would otherwise be mistaken for signal.
 */
export function detectBands(
  masks: Masks,
  pxPerMm: number,
  words: OcrWord[],
  sensitivity = 0.004,
): { y0: number; y1: number }[] {
  const { trace, width, height } = masks;

  const suppress = new Uint8Array(height);
  for (const w of words) {
    const h = w.bbox.y1 - w.bbox.y0;
    // Only suppress rows occupied by things that look like printed text.
    if (w.confidence < 45) continue;
    if (h > pxPerMm * 7) continue;
    for (let y = Math.max(0, w.bbox.y0); y < Math.min(height, w.bbox.y1); y++) suppress[y] = 1;
  }

  const profile = new Float32Array(height);
  for (let y = 0; y < height; y++) {
    if (suppress[y]) continue;
    const off = y * width;
    let c = 0;
    for (let x = 0; x < width; x++) c += trace[off + x];
    profile[y] = c;
  }

  const minRun = Math.max(3, Math.round(pxPerMm * 3));
  const mergeGap = Math.max(2, Math.round(pxPerMm * 2.5));
  const activeThreshold = Math.max(1, Math.round(width * sensitivity));

  const bands: { y0: number; y1: number }[] = [];
  let start = -1;
  for (let y = 0; y <= height; y++) {
    const active = y < height && profile[y] >= activeThreshold;
    if (active && start < 0) start = y;
    if (!active && start >= 0) {
      bands.push({ y0: start, y1: y });
      start = -1;
    }
  }

  // Merge bands separated by less than the merge gap — a single lead's
  // excursions can momentarily leave a row empty.
  const merged: { y0: number; y1: number }[] = [];
  for (const b of bands) {
    const last = merged[merged.length - 1];
    if (last && b.y0 - last.y1 <= mergeGap) last.y1 = b.y1;
    else merged.push({ ...b });
  }

  return merged.filter((b) => b.y1 - b.y0 >= minRun);
}

/**
 * Rows occupied by printed text, to be excluded when locating panels.
 *
 * Recognition run over a grid-stripped ECG will happily report parts of the
 * waveform as words, and those boxes are large and everywhere. Only things
 * shaped like printed labels are honoured, and if the result would blank out a
 * large fraction of the image the suppression is abandoned entirely — losing a
 * lead label is a small cost, losing a whole panel row is not.
 */
function textRowMask(words: OcrWord[], pxPerMm: number, height: number): Uint8Array {
  const mask = new Uint8Array(height);
  let suppressed = 0;

  for (const w of words) {
    if (w.confidence < 45) continue;
    const h = w.bbox.y1 - w.bbox.y0;
    const wid = w.bbox.x1 - w.bbox.x0;
    if (h <= 0 || h > pxPerMm * 7) continue;
    if (wid > pxPerMm * 30) continue;
    const text = w.text.trim();
    if (!text || text.length > 14 || !/[A-Za-z0-9]/.test(text)) continue;
    for (let y = Math.max(0, w.bbox.y0); y < Math.min(height, w.bbox.y1); y++) {
      if (!mask[y]) { mask[y] = 1; suppressed++; }
    }
  }

  if (suppressed > height * 0.2) return new Uint8Array(height);
  return mask;
}

/**
 * Row baselines.
 *
 * More reliable than measuring the vertical extent of each band: a trace
 * spends most of its length on the isoelectric line, so the row-occupancy
 * profile has a sharp peak at each panel's baseline. Those peaks stay separate
 * even when large deflections cause the bands themselves to touch, which is
 * exactly the case that defeats extent-based detection — a markedly negative
 * axis, deep S waves, or tall T waves.
 */
export function detectRowBaselines(
  masks: Masks,
  pxPerMm: number,
  words: OcrWord[],
): { baselines: number[]; pitch: number } {
  const { trace, width, height } = masks;

  const suppress = textRowMask(words, pxPerMm, height);

  const profile = new Float32Array(height);
  for (let y = 0; y < height; y++) {
    if (suppress[y]) continue;
    const off = y * width;
    let c = 0;
    for (let x = 0; x < width; x++) c += trace[off + x];
    profile[y] = c;
  }

  // Smooth over roughly one millimetre so the peak is the baseline, not noise.
  const w1 = Math.max(1, Math.round(pxPerMm));
  const smooth = new Float32Array(height);
  for (let y = 0; y < height; y++) {
    let s = 0, n = 0;
    for (let k = -w1; k <= w1; k++) {
      const j = y + k;
      if (j >= 0 && j < height) { s += profile[j]; n++; }
    }
    smooth[y] = n ? s / n : 0;
  }

  let max = 0;
  for (let y = 0; y < height; y++) max = Math.max(max, smooth[y]);
  if (max <= 0) return { baselines: [], pitch: 0 };

  const minSeparation = Math.max(6, Math.round(pxPerMm * 13));
  const cut = max * 0.22;

  const peaks: { y: number; v: number }[] = [];
  for (let y = 1; y < height - 1; y++) {
    if (smooth[y] < cut) continue;
    if (smooth[y] < smooth[y - 1] || smooth[y] < smooth[y + 1]) continue;
    const last = peaks[peaks.length - 1];
    if (last && y - last.y < minSeparation) {
      if (smooth[y] > last.v) { last.y = y; last.v = smooth[y]; }
    } else {
      peaks.push({ y, v: smooth[y] });
    }
  }

  peaks.sort((a, b) => a.y - b.y);
  const gaps: number[] = [];
  for (let i = 1; i < peaks.length; i++) gaps.push(peaks[i].y - peaks[i - 1].y);
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const pitch = sortedGaps.length ? sortedGaps[sortedGaps.length >> 1] : height;

  // Panels are printed on a regular vertical pitch. Discarding peaks that do
  // not sit on that lattice removes spurious maxima — a prominent T wave or a
  // long flat segment part-way between two rows — that would otherwise inflate
  // the row count and defeat layout recognition.
  let baselines = peaks.map((p) => p.y);
  if (peaks.length >= 3 && pitch > 0) {
    const tolerance = pitch * 0.28;
    let best: number[] = [];
    for (const anchor of peaks) {
      const kept = peaks
        .filter((p) => Math.abs(((p.y - anchor.y) / pitch) - Math.round((p.y - anchor.y) / pitch)) * pitch <= tolerance)
        .map((p) => p.y);
      if (kept.length > best.length) best = kept;
    }
    if (best.length >= peaks.length - 2 && best.length >= 2) baselines = best;
  }

  return { baselines: baselines.sort((a, b) => a - b), pitch };
}

/** Lead labels located by OCR, keyed by the band they fall inside. */
function labelsInBands(
  words: OcrWord[],
  bands: { y0: number; y1: number }[],
  pxPerMm: number,
): Map<number, { lead: LeadName; x: number }[]> {
  const out = new Map<number, { lead: LeadName; x: number }[]>();
  const slack = pxPerMm * 6;

  for (const w of words) {
    const lead = canonicalLead(w.text);
    if (!lead || w.confidence < 40) continue;
    const cy = (w.bbox.y0 + w.bbox.y1) / 2;
    let bandIdx = bands.findIndex((b) => cy >= b.y0 - slack && cy <= b.y1 + slack);
    if (bandIdx < 0) continue;
    if (!out.has(bandIdx)) out.set(bandIdx, []);
    const list = out.get(bandIdx)!;
    // Keep the leftmost instance of each lead — labels sit at the panel start.
    if (!list.some((l) => l.lead === lead)) list.push({ lead, x: w.bbox.x0 });
  }

  for (const list of out.values()) list.sort((a, b) => a.x - b.x);
  return out;
}

export function segmentLeads(
  masks: Masks,
  pxPerMm: number,
  mmPerSec: number,
  words: OcrWord[],
): LayoutResult {
  const notes: string[] = [];
  const { width } = masks;

  // Rows are located from the baseline peaks. Where that fails — a trace with
  // no sustained isoelectric segment, for instance — fall back to measuring
  // the vertical extent of each band.
  const { baselines, pitch } = detectRowBaselines(masks, pxPerMm, words);
  let bands: { y0: number; y1: number }[];

  if (baselines.length >= 1 && pitch > pxPerMm * 10) {
    const half = Math.round(pitch / 2);
    bands = baselines.map((y, i) => {
      const prev = i > 0 ? baselines[i - 1] : y - pitch;
      const next = i < baselines.length - 1 ? baselines[i + 1] : y + pitch;
      return {
        y0: Math.max(0, Math.round((y + prev) / 2), y - half),
        y1: Math.min(masks.height, Math.round((y + next) / 2), y + half),
      };
    });
    notes.push(`${baselines.length} panel row${baselines.length === 1 ? '' : 's'} located from the isoelectric baselines (row pitch ${(pitch / pxPerMm).toFixed(0)} mm).`);
  } else {
    bands = detectBands(masks, pxPerMm, words);
    notes.push('Row baselines were not distinct; panel rows were taken from the vertical extent of the trace instead.');
  }

  if (!bands.length) {
    return { panels: [], layout: 'unrecognised', rows: 0, columns: 0, notes: ['No trace bands were found in the image.'] };
  }

  const labelled = labelsInBands(words, bands, pxPerMm);
  const totalLabels = [...labelled.values()].reduce((a, l) => a + l.length, 0);

  // Column count: prefer the observed labels, otherwise infer from band count.
  let columns = 0;
  if (totalLabels >= 4) {
    const counts = [...labelled.values()].map((l) => l.length);
    columns = Math.max(...counts);
  }

  let template: LeadName[][] | null = null;
  const bandCount = bands.length;

  if (columns === 4 || (columns === 0 && (bandCount === 3 || bandCount === 4))) {
    template = LAYOUT_4x3; columns = 4;
  } else if (columns === 2 || (columns === 0 && (bandCount === 6 || bandCount === 7))) {
    template = LAYOUT_2x6; columns = 2;
  } else if (columns === 1 || (columns === 0 && bandCount >= 12)) {
    template = LAYOUT_1x12; columns = 1;
  } else if (columns === 3) {
    template = null;
  }

  const panels: Panel[] = [];
  const secPerPx = 1 / (mmPerSec * pxPerMm);

  // A trailing band that is wider in time than the others, or simply the extra
  // band beyond the template, is the rhythm strip.
  const templateRows = template ? template.length : bandCount;
  const rhythmBandIndex = bandCount > templateRows ? bandCount - 1 : -1;

  for (let bi = 0; bi < bands.length; bi++) {
    const band = bands[bi];
    const isRhythm = bi === rhythmBandIndex;
    const cols = isRhythm ? 1 : columns || 1;
    const bandLabels = labelled.get(bi) ?? [];

    // Column boundaries: use label positions where we have a full set,
    // otherwise divide the width evenly, which is how printers lay these out.
    let edges: number[];
    if (!isRhythm && bandLabels.length === cols && cols > 1) {
      edges = [0];
      for (let c = 1; c < cols; c++) {
        edges.push(Math.max(0, Math.round(bandLabels[c].x - pxPerMm * 2)));
      }
      edges.push(width);
    } else {
      edges = [];
      for (let c = 0; c <= cols; c++) edges.push(Math.round((c * width) / cols));
    }

    for (let c = 0; c < cols; c++) {
      let lead: LeadName | null = null;
      let wasLabelled = false;

      if (isRhythm) {
        lead = bandLabels[0]?.lead ?? 'rhythm';
        wasLabelled = !!bandLabels[0];
      } else if (bandLabels.length === cols) {
        lead = bandLabels[c].lead;
        wasLabelled = true;
      } else if (template && bi < template.length && c < template[bi].length) {
        lead = template[bi][c];
      }

      // No template and no labels: still surface the band as a rhythm strip
      // rather than discarding a trace we successfully located.
      if (!lead && cols === 1) lead = 'rhythm';
      if (!lead) continue;
      panels.push({
        lead,
        bounds: { x0: edges[c], y0: band.y0, x1: edges[c + 1], y1: band.y1 },
        startSec: isRhythm ? 0 : c * (edges[1] - edges[0]) * secPerPx,
        labelled: wasLabelled,
      });
    }
  }

  // Deduplicate: a lead appearing twice keeps the wider panel, except that a
  // named lead is never displaced by an unnamed rhythm strip.
  const byLead = new Map<LeadName, Panel>();
  for (const p of panels) {
    const existing = byLead.get(p.lead);
    const wide = (q: Panel) => q.bounds.x1 - q.bounds.x0;
    if (!existing || wide(p) > wide(existing)) byLead.set(p.lead, p);
  }
  const finalPanels = [...byLead.values()];
  if (!finalPanels.length && bands.length) {
    for (const [i, band] of bands.entries()) {
      finalPanels.push({
        lead: 'rhythm',
        bounds: { x0: 0, y0: band.y0, x1: width, y1: band.y1 },
        startSec: 0,
        labelled: false,
      });
      if (i === 0) break;
    }
  }

  const layout =
    columns === 4 ? (rhythmBandIndex >= 0 ? '4 × 3 with rhythm strip' : '4 × 3')
      : columns === 2 ? '2 × 6'
        : columns === 1 && bandCount >= 12 ? '1 × 12'
          : bandCount === 1 ? 'single rhythm strip'
            : `${columns || 1} × ${bandCount}`;

  if (totalLabels >= 4) notes.push(`${totalLabels} lead labels located by OCR and used to assign panels.`);
  else if (template) notes.push(`No lead labels were legible; the standard ${layout} layout has been assumed.`);
  else notes.push('Layout could not be determined; panels were treated as independent rhythm strips.');

  if (bandCount === 1) notes.push('A single trace band was found — treating this as a rhythm strip. Chamber and territory criteria requiring 12 leads will not be applied.');

  return { panels: finalPanels, layout, rows: bandCount, columns: columns || 1, notes };
}
