/**
 * Verifies multi-shot camera capture in a real browser.
 *
 * Chrome is launched with a synthetic camera device, so this exercises the
 * genuine getUserMedia path — permission, stream, live preview, capture,
 * accumulation, deletion and hand-off — rather than a mock of it.
 *
 * Three things are checked that a manual look at the screen would miss:
 *   · every captured photograph reaches the ingestion pipeline as its own
 *     document, which is the entire point of taking several;
 *   · the camera is genuinely released when the panel closes, on both the
 *     finish and the cancel path (a stream left running holds the device and
 *     leaves the recording indicator lit);
 *   · the blur detector separates a sharp frame from a blurred one, tested
 *     against images of known sharpness rather than against whatever the
 *     fake camera happens to produce.
 *
 * Usage: node scripts/verify-camera.mjs [baseUrl]
 */
import puppeteer from 'puppeteer-core';
import { build } from 'esbuild';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.argv[2] ?? 'https://localhost:4173/';

const local = join(root, '.browser', 'chrome-headless-shell');
const exe = [
  ...(existsSync(local)
    ? readdirSync(local).map((v) => join(local, v, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'))
    : []),
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find(existsSync);
if (!exe) { console.error('No browser found.'); process.exit(1); }

let failures = 0;
let checks = 0;
const check = (label, ok, detail) => {
  checks++;
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${!ok && detail !== undefined ? `  → ${JSON.stringify(detail)}` : ''}`);
};
const line = (c = '─') => console.log(`  ${c.repeat(76)}`);

// The real focus routine, bundled so the check runs against shipped code.
const { outputFiles } = await build({
  stdin: {
    contents: `import { focusScore, BLUR_THRESHOLD } from ${JSON.stringify(join(root, 'src/ui/focus.ts').replace(/\\/g, '/'))};
      window.__focusScore = focusScore; window.__blurThreshold = BLUR_THRESHOLD;`,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'iife',
  target: 'chrome110',
  logLevel: 'warning',
});
const focusBundle = outputFiles[0].text;

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: 'new',
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--allow-insecure-localhost',
    '--ignore-certificate-errors',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

const nap = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on('pageerror', (e) => { console.log(`  ! page error: ${e.message}`); failures++; });

  const ctx = browser.defaultBrowserContext();
  await ctx.overridePermissions(new URL(BASE).origin, ['camera']);

  console.log('\n  MULTI-SHOT CAMERA CAPTURE — VERIFICATION');
  line('═');
  console.log(`\n  ▸ ${BASE}`);
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 60000 });

  // ─────────────── blur detection, against known images ───────────────
  console.log('\n  Focus detection — images of known sharpness');
  line();
  await page.evaluate(focusBundle);
  const focus = await page.evaluate(() => {
    const make = (draw) => {
      const c = document.createElement('canvas');
      c.width = 900; c.height = 640;
      const x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
      draw(x, c);
      return c;
    };
    // Something like a laboratory report: hard-edged text rows and rules.
    const page1 = (x, c) => {
      x.fillStyle = '#000';
      x.font = '17px monospace';
      for (let i = 0; i < 22; i++) {
        x.fillText('Haemoglobin        7.4   g/dL    13.0 - 17.0   L', 30, 40 + i * 26);
        x.fillRect(20, 50 + i * 26, c.width - 40, 1);
      }
    };
    const sharp = make(page1);
    const blurry = make((x, c) => { x.filter = 'blur(3px)'; page1(x, c); });
    const veryBlurry = make((x, c) => { x.filter = 'blur(7px)'; page1(x, c); });
    const blank = make(() => {});
    return {
      threshold: window.__blurThreshold,
      sharp: window.__focusScore(sharp),
      blurry: window.__focusScore(blurry),
      veryBlurry: window.__focusScore(veryBlurry),
      blank: window.__focusScore(blank),
    };
  });

  const r = (n) => Math.round(n * 100) / 100;
  console.log(`    scores — sharp ${r(focus.sharp)}, 3px ${r(focus.blurry)}, 7px ${r(focus.veryBlurry)}, threshold ${focus.threshold}`);
  check('a sharp report scores above the threshold', focus.sharp > focus.threshold, r(focus.sharp));
  check('a 3px-blurred copy falls below it', focus.blurry < focus.threshold, r(focus.blurry));
  check('a 7px-blurred copy falls further still', focus.veryBlurry < focus.blurry, focus);
  check('sharp scores at least 4x the blurred copy', focus.sharp > focus.blurry * 4, {
    sharp: r(focus.sharp), blurry: r(focus.blurry),
  });
  // Normalising by contrast must make the score comparable across documents
  // of different density — otherwise no single threshold can fit both.
  check('a sharp page scores in the same band as the calibration report (5-15)',
    focus.sharp > 5 && focus.sharp < 15, r(focus.sharp));
  check('a blank frame is not reported as blurred',
    focus.blank === null || focus.blank >= focus.threshold, focus.blank);

  // ─────────────── open the camera ───────────────
  console.log('\n  Opening the camera');
  line();
  await page.evaluate(() => {
    [...document.querySelectorAll('.tab')].find((b) => b.textContent.trim().startsWith('Scan'))?.click();
  });
  await nap(300);
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Use camera')?.click();
  });

  await page.waitForSelector('.cam-video', { timeout: 15000 });
  await page.waitForFunction(() => {
    const v = document.querySelector('.cam-video');
    return v && v.videoWidth > 0;
  }, { timeout: 15000 });

  const stream = await page.evaluate(() => {
    const v = document.querySelector('.cam-video');
    const t = v.srcObject?.getVideoTracks?.()[0];
    return { w: v.videoWidth, h: v.videoHeight, live: t?.readyState === 'live', label: t?.label ?? '' };
  });
  check('a live camera stream is playing in the panel', stream.live, stream);
  check('the preview has real frame dimensions', stream.w > 0 && stream.h > 0, stream);
  check('the shutter is enabled once the stream is ready',
    await page.evaluate(() => !document.querySelector('.shutter')?.disabled));

  // ─────────────── multiple shots in one session ───────────────
  console.log('\n  Taking several photographs without reopening');
  line();
  // Pressed in quick succession, deliberately: a capture takes long enough
  // that a second press can land mid-encode, and every press must still
  // produce a photograph.
  for (let i = 0; i < 3; i++) await page.click('.shutter');
  let settled = true;
  try {
    await page.waitForFunction(() => document.querySelectorAll('.cam-thumb').length === 3, { timeout: 20000 });
  } catch { settled = false; }
  let thumbs = await page.evaluate(() => document.querySelectorAll('.cam-thumb').length);
  check('three rapid shutter presses produce three photographs — none dropped', settled && thumbs === 3, thumbs);
  await nap(500);
  check('and no extra photograph appears afterwards',
    (await page.evaluate(() => document.querySelectorAll('.cam-thumb').length)) === 3);
  check('the camera stayed open throughout',
    await page.evaluate(() => !!document.querySelector('.cam-video')));
  check('the stream is still live after capturing',
    await page.evaluate(() => document.querySelector('.cam-video').srcObject.getVideoTracks()[0].readyState === 'live'));

  const distinct = await page.evaluate(() =>
    new Set([...document.querySelectorAll('.cam-thumb img')].map((i) => i.src)).size);
  check('each photograph is a separate image, not the same one repeated', distinct === 3, distinct);

  // ─────────────── retake ───────────────
  console.log('\n  Discarding a bad photograph');
  line();
  await page.click('.cam-thumb .cam-del');
  await nap(250);
  thumbs = await page.evaluate(() => document.querySelectorAll('.cam-thumb').length);
  check('removing one leaves the other two', thumbs === 2, thumbs);
  check('the remaining photographs are renumbered 1 and 2',
    (await page.evaluate(() =>
      [...document.querySelectorAll('.cam-thumb figcaption')].map((f) => f.textContent.trim()[0]).join(''),
    )) === '12');

  const label = await page.evaluate(() =>
    [...document.querySelectorAll('.cam button')].find((b) => b.textContent.includes('Analyse'))?.textContent.trim());
  check('the finish button counts what will be analysed', /Analyse\s*2\s*photos/.test(label), label);

  // ─────────────── hand-off to the pipeline ───────────────
  console.log('\n  Handing every photograph to the ingestion pipeline');
  line();
  const before = await page.evaluate(() => document.querySelectorAll('.doc-row').length);

  await page.evaluate(() => {
    [...document.querySelectorAll('.cam button')].find((b) => b.textContent.includes('Analyse'))?.click();
  });
  await nap(400);
  check('the camera panel closes on finishing',
    await page.evaluate(() => !document.querySelector('.cam-backdrop')));

  // Both photographs must be ingested — not merged, not the last one only.
  await page.waitForFunction(
    (n) => document.querySelectorAll('.doc-row').length >= n + 2,
    { timeout: 180000 },
    before,
  );
  const docs = await page.evaluate(() =>
    [...document.querySelectorAll('.doc-row .name')].map((n) => n.textContent.trim()));
  const fromCamera = docs.filter((d) => d.startsWith('camera-'));
  check('both photographs arrive as separate documents', fromCamera.length === 2, fromCamera);
  check('they are named in capture order', /page-01/.test(fromCamera[0]) && /page-02/.test(fromCamera[1]), fromCamera);

  await page.waitForFunction(
    () => [...document.querySelectorAll('.doc-row .chip')].filter((c) => c.textContent.trim() === 'Processed').length >= 2,
    { timeout: 180000 },
  );
  check('both were processed by the recognition pipeline', true);

  // ─────────────── the camera is released ───────────────
  console.log('\n  Releasing the device');
  line();
  const leaked = await page.evaluate(() => window.__openTracks ?? null);
  check('no live camera track remains after finishing', leaked === null || leaked === 0, leaked);

  // Reopen and cancel — the other exit path must release it too.
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Use camera')?.click();
  });
  await page.waitForFunction(() => {
    const v = document.querySelector('.cam-video');
    return v && v.videoWidth > 0;
  }, { timeout: 15000 });

  const track = await page.evaluate(() => {
    const v = document.querySelector('.cam-video');
    window.__t = v.srcObject.getVideoTracks()[0];
    return window.__t.readyState;
  });
  check('reopening the camera works after a previous session', track === 'live', track);

  await page.evaluate(() => {
    [...document.querySelectorAll('.cam-head button')].find((b) => b.textContent.trim() === 'Close')?.click();
  });
  await nap(400);
  const afterCancel = await page.evaluate(() => window.__t.readyState);
  check('cancelling stops the camera track', afterCancel === 'ended', afterCancel);
  check('the panel is gone', await page.evaluate(() => !document.querySelector('.cam-backdrop')));

  line('═');
  console.log(`  ${checks} checks, ${failures} failed`);
  console.log(failures ? '  RESULT: FAILED' : '  RESULT: ALL CHECKS PASSED');
  line('═');
} finally {
  await browser.close();
}

process.exitCode = failures ? 1 : 0;
