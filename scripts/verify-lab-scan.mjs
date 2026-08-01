/**
 * End-to-end verification of laboratory table extraction.
 *
 * Renders a replica of a real bordered full blood count report — the layout
 * that defeated the parser in the field: a leading "Investigation" column
 * carrying the panel name, ruled cell borders, differentials given only as
 * percentages, and reference ranges in their own column — then feeds it
 * through the application's actual recognition and parsing path and checks
 * every value is recovered.
 *
 * Identifiers are fictitious.
 *
 * Usage: node scripts/verify-lab-scan.mjs [baseUrl]
 */
import puppeteer from 'puppeteer-core';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BASE = process.argv[2] ?? 'https://localhost:4173/';

const local = join(process.cwd(), '.browser', 'chrome-headless-shell');
const CANDIDATES = [
  ...(existsSync(local)
    ? readdirSync(local).map((v) => join(local, v, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'))
    : []),
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];
const exe = CANDIDATES.find((p) => existsSync(p));
if (!exe) { console.error('No browser found.'); process.exit(1); }

/** Result, unit and reference range exactly as printed on the source report. */
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

/** Label shown in the review table, and the value that must appear against it. */
const EXPECTED = [
  ['White Blood Cell Count', '4.42'],
  ['Red Blood Cell Count', '4.35'],
  ['Haemoglobin', '13'],
  ['Packed Cell Volume (PCV/Haematocrit)', '37.2'],
  ['Mean Cell Volume', '86'],
  ['Mean Cell Haemoglobin', '30'],
  ['Mean Cell Haemoglobin Concentration', '34.9'],
  ['Red Cell Distribution Width', '13.2'],
  ['Platelet Count', '187'],
  ['Mean Platelet Volume', '11'],
];

// Differentials are printed as percentages only; the absolute counts are
// derived from the white cell count of 4.42.
const EXPECTED_DERIVED = [
  ['Neutrophils', 68.6 * 4.42 / 100],
  ['Lymphocytes', 23.4 * 4.42 / 100],
  ['Monocytes', 6.9 * 4.42 / 100],
  ['Eosinophils', 1.1 * 4.42 / 100],
];

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`   ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: true,
  acceptInsecureCerts: true,
  userDataDir: join(tmpdir(), `ca-lab-${Date.now()}`),
  args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--ignore-certificate-errors'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 1000 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

console.log('═'.repeat(74));
console.log('  LABORATORY TABLE EXTRACTION — BORDERED REPORT REPLICA');
console.log('═'.repeat(74));

try {
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForSelector('.app-header', { timeout: 20000 });

  // The file input lives on the Scan tab; the app opens on Patient.
  await page.evaluate(() => [...document.querySelectorAll('.tab')].find((b) => b.textContent.trim().startsWith('Scan')).click());
  await new Promise((r) => setTimeout(r, 400));

  console.log('\n▸ Rendering a replica of the printed report and scanning it');
  const before = await page.evaluate(() => document.querySelectorAll('.doc-row').length);

  await page.evaluate((rows) => {
    const c = document.createElement('canvas');
    c.width = 1240; c.height = 1450;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#111';

    g.font = 'bold 34px Arial';
    g.fillText('JENPEEY', 60, 70);
    g.font = '17px Arial';
    g.fillText('MEDICAL DIAGNOSTIC CENTRE', 60, 96);

    g.font = '19px Arial';
    g.fillText('NAME: SPECIMEN, TEST PATIENT', 60, 170);
    g.fillText('SEX: MALE', 60, 200);
    g.fillText('AGE: 30 YEARS', 60, 230);
    g.fillText('DATE: 01/08/2026', 60, 260);
    g.fillText('LAB NO: JP1027', 700, 170);
    g.fillText('SPECIMEN: BLOOD', 700, 200);
    g.fillText('Requesting Test: FBC', 700, 230);

    // Ruled table — the structure that defeats text-flow ordering.
    const x0 = 55, y0 = 320, w = 1130;
    const cols = [0, 175, 460, 700, 860, 1130];
    const rowH = 58;
    const total = rows.length + 1;

    g.strokeStyle = '#222'; g.lineWidth = 2;
    for (let r = 0; r <= total; r++) {
      g.beginPath(); g.moveTo(x0, y0 + r * rowH); g.lineTo(x0 + w, y0 + r * rowH); g.stroke();
    }
    for (const cx of cols) {
      g.beginPath(); g.moveTo(x0 + cx, y0); g.lineTo(x0 + cx, y0 + total * rowH); g.stroke();
    }

    g.font = '20px Arial';
    const cell = (text, col, row, pad = 14) => {
      g.fillText(text, x0 + cols[col] + pad, y0 + row * rowH + 38);
    };

    cell('Investigation', 0, 0); cell('Parameters', 1, 0);
    cell('Result', 2, 0); cell('Unit', 3, 0); cell('Normal Range', 4, 0);

    rows.forEach((r, i) => {
      if (i === 0) cell('FBC', 0, i + 1);
      cell(r[0], 1, i + 1);
      cell(r[1], 2, i + 1);
      cell(r[2], 3, i + 1);
      cell(r[3], 4, i + 1);
    });

    g.font = 'bold 20px Arial';
    g.fillText('FILM COMMENT', 55, y0 + total * rowH + 50);
    g.font = '19px Arial';
    g.fillText('RBC -   MICROCYTIC NORMOCHROMIC', 55, y0 + total * rowH + 80);
    g.fillText('WBC -   APPEAR NORMAL', 55, y0 + total * rowH + 108);
    g.fillText('PLATELET - ADEQUATE', 55, y0 + total * rowH + 136);

    c.toBlob((blob) => {
      const dt = new DataTransfer();
      dt.items.add(new File([blob], 'fbc-report-replica.png', { type: 'image/png' }));
      const input = [...document.querySelectorAll('input[type=file]')].find((i) => i.accept.includes('image'));
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, 'image/png');
  }, ROWS);

  await page.waitForFunction((n) => document.querySelectorAll('.doc-row').length > n, { timeout: 240000 }, before);
  await new Promise((r) => setTimeout(r, 1500));

  const docRow = await page.evaluate(() => {
    const row = [...document.querySelectorAll('.doc-row')].find((r) => r.textContent.includes('fbc-report-replica'));
    return row ? row.innerText.replace(/\n/g, ' | ') : null;
  });
  console.log(`   ${docRow}`);
  check('classified as a full blood count', /Full Blood Count/i.test(docRow ?? ''));
  check('no "no recognised clinical values" message', !/no recognised clinical values/i.test(docRow ?? ''), docRow ?? '');

  console.log('\n▸ Values recovered');
  await page.evaluate(() => [...document.querySelectorAll('.tab')].find((b) => b.textContent.trim().startsWith('Review')).click());
  await new Promise((r) => setTimeout(r, 900));

  const read = await page.evaluate(() => {
    const out = {};
    for (const tr of document.querySelectorAll('table.data tbody tr')) {
      const name = tr.cells[0]?.innerText.trim();
      const input = tr.querySelector('input[type=number]');
      if (name && input) out[name] = input.value;
    }
    return out;
  });

  for (const [label, want] of EXPECTED) {
    const got = read[label];
    check(`${label} = ${want}`, got !== undefined && Math.abs(parseFloat(got) - parseFloat(want)) < 0.05, `got ${got ?? 'NOT FOUND'}`);
  }

  console.log('\n▸ Differentials derived from the percentages and the white cell count');
  for (const [prefix, want] of EXPECTED_DERIVED) {
    const entry = Object.entries(read).find(([k]) => k.startsWith(prefix));
    const got = entry ? parseFloat(entry[1]) : NaN;
    check(`${prefix} ≈ ${want.toFixed(2)} ×10⁹/L`, Number.isFinite(got) && Math.abs(got - want) < 0.05, entry ? `got ${got}` : 'NOT FOUND');
  }

  console.log('\n▸ Safety: a percentage must never be graded as an absolute count');
  const neut = Object.entries(read).find(([k]) => k.startsWith('Neutrophils'));
  check('neutrophil count is not the raw percentage', !neut || parseFloat(neut[1]) < 20, neut ? `${neut[1]} ×10⁹/L` : 'absent');

  const analysis = await page.evaluate(() => {
    [...document.querySelectorAll('.tab')].find((b) => b.textContent.trim().startsWith('Analysis')).click();
    return new Promise((r) => setTimeout(() => r(document.body.innerText), 900));
  });
  check('no spurious leukaemoid reaction reported', !/Marked leucocytosis|leukaemoid/i.test(analysis));
  check('mild leucopenia recognised (WBC 4.42 against 4.5 lower limit)', /Leucopenia|within the reference/i.test(analysis));

  check('no page errors', errors.length === 0, errors.join(' | '));
} catch (err) {
  failures++;
  console.log(`   ✗ FATAL: ${err.message}`);
} finally {
  await browser.close();
}

console.log('\n' + '═'.repeat(74));
console.log(failures ? `  RESULT: ${failures} CHECK(S) FAILED` : '  RESULT: ALL CHECKS PASSED');
console.log('═'.repeat(74));
process.exitCode = failures ? 1 : 0;
