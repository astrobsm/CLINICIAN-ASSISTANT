/**
 * ECG paper grid detection.
 *
 * Everything downstream depends on knowing how many pixels represent one
 * millimetre, because ECG paper encodes time and voltage geometrically:
 * at the standard settings 1 mm horizontally is 0.04 s and 1 mm vertically is
 * 0.1 mV. The scale is recovered from the periodicity of the printed grid,
 * cross-checked against the 5 mm major grid and, where present, the calibration
 * pulse.
 */

export interface Masks {
  width: number;
  height: number;
  /** 1 where a dark neutral (non-red) pixel sits — the ECG trace. */
  trace: Uint8Array;
  /** 1 where a grid pixel sits. */
  grid: Uint8Array;
  /** Mean luminance, used for quality reporting. */
  meanLuma: number;
  /** True when the grid is printed in colour rather than greyscale. */
  colourGrid: boolean;
}

export interface GridResult {
  pxPerMm: number;
  detected: boolean;
  /** 0–1 strength of the periodicity that produced the estimate. */
  strength: number;
  rotationDeg: number;
  source: 'grid' | 'calibration' | 'assumed';
  notes: string[];
}

/**
 * Separate trace pixels from grid pixels.
 *
 * ECG paper grids are printed in red, orange or pink; the trace is black. A
 * simple chroma test separates them robustly and, unlike a pure luminance
 * threshold, does not erase the trace where it crosses a major grid line.
 * Greyscale printouts fall back to a two-level luminance split, since the grid
 * is always lighter than the trace.
 */
export function buildMasks(data: Uint8ClampedArray, width: number, height: number): Masks {
  const n = width * height;
  const trace = new Uint8Array(n);
  const grid = new Uint8Array(n);

  let lumaSum = 0;
  let reddish = 0;
  const luma = new Float32Array(n);
  const chroma = new Float32Array(n);

  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    luma[i] = l;
    lumaSum += l;
    // Positive where red dominates green and blue — the printed grid.
    const c = r - Math.max(g, b);
    chroma[i] = c;
    if (c > 18 && l > 90) reddish++;
  }

  const meanLuma = lumaSum / n;
  const colourGrid = reddish / n > 0.02;

  // Otsu threshold over the luminance histogram to find the dark ink level.
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) hist[luma[i] | 0]++;
  const inkThreshold = otsu(hist, n);

  if (colourGrid) {
    const traceCut = Math.min(inkThreshold, meanLuma * 0.72);
    for (let i = 0; i < n; i++) {
      const isRed = chroma[i] > 14;
      if (!isRed && luma[i] < traceCut) trace[i] = 1;
      else if (isRed) grid[i] = 1;
    }
  } else {
    // Greyscale: the trace is the darkest population, the grid a mid grey.
    const traceCut = inkThreshold * 0.72;
    const gridCut = Math.min(inkThreshold * 1.06, meanLuma * 0.97);
    for (let i = 0; i < n; i++) {
      const l = luma[i];
      if (l < traceCut) trace[i] = 1;
      else if (l < gridCut) grid[i] = 1;
    }
  }

  return { width, height, trace, grid, meanLuma, colourGrid };
}

function otsu(hist: Uint32Array, total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2;
    if (between > best) { best = between; threshold = t; }
  }
  return threshold;
}

/** Column and row occupancy profiles of a mask. */
function projections(mask: Uint8Array, width: number, height: number) {
  const cols = new Float32Array(width);
  const rows = new Float32Array(height);
  for (let y = 0; y < height; y++) {
    const off = y * width;
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      const v = mask[off + x];
      if (v) { cols[x] += 1; rowSum += 1; }
    }
    rows[y] = rowSum;
  }
  return { cols, rows };
}

/**
 * Dominant period of a projection by autocorrelation, refined by parabolic
 * interpolation around the peak.
 */
