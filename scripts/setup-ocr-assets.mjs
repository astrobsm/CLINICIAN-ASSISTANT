/**
 * Copies the Tesseract OCR runtime (worker + WASM core) out of node_modules into
 * public/ocr/ and fetches the English traineddata once, so the application can
 * run OCR with NO network access at runtime.
 *
 * Run once after `npm install` (wired up as a postinstall hook).
 * If the machine is offline, the copy step still succeeds and the script prints
 * instructions for supplying eng.traineddata.gz manually.
 */
import { createReadStream, createWriteStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { mkdir, copyFile, access, stat, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'ocr');

const exists = async (p) => access(p).then(() => true).catch(() => false);

async function copyIfPresent(from, to) {
  if (!(await exists(from))) return false;
  await copyFile(from, to);
  return true;
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const nm = join(root, 'node_modules');

  const copied = [];

  // tesseract.js worker script. The source map is deliberately omitted: it is
  // 350 kB of no use in production and would be deployed with everything else.
  if (await copyIfPresent(join(nm, 'tesseract.js/dist/worker.min.js'), join(outDir, 'worker.min.js'))) {
    copied.push('worker.min.js');
  }

  // Only the LSTM cores are staged. The engine is configured for LSTM-only
  // recognition (OEM 1), so the combined legacy-plus-LSTM builds are never
  // loaded — and they account for roughly 16 MB, which would otherwise be
  // downloaded by every device and deployed to every host.
  const coreDir = join(nm, 'tesseract.js-core');
  const KEEP = /^(index\.js|tesseract-core(-simd)?-lstm\.(js|wasm|wasm\.js))$/;
  if (await exists(coreDir)) {
    for (const f of await readdir(coreDir)) {
      if (!KEEP.test(f)) continue;
      await copyFile(join(coreDir, f), join(outDir, f));
      copied.push(f);
    }
  }

  // Remove anything staged by an earlier version of this script.
  for (const f of await readdir(outDir).catch(() => [])) {
    if (/^tesseract-core/.test(f) && !KEEP.test(f)) await rm(join(outDir, f), { force: true });
    if (f === 'worker.min.js.map') await rm(join(outDir, f), { force: true });
  }

  console.log(`[setup:ocr] staged ${copied.length} runtime file(s) into public/ocr/`);

  // Language data — one-time download, then permanently offline.
  //
  // Stored UNCOMPRESSED as eng.traineddata. Static servers routinely serve a
  // .gz file with `Content-Encoding: gzip`, which makes the browser decompress
  // it transparently; Tesseract would then try to gunzip already-plain bytes
  // and fail. Shipping it uncompressed removes that server dependency
  // entirely (the wire transfer is still compressed by normal HTTP encoding).
  const plain = join(outDir, 'eng.traineddata');
  const gz = join(outDir, 'eng.traineddata.gz');

  if (await exists(plain)) {
    const { size } = await stat(plain);
    console.log(`[setup:ocr] eng.traineddata already present (${(size / 1e6).toFixed(1)} MB) — offline ready.`);
    await writeManifest(outDir, size);
    return;
  }

  const url = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz';
  try {
    if (!(await exists(gz))) {
      console.log('[setup:ocr] downloading English language data (one time only)…');
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await pipeline(Readable.fromWeb(res.body), createWriteStream(gz));
    }
    console.log('[setup:ocr] decompressing language data…');
    await pipeline(createReadStream(gz), createGunzip(), createWriteStream(plain));
    await rm(gz, { force: true });
    const { size } = await stat(plain);
    console.log(`[setup:ocr] eng.traineddata ready (${(size / 1e6).toFixed(1)} MB). OCR is now fully offline.`);
    await writeManifest(outDir, size);
  } catch (err) {
    console.warn(`[setup:ocr] could not prepare language data: ${err.message}`);
    console.warn('[setup:ocr] The app will run, but OCR needs this file. To supply it manually, download');
    console.warn(`[setup:ocr]   ${url}`);
    console.warn('[setup:ocr] decompress it, and place the resulting  eng.traineddata  into  public/ocr/');

    // On a hosting build this must not pass quietly: a deployment without the
    // language data looks fine until someone tries to scan a report on a ward.
    if (process.env.VERCEL || process.env.CI || process.argv.includes('--require')) {
      console.error('[setup:ocr] Refusing to continue a deployment build without the recognition language data.');
      process.exitCode = 1;
    }
  }
}

/**
 * A tiny manifest the application probes at start-up. Checking this instead of
 * the multi-megabyte language file avoids a wasteful request just to answer
 * "is OCR available?".
 */
async function writeManifest(dir, langBytes) {
  await writeFile(
    join(dir, 'manifest.json'),
    JSON.stringify({ lang: 'eng', file: 'eng.traineddata', bytes: langBytes, gzip: false }, null, 2),
  );
}

main().catch((e) => {
  console.warn('[setup:ocr] non-fatal:', e.message);
});
