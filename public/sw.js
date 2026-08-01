/**
 * Service worker — offline operation.
 *
 * The application claims to work without a network. That claim only holds if
 * the browser can serve the whole application from local storage, which is
 * what this provides.
 *
 * Two tiers, deliberately:
 *  - The application shell (about 1.5 MB) is cached on install, so the app
 *    opens offline immediately after the first visit.
 *  - The OCR engine and language data (about 13 MB) are cached only when the
 *    clinician asks, via "Prepare for offline use" in Settings, or lazily the
 *    first time they are fetched. Downloading 13 MB unannounced on a hospital
 *    connection would be the wrong default.
 */
const VERSION = 'v1';
const SHELL_CACHE = `clinician-shell-${VERSION}`;
const ASSET_CACHE = `clinician-assets-${VERSION}`;
const OCR_CACHE = `clinician-ocr-${VERSION}`;

const SHELL = ['./', './index.html', './manifest.webmanifest', './favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })));

      // Built assets carry hashed filenames, so the list is generated at build
      // time rather than hard-coded here.
      try {
        const res = await fetch('./asset-manifest.json', { cache: 'reload' });
        if (res.ok) {
          const assets = await res.json();
          const assetCache = await caches.open(ASSET_CACHE);
          await assetCache.addAll(assets.map((u) => new Request(u, { cache: 'reload' })));
        }
      } catch {
        // A missing manifest must not block installation.
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE, OCR_CACHE]);
      for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

const isOcrAsset = (url) => url.pathname.includes('/ocr/');

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations fall back to the cached shell so the app opens offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          return (await cache.match('./index.html')) ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Cache-first for everything else: these are immutable hashed assets and a
  // multi-megabyte WASM runtime, none of which should be refetched.
  event.respondWith(
    (async () => {
      const cacheName = isOcrAsset(url) ? OCR_CACHE : ASSET_CACHE;
      const cache = await caches.open(cacheName);
      const hit = await cache.match(request);
      if (hit) return hit;
      try {
        const response = await fetch(request);
        if (response.ok && response.type === 'basic') cache.put(request, response.clone());
        return response;
      } catch (err) {
        const shell = await caches.open(SHELL_CACHE);
        const shellHit = await shell.match(request);
        if (shellHit) return shellHit;
        throw err;
      }
    })(),
  );
});

/** Explicit, progress-reported caching of the OCR engine. */
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CACHE_OCR') return;

  event.waitUntil(
    (async () => {
      const reply = (msg) => event.source?.postMessage(msg);
      try {
        const manifestRes = await fetch('./ocr/manifest.json', { cache: 'reload' });
        if (!manifestRes.ok) throw new Error('OCR manifest not found');
        const manifest = await manifestRes.json();

        // The SIMD core is the one Tesseract selects on modern devices; the
        // others are fallbacks and are not worth 10 MB of storage each.
        const files = [
          './ocr/manifest.json',
          './ocr/worker.min.js',
          './ocr/tesseract-core-simd-lstm.wasm',
          './ocr/tesseract-core-simd-lstm.js',
          './ocr/tesseract-core-lstm.wasm',
          './ocr/tesseract-core-lstm.js',
          `./ocr/${manifest.file ?? 'eng.traineddata'}`,
        ];

        const cache = await caches.open(OCR_CACHE);
        let done = 0;
        for (const file of files) {
          try {
            const res = await fetch(file, { cache: 'reload' });
            if (res.ok) await cache.put(file, res.clone());
          } catch {
            // A missing optional fallback core is not a failure.
          }
          done++;
          reply({ type: 'CACHE_OCR_PROGRESS', done, total: files.length });
        }
        reply({ type: 'CACHE_OCR_DONE' });
      } catch (err) {
        reply({ type: 'CACHE_OCR_ERROR', message: String(err?.message ?? err) });
      }
    })(),
  );
});
