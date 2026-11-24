// Film lab: DIAGNOSTIC only. Recompiles a one-shot answer after a labelled hand edit, to see what
// the rest of the film looks like when one bug is removed. Not a model output; never reported as one.
// Usage: node scripts/run-film-lab.ts handfix <oneshot dir> <out name> <find> <replace> [--vo coffee]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadVoiceover } from './data';
import { shoot } from './shoot';

const pkgDir = process.env['MOTION_PKG_DIR'] ?? process.cwd();
const [dir, outName, find, replace] = process.argv.slice(2);
if (!dir || !outName || !find || replace === undefined) throw new Error('usage: handfix <dir> <out> <find> <replace>');
const p = JSON.parse(readFileSync(join(dir, 'params.json'), 'utf8')) as { script: string };
if (!p.script.includes(find)) throw new Error('find string not in script');
p.script = p.script.replace(find, replace);
const vo = loadVoiceover('coffee');
const shot = await shoot({
  outDir: join(pkgDir, '.check', 'film-lab', outName),
  format: '9:16',
  lookId: 'newsprint',
  durationMs: vo.durationMs,
  slots: [{ id: 'film', componentId: 'custom', startMs: 0, endMs: vo.durationMs, params: p as never, words: vo.words }],
  shares: Array.from({ length: 16 }, (_, i) => (i + 0.5) / 16),
});
console.log(`errors: ${shot.errors.length}; sheet → ${shot.sheet}`);
