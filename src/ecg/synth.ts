/**
 * Synthetic ECG renderer.
 *
 * Draws a physiologically shaped 12-lead ECG onto standard ruled paper at a
 * known heart rate, PR, QRS, QT, axis and ST deviation. Its purpose is
 * verification: the digitiser and measurement chain can be run against an image
 * whose true parameters are known exactly, which is the only way to establish
 * that the recovered numbers mean anything.
 *
 * It also provides a demonstration ECG for the application, clearly labelled as
 * synthetic.
 */
import type { LeadName } from './types';

export interface SynthOptions {
  heartRateBpm: number;
  prMs: number;
  qrsMs: number;
  qtMs: number;
  axisDeg: number;
  /** Total recording length in seconds. */
  durationSec: number;
  pxPerMm: number;
  mmPerSec: number;
  mmPerMv: number;
  /** ST deviation added at the J point, in millivolts, per lead. */
  stMv?: Partial<Record<LeadName, number>>;
  /** Leads whose T wave is inverted. */
  tInverted?: LeadName[];
  /** Multiplier applied to precordial QRS amplitude — raise to model hypertrophy. */
  precordialGain?: number;
  /** Multiplier applied to T wave amplitude — raise to model hyperkalaemia. */
  tGain?: number;
  /** Set to 0 to remove P waves, as in atrial fibrillation. */
  pAmplitudeMv?: number;
  /** Random beat-to-beat RR variation as a fraction of the mean. */
  rrJitter?: number;
  /** Additive noise in millivolts. */
  noiseMv?: number;
  /** Draw lead labels. */
  labels?: boolean;
  /** Include the 10 mm calibration pulse at the start of each row. */
  calibration?: boolean;
  layout?: '4x3+rhythm' | 'rhythm';
  /** Deterministic seed for jitter and noise. */
  seed?: number;
}

export interface SynthResult {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  truth: {
    heartRateBpm: number;
    prMs: number;
    qrsMs: number;
    qtMs: number;
    qtcMs: number;
    axisDeg: number;
    stMv: Partial<Record<LeadName, number>>;
    pxPerMm: number;
  };
}

const LIMB_ANGLE: Record<string, number> = {
  I: 0, II: 60, III: 120, aVR: -150, aVL: -30, aVF: 90,
};

/** Net QRS amplitude for each precordial lead, giving normal R wave progression. */
const PRECORDIAL_NET: Record<string, number> = {
  V1: -1.0, V2: -0.75, V3: -0.1, V4: 0.75, V5: 1.15, V6: 0.9,
};

const LAYOUT_ROWS: LeadName[][] = [
  ['I', 'aVR', 'V1', 'V4'],
  ['II', 'aVL', 'V2', 'V5'],
  ['III', 'aVF', 'V3', 'V6'],
];

