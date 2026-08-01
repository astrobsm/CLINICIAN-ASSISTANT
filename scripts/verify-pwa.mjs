/**
 * Proves the offline claim rather than asserting it.
 *
 * Loads the built app over HTTPS, registers the service worker, caches the
 * recognition engine, then cuts the network entirely and reloads — checking
 * that the application still starts, still analyses, and still runs OCR.
 *
 * Usage: node scripts/verify-pwa.mjs [baseUrl]
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
const executablePath = CANDIDATES.find((p) => existsSync(p));
if (!executablePath) { console.error('No browser found.'); process.exit(1); }

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`   ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  acceptInsecureCerts: true,
  userDataDir: join(tmpdir(), `ca-pwa-${Date.now()}`),
  args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--ignore-certificate-errors'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 1000 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
// The app warns before an unsaved session is lost; accept it so reloads proceed.
page.on('dialog', (d) => d.accept().catch(() => {}));

console.log('═'.repeat(72));
console.log('  OFFLINE / INSTALLABILITY VERIFICATION');
console.log('═'.repeat(72));

try {
  console.log(`\n▸ Loading ${BASE}`);
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForSelector('.app-header', { timeout: 20000 });

  const secure = await page.evaluate(() => window.isSecureContext);
  check('served in a secure context', secure);

  console.log('\n▸ Service worker');
  const swReady = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { ok: false, why: 'unsupported' };
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    return { ok: !!reg, scope: reg?.scope ?? null, active: !!reg?.active };
  });
  check('service worker registered and active', swReady.ok && swReady.active, swReady.scope ?? '');

  console.log('\n▸ Web app manifest and icons');
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector('link[rel=manifest]');
    if (!link) return null;
    const res = await fetch(link.href);
    return res.ok ? await res.json() : null;
  });
  check('manifest served and parseable', !!manifest);
  if (manifest) {
    check('has name and short_name', !!manifest.name && !!manifest.short_name, `${manifest.name} / ${manifest.short_name}`);
    check('display is standalone', manifest.display === 'standalone', manifest.display);
    check('start_url and scope present', !!manifest.start_url && !!manifest.scope);
    const sizes = (manifest.icons ?? []).map((i) => i.sizes);
    check('has a 192px icon', sizes.some((s) => /(^|\s)192x192/.test(s)), sizes.join(', '));
    check('has a 512px icon', sizes.some((s) => /(^|\s)512x512/.test(s)));
    check('has a maskable icon', (manifest.icons ?? []).some((i) => String(i.purpose).includes('maskable')));

    const iconOk = await page.evaluate(async (icons) => {
      for (const i of icons) {
        const res = await fetch(new URL(i.src, location.href).href);
        if (!res.ok) return `${i.src} → ${res.status}`;
      }
      return null;
    }, manifest.icons ?? []);
    check('every declared icon resolves', iconOk === null, iconOk ?? '');
  }

  console.log('\n▸ Caching the recognition engine for offline use');
  await page.evaluate(() => [...document.querySelectorAll('.tab')].find((b) => b.textContent.trim().startsWith('Settings')).click());
  await new Promise((r) => setTimeout(r, 500));
  const hasButton = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Prepare for offline use'));
    if (b) { b.click(); return true; }
    return document.body.innerText.includes('Fully offline capable');
  });
  check('offline preparation available or already complete', hasButton);

  await page.waitForFunction(
    () => document.body.innerText.includes('Fully offline capable'),
    { timeout: 240000 },
  );
  check('recognition engine cached', true);

  const cacheReport = await page.evaluate(async () => {
    const out = {};
    for (const key of await caches.keys()) {
      const c = await caches.open(key);
      out[key] = (await c.keys()).length;
    }
    return out;
  });
  console.log(`   caches: ${Object.entries(cacheReport).map(([k, v]) => `${k}=${v} entries`).join(', ')}`);

  console.log('\n▸ Cutting the network and reloading');
  await page.setOfflineMode(true);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.app-header', { timeout: 30000 });
  check('application starts with no network', true);

  const title = await page.title();
  check('page rendered correctly offline', /Clinician Assistant/.test(title), title);

  console.log('\n▸ Running the full analysis offline');
  await page.evaluate(() => [...document.querySelectorAll('.tab')].find((b) => b.textContent.trim().startsWith('Scan')).click());
  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Load demonstration reports')).click());
  await page.waitForFunction(() => document.querySelectorAll('.doc-row').length >= 8, { timeout: 240000 });
  check('all demonstration reports ingested offline', true);

  await page.evaluate(() => [...document.querySelectorAll('.tab')].find((b) => b.textContent.trim().startsWith('Analysis')).click());
  await new Promise((r) => setTimeout(r, 900));
  const analysisText = await page.evaluate(() => document.body.innerText);
  check('life-threatening finding raised offline', /Life-threatening finding/i.test(analysisText));
  check('ECG waveform analysed offline', /Waveform signal analysis/i.test(analysisText));

  console.log('\n▸ Running live OCR offline');
  await page.evaluate(() => [...document.querySelectorAll('.tab')].find((b) => b.textContent.trim().startsWith('Scan')).click());
  await new Promise((r) => setTimeout(r, 300));
  const before = await page.evaluate(() => document.querySelectorAll('.doc-row').length);
  await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 1000; c.height = 320;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#000'; g.font = '26px Georgia';
    g.fillText('THYROID FUNCTION', 50, 60);
    g.fillText('C-Reactive Protein    98   mg/L', 50, 140);
    g.fillText('Ferritin              820  ug/L', 50, 200);
    c.toBlob((blob) => {
      const dt = new DataTransfer();
      dt.items.add(new File([blob], 'offline-ocr-test.png', { type: 'image/png' }));
      const input = [...document.querySelectorAll('input[type=file]')].find((i) => i.accept.includes('image'));
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, 'image/png');
  });
  await page.waitForFunction((n) => document.querySelectorAll('.doc-row').length > n, { timeout: 240000 }, before);
  await new Promise((r) => setTimeout(r, 1200));

  const ocrValues = await page.evaluate(() => {
    [...document.querySelectorAll('.tab')].find((b) => b.textContent.trim().startsWith('Review')).click();
    return null;
  });
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
  check('OCR ran with no network — CRP', read['C-Reactive Protein'] === '98', `got ${read['C-Reactive Protein'] ?? 'not found'}`);
  check('OCR ran with no network — Ferritin', read['Ferritin'] === '820', `got ${read['Ferritin'] ?? 'not found'}`);

  await page.setOfflineMode(false);

  // ── Encrypted case library on the device ─────────────────────────────
  console.log('\n▸ Encrypted case library (device storage)');
  const PASS = 'correct-horse-battery';

  const goReport = async () => {
    await page.evaluate(() => [...document.querySelectorAll('.tab')].find((b) => b.textContent.trim().startsWith('Report')).click());
    await new Promise((r) => setTimeout(r, 900));
  };
  const libraryText = () => page.evaluate(() => {
    const card = [...document.querySelectorAll('.card')].find((c) => /Case library on this device/i.test(c.textContent));
    return card ? card.innerText : '';
  });
  const clickInLibrary = (label) => page.evaluate((l) => {
    const card = [...document.querySelectorAll('.card')].find((c) => /Case library on this device/i.test(c.textContent));
    const b = [...card.querySelectorAll('button')].find((x) => x.textContent.trim() === l);
    if (b) { b.click(); return true; }
    return false;
  }, label);
  const typePass = (value) => page.evaluate((v) => {
    const card = [...document.querySelectorAll('.card')].find((c) => /Case library on this device/i.test(c.textContent));
    const input = card.querySelector('input[type=password]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

  await goReport();
  check('library card present', /Case library on this device/i.test(await libraryText()));

  await typePass(PASS);
  await clickInLibrary('Create library');
  await page.waitForFunction(
    () => document.body.innerText.includes('Save current case'),
    { timeout: 30000 },
  );
  check('library created and unlocked', true);

  await clickInLibrary('Save current case');
  await page.waitForFunction(
    () => /Case saved to this device/i.test(document.body.innerText),
    { timeout: 30000 },
  );
  const afterSave = await libraryText();
  check('case saved and listed', /DEMONSTRATION, PATIENT|DEMO-0001/.test(afterSave), afterSave.split('\n').find((l) => /DEMO-0001/.test(l)) ?? '');
  check('case size reported', /\d+(\.\d+)?\s?(kB|MB)/.test(afterSave));

  console.log('\n▸ Library survives a reload and a wrong passphrase is rejected');
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.app-header', { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 600));
  await goReport();
  const locked = await libraryText();
  check('library persists and is locked after reload', /A library already exists on this device/i.test(locked));

  await typePass('wrong-passphrase-here');
  await clickInLibrary('Open library');
  await page.waitForFunction(
    () => /Incorrect passphrase/i.test(document.body.innerText),
    { timeout: 30000 },
  );
  check('wrong passphrase rejected', true);

  await typePass(PASS);
  await clickInLibrary('Open library');
  await page.waitForFunction(
    () => document.body.innerText.includes('Save current case'),
    { timeout: 30000 },
  );
  const reopened = await libraryText();
  check('saved case still listed after reload', /DEMO-0001/.test(reopened));

  console.log('\n▸ Restoring a case into the session');
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('.card')].find((c) => /Case library on this device/i.test(c.textContent));
    [...card.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Open').click();
  });
  await page.waitForFunction(() => /Opened /i.test(document.body.innerText), { timeout: 30000 });
  const restored = await page.evaluate(() => {
    [...document.querySelectorAll('.tab')].find((b) => b.textContent.trim().startsWith('Patient')).click();
    return null;
  });
  await new Promise((r) => setTimeout(r, 700));
  const patientName = await page.evaluate(() => {
    const f = [...document.querySelectorAll('.field')].find((x) => x.querySelector('label')?.textContent.includes('Patient name'));
    return f?.querySelector('input')?.value ?? '';
  });
  check('patient restored from the encrypted case', patientName === 'DEMONSTRATION, PATIENT', patientName);

  console.log('\n▸ Nothing is stored in the clear');
  const plaintextLeak = await page.evaluate(async () => {
    const opfs = await navigator.storage.getDirectory();
    const dir = await opfs.getDirectoryHandle('clinician-assistant');
    const found = [];
    const scan = async (handle, prefix) => {
      for await (const [name, h] of handle.entries()) {
        if (h.kind === 'directory') { await scan(h, `${prefix}${name}/`); continue; }
        const text = await (await h.getFile()).text().catch(() => '');
        found.push({ path: `${prefix}${name}`, leaks: /DEMONSTRATION|DEMO-0001|Ward 12/i.test(text) });
      }
    };
    await scan(dir, '');
    return found;
  });
  for (const f of plaintextLeak) {
    check(`no identifiers in ${f.path}`, !f.leaks);
  }

  console.log('\n▸ Deleting a case');
  await goReport();
  await page.evaluate(() => { window.confirm = () => true; });
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('.card')].find((c) => /Case library on this device/i.test(c.textContent));
    [...card.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Delete').click();
  });
  await page.waitForFunction(() => /Case deleted from this device/i.test(document.body.innerText), { timeout: 30000 });
  // The confirmation appears before the list re-reads the index, so wait for
  // the row itself to go rather than reading straight after the message.
  const removed = await page
    .waitForFunction(() => {
      const card = [...document.querySelectorAll('.card')].find((c) => /Case library on this device/i.test(c.textContent));
      return card && !card.querySelector('table.data');
    }, { timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  check('case deleted and removed from the list', removed, removed ? '' : await libraryText());

  console.log('\n▸ Install prompt');
  const banner = await page.evaluate(() => {
    // The browser fires this only after an engagement heuristic that headless
    // runs never satisfy, so the event is synthesised to exercise the wiring.
    const e = new Event('beforeinstallprompt');
    e.prompt = async () => {};
    Object.defineProperty(e, 'userChoice', { value: Promise.resolve({ outcome: 'dismissed' }) });
    window.dispatchEvent(e);
    return new Promise((resolve) => setTimeout(() => {
      const el = document.querySelector('.install-banner');
      resolve(el ? el.innerText.replace(/\n/g, ' | ') : null);
    }, 400));
  });
  check('install banner appears when the browser offers installation', !!banner, banner ?? 'not shown');
  const installBtn = await page.evaluate(() => {
    const el = document.querySelector('.install-banner');
    return !!el && [...el.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Install');
  });
  check('install button present in the banner', installBtn);

  check('no page errors throughout', pageErrors.length === 0, pageErrors.join(' | '));
} catch (err) {
  failures++;
  console.log(`   ✗ FATAL: ${err.message}`);
} finally {
  await browser.close();
}

console.log('\n' + '═'.repeat(72));
if (failures) {
  console.log(`  RESULT: ${failures} CHECK(S) FAILED`);
  process.exitCode = 1;
} else {
  console.log('  RESULT: ALL CHECKS PASSED — the app installs and runs with no network');
}
console.log('═'.repeat(72));