export function dominantPeriod(
  proj: Float32Array,
  minLag: number,
  maxLag: number,
): { period: number; strength: number } {
  const n = proj.length;
  if (n < maxLag * 3) return { period: 0, strength: 0 };

  let m = 0;
  for (let i = 0; i < n; i++) m += proj[i];
  m /= n;

  const x = new Float32Array(n);
  let energy = 0;
  for (let i = 0; i < n; i++) { x[i] = proj[i] - m; energy += x[i] * x[i]; }
  if (energy <= 0) return { period: 0, strength: 0 };

  const corr = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += x[i] * x[i + lag];
    corr[lag] = s / energy;
  }

  let bestLag = 0, bestVal = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    // Require a local maximum so harmonics of a slower rhythm are not chosen.
    if (corr[lag] > bestVal && corr[lag] >= corr[lag - 1] && corr[lag] >= corr[Math.min(lag + 1, maxLag)]) {
      bestVal = corr[lag];
      bestLag = lag;
    }
  }
  if (!bestLag) return { period: 0, strength: 0 };

  const y0 = corr[bestLag - 1] ?? bestVal;
  const y1 = bestVal;
  const y2 = corr[bestLag + 1] ?? bestVal;
  const denom = y0 - 2 * y1 + y2;
  const delta = denom !== 0 ? (0.5 * (y0 - y2)) / denom : 0;

  return { period: bestLag + Math.max(-0.5, Math.min(0.5, delta)), strength: bestVal };
}

/**
 * Estimate small rotations from the grid.
 *
 * A correctly aligned grid produces a sharply peaked row projection; tilting
 * the sampling axis by the paper's own angle restores that sharpness. The
 * angle maximising the projection variance is the rotation to correct.
 */
/**
 * Grid spacing measured directly, as the median distance between adjacent
 * printed lines.
 *
 * Autocorrelation is the obvious approach and is what this used first, but it
 * is unreliable once the image has been rescaled: resampling makes the line
 * spacing alternate between adjacent integers, which spreads the correlation
 * peak and lets a spurious longer lag win. Measuring the gaps between the
 * lines themselves has no such failure mode, and it degrades gracefully — a
 * few missed lines shift nothing, because the median is taken.
 */
export function lineSpacing(proj: Float32Array, minSpacing: number): { period: number; strength: number } {
  const n = proj.length;
  if (n < 24) return { period: 0, strength: 0 };

  let mean = 0;
  for (let i = 0; i < n; i++) mean += proj[i];
  mean /= n;
  let variance = 0;
  for (let i = 0; i < n; i++) variance += (proj[i] - mean) ** 2;
  const sd = Math.sqrt(variance / n);
  if (sd <= 0) return { period: 0, strength: 0 };

  const cut = mean + 0.25 * sd;
  const peaks: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    if (proj[i] < cut) continue;
    if (proj[i] < proj[i - 1] || proj[i] < proj[i + 1]) continue;
    const last = peaks[peaks.length - 1];
    // Adjacent columns of a two-pixel-wide major line count once.
    if (last !== undefined && i - last < Math.max(2, minSpacing * 0.55)) {
      if (proj[i] > proj[last]) peaks[peaks.length - 1] = i;
      continue;
    }
    peaks.push(i);
  }
  if (peaks.length < 6) return { period: 0, strength: 0 };

  const gaps: number[] = [];
  for (let i = 1; i < peaks.length; i++) gaps.push(peaks[i] - peaks[i - 1]);
  const sorted = [...gaps].sort((a, b) => a - b);
  const period = sorted[sorted.length >> 1];
  if (period < minSpacing) return { period: 0, strength: 0 };

  // Confidence is the proportion of gaps consistent with that spacing.
  const consistent = gaps.filter((g) => Math.abs(g - period) <= Math.max(1, period * 0.28)).length;
  const strength = consistent / gaps.length;

  // Sub-pixel refinement from the total span of the consistent runs.
  let spanStart = -1, spanEnd = -1, count = 0;
  for (let i = 1; i < peaks.length; i++) {
    if (Math.abs(peaks[i] - peaks[i - 1] - period) <= Math.max(1, period * 0.28)) {
      if (spanStart < 0) spanStart = peaks[i - 1];
      spanEnd = peaks[i];
      count++;
    }
  }
  const refined = count >= 4 && spanEnd > spanStart ? (spanEnd - spanStart) / count : period;

  return { period: refined, strength };
}

