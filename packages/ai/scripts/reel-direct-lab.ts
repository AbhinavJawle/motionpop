// Reel director lab (spec 26): runs `reel.direct` on a transcript through the film-lab Vertex
// caller (developer gcloud login, no App Check), then maps it with the product's `toReelPlan`.
// Not product code.
// Usage: npx tsx scripts/reel-direct-lab.ts <words.json> <durationMs> <look> <model> <out.json> [thinking]
import { readFileSync, writeFileSync } from 'node:fs';
import type { ReelLook, ReelWord } from '@motionpop/schemas';
import { ReelDirectOutputSchema, reelDirectJsonSchema, toReelPlan } from '../src/reel/director';
import { REEL_DIRECT_SYSTEM_V3, reelDirectPromptV3 } from '../src/reel/prompt';
import { generate, parseJson, setLedger, usage } from '../../motion/scripts/film-lab/gemini';

const [wordsFile, dur, look, model, out, thinking] = process.argv.slice(2) as [
  string,
  string,
  ReelLook,
  string,
  string,
  string?,
];
setLedger(`${process.cwd()}/../motion/.check/film-lab/ledger.jsonl`);
const words = JSON.parse(readFileSync(wordsFile, 'utf8')) as ReelWord[];
const durationMs = Number(dur);
// model "remap" re-maps a saved raw answer (<out>.raw.json) with the current toReelPlan.
const remap = model === 'remap';
const res = remap
  ? {
      text: readFileSync(out.replace(/\.json$/, '.raw.json'), 'utf8'),
      latencyMs: 0,
      inTokens: 0,
      outTokens: 0,
    }
  : await generate({
      model,
      system: REEL_DIRECT_SYSTEM_V3,
      prompt: reelDirectPromptV3({
        look,
        durationMs,
        words: words.map((w, i) => [i, w.startMs, w.text] as const),
      }),
      jsonSchema: reelDirectJsonSchema(),
      ...(thinking ? { thinking: thinking as 'LOW' } : {}),
      maxOutputTokens: 16384,
    });
const parsed = ReelDirectOutputSchema.parse(parseJson(res.text));
writeFileSync(out.replace(/\.json$/, '.raw.json'), JSON.stringify(parsed, null, 1));
const plan = toReelPlan(parsed, words, durationMs, look, model);
writeFileSync(out, JSON.stringify(plan, null, 1));
const p0 = parsed as { story?: unknown; brands?: unknown };
console.log('story', JSON.stringify(p0.story), '\nbrands', JSON.stringify(p0.brands));
console.log(
  `${model}: ${plan.scenes.length} scenes, ${res.latencyMs} ms, in ${res.inTokens} out ${res.outTokens}, ~$${usage.usd.toFixed(4)}`,
);
for (const s of plan.scenes)
  console.log(
    `${(s.startMs / 1000).toFixed(1)} ${s.layout} ${JSON.stringify(s.content).slice(0, 140)}`,
  );
