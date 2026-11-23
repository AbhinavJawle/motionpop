// Writes src/skills/slot-sequences.ts from skills/*.md (spec 39 task 3).
// Usage: node scripts/build-slot-sequences.ts   (or: pnpm --filter @motionpop/ai skills:build)
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { buildSlotSequences, renderSlotSequencesModule } from './slot-sequences-lib.ts';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(pkgDir, '../..');
const target = join(pkgDir, 'src/skills/slot-sequences.ts');

const map = buildSlotSequences(join(repoRoot, 'skills'));
const config = (await resolveConfig(target)) ?? {};
writeFileSync(
  target,
  await format(renderSlotSequencesModule(map), { ...config, filepath: target }),
);
console.log(`${Object.keys(map).length} skills -> ${target}`);
