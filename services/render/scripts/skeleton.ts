// Walking-skeleton render: compiles a one-slot project with @motionpop/motion and renders it
// with @hyperframes/producer. Usage: node scripts/skeleton.ts <voice.wav> <outDir>
import { compileProject } from '@motionpop/motion/compiler';
import { editorialExplainer } from '@motionpop/motion/styles';
import { createRenderJob, executeRenderJob } from '@hyperframes/producer';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const [voice, outDir] = process.argv.slice(2);
if (!voice || !outDir) {
  console.error('usage: skeleton.ts <voice.wav> <outDir>');
  process.exit(2);
}

const require = createRequire(import.meta.url);
const motionDist = join(dirname(require.resolve('@motionpop/motion/package.json')), 'dist');
const [runtimeJs, hyperframesRuntimeJs, fontsJson] = await Promise.all([
  readFile(join(motionDist, 'runtime.js'), 'utf8'),
  readFile(join(motionDist, 'hyperframe.runtime.iife.js'), 'utf8'),
  readFile(join(motionDist, 'fonts.json'), 'utf8'),
]);

const compDir = join(outDir, 'composition');
await mkdir(join(compDir, 'assets'), { recursive: true });
await copyFile(voice, join(compDir, 'assets/voice.wav'));

const t0 = performance.now();
const html = compileProject(
  {
    width: 1280,
    height: 720,
    format: '16:9',
    durationMs: 4000,
    style: editorialExplainer,
    voiceSrc: 'assets/voice.wav',
    slots: [
      {
        id: 'slot-1',
        startMs: 500,
        endMs: 3500,
        componentId: 'big-number',
        // Lands on the spoken word at 2.0 s (slot-local 1500 ms).
        keyMomentMs: 1500,
        params: {
          value: 40,
          suffix: '%',
          label: 'Revenue growth since 2020',
          context: 'The bigger picture',
        },
      },
    ],
  },
  { runtimeJs, hyperframesRuntimeJs, fonts: JSON.parse(fontsJson) as Record<string, string> },
);
await writeFile(join(compDir, 'index.html'), html);
console.log(
  `compiled in ${(performance.now() - t0).toFixed(0)} ms (${(html.length / 1024).toFixed(0)} KB)`,
);

const t1 = performance.now();
const job = createRenderJob({ fps: 30, quality: 'draft' });
await executeRenderJob(job, compDir, join(outDir, 'skeleton.mp4'), () => {});
console.log(
  `rendered in ${((performance.now() - t1) / 1000).toFixed(1)} s → ${join(outDir, 'skeleton.mp4')}`,
);