// A 5 × 7 bitmap font — enough for the lead labels.
const FONT: Record<string, string[]> = {
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  a: ['00000', '00000', '01110', '00001', '01111', '10001', '01111'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const gauss = (t: number, centre: number, width: number) =>
  Math.exp(-((t - centre) ** 2) / (2 * width * width));

interface BeatShape {
  /** Millivolts at time `t` seconds relative to the R peak. */
  value(t: number, net: number, tAmp: number, pAmp: number, st: number): number;
  qrsOnsetRel: number;
  qrsOffsetRel: number;
  tEndRel: number;
}

function beatShape(o: SynthOptions): BeatShape {
  const qrsSec = o.qrsMs / 1000;
  const prSec = o.prMs / 1000;
  const qtSec = o.qtMs / 1000;

  // QRS: a dominant central deflection flanked by opposite-signed lobes, so
  // that the net area — which is what the axis is computed from — tracks `net`.
  //
  // The declared onset and offset are placed where the deflection has actually
  // decayed, not at an arbitrary fraction of the width. That matters because
  // the ST offset is applied from the declared J point: if the S lobe were
  // still decaying there, the rendered image would not match its own stated
  // ground truth and the harness would be testing the wrong thing.
  const w = qrsSec / 6;
  const qrsOnsetRel = -2.4 * w;
  const qrsOffsetRel = 3.3 * w;

  const pWidth = 0.022;
  const pCentre = qrsOnsetRel - prSec + 2.2 * pWidth;

  const tWidth = 0.045;
  const tEndRel = qrsOnsetRel + qtSec;
  const tCentre = tEndRel - 2.1 * tWidth;

  return {
    qrsOnsetRel,
    qrsOffsetRel,
    tEndRel,
    value(t, net, tAmp, pAmp, st) {
      let v = 0;
      v += pAmp * gauss(t, pCentre, pWidth);
      // Dominant R with an S lobe and a narrow septal q, scaled so that the
      // net area — and therefore the frontal axis — tracks `net`.
      v += net * (gauss(t, 0, w) - 0.25 * gauss(t, 1.6 * w, w * 0.85) - 0.08 * gauss(t, -1.5 * w, w * 0.4));
      v += tAmp * gauss(t, tCentre, tWidth);
      // The deviation reaches its full value exactly at the J point, which is
      // where it is measured, and is blended in over the preceding 20 ms so
      // there is no discontinuity for the delineator to exploit.
      if (st !== 0 && t >= qrsOffsetRel - 0.02 && t <= tEndRel) {
        const ramp = Math.max(0, Math.min(1, (t - (qrsOffsetRel - 0.02)) / 0.02));
        v += st * ramp;
      }
      return v;
    },
  };
}

function leadParameters(lead: LeadName, o: SynthOptions) {
  const gain = o.precordialGain ?? 1;
  let net: number;
  let pAmp: number;

  if (lead in LIMB_ANGLE) {
    const theta = ((LIMB_ANGLE[lead] - o.axisDeg) * Math.PI) / 180;
    net = 1.35 * Math.cos(theta);
    const pTheta = ((LIMB_ANGLE[lead] - 50) * Math.PI) / 180;
    pAmp = (o.pAmplitudeMv ?? 0.14) * Math.cos(pTheta);
  } else if (lead in PRECORDIAL_NET) {
    net = PRECORDIAL_NET[lead] * gain;
    pAmp = (o.pAmplitudeMv ?? 0.14) * (lead === 'V1' ? 0.4 : 0.7);
  } else {
    // Rhythm strip mirrors lead II.
    const theta = ((60 - o.axisDeg) * Math.PI) / 180;
    net = 1.35 * Math.cos(theta);
    pAmp = (o.pAmplitudeMv ?? 0.14) * Math.cos(((60 - 50) * Math.PI) / 180);
  }

  let tAmp = 0.28 * net * (o.tGain ?? 1);
  if (o.tInverted?.includes(lead)) tAmp = -Math.abs(0.28 * (Math.abs(net) || 1) * (o.tGain ?? 1));
  const st = o.stMv?.[lead] ?? 0;
  return { net, tAmp, pAmp, st };
}

export function renderSyntheticEcg(options: Partial<SynthOptions> = {}): SynthResult {
  const o: SynthOptions = {
    heartRateBpm: 72,
    prMs: 160,
    qrsMs: 92,
    qtMs: 380,
    axisDeg: 45,
    durationSec: 10,
    pxPerMm: 6,
    mmPerSec: 25,
    mmPerMv: 10,
    labels: true,
    calibration: true,
    layout: '4x3+rhythm',
    seed: 12345,
    ...options,
  };

  const rand = mulberry32(o.seed ?? 1);
  const shape = beatShape(o);

  const rows = o.layout === 'rhythm' ? 1 : 4;
  const columns = o.layout === 'rhythm' ? 1 : 4;
  const columnSec = o.durationSec / columns;

  const marginMm = 6;
  const rowHeightMm = 38;
  const paperWidthMm = o.durationSec * o.mmPerSec + marginMm * 2;
  const paperHeightMm = rows * rowHeightMm + marginMm * 2;

  const width = Math.round(paperWidthMm * o.pxPerMm);
  const height = Math.round(paperHeightMm * o.pxPerMm);
  const pixels = new Uint8ClampedArray(width * height * 4);
  pixels.fill(255);
  for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;

  const put = (x: number, y: number, r: number, g: number, b: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = (y * width + x) * 4;
    pixels[p] = r; pixels[p + 1] = g; pixels[p + 2] = b; pixels[p + 3] = 255;
  };

  // ── Grid ────────────────────────────────────────────────────────────
  const step = o.pxPerMm;
  for (let mm = 0; mm * step < width; mm++) {
    const x = Math.round(mm * step);
    const major = mm % 5 === 0;
    const [r, g, b] = major ? [232, 138, 138] : [246, 197, 197];
    for (let y = 0; y < height; y++) put(x, y, r, g, b);
    if (major) for (let y = 0; y < height; y++) put(x + 1, y, r, g, b);
  }
  for (let mm = 0; mm * step < height; mm++) {
    const y = Math.round(mm * step);
    const major = mm % 5 === 0;
    const [r, g, b] = major ? [232, 138, 138] : [246, 197, 197];
    for (let x = 0; x < width; x++) put(x, y, r, g, b);
    if (major) for (let x = 0; x < width; x++) put(x, y + 1, r, g, b);
  }

  // ── Beat times ──────────────────────────────────────────────────────
  const rrMean = 60 / o.heartRateBpm;
  const beatTimes: number[] = [];
  let t = 0.45;
  while (t < o.durationSec + 1) {
    beatTimes.push(t);
    const jitter = o.rrJitter ? (rand() * 2 - 1) * o.rrJitter * rrMean : 0;
    t += rrMean + jitter;
  }

  const drawDot = (x: number, y: number) => {
    put(x, y, 20, 20, 20);
    put(x, y + 1, 20, 20, 20);
    put(x + 1, y, 45, 45, 45);
  };

  const drawLine = (x0: number, y0: number, x1: number, y1: number) => {
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0, y = y0;
    for (;;) {
      drawDot(x, y);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  };

  const drawText = (text: string, xPx: number, yPx: number, scale: number) => {
    let cx = xPx;
    for (const ch of text) {
      const glyph = FONT[ch];
      if (!glyph) { cx += 4 * scale; continue; }
      for (let gy = 0; gy < glyph.length; gy++) {
        for (let gx = 0; gx < glyph[gy].length; gx++) {
          if (glyph[gy][gx] !== '1') continue;
          for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
            put(cx + gx * scale + sx, yPx + gy * scale + sy, 15, 15, 15);
          }
        }
      }
      cx += 6 * scale;
    }
  };

  // ── Traces ──────────────────────────────────────────────────────────
  const stTruth: Partial<Record<LeadName, number>> = { ...(o.stMv ?? {}) };
  const labelScale = Math.max(1, Math.round(o.pxPerMm / 2.2));

  const renderPanel = (
    lead: LeadName,
    xStartMm: number,
    widthMm: number,
    baselineMm: number,
    timeOffsetSec: number,
    withCalibration: boolean,
  ) => {
    const { net, tAmp, pAmp, st } = leadParameters(lead, o);
    const x0 = Math.round(xStartMm * o.pxPerMm);
    const x1 = Math.round((xStartMm + widthMm) * o.pxPerMm);
    const baselineY = Math.round(baselineMm * o.pxPerMm);

    let drawStart = x0;

    if (withCalibration) {
      // 10 mm tall, 5 mm wide rectangular pulse.
      const pulseH = Math.round(o.mmPerMv * o.pxPerMm);
      const pulseW = Math.round(5 * o.pxPerMm);
      drawLine(x0, baselineY, x0 + 1, baselineY);
      drawLine(x0 + 1, baselineY, x0 + 1, baselineY - pulseH);
      drawLine(x0 + 1, baselineY - pulseH, x0 + 1 + pulseW, baselineY - pulseH);
      drawLine(x0 + 1 + pulseW, baselineY - pulseH, x0 + 1 + pulseW, baselineY);
      drawStart = x0 + pulseW + Math.round(2 * o.pxPerMm);
    }

    if (o.labels) {
      drawText(lead === 'rhythm' ? 'II' : lead, x0 + Math.round(o.pxPerMm), baselineY - Math.round(14 * o.pxPerMm), labelScale);
    }

    let prevX = -1, prevY = 0;
    for (let x = drawStart; x < x1; x++) {
      const tSec = timeOffsetSec + (x - x0) / (o.pxPerMm * o.mmPerSec);
      let v = 0;
      for (const bt of beatTimes) {
        const dt = tSec - bt;
        if (dt < -0.45 || dt > 0.65) continue;
        v += shape.value(dt, net, tAmp, pAmp, st);
      }
      if (o.noiseMv) v += (rand() * 2 - 1) * o.noiseMv;
      const y = Math.round(baselineY - v * o.mmPerMv * o.pxPerMm);
      if (prevX >= 0) drawLine(prevX, prevY, x, y);
      prevX = x; prevY = y;
    }
  };

  if (o.layout === 'rhythm') {
    renderPanel('rhythm', marginMm, o.durationSec * o.mmPerSec, marginMm + rowHeightMm / 2, 0, o.calibration ?? true);
  } else {
    for (let r = 0; r < 3; r++) {
      const baselineMm = marginMm + rowHeightMm * r + rowHeightMm / 2;
      for (let c = 0; c < 4; c++) {
        renderPanel(
          LAYOUT_ROWS[r][c],
          marginMm + c * columnSec * o.mmPerSec,
          columnSec * o.mmPerSec,
          baselineMm,
          c * columnSec,
          (o.calibration ?? true) && c === 0,
        );
      }
    }
    renderPanel(
      'rhythm',
      marginMm,
      o.durationSec * o.mmPerSec,
      marginMm + rowHeightMm * 3 + rowHeightMm / 2,
      0,
      o.calibration ?? true,
    );
  }

  const rrSec = 60 / o.heartRateBpm;
  return {
    pixels,
    width,
    height,
    truth: {
      heartRateBpm: o.heartRateBpm,
      prMs: o.prMs,
      qrsMs: o.qrsMs,
      qtMs: o.qtMs,
      qtcMs: Math.round(o.qtMs / Math.sqrt(rrSec)),
      axisDeg: o.axisDeg,
      stMv: stTruth,
      pxPerMm: o.pxPerMm,
    },
  };
}

/** Encode RGBA pixels as a PNG. Used to produce demonstration images. */
export function encodePng(pixels: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter type 0
    raw.set(pixels.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }

  const chunks: Uint8Array[] = [];
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  const crc32 = (buf: Uint8Array) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };

  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    const crcInput = out.subarray(4, 8 + data.length);
    dv.setUint32(8 + data.length, crc32(crcInput));
    return out;
  };

  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // Stored (uncompressed) deflate blocks keep this dependency-free.
  const blocks: Uint8Array[] = [];
  const MAX = 65535;
  let adlerA = 1, adlerB = 0;
  for (let i = 0; i < raw.length; i++) {
    adlerA = (adlerA + raw[i]) % 65521;
    adlerB = (adlerB + adlerA) % 65521;
  }
  for (let off = 0; off < raw.length; off += MAX) {
    const len = Math.min(MAX, raw.length - off);
    const last = off + len >= raw.length ? 1 : 0;
    const b = new Uint8Array(5 + len);
    b[0] = last;
    b[1] = len & 0xff; b[2] = (len >> 8) & 0xff;
    b[3] = ~len & 0xff; b[4] = (~len >> 8) & 0xff;
    b.set(raw.subarray(off, off + len), 5);
    blocks.push(b);
  }
  const zlibLen = 2 + blocks.reduce((a, b) => a + b.length, 0) + 4;
  const zlib = new Uint8Array(zlibLen);
  zlib[0] = 0x78; zlib[1] = 0x01;
  let p = 2;
  for (const b of blocks) { zlib.set(b, p); p += b.length; }
  new DataView(zlib.buffer).setUint32(p, ((adlerB << 16) | adlerA) >>> 0);

  chunks.push(signature, chunk('IHDR', ihdr), chunk('IDAT', zlib), chunk('IEND', new Uint8Array(0)));

  const total = chunks.reduce((a, c) => a + c.length, 0);
  const png = new Uint8Array(total);
  let q = 0;
  for (const c of chunks) { png.set(c, q); q += c.length; }
  return png;
}
