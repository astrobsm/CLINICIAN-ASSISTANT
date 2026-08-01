/**
 * Browser smoke test: drives the built application in headless Edge, loads the
 * demonstration reports through the real ingestion pipeline, and captures
 * screenshots of each tab plus a print-to-PDF of the report.
 *
 * Usage: node scripts/smoke.mjs [baseUrl] [outDir]
 */
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BASE = process.argv[2] ?? 'https://localhost:4173/';
const OUT = process.argv[3] ?? join(process.cwd(), 'screenshots');

// Prefer the pinned headless shell fetched by `npx @puppeteer/browsers install`,
// falling back to a system Chrome or Edge.
const CANDIDATES = [
  ...(existsSync(join(process.cwd(), '.browser', 'chrome-headless-shell'))
    ? readdirSync(join(process.cwd(), '.browser', 'chrome-headless-shell')).map((v) =>
        join(process.cwd(), '.browser', 'chrome-headless-shell', v, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'))
    : []),
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const executablePath = CANDIDATES.find((p) => existsSync(p));
if (!executablePath) {
  console.error('No Chrome/Edge executable found. Run: npx @puppeteer/browsers install chrome-headless-shell@stable --path ./.browser');
  process.exit(1);
}
console.log('▸ Browser:', executablePath);

await mkdir(OUT, { recursive: true });

const userDataDir = join(tmpdir(), `ca-smoke-${Date.now()}`);
const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  userDataDir,
  // The preview server uses a development certificate.
  acceptInsecureCerts: true,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--ignore-certificate-errors',
    '--force-color-profile=srgb',
  ],
});

const errors = [];
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1100, deviceScaleFactor: 1 });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));

const clickTab = async (label) => {
  await page.evaluate((l) => {
    const t = [...document.querySelectorAll('.tab')].find((b) => b.textContent.trim().startsWith(l));
    if (t) t.click();
  }, label);
  await new Promise((r) => setTimeout(r, 450));
};

const shot = async (name, full = false) => {
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: full });
  console.log(`  captured ${name}.png`);
};

const text = () => page.evaluate(() => document.body.innerText);

