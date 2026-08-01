/**
 * Bundles and runs the headless engine verification (scripts/verify-entry.ts).
 * Uses the esbuild that ships with Vite — no extra dependency.
 */
import { build } from 'esbuild';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = await mkdtemp(join(tmpdir(), 'ca-verify-'));
const outfile = join(dir, 'verify.mjs');

try {
  await build({
    entryPoints: [join(root, 'scripts', 'verify-entry.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    logLevel: 'warning',
  });
  await import(pathToFileURL(outfile).href);
} finally {
  await rm(dir, { recursive: true, force: true });
}
