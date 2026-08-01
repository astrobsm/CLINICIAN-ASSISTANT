/**
 * Reconstruct text rows from recognised word positions.
 *
 * Recognition engines infer reading order from the page, and on a bordered
 * laboratory table they frequently get it wrong — emitting a column at a time,
 * or breaking each cell onto its own line, so that a parameter name, its
 * result and its unit end up nowhere near each other in the text stream. The
 * geometry does not have that ambiguity: words that share a horizontal band
 * are on the same row of the table, whatever order they were emitted in.
 *
 * Rebuilding rows from the bounding boxes therefore recovers tables that the
 * text stream alone loses entirely.
 */
export interface WordBox {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  confidence: number;
}

export interface SpatialOptions {
  /** Discard words recognised below this confidence. */
  minConfidence?: number;
  /** Row grouping tolerance, as a fraction of the median word height. */
  tolerance?: number;
}

export interface WordRow {
  words: WordBox[];
  bbox: { x0: number; y0: number; x1: number; y1: number };
  text: string;
}

/** Group words into the visual rows they occupy. */
export function groupRows(words: WordBox[], opts: SpatialOptions = {}): WordRow[] {
  const { minConfidence = 25, tolerance = 0.6 } = opts;

  const usable = words.filter((w) => {
    const h = w.bbox.y1 - w.bbox.y0;
    const wid = w.bbox.x1 - w.bbox.x0;
    return w.confidence >= minConfidence && h > 0 && wid > 0 && w.text.trim().length > 0;
  });
  if (!usable.length) return [];

  const heights = usable.map((w) => w.bbox.y1 - w.bbox.y0).sort((a, b) => a - b);
  const medianHeight = heights[heights.length >> 1] || 1;
  const band = medianHeight * tolerance;
  const medianWidth = medianHeight * 0.6;

  const sorted = [...usable].sort(
    (a, b) => (a.bbox.y0 + a.bbox.y1) / 2 - (b.bbox.y0 + b.bbox.y1) / 2,
  );

  const groups: { centre: number; count: number; words: WordBox[] }[] = [];
  for (const w of sorted) {
    const centre = (w.bbox.y0 + w.bbox.y1) / 2;
    const last = groups[groups.length - 1];
    if (last && Math.abs(centre - last.centre) <= band) {
      last.centre = (last.centre * last.count + centre) / (last.count + 1);
      last.count++;
      last.words.push(w);
    } else {
      groups.push({ centre, count: 1, words: [w] });
    }
  }

  return groups.map((g) => {
    const ordered = [...g.words].sort((a, b) => a.bbox.x0 - b.bbox.x0);
    let text = '';
    let prevEnd: number | null = null;
    for (const w of ordered) {
      if (prevEnd !== null) {
        const gap = w.bbox.x0 - prevEnd;
        text += gap > medianWidth * 2.5 ? '   ' : ' ';
      }
      text += w.text;
      prevEnd = w.bbox.x1;
    }
    return {
      words: ordered,
      text: text.trim(),
      bbox: {
        x0: Math.min(...ordered.map((w) => w.bbox.x0)),
        y0: Math.min(...ordered.map((w) => w.bbox.y0)),
        x1: Math.max(...ordered.map((w) => w.bbox.x1)),
        y1: Math.max(...ordered.map((w) => w.bbox.y1)),
      },
    };
  }).filter((r) => r.text.length > 0);
}

export function rowsFromWords(words: WordBox[], opts: SpatialOptions = {}): string[] {
  const { minConfidence = 25, tolerance = 0.6 } = opts;

  const usable = words.filter((w) => {
    const h = w.bbox.y1 - w.bbox.y0;
    const wid = w.bbox.x1 - w.bbox.x0;
    return w.confidence >= minConfidence && h > 0 && wid > 0 && w.text.trim().length > 0;
  });
  if (usable.length < 4) return [];

  const heights = usable.map((w) => w.bbox.y1 - w.bbox.y0).sort((a, b) => a - b);
  const medianHeight = heights[heights.length >> 1] || 1;
  const band = medianHeight * tolerance;

  const sorted = [...usable].sort(
    (a, b) => (a.bbox.y0 + a.bbox.y1) / 2 - (b.bbox.y0 + b.bbox.y1) / 2,
  );

  interface Row { centre: number; count: number; words: WordBox[] }
  const rows: Row[] = [];

  for (const w of sorted) {
    const centre = (w.bbox.y0 + w.bbox.y1) / 2;
    const last = rows[rows.length - 1];
    if (last && Math.abs(centre - last.centre) <= band) {
      // Running mean, so a tall word does not drag the row off its baseline.
      last.centre = (last.centre * last.count + centre) / (last.count + 1);
      last.count++;
      last.words.push(w);
    } else {
      rows.push({ centre, count: 1, words: [w] });
    }
  }

  const medianWidth = medianHeight * 0.6; // rough advance width of one character

  return rows.map((row) => {
    const ordered = [...row.words].sort((a, b) => a.bbox.x0 - b.bbox.x0);
    let line = '';
    let prevEnd: number | null = null;
    for (const w of ordered) {
      if (prevEnd !== null) {
        const gap = w.bbox.x0 - prevEnd;
        // A wide gap is a column boundary. Emitting several spaces preserves
        // it, which is what lets the reference-range column be told apart
        // from the result column downstream.
        line += gap > medianWidth * 2.5 ? '   ' : ' ';
      }
      line += w.text;
      prevEnd = w.bbox.x1;
    }
    return line.trim();
  }).filter((l) => l.length > 0);
}

/** Rows joined into a text block the line-oriented parsers can consume. */
export function spatialText(words: WordBox[], opts?: SpatialOptions): string {
  return rowsFromWords(words, opts).join('\n');
}
