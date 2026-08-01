/**
 * Serve the built app over plain HTTP on the local network.
 *
 * For a quick look from a phone on the same Wi-Fi. Note what is lost: plain
 * HTTP is not a secure context, so the browser will not offer to install the
 * app, will not store it for offline use, and will not expose the Web Crypto
 * API the encrypted archive depends on. Everything else — scanning, OCR, ECG
 * digitisation, analysis, PDF and HTML export — works normally.
 *
 * For installation, use the HTTPS server (`npm run preview`) on this machine,
 * or host the `dist/` folder on any HTTPS static host.
 */
import { spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';

const port = process.argv[2] ?? '4174';

const addresses = [];
for (const list of Object.values(networkInterfaces())) {
  for (const iface of list ?? []) {
    if (iface.family === 'IPv4' && !iface.internal) addresses.push(iface.address);
  }
}

console.log('\n  Plain HTTP — for viewing on another device on this network.');
console.log('  Installation and the encrypted archive are unavailable over HTTP.\n');
for (const a of addresses) console.log(`    http://${a}:${port}/`);
console.log('');

// Spawn Vite's own entry point with the current Node binary — no shell, so
// nothing is concatenated into a command line.
const viteBin = new URL('../node_modules/vite/bin/vite.js', import.meta.url);
const child = spawn(
  process.execPath,
  [fileURLToPath(viteBin), 'preview', '--port', port, '--host', '--strictPort'],
  { stdio: 'inherit', env: { ...process.env, CA_HTTP: '1' } },
);
child.on('exit', (code) => process.exit(code ?? 0));
