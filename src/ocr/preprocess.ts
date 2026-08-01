/**
 * Image preprocessing for OCR.
 *
 * Laboratory printouts photographed on a ward are typically low contrast,
 * unevenly lit and under-resolved for OCR. Upscaling, greyscale conversion,
 * local contrast normalisation and adaptive thresholding materially improve
 * character recognition. Everything runs on a local canvas — no upload.
 */

export interface PreprocessOptions {
  /** Target minimum width in pixels; Tesseract performs best around 1600–2400. */
  minWidth?: number;
  /** Apply adaptive thresholding to produce a clean bi-level image. */
  binarise?: boolean;
  /** Invert (for white-on-black monitor screenshots). */
  autoInvert?: boolean;
}

export async function loadImage(source: Blob | string): Promise<HTMLImageElement> {
  const url = typeof source === 'string' ? source : URL.createObjectURL(source);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Unable to decode image'));
      img.src = url;
    });
    return img;
  } finally {
    if (typeof source !== 'string') {
      // Revoked after decode; the pixels are already in the image object.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }
}

/** Otsu threshold over a greyscale histogram. */
function otsuThreshold(hist: Uint32Array, total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/**
 * Upscale to a working resolution, preserving colour.
 *
 * Colour must survive this step: ECG paper grids are printed in red, and
 * separating the red grid from the black trace is what makes waveform
 * digitisation possible at all. Binarisation is applied afterwards, to a
 * separate canvas of identical geometry, so OCR word coordinates map directly
 * onto the colour image.
 */
export function scaleToCanvas(
  img: CanvasImageSource & { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number },
  minWidth = 1800,
): HTMLCanvasElement {
  const srcW = (img as HTMLImageElement).naturalWidth || (img.width as number) || 1000;
  const srcH = (img as HTMLImageElement).naturalHeight || (img.height as number) || 1000;

  // minWidth of 0 means "keep the original resolution".
  const scale = minWidth <= 0 ? 1 : Math.min(Math.max(minWidth / srcW, 1), 4);
  const w = Math.round(srcW * scale);
  const h = Math.round(srcH * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

/** Greyscale, contrast-stretch and threshold a canvas for OCR. */
export function enhanceForOcr(source: HTMLCanvasElement, opts: PreprocessOptions = {}): HTMLCanvasElement {
  const { binarise = true, autoInvert = true } = opts;
  const w = source.width;
  const h = source.height;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0);

  const imgData = ctx.getImageData(0, 0, w, h);
  applyEnhancement(imgData, w, h, binarise, autoInvert);
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

export function preprocessToCanvas(
  img: CanvasImageSource & { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number },
  opts: PreprocessOptions = {},
): HTMLCanvasElement {
  return enhanceForOcr(scaleToCanvas(img, opts.minWidth ?? 1800), opts);
}

function applyEnhancement(
  imgData: ImageData,
  w: number,
  h: number,
  binarise: boolean,
  autoInvert: boolean,
): void {
  const d = imgData.data;
  const n = w * h;

  // Greyscale + histogram
  const grey = new Uint8ClampedArray(n);
  const hist = new Uint32Array(256);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
    grey[p] = g;
    hist[g]++;
  }

  // Contrast stretch on the 2nd–98th percentile to survive uneven lighting.
  let lo = 0;
  let hi = 255;
  const loCount = n * 0.02;
  const hiCount = n * 0.98;
  let acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= loCount) { lo = i; break; }
  }
  acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= hiCount) { hi = i; break; }
  }
  const span = Math.max(hi - lo, 1);

  // Mean luminance decides whether this is a white-on-black screenshot.
  let mean = 0;
  for (let p = 0; p < n; p++) mean += grey[p];
  mean /= n;
  const invert = autoInvert && mean < 100;

  const stretched = new Uint8ClampedArray(n);
  const hist2 = new Uint32Array(256);
  for (let p = 0; p < n; p++) {
    let v = ((grey[p] - lo) / span) * 255;
    v = v < 0 ? 0 : v > 255 ? 255 : v;
    if (invert) v = 255 - v;
    stretched[p] = v;
    hist2[v | 0]++;
  }

  const threshold = binarise ? otsuThreshold(hist2, n) : 0;

  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const v = binarise ? (stretched[p] > threshold ? 255 : 0) : stretched[p];
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
    d[i + 3] = 255;
  }
}

/** Convenience: Blob in, preprocessed canvas out. */
export async function preprocessBlob(blob: Blob, opts?: PreprocessOptions): Promise<HTMLCanvasElement> {
  const img = await loadImage(blob);
  return preprocessToCanvas(img, opts);
}
