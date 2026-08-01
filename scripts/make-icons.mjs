/**
 * Render the NEXORA monogram to PNG app icons.
 *
 * Browsers require raster icons at 192 and 512 pixels before they will offer
 * to install a web app, and iOS needs an apple-touch-icon. Generating them
 * from the same geometry as the inline SVG keeps the mark consistent
 * everywhere without adding an image dependency.
 */
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Monogram geometry, in the same 100 × 116 space as the SVG.
const BLUE = [[0, 0], [20, 0], [70, 48], [20, 48], [20, 86], [0, 100]];
const WHITE = [[100, 116], [80, 116], [30, 68], [80, 68], [80, 30], [100, 16]];

function fillPolygon(px, size, poly, colour, ox, oy, scale) {
  const pts = poly.map(([x, y]) => [ox + x * scale, oy + y * scale]);
  let minY = Infinity, maxY = -Infinity;
  for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }

  // Coverage is accumulated across all subsamples first and the blend applied
  // once. Blending per subsample compounds, which washes a solid fill out to
  // roughly two thirds of its intended colour.
  const SS = 4;
  const coverage = new Float32Array(size * size);
  for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(size - 1, Math.ceil(maxY)); y++) {
    for (let s = 0; s < SS; s++) {
      const sy = y + (s + 0.5) / SS;
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % pts.length];
        if ((y1 <= sy && y2 > sy) || (y2 <= sy && y1 > sy)) {
          xs.push(x1 + ((sy - y1) / (y2 - y1)) * (x2 - x1));
        }
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let x = Math.max(0, Math.floor(xs[i])); x <= Math.min(size - 1, Math.ceil(xs[i + 1])); x++) {
          const overlap = Math.min(x + 1, xs[i + 1]) - Math.max(x, xs[i]);
          if (overlap <= 0) continue;
          coverage[y * size + x] += Math.min(1, overlap) / SS;
        }
      }
    }
  }

  for (let i = 0; i < coverage.length; i++) {
    const cov = Math.min(1, coverage[i]);
    if (cov <= 0) continue;
    const p = i * 4;
    for (let c = 0; c < 3; c++) px[p + c] = px[p + c] * (1 - cov) + colour[c] * cov;
    px[p + 3] = Math.max(px[p + 3], 255 * cov);
  }
}

function renderIcon(size) {
  const px = new Uint8ClampedArray(size * size * 4);
  // Rounded dark tile, matching the application background.
  const radius = size * 0.19;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.max(radius - x, 0, x - (size - radius));
      const dy = Math.max(radius - y, 0, y - (size - radius));
      const inside = dx * dx + dy * dy <= radius * radius;
      const p = (y * size + x) * 4;
      px[p] = inside ? 5 : 5;
      px[p + 1] = inside ? 7 : 7;
      px[p + 2] = inside ? 13 : 13;
      px[p + 3] = inside ? 255 : 0;
    }
  }

  const scale = (size * 0.62) / 116;
  const markW = 100 * scale;
  const markH = 116 * scale;
  const ox = (size - markW) / 2;
  const oy = (size - markH) / 2;

  fillPolygon(px, size, BLUE, [0, 163, 255], ox, oy, scale);
  fillPolygon(px, size, WHITE, [234, 246, 255], ox, oy, scale);
  return px;
}

function encodePng(px, size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(px.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }

  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    Buffer.from(data).copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512, 180]) {
  const name = size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`;
  writeFileSync(join(root, 'public', name), encodePng(renderIcon(size), size));
  console.log(`[icons] wrote public/${name} (${size}×${size})`);
}
