/**
 * Calibrates the blur warning threshold against what actually breaks
 * recognition.
 *
 * The threshold decides when a clinician is told a photograph looks out of
 * focus. Picking the number by eye would produce a warning that fires on
 * photographs that read perfectly well, or stays silent on ones that do not —
 * either of which trains people to ignore it.
 *
 * So it is measured: the same laboratory report is rendered at a series of
 * blur radii, each one is scored by the focus routine the camera uses and
 * then put through the application's real recognition and parsing path, and
 * the threshold is placed where value recovery actually collapses.
 *
 * Usage: node scripts/calibrate-blur.mjs [baseUrl]
 */
import puppeteer from 'puppeteer-core';
import { build } from 'esbuild';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.argv[2] ?? 'https://localhost:4173/';

const local = join(root, '.browser', 'chrome-headless-shell');
const exe = [
  ...(existsSync(local)
    ? readdirSync(local).map((v) => join(local, v, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'))
    : []),
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find(existsSync);
if (!exe) { console.error('No browser found.'); process.exit(1); }

const ROWS = [
  ['WBC', '4.42', '10/9', '(4.5- 17.0)'],
  ['NEUTROPHILS', '68.6', '%', '(40 - 75)'],
  ['LYMPHOCYTES', '23.4', '%', '(19 - 46)'],
  ['MONOCYTES', '6.9', '%', '( 2 -10)'],
  ['EOSINOPHILS', '1.1', '%', '(1 - 6)'],
  ['BASOPHILS', '0.0', '%', '(0 - 2)'],
  ['RBC', '4.35', '10^12L', '(4.0 - 5.8)'],
  ['HAEMOGLOBIN', '13.0', 'g/dl', '(11.5 - 15.5)'],
  ['PCV/HEAMATOCRIT', '37.2', '%', '(36.0 - 46.0)'],
  ['MCV', '86.0', 'Fl', '(80.0 - 95.0)'],
  ['MCH', '30.0', 'Pg', '(27.0 - 32.0)'],
  ['MCHC', '34.9', 'g/dl', '(32.0 - 36.0)'],
  ['RDW-CV', '13.2', '%', '(11 - 16)'],
  ['PLATELET', '187', '10^9/L', '(100- 400)'],
  ['MPV', '11.0', 'Fl', '(9 - 13)'],
];

// Blur radii applied to a 1240 px wide render. A phone photograph of an A4
// page is roughly this scale, so these are comparable to real camera shake
// and misfocus.
const RADII = [0, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8];

const { outputFiles } = await build({
  stdin: {
    contents: `import { focusScore, BLUR_THRESHOLD } from ${JSON.stringify(join(root, 'src/ui/focus.ts').replace(/\\/g, '/'))};
      window.__focusScore = focusScore; window.__blurThreshold = BLUR_THRESHOLD;`,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true, write: false, format: 'iife', target: 'chrome110', logLevel: 'warning',
});
const focusBundle = outputFiles[0].text;

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: true,
  acceptInsecureCerts: true,
  userDataDir: join(tmpdir(), `ca-blur-${Date.now()}`),
  args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--ignore-certificate-errors'],
});

const nap = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000 });
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForSelector('.app-header', { timeout: 20000 });
  await page.evaluate(focusBundle);

  await page.evaluate(() =>
    [...document.querySelectorAll('.tab')].find((b) => b.textContent.trim().startsWith('Scan')).click());
  await nap(400);

  console.log('\n  BLUR THRESHOLD CALIBRATION');
  console.log('  ' + '═'.repeat(72));
  console.log('  radius   focus score   values recovered   reads acceptably');
  console.log('  ' + '─'.repeat(72));

  const table = [];

  for (const radius of RADII) {
    const before = await page.evaluate(() => document.querySelectorAll('.doc-row').length);

    const score = await page.evaluate(async ({ rows, radius }) => {
      const c = document.createElement('canvas');
      c.width = 1240; c.height = 1450;
      const g = c.getContext('2d');
      if (radius > 0) g.filter = `blur(${radius}px)`;
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#111';
      g.font = '19px Arial';
      g.fillText('NAME: SPECIMEN, TEST PATIENT', 60, 170);
      g.fillText('Requesting Test: FBC', 700, 230);

      const x0 = 55, y0 = 320, w = 1130;
      const cols = [0, 175, 460, 700, 860, 1130];
      const rowH = 58;
      const total = rows.length + 1;
      g.strokeStyle = '#222'; g.lineWidth = 2;
      for (let r = 0; r <= total; r++) { g.beginPath(); g.moveTo(x0, y0 + r * rowH); g.lineTo(x0 + w, y0 + r * rowH); g.stroke(); }
      for (const cx of cols) { g.beginPath(); g.moveTo(x0 + cx, y0); g.lineTo(x0 + cx, y0 + total * rowH); g.stroke(); }

      g.font = '20px Arial';
      const cell = (t, col, row) => g.fillText(t, x0 + cols[col] + 14, y0 + row * rowH + 38);
      cell('Investigation', 0, 0); cell('Parameters', 1, 0); cell('Result', 2, 0); cell('Unit', 3, 0); cell('Normal Range', 4, 0);
      rows.forEach((r, i) => {
        if (i === 0) cell('FBC', 0, i + 1);
        cell(r[0], 1, i + 1); cell(r[1], 2, i + 1); cell(r[2], 3, i + 1); cell(r[3], 4, i + 1);
      });

      // Scored exactly as the camera scores a captured frame.
      const focus = window.__focusScore(c);

      await new Promise((resolve) => c.toBlob((blob) => {
        const dt = new DataTransfer();
        dt.items.add(new File([blob], `blur-${radius}.png`, { type: 'image/png' }));
        const input = [...document.querySelectorAll('input[type=file]')].find((i) => i.accept.includes('image'));
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        resolve();
      }, 'image/png'));

      return focus;
    }, { rows: ROWS, radius });

    await page.waitForFunction((n) => document.querySelectorAll('.doc-row').length > n, { timeout: 300000 }, before);
    await page.waitForFunction(
      (n) => [...document.querySelectorAll('.doc-row .chip')].filter((c) => /Processed|failed/i.test(c.textContent)).length >= n + 1,
      { timeout: 300000 }, before,
    );
    await nap(800);

    // How many of the 15 printed values came back.
    await page.evaluate(() =>
      [...document.querySelectorAll('.tab')].find((b) => b.textContent.trim().startsWith('Review')).click());
    await nap(700);
    const recovered = await page.evaluate(() =>
      document.querySelectorAll('table.data tbody tr input[type=number]').length);
    await page.evaluate(() =>
      [...document.querySelectorAll('.tab')].find((b) => b.textContent.trim().startsWith('Scan')).click());
    await nap(300);

    // Clear the session so each radius is measured independently.
    await page.evaluate(() => {
      [...document.querySelectorAll('.doc-row .btn.danger')].forEach((b) => b.click());
    });
    await nap(600);

    const ok = recovered >= 12;
    table.push({ radius, focus: score, recovered, ok });
    console.log(
      `  ${String(radius).padStart(5)}   ${score.toFixed(1).padStart(11)}   ${String(recovered).padStart(16)}   ${ok ? 'yes' : 'NO'}`,
    );
  }

  console.log('  ' + '─'.repeat(72));

  // The threshold belongs between the worst image that still reads and the
  // best image that does not.
  const lastGood = [...table].reverse().find((r) => r.ok);
  const firstBad = table.find((r) => !r.ok);

  if (!firstBad) {
    console.log('\n  No radius tested degraded recognition — widen RADII before trusting a threshold.');
  } else if (!lastGood) {
    console.log('\n  Even the unblurred render failed; recognition is broken, not the threshold.');
  } else {
    const suggested = Math.round((lastGood.focus + firstBad.focus) / 2);
    console.log(`\n  Worst image that still reads : blur ${lastGood.radius}px, focus ${lastGood.focus.toFixed(1)}, ${lastGood.recovered}/15 values`);
    console.log(`  Best image that does not     : blur ${firstBad.radius}px, focus ${firstBad.focus.toFixed(1)}, ${firstBad.recovered}/15 values`);
    console.log(`\n  SUGGESTED BLUR_THRESHOLD = ${suggested}`);
    console.log(`  (currently ${await page.evaluate(() => window.__blurThreshold)} in src/ui/focus.ts)`);
  }
  console.log('  ' + '═'.repeat(72) + '\n');
} finally {
  await browser.close();
}