export function estimateRotation(masks: Masks): number {
  const { grid, width, height } = masks;
  const step = Math.max(1, Math.floor(Math.min(width, height) / 500));
  let bestAngle = 0;
  let bestScore = -Infinity;

  for (let deg = -4; deg <= 4; deg += 0.25) {
    const slope = Math.tan((deg * Math.PI) / 180);
    const bins = new Float32Array(height + Math.ceil(Math.abs(slope) * width) + 2);
    const offset = slope < 0 ? Math.ceil(-slope * width) : 0;
    for (let y = 0; y < height; y += step) {
      const row = y * width;
      for (let x = 0; x < width; x += step) {
        if (!grid[row + x]) continue;
        const b = (y + slope * x + offset) | 0;
        if (b >= 0 && b < bins.length) bins[b] += 1;
      }
    }
    let m = 0;
    for (let i = 0; i < bins.length; i++) m += bins[i];
    m /= bins.length;
    let v = 0;
    for (let i = 0; i < bins.length; i++) v += (bins[i] - m) ** 2;
    v /= bins.length;
    if (v > bestScore) { bestScore = v; bestAngle = deg; }
  }
  return Math.abs(bestAngle) < 0.3 ? 0 : bestAngle;
}

export function detectGrid(masks: Masks): GridResult {
  const notes: string[] = [];
  const { grid, width, height } = masks;

  let gridCount = 0;
  for (let i = 0; i < grid.length; i++) gridCount += grid[i];
  const gridFraction = gridCount / grid.length;

  if (gridFraction < 0.004) {
    return {
      pxPerMm: 0, detected: false, strength: 0, rotationDeg: 0, source: 'assumed',
      notes: ['No printed grid could be identified in the image.'],
    };
  }

  const { cols, rows } = projections(grid, width, height);
  const minLag = 2.4;
  const maxLag = Math.max(12, Math.min(60, Math.floor(Math.min(width, height) / 12)));

  // Direct line-spacing measurement first; autocorrelation as the fallback for
  // images where individual lines are not resolvable as separate peaks.
  let h = lineSpacing(cols, minLag);
  let v = lineSpacing(rows, minLag);
  if (h.strength < 0.5 || h.period <= 0) h = dominantPeriod(cols, Math.ceil(minLag), maxLag);
  if (v.strength < 0.5 || v.period <= 0) v = dominantPeriod(rows, Math.ceil(minLag), maxLag);

  const candidates: { period: number; strength: number }[] = [];
  if (h.period > 0) candidates.push(h);
  if (v.period > 0) candidates.push(v);
  if (!candidates.length) {
    return {
      pxPerMm: 0, detected: false, strength: 0, rotationDeg: 0, source: 'assumed',
      notes: ['A grid was present but no regular spacing could be measured.'],
    };
  }

  // Horizontal and vertical spacing must agree — ECG paper is square-ruled.
  let pxPerMm: number;
  let strength: number;
  if (h.period > 0 && v.period > 0) {
    const ratio = h.period / v.period;
    if (ratio > 0.85 && ratio < 1.18) {
      pxPerMm = (h.period + v.period) / 2;
      strength = (h.strength + v.strength) / 2;
    } else {
      // Trust the stronger axis and record the disagreement.
      const pick = h.strength >= v.strength ? h : v;
      pxPerMm = pick.period;
      strength = pick.strength * 0.7;
      notes.push(`Horizontal and vertical grid spacing disagree (${h.period.toFixed(2)} vs ${v.period.toFixed(2)} px) — the image may be skewed or photographed at an angle.`);
    }
  } else {
    const pick = candidates[0];
    pxPerMm = pick.period;
    strength = pick.strength * 0.8;
    notes.push('Grid spacing measured on one axis only.');
  }

  // The detected period may be the 5 mm major grid rather than the 1 mm minor.
  if (pxPerMm > 14) {
    const minor = pxPerMm / 5;
    if (minor >= 2.4) {
      notes.push(`Detected spacing of ${pxPerMm.toFixed(1)} px interpreted as the 5 mm major grid.`);
      pxPerMm = minor;
    }
  }

  if (pxPerMm < 2.2) {
    notes.push('Grid spacing is below 2.2 pixels per millimetre — the scan resolution is too low for reliable measurement.');
  }

  const rotationDeg = estimateRotation(masks);
  if (rotationDeg !== 0) notes.push(`Image rotated by approximately ${rotationDeg.toFixed(1)}°; corrected before extraction.`);

  // A weak or sparse periodicity is more likely to be the trace's own texture
  // than a printed grid. Refusing here is the correct outcome: without a
  // reliable scale every measurement downstream would be a guess presented as
  // a number.
  const plausibleFraction = gridFraction > 0.012 && gridFraction < 0.65;
  const detected = pxPerMm >= 2.2 && strength > 0.2 && plausibleFraction;
  if (!detected) {
    notes.push(`Grid periodicity was too weak to trust (strength ${strength.toFixed(2)}, coverage ${(gridFraction * 100).toFixed(1)}%).`);
  }

  return { pxPerMm, detected, strength, rotationDeg, source: 'grid', notes };
}

