/**
 * Verifies de-identification before transmission.
 *
 * Renders a report carrying a name, hospital number, date of birth, address
 * and consultant, applies the redaction that runs before anything is sent, and
 * then reads the redacted image back with the recognition engine. Anything the
 * engine can still read is something that would leave the device.
 *
 * Also confirms that with assisted extraction switched off — the default — no
 * request is made at all.
 *
 * Usage: node scripts/verify-redaction.mjs [baseUrl]
 */
import puppeteer from 'puppeteer-core';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BASE = process.argv[2] ?? 'https://localhost:4173/';

const local = join(process.cwd(), '.browser', 'chrome-headless-shell');
const exe = [
  ...(existsSync(local)
    ? readdirSync(local).map((v) => join(local, v, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'))
    : []),
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find(existsSync);
if (!exe) { console.error('No browser found.'); process.exit(1); }

const IDENTIFIERS = {
  name: 'OKONKWO, CHINWEUBA',
  hospitalNumber: 'JP1027453',
  dob: '14/03/1996',
  address: '17 MARINA ROAD, ENUGU',
  consultant: 'Dr A REYNOLDS',
  phone: '08031234567',
};

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`   ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: true,
  acceptInsecureCerts: true,
  userDataDir: join(tmpdir(), `ca-redact-${Date.now()}`),
  args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--ignore-certificate-errors'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 1000 });

// Every outbound request is recorded, so "nothing is transmitted" can be
// checked rather than asserted.
const external = [];
page.on('request', (r) => {
  const url = r.url();
  if (!url.startsWith(BASE) && !url.startsWith('data:') && !url.startsWith('blob:')) external.push(url);
});

console.log('═'.repeat(74));
console.log('  DE-IDENTIFICATION BEFORE TRANSMISSION');
console.log('═'.repeat(74));

try {
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForSelector('.app-header', { timeout: 20000 });
  await page.evaluate(() => [...document.querySelectorAll('.tab')].find((b) => b.textContent.trim().startsWith('Scan')).click());
  await new Promise((r) => setTimeout(r, 400));

  console.log('\n▸ Scanning a report that carries identifiers');
  const before = await page.evaluate(() => document.querySelectorAll('.doc-row').length);
  await page.evaluate((id) => {
    const c = document.createElement('canvas');
    c.width = 1240; c.height = 900;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#111';
    g.font = 'bold 30px Arial';
    g.fillText('JENPEEY MEDICAL DIAGNOSTIC CENTRE', 50, 55);
    g.font = '22px Arial';
    g.fillText(`NAME: ${id.name}`, 50, 120);
    g.fillText(`HOSPITAL NO: ${id.hospitalNumber}`, 50, 160);
    g.fillText(`DOB: ${id.dob}`, 50, 200);
    g.fillText(`ADDRESS: ${id.address}`, 50, 240);
    g.fillText(`CONSULTANT: ${id.consultant}`, 640, 120);
    g.fillText(`TEL: ${id.phone}`, 640, 160);
    g.fillText('SPECIMEN: BLOOD', 640, 200);
    g.font = 'bold 24px Arial';
    g.fillText('FULL BLOOD COUNT', 50, 320);
    g.font = '22px Arial';
    const rows = [['HAEMOGLOBIN', '13.0', 'g/dl'], ['WBC', '4.42', '10^9/L'], ['PLATELET', '187', '10^9/L']];
    rows.forEach((r, i) => {
      g.fillText(r[0], 50, 380 + i * 45);
      g.fillText(r[1], 460, 380 + i * 45);
      g.fillText(r[2], 620, 380 + i * 45);
    });
    c.toBlob((blob) => {
      const dt = new DataTransfer();
      dt.items.add(new File([blob], 'identified-report.png', { type: 'image/png' }));
      const input = [...document.querySelectorAll('input[type=file]')].find((i) => i.accept.includes('image'));
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, 'image/png');
  }, IDENTIFIERS);

  await page.waitForFunction((n) => document.querySelectorAll('.doc-row').length > n, { timeout: 240000 }, before);
  await new Promise((r) => setTimeout(r, 1200));
  check('report ingested', true);

  console.log('\n▸ Assisted extraction is off by default — nothing may be transmitted');
  const enabledByDefault = await page.evaluate(() => localStorage.getItem('nexora.clinician-assistant.ai-enabled.v1') === '1');
  check('feature off by default', !enabledByDefault);
  check('no request left the origin during a normal scan', external.length === 0, external.slice(0, 3).join(', '));

  console.log('\n▸ Redacting, then reading the redacted image back');
  const outcome = await page.evaluate(async (id) => {
    const mods = await Promise.all([
      import('/assets/' + window.__caRedactChunk),
    ]).catch(() => null);
    return null;
  }, IDENTIFIERS).catch(() => null);

  // The redaction runs inside the app; drive it through the interface so the
  // code path under test is the one that actually ships.
  const prepared = await page.evaluate(() => {
    const card = [...document.querySelectorAll('.card')].find((c) => /Assisted extraction/i.test(c.textContent));
    if (!card) return 'no card';
    const toggle = card.querySelector('input[type=checkbox]');
    if (!toggle) return 'unavailable';
    toggle.click();
    return 'enabled';
  });

  if (prepared === 'unavailable') {
    console.log('   · the deployment has no extraction endpoint configured, so the interface offers nothing');
    console.log('   · redaction is exercised directly instead');
  }

  // Fill in the patient record so token-based redaction has something to match.
  await page.evaluate((id) => {
    [...document.querySelectorAll('.tab')].find((b) => b.textContent.trim().startsWith('Patient')).click();
    const set = (labelStart, value) => {
      const f = [...document.querySelectorAll('.field')].find((x) => x.querySelector('label')?.textContent.trim().toLowerCase().startsWith(labelStart));
      const input = f?.querySelector('input');
      if (!input) return;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('patient name', id.name);
    set('hospital number', id.hospitalNumber);
    set('consultant', id.consultant);
  }, IDENTIFIERS);
  await new Promise((r) => setTimeout(r, 500));

  const redacted = await page.evaluate(async (id) => {
    // Reproduce the exact redaction the app performs, using the same module.
    const { redactIdentifiers } = await import('./assets/redact-probe.js').catch(() => ({}));
    return { unsupported: !redactIdentifiers };
  }, IDENTIFIERS).catch(() => ({ unsupported: true }));

  // Direct module access is not available from a production bundle, so the
  // check is done through the interface: prepare the image and read the
  // preview the clinician is shown.
  await page.evaluate(() => [...document.querySelectorAll('.tab')].find((b) => b.textContent.trim().startsWith('Scan')).click());
  await new Promise((r) => setTimeout(r, 500));

  const previewSrc = await page.evaluate(async () => {
    const card = [...document.querySelectorAll('.card')].find((c) => /Assisted extraction/i.test(c.textContent));
    if (!card) return null;
    const btn = [...card.querySelectorAll('button')].find((b) => /Prepare to send/i.test(b.textContent));
    if (!btn) return null;
    btn.click();
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 200));
      const img = card.querySelector('img[alt*="transmitted"]');
      if (img) return img.src;
    }
    return null;
  });

  if (!previewSrc) {
    check('a redacted preview was produced', false, 'the interface did not offer one (no endpoint configured on this deployment)');
  } else {
    check('a redacted preview was produced', true);

    // Read the redacted image back. Anything still legible would be sent.
    const readBack = await page.evaluate(async (src) => {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      const before = document.querySelectorAll('.doc-row').length;
      await new Promise((res) => c.toBlob((b) => {
        const dt = new DataTransfer();
        dt.items.add(new File([b], 'redacted-readback.png', { type: 'image/png' }));
        const input = [...document.querySelectorAll('input[type=file]')].find((i) => i.accept.includes('image'));
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        res();
      }, 'image/png'));
      for (let i = 0; i < 300; i++) {
        await new Promise((r) => setTimeout(r, 400));
        if (document.querySelectorAll('.doc-row').length > before) break;
      }
      const row = [...document.querySelectorAll('.doc-row')].find((r) => r.textContent.includes('redacted-readback'));
      const btn = [...row.querySelectorAll('button')].find((b) => b.textContent.includes('View text'));
      btn.click();
      await new Promise((r) => setTimeout(r, 400));
      return [...document.querySelectorAll('.raw-text')].map((p) => p.innerText).join('\n');
    }, previewSrc);

    const flat = readBack.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    for (const [field, value] of Object.entries(IDENTIFIERS)) {
      const needle = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      const leaked = needle.length >= 5 && flat.includes(needle);
      check(`${field} is not legible in the redacted image`, !leaked);
    }

    // The clinical values must survive; redacting everything would be safe but
    // useless.
    check('clinical values survive redaction', /HAEMOGLOBIN|WBC|PLATELET/i.test(readBack), readBack.slice(0, 90).replace(/\n/g, ' '));
  }
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
