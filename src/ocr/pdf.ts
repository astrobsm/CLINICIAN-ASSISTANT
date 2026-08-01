/**
 * PDF handling.
 *
 * Digitally generated PDFs (most laboratory and ECG reports issued
 * electronically) carry a real text layer, which is extracted directly — far
 * more accurate than OCR. Scanned PDFs have no usable text layer, so each page
 * is rasterised to a canvas and passed through the OCR engine instead.
 *
 * pdf.js runs locally from the bundle; no network access is involved.
 */
import * as pdfjs from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

export interface PdfPage {
  pageNumber: number;
  /** Text layer content, empty when the page is a scan. */
  text: string;
  /** Rasterised page, provided when the text layer is unusable. */
  canvas?: HTMLCanvasElement;
}

const MIN_TEXT_CHARS = 60;

export async function readPdf(
  file: Blob,
  onProgress?: (done: number, total: number) => void,
): Promise<{ pages: PdfPage[]; hasTextLayer: boolean }> {
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf, isEvalSupported: false, useSystemFonts: true }).promise;

  const pages: PdfPage[] = [];
  let textualPages = 0;

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();

    // Reconstruct lines from positioned text items so that tabular reports
    // survive extraction with their row structure intact.
    const items = (content.items as Array<{ str: string; transform: number[] }>)
      .filter((it) => typeof it.str === 'string')
      .map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5] }));

    let text = '';
    if (items.length) {
      const rows = new Map<number, { x: number; str: string }[]>();
      for (const it of items) {
        const key = Math.round(it.y / 3) * 3; // tolerate sub-pixel baseline drift
        if (!rows.has(key)) rows.set(key, []);
        rows.get(key)!.push({ x: it.x, str: it.str });
      }
      text = [...rows.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([, cells]) =>
          cells.sort((a, b) => a.x - b.x).map((c) => c.str).join(' ').replace(/\s{2,}/g, '   ').trim(),
        )
        .filter(Boolean)
        .join('\n');
    }

    const usable = text.replace(/\s/g, '').length >= MIN_TEXT_CHARS;
    if (usable) textualPages++;

    let canvas: HTMLCanvasElement | undefined;
    if (!usable) {
      const viewport = page.getViewport({ scale: 2.2 });
      canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
    }

    pages.push({ pageNumber: i, text: usable ? text : '', canvas });
    onProgress?.(i, doc.numPages);
    page.cleanup();
  }

  await doc.destroy();
  return { pages, hasTextLayer: textualPages > 0 };
}