/**
 * Locate the calibration pulse — the rectangular step at the start of each row,
 * 10 mm tall at standard gain. It provides an independent voltage scale and
 * reveals half- or double-gain recordings.
 */
export function detectCalibrationPulse(
  masks: Masks,
  band: { y0: number; y1: number },
  pxPerMm: number,
): { heightMm: number; widthPx: number; x0: number } | null {
  const { trace, width } = masks;
  const searchWidth = Math.min(width, Math.round(pxPerMm * 22));
  let bestHeight = 0;
  let bestX = -1;
  let plateauStart = -1;
  let run = 0;

  for (let x = 2; x < searchWidth; x++) {
    let top = -1, bottom = -1;
    for (let y = band.y0; y < band.y1; y++) {
      if (trace[y * width + x]) { if (top < 0) top = y; bottom = y; }
    }
    const height = top < 0 ? 0 : bottom - top + 1;
    // A calibration pulse is a tall vertical stroke followed by a flat top.
    if (height > pxPerMm * 6) {
      if (plateauStart < 0) plateauStart = x;
      run++;
      if (height > bestHeight) { bestHeight = height; bestX = x; }
    } else if (run > 0) {
      if (run >= 2 && bestHeight > pxPerMm * 6) break;
      run = 0;
      plateauStart = -1;
      bestHeight = 0;
    }
  }

  if (bestHeight <= pxPerMm * 6) return null;
  return {
    heightMm: bestHeight / pxPerMm,
    widthPx: Math.max(run, 1),
    x0: plateauStart >= 0 ? plateauStart : bestX,
  };
}

/** Rotate RGBA pixels about the centre by `deg`, nearest-neighbour. */
export function rotatePixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  deg: number,
): Uint8ClampedArray {
  if (!deg) return data;
  const rad = (-deg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const cx = width / 2, cy = height / 2;
  const out = new Uint8ClampedArray(data.length);
  out.fill(255);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx, dy = y - cy;
      const sx = Math.round(cx + dx * cos - dy * sin);
      const sy = Math.round(cy + dx * sin + dy * cos);
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
      const d = (y * width + x) * 4;
      const s = (sy * width + sx) * 4;
      out[d] = data[s]; out[d + 1] = data[s + 1]; out[d + 2] = data[s + 2]; out[d + 3] = 255;
    }
  }
  return out;
}
