import { networkInterfaces } from 'node:os';
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

/**
 * Every address this machine can be reached on, so the development certificate
 * names the host a phone will actually type. Without this the certificate
 * covers only localhost and a device on the same network gets a name-mismatch
 * error on top of the untrusted-issuer one.
 */
function localAddresses(): string[] {
  const out = new Set(['localhost', '127.0.0.1']);
  for (const list of Object.values(networkInterfaces())) {
    for (const iface of list ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) out.add(iface.address);
    }
  }
  return [...out];
}

/**
 * Emit the list of built assets so the service worker can precache the
 * application shell. Asset filenames are content-hashed, so the list cannot be
 * written by hand.
 */
function assetManifest(): Plugin {
  return {
    name: 'asset-manifest',
    apply: 'build',
    closeBundle() {
      const dist = join(process.cwd(), 'dist');
      const out: string[] = [];
      const walk = (dir: string) => {
        for (const entry of readdirSync(dir)) {
          const full = join(dir, entry);
          if (statSync(full).isDirectory()) {
            // The OCR runtime is cached separately, on request: it is 13 MB and
            // should not be downloaded unannounced.
            if (entry === 'ocr') continue;
            walk(full);
          } else if (/\.(js|mjs|css|wasm)$/.test(entry)) {
            out.push(`./${relative(dist, full).replace(/\\/g, '/')}`);
          }
        }
      };
      walk(dist);
      writeFileSync(join(dist, 'asset-manifest.json'), JSON.stringify(out, null, 2));
      console.log(`[asset-manifest] ${out.length} shell assets listed for offline precaching`);
    },
  };
}

// Everything is bundled locally: no CDN, no runtime network calls.
export default defineConfig({
  base: './',
  // A secure context is required for installation as an app, and for the Web
  // Crypto API the encrypted archive depends on. Serving the dev and preview
  // servers over HTTPS means a phone on the same network gets both.
  // HTTPS by default, because installation and the Web Crypto API used by the
  // encrypted archive both require a secure context. Set CA_HTTP=1 to serve
  // plain HTTP instead — useful for a quick look from a phone on the same
  // network, where a self-signed certificate produces a worse experience than
  // no certificate at all.
  plugins: [
    react(),
    ...(process.env.CA_HTTP ? [] : [basicSsl({ name: 'clinician-assistant', domains: localAddresses() })]),
    assetManifest(),
  ],
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['tesseract.js'] },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      output: {
        manualChunks: {
          pdfjs: ['pdfjs-dist'],
          jspdf: ['jspdf'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
});
