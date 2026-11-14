// Renders a HyperFrames composition directory to a video file with @hyperframes/producer.
// Usage: node services/render/scripts/render-dir.ts <compositionDir> <out.mp4> [draft|standard|high]
import { createRenderJob, executeRenderJob } from '@hyperframes/producer';

const [dir, out, quality = 'draft'] = process.argv.slice(2);
if (!dir || !out) {
  console.error('usage: render-dir.ts <compositionDir> <out.mp4> [draft|standard|high]');
  process.exit(2);
}
if (quality !== 'draft' && quality !== 'standard' && quality !== 'high') {
  console.error(`unknown quality "${quality}"`);
  process.exit(2);
}

const started = performance.now();
const job = createRenderJob({ fps: 30, quality });
let lastPct = -10;
await executeRenderJob(job, dir, out, (j) => {
  const pct = Math.round(j.progress);
  if (pct >= lastPct + 10) {
    lastPct = pct;
    console.log(`render ${pct}%`);
  }
});
console.log(`done: ${out} in ${((performance.now() - started) / 1000).toFixed(1)}s`);