try {
  console.log(`▸ Loading ${BASE}`);
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForSelector('.app-header', { timeout: 15000 });
  console.log('  title:', await page.title());
  await shot('01-patient');

  console.log('▸ Filling patient panel');
  await page.evaluate(() => {
    const set = (el, v) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const inputs = [...document.querySelectorAll('.field')];
    const byLabel = (l) => inputs.find((f) => f.querySelector('label')?.textContent.trim().toLowerCase().startsWith(l.toLowerCase()));
    set(byLabel('Patient name').querySelector('input'), 'DEMONSTRATION, PATIENT');
    set(byLabel('Hospital number').querySelector('input'), 'DEMO-0001');
    set(byLabel('Age').querySelector('input'), '68');
    set(byLabel('Weight').querySelector('input'), '78');
    set(byLabel('Baseline creatinine').querySelector('input'), '96');
    const sel = byLabel('Sex').querySelector('select');
    const ss = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    ss.call(sel, 'male');
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 300));
  // Clinical context flags
  await page.evaluate(() => {
    for (const label of ['Febrile', 'Surgery planned']) {
      const el = [...document.querySelectorAll('.check')].find((c) => c.textContent.trim() === label);
      el?.querySelector('input')?.click();
    }
  });
  await new Promise((r) => setTimeout(r, 300));
  await shot('02-patient-filled');

  console.log('▸ Loading demonstration reports');
  await clickTab('Scan');
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Load demonstration reports'));
    b.click();
  });
  await page.waitForFunction(
    () => [...document.querySelectorAll('.doc-row')].length >= 8,
    { timeout: 180000 },
  );
  await new Promise((r) => setTimeout(r, 900));
  await shot('03-scan', true);

  const docCount = await page.evaluate(() => document.querySelectorAll('.doc-row').length);
  console.log(`  documents ingested: ${docCount}`);

  console.log('▸ ECG waveform digitisation (real signal analysis on the rendered tracing)');
  await clickTab('Review');
  await new Promise((r) => setTimeout(r, 900));
  const ecgState = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const body = document.body.innerText;
    const chip = [...document.querySelectorAll('.chip')].map((c) => c.textContent.trim());
    return {
      hasCanvas: !!canvas,
      canvasWidth: canvas?.width ?? 0,
      quality: chip.find((c) => /Digitisation quality/i.test(c)) ?? null,
      layout: chip.find((c) => /rhythm strip|× 3|× 6/i.test(c)) ?? null,
      pxPerMm: chip.find((c) => /px\/mm/.test(c)) ?? null,
      mentionsMarkers: /QRS offset \(J point\)/.test(body),
    };
  });
  console.log(`  viewer canvas: ${ecgState.hasCanvas ? `${ecgState.canvasWidth}px wide` : 'ABSENT'}`);
  console.log(`  ${ecgState.quality ?? 'no quality chip'} · ${ecgState.layout ?? 'no layout chip'} · ${ecgState.pxPerMm ?? 'no scale chip'}`);
  if (!ecgState.hasCanvas) errors.push('ECG waveform viewer canvas was not rendered');
  if (!ecgState.quality) errors.push('ECG digitisation quality was not reported');
  if (!ecgState.mentionsMarkers) errors.push('ECG fiducial legend missing');
  await shot('11-ecg-waveform', true);

  console.log('▸ Review tab');
  await clickTab('Review');
  await new Promise((r) => setTimeout(r, 500));
  const analyteRows = await page.evaluate(() => document.querySelectorAll('table.data tbody tr').length);
  console.log(`  review rows: ${analyteRows}`);
  await shot('04-review', true);

  console.log('▸ Analysis tab');
  await clickTab('Analysis');
  await new Promise((r) => setTimeout(r, 700));
  await shot('05-analysis-top');
  await shot('06-analysis-full', true);
  const analysisText = await text();
  const findChecks = [
    ['Life-threatening banner', /Life-threatening finding/i],
    ['Hyperkalaemia + ECG correlation', /Hyperkalaemia with electrocardiographic changes/i],
    ['AKI stage 3', /KDIGO stage 3/i],
    ['DIC', /disseminated intravascular coagulation/i],
    ['MRSA', /Meticillin-resistant Staphylococcus aureus/i],
    ['Metabolic acidosis interpretation', /Metabolic acidosis|Acidaemia/i],
    ['Urinary tract infection from dipstick', /urinary tract infection/i],
    ['Suggested next steps', /Suggested Next Steps/i],
    ['Waveform analysis scope reported', /Waveform signal analysis/i],
    ['Measurements computed from the trace', /Measured from the digitised trace/i],
    // The demonstration tracing has no ST deviation, so that section is
    // correctly absent; RR variability is computed for every recording.
    ['RR variability computed from the trace', /RR variability/i],
    ['Digitisation quality reported', /Digitisation quality/i],
  ];
  for (const [label, re] of findChecks) {
    console.log(`  ${re.test(analysisText) ? '✓' : '✗'} ${label}`);
    if (!re.test(analysisText)) errors.push(`missing in analysis: ${label}`);
  }

  console.log('▸ Report tab');
  await clickTab('Report');
  await new Promise((r) => setTimeout(r, 900));
  await shot('07-report');
  const reportText = await text();
  for (const [label, re] of [
    ['Report header', /Comprehensive Clinical Diagnostic Report/i],
    ['NEXORA credit', /NEXORA Innovations/i],
    ['Electronic signature block', /Electronic Signature/i],
    ['Antimicrobial susceptibility overview', /Antimicrobial Susceptibility Overview/i],
    ['Encrypted archive section', /Encrypted offline archive/i],
    ['Waveform measurements in the report', /Measured from the digitised trace/i],
    ['Digitisation quality in the report', /Digitisation quality/i],
  ]) {
    console.log(`  ${re.test(reportText) ? '✓' : '✗'} ${label}`);
    if (!re.test(reportText)) errors.push(`missing in report: ${label}`);
  }

  console.log('▸ Printing report preview to A4 PDF');
  await page.pdf({
    path: join(OUT, 'report-print.pdf'),
    format: 'A4',
    printBackground: true,
    margin: { top: '14mm', bottom: '16mm', left: '13mm', right: '13mm' },
  });
  console.log('  captured report-print.pdf');

  console.log('▸ Exercising PDF export (jsPDF)');
  const pdfBase64 = await page.evaluate(async () => {
    // Intercept the download by stubbing the anchor click.
    return await new Promise((resolve) => {
      const origCreate = document.createElement.bind(document);
      document.createElement = (tag, ...rest) => {
        const el = origCreate(tag, ...rest);
        if (tag === 'a') {
          el.click = () => {
            fetch(el.href)
              .then((r) => r.blob())
              .then((b) => new Promise((res) => {
                const fr = new FileReader();
                fr.onload = () => res(String(fr.result).split(',')[1]);
                fr.readAsDataURL(b);
              }))
              .then(resolve);
          };
        }
        return el;
      };
      const btn = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Export PDF');
      btn.click();
      setTimeout(() => resolve(''), 25000);
    });
  });
  const pdfBytes = pdfBase64 ? Buffer.from(pdfBase64, 'base64') : Buffer.alloc(0);
  if (pdfBytes.length) await writeFile(join(OUT, 'report-export.pdf'), pdfBytes);
  console.log(`  PDF export produced ${pdfBytes.length} bytes -> report-export.pdf`);
  if (pdfBytes.length < 20000) errors.push(`PDF export too small: ${pdfBytes.length} bytes`);

  console.log('▸ Real OCR path — rendering a report image in-page and scanning it');
  await clickTab('Scan');
  await new Promise((r) => setTimeout(r, 300));
  const beforeDocs = await page.evaluate(() => document.querySelectorAll('.doc-row').length);
  await page.evaluate(() => {
    // Draw a laboratory report onto a canvas, export it as a PNG File, and
    // hand it to the real file input so the full OCR pipeline runs.
    const c = document.createElement('canvas');
    c.width = 1240; c.height = 700;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#000';
    const lines = [
      ['28px Georgia', 'LIVER FUNCTION TESTS', 60],
      ['22px Georgia', 'Hospital No: DEMO-0001', 110],
      ['24px Georgia', 'Bilirubin            84    umol/L    3 - 21', 180],
      ['24px Georgia', 'ALT                 640    U/L       0 - 40', 230],
      ['24px Georgia', 'AST                 512    U/L       0 - 40', 280],
      ['24px Georgia', 'Alkaline Phosphatase 190   U/L      30 - 130', 330],
      ['24px Georgia', 'Gamma GT            210    U/L      10 - 71', 380],
      ['24px Georgia', 'Total Protein        58    g/L      60 - 80', 430],
      ['24px Georgia', 'Troponin            186    ng/L    less than 14', 480],
    ];
    for (const [font, text, y] of lines) { g.font = font; g.fillText(text, 60, y); }
    c.toBlob((blob) => {
      const file = new File([blob], 'ocr-test-lft.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const input = [...document.querySelectorAll('input[type=file]')].find((i) => i.accept.includes('image'));
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, 'image/png');
  });
  await page.waitForFunction(
    (n) => document.querySelectorAll('.doc-row').length > n,
    { timeout: 180000 },
    beforeDocs,
  );
  await new Promise((r) => setTimeout(r, 1200));
  const ocrDoc = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.doc-row')];
    const row = rows.find((r) => r.textContent.includes('ocr-test-lft.png'));
    return row ? row.innerText.replace(/\n/g, ' | ') : null;
  });
  console.log(`  OCR document row: ${ocrDoc}`);
  if (!ocrDoc) errors.push('OCR test document was not ingested');
  await shot('09-ocr-scan');

  await clickTab('Review');
  await new Promise((r) => setTimeout(r, 600));
  const ocrValues = await page.evaluate(() => {
    const out = {};
    for (const tr of document.querySelectorAll('table.data tbody tr')) {
      const name = tr.cells[0]?.innerText.trim();
      const input = tr.querySelector('input[type=number]');
      if (name && input) out[name] = input.value;
    }
    return out;
  });
  const expectOcr = [['ALT', '640'], ['AST', '512'], ['Bilirubin (total)', '84'], ['Alkaline Phosphatase', '190'], ['Gamma GT', '210'], ['Troponin (high sensitivity)', '186']];
  let ocrHits = 0;
  for (const [label, want] of expectOcr) {
    const got = ocrValues[label];
    const ok = got === want;
    if (ok) ocrHits++;
    console.log(`  ${ok ? '✓' : '✗'} OCR read ${label} = ${want} (got ${got ?? 'not found'})`);
  }
  if (ocrHits < 5) errors.push(`OCR recognised only ${ocrHits}/${expectOcr.length} analytes correctly`);
  await shot('10-ocr-review', true);

  await clickTab('Analysis');
  await new Promise((r) => setTimeout(r, 700));
  const afterOcrText = await text();
  for (const [label, re] of [
    ['Transaminitis from OCR values', /transaminitis/i],
    ['Myocardial injury from OCR troponin', /myocardial injury/i],
  ]) {
    console.log(`  ${re.test(afterOcrText) ? '✓' : '✗'} ${label}`);
    if (!re.test(afterOcrText)) errors.push(`missing after OCR: ${label}`);
  }

  console.log('▸ Settings tab');
  await clickTab('Settings');
  await new Promise((r) => setTimeout(r, 400));
  await shot('08-settings');
} catch (e) {
  errors.push(`FATAL: ${e.message}`);
  await shot('99-failure', true).catch(() => {});
} finally {
  await browser.close();
}

console.log('\n' + '═'.repeat(70));
if (errors.length) {
  console.log(`SMOKE TEST: ${errors.length} problem(s)`);
  for (const e of errors) console.log('  ✗ ' + e);
  process.exitCode = 1;
} else {
  console.log('SMOKE TEST: PASSED — no page errors, all sections rendered');
}
console.log('═'.repeat(70));
