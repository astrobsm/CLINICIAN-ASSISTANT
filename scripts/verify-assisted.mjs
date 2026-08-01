/**
 * Verifies assisted extraction against a live deployment.
 *
 * Loads the deployed application, renders a replica of a bordered laboratory
 * report, and drives the real interface — enable, redact, confirm, send — so
 * that what is exercised is the production path, including the model itself.
 *
 * The key is never handled here. It lives in the deployment's environment.
 *
 * Usage: node scripts/verify-assisted.mjs https://your-app.vercel.app
 */
import puppeteer from 'puppeteer-core';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BASE = process.argv[2];
if (!BASE) {
  console.error('Usage: node scripts/verify-assisted.mjs <deployment-url>');
  process.exit(1);
}
const ROOT = BASE.endsWith('/') ? BASE : `${BASE}/`;

const local = join(process.cwd(), '.browser', 'chrome-headless-shell');
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

const EXPECTED = [
  ['White Blood Cell Count', 4.42], ['Red Blood Cell Count', 4.35],
  ['Haemoglobin', 13], ['Packed Cell Volume (PCV/Haematocrit)', 37.2],
  ['Mean Cell Volume', 86], ['Mean Cell Haemoglobin', 30],
  ['Mean Cell Haemoglobin Concentration', 34.9], ['Red Cell Distribution Width', 13.2],
  ['Platelet Count', 187], ['Mean Platelet Volume', 11],
];

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`   ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

console.log('═'.repeat(74));
console.log('  ASSISTED EXTRACTION — LIVE DEPLOYMENT');
console.log(`  ${ROOT}`);
console.log('═'.repeat(74));

console.log('\n▸ Endpoint');
let probe;
try {
  const res = await fetch(new URL('api/extract', ROOT), { cache: 'no-store' });
  probe = await res.json();
  check('endpoint reachable', res.ok, `HTTP ${res.status}`);
  check('a key is configured', probe.available === true,
    probe.available ? '' : 'OPENAI_API_KEY is not set on the deployment, or the redeploy has not finished');
} catch (err) {
  check('endpoint reachable', false, err.message);
}

if (!probe?.available) {
  console.log('\n' + '═'.repeat(74));
  console.log('  RESULT: the deployment is not serving assisted extraction yet.');
  console.log('  Set OPENAI_API_KEY in Project → Settings → Environment Variables, then redeploy.');
  console.log('═'.repeat(74));
  process.exit(1);
}

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: true,
  acceptInsecureCerts: true,
  userDataDir: join(tmpdir(), `ca-assist-${Date.now()}`),
  args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--ignore-certificate-errors'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 1000 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

try {
  await page.goto(ROOT, { waitUntil: 'networkidle0', timeout: 90000 });
  await page.waitForSelector('.app-header', { timeout: 30000 });
  check('application loaded', true);

  await page.evaluate(() => [...document.querySelectorAll('.tab')].find((b) => b.textContent.trim().startsWith('Scan')).click());
  await new Promise((r) => setTimeout(r, 500));

  console.log('\n▸ Scanning a bordered report with on-device recognition first');
  const before = await page.evaluate(() => document.querySelectorAll('.doc-row').length);
  await page.evaluate((rows) => {
    const c = document.createElement('canvas');
    c.width = 1240; c.height = 1300;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#111';
    g.font = 'bold 30px Arial';
    g.fillText('JENPEEY MEDICAL DIAGNOSTIC CENTRE', 55, 55);
    g.font = '20px Arial';
    g.fillText('NAME: SPECIMEN, TEST PATIENT', 55, 110);
    g.fillText('HOSPITAL NO: TEST-0001', 55, 145);
    g.fillText('SEX: MALE   AGE: 30 YEARS', 55, 180);
    const x0 = 55, y0 = 230, w = 1130, cols = [0, 175, 460, 700, 860, 1130], rowH = 58, total = rows.length + 1;
    g.strokeStyle = '#222'; g.lineWidth = 2;
    for (let r = 0; r <= total; r++) { g.beginPath(); g.moveTo(x0, y0 + r * rowH); g.lineTo(x0 + w, y0 + r * rowH); g.stroke(); }
    for (const cx of cols) { g.beginPath(); g.moveTo(x0 + cx, y0); g.lineTo(x0 + cx, y0 + total * rowH); g.stroke(); }
    g.font = '20px Arial';
    const cell = (t, col, row) => g.fillText(t, x0 + cols[col] + 14, y0 + row * rowH + 38);
    cell('Investigation', 0, 0); cell('Parameters', 1, 0); cell('Result', 2, 0); cell('Unit', 3, 0); cell('Normal Range', 4, 0);
    rows.forEach((r, i) => { if (i === 0) cell('FBC', 0, i + 1); cell(r[0], 1, i + 1); cell(r[1], 2, i + 1); cell(r[2], 3, i + 1); cell(r[3], 4, i + 1); });
    c.toBlob((b) => {
      const dt = new DataTransfer();
      dt.items.add(new File([b], 'live-fbc.png', { type: 'image/png' }));
      const input = [...document.querySelectorAll('input[type=file]')].find((i) => i.accept.includes('image'));
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, 'image/png');
  }, ROWS);

  await page.waitForFunction((n) => document.querySelectorAll('.doc-row').length > n, { timeout: 300000 }, before);
  await new Promise((r) => setTimeout(r, 1500));

  const readTable = () => page.evaluate(() => {
    [...document.querySelectorAll('.tab')].find((b) => b.textContent.trim().startsWith('Review')).click();
    return new Promise((res) => setTimeout(() => {
      const out = {};
      for (const tr of document.querySelectorAll('table.data tbody tr')) {
        const name = tr.cells[0]?.innerText.trim();
        const input = tr.querySelector('input[type=number]');
        if (name && input) out[name] = parseFloat(input.value);
      }
      res(out);
    }, 900));
  });

  const onDevice = await readTable();
  const onDeviceHits = EXPECTED.filter(([l, v]) => Math.abs((onDevice[l] ?? NaN) - v) < 0.05).length;
  console.log(`   on-device recognition recovered ${onDeviceHits} of ${EXPECTED.length}`);

  console.log('\n▸ Assisted extraction through the interface');
  await page.evaluate(() => [...document.querySelectorAll('.tab')].find((b) => b.textContent.trim().startsWith('Scan')).click());
  await new Promise((r) => setTimeout(r, 500));

  const enabled = await page.evaluate(() => {
    const card = [...document.querySelectorAll('.card')].find((c) => /Assisted extraction/i.test(c.textContent));
    if (!card) return 'no card';
    const toggle = card.querySelector('input[type=checkbox]');
    if (!toggle) return 'no toggle — the deployment reports the feature unavailable';
    if (!toggle.checked) toggle.click();
    return 'enabled';
  });
  check('feature offered and enabled', enabled === 'enabled', enabled);

  const previewShown = await page.evaluate(async () => {
    const card = [...document.querySelectorAll('.card')].find((c) => /Assisted extraction/i.test(c.textContent));
    const btn = [...card.querySelectorAll('button')].find((b) => /Prepare to send/i.test(b.textContent));
    if (!btn) return false;
    btn.click();
    for (let i = 0; i < 80; i++) {
      await new Promise((r) => setTimeout(r, 200));
      if (card.querySelector('img[alt*="transmitted"]')) return true;
    }
    return false;
  });
  check('redacted preview shown before sending', previewShown);

  const result = await page.evaluate(async () => {
    const card = [...document.querySelectorAll('.card')].find((c) => /Assisted extraction/i.test(c.textContent));
    const send = [...card.querySelectorAll('button')].find((b) => /Send this image/i.test(b.textContent));
    if (!send) return 'no send button';
    send.click();
    for (let i = 0; i < 400; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const note = card.querySelector('.disclaimer');
      const text = note?.innerText ?? '';
      if (/values extracted with|model read no|failed|not authorised|refused|Too many/i.test(text)) return text;
    }
    return 'timed out waiting for a response';
  });
  console.log(`   ${result.replace(/\n/g, ' ')}`);
  check('extraction returned values', /values? extracted with/i.test(result), '');

  const model = /extracted with ([\w.-]+)/i.exec(result)?.[1];
  if (model) console.log(`   model used: ${model}`);

  console.log('\n▸ Values after assisted extraction');
  const assisted = await readTable();
  let hits = 0;
  for (const [label, want] of EXPECTED) {
    const got = assisted[label];
    const ok = got !== undefined && Math.abs(got - want) < 0.05;
    if (ok) hits++;
    check(`${label} = ${want}`, ok, `got ${got ?? 'NOT FOUND'}`);
  }
  console.log(`   ${hits} of ${EXPECTED.length} recovered (on-device alone: ${onDeviceHits})`);

  check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
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
