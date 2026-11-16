// Writes every synthesized effect take (and each music bed, once `synthBed` exists) as WAV files
// into .check/sfx/ (gitignored) so a person can listen. Usage: node scripts/sfx-listen.ts
// Bundles src/sfx (extensionless imports Node can't resolve) the same way run-check.ts does.
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(pkgDir, '.check', 'sfx');
const bundle = join(outDir, 'sfx.mjs');
await mkdir(outDir, { recursive: true });
await build({
  entryPoints: [join(pkgDir, 'src/sfx/index.ts')],
  outfile: bundle,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  logLevel: 'warning',
});

interface SfxModule {
  SFX_KINDS: readonly string[];
  SFX_TAKES: Record<string, number>;
  SFX_SAMPLE_RATE: number;
  synthSfx: (kind: string, take: number) => Float32Array;
  encodeWav16: (samples: Float32Array, sampleRate: number) => Uint8Array;
  synthBed?: (id: string, durationMs: number, seed: number) => Float32Array;
  MUSIC_BED_IDS?: readonly string[];
}
const m = (await import(pathToFileURL(bundle).href)) as SfxModule;

const written: string[] = [];
for (const kind of m.SFX_KINDS) {
  for (let take = 0; take < (m.SFX_TAKES[kind] ?? 0); take++) {
    const file = join(outDir, `${kind}-${take}.wav`);
    await writeFile(file, m.encodeWav16(m.synthSfx(kind, take), m.SFX_SAMPLE_RATE));
    written.push(file);
  }
}
if (m.synthBed && m.MUSIC_BED_IDS) {
  for (const id of m.MUSIC_BED_IDS) {
    const file = join(outDir, `bed-${id}-20s.wav`);
    await writeFile(file, m.encodeWav16(m.synthBed(id, 20_000, 1), m.SFX_SAMPLE_RATE));
    written.push(file);
    // Longer than one loop (26.7 s and 20 s), so the 500 ms loop crossfade can be heard.
    const seam = join(outDir, `bed-${id}-60s-loop-seams.wav`);
    await writeFile(seam, m.encodeWav16(m.synthBed(id, 60_000, 1), m.SFX_SAMPLE_RATE));
    written.push(seam);
  }
}
for (const f of written) console.log(f);
