// Studio smoke test, no model calls: inject the libraries into an existing film and inspect it.
// Usage: node scripts/run-film-lab.ts studio-smoke <film.html> <durationMs>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inspect } from './studio/inspect';
import { injectLibs, installLibs } from './studio/libs';

const [src, dur] = process.argv.slice(2);
const durationMs = Number(dur);
const dir = join(process.env['MOTION_PKG_DIR'] ?? '.', '.check', 'film-lab', 'studio-smoke');
mkdirSync(dir, { recursive: true });
installLibs(dir);
const file = join(dir, 'film.html');
writeFileSync(file, injectLibs(readFileSync(src ?? '', 'utf8')));
const times = Array.from({ length: 12 }, (_, i) => ({ ms: Math.round(((i + 0.5) / 12) * durationMs), beat: i, words: '' }));
const t0 = Date.now();
const r = await inspect(file, durationMs, times, join(dir, 'stills'));
console.log(JSON.stringify({ blocking: r.blocking, layout: r.layout, samples: r.samples.length, s: Math.round((Date.now() - t0) / 1000) }, null, 1));
