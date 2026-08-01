import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
const entry = process.argv[2];
process.argv = [process.argv[0], entry, ...process.argv.slice(3)];
await build({ entryPoints: [entry], outfile: '.tmp-out.mjs', bundle: true, platform: 'node', format: 'esm', target: 'node20', logLevel: 'warning' });
await import(pathToFileURL(process.cwd() + '/.tmp-out.mjs').href);
