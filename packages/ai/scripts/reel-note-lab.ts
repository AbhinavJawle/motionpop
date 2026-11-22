// Lab (spec 29): real cloud runs of the reel director and of `reel.note` on a saved reel.
//   npx tsx scripts/reel-note-lab.ts direct <reel.json> [model]
//   npx tsx scripts/reel-note-lab.ts notes <reel.json> <cases.json> [model]
// reel.json = { reel: ReelPlan, words: Word[] }. The router adapter mirrors the app router:
// parse with the task's schema, run its check, one repair with the error fed back.
import { readFileSync, writeFileSync } from 'node:fs';
import type { ReelPlan, ReelWord } from '@motionpop/schemas';
import type { Router, RunResult, TaskDef } from '../src/router';
import { directReel } from '../src/reel/director';
import {
  applyReelNote,
  reelNoteContext,
  reelNoteInput,
  runReelNote,
  type ReelNotePart,
} from '../src/reel/note';
import { generate, parseJson } from '../../motion/scripts/film-lab/gemini';

const CFG = {
  routingOverrides: {},
  routingSlotsDetectDeviceMaxWords: 400,
  modelFast: 'gemini-3.5-flash-lite',
  modelStrong: 'gemini-4-neon',
  modelFilmBuild: 'gemini-4-neon',
  killSwitch: false,
};

function labRouter(modelOverride?: string): Router {
  return {
    async run<I, O>(task: TaskDef<I, O>, raw: I): Promise<RunResult<O>> {
      const input = task.input.parse(raw);
      const model = modelOverride ?? task.model(CFG);
      const media = task.media?.(input);
      const mediaList = task.mediaList?.(input);
      let prompt = task.prompt(input);
      let latency = 0;
      for (let attempt = 1; attempt <= 1 + (task.maxRepairs ?? 1); attempt++) {
        const res = await generate({
          model,
          system: task.system,
          prompt,
          ...(task.jsonSchema ? { jsonSchema: task.jsonSchema(input) } : {}),
          ...(task.thinking ? { thinking: task.thinking } : {}),
          ...(task.maxOutputTokens ? { maxOutputTokens: task.maxOutputTokens } : {}),
          ...(media ? { media: [media] } : mediaList ? { media: mediaList } : {}),
        });
        latency += res.latencyMs;
        let err: string | null = null;
        let output: O | null = null;
        try {
          output = task.output.parse(parseJson(res.text));
          err = task.check?.(output, input) ?? null;
        } catch (e) {
          err = (e as Error).message.slice(0, 400);
        }
        if (!err && output !== null)
          return {
            output,
            ranOn: 'cloud',
            model,
            costCredits: 0,
            latencyMs: latency,
            attempts: attempt,
            cached: false,
          };
        console.error(`  ! attempt ${attempt}: ${err}`);
        if (process.env['LAB_RAW']) console.error(`    raw: ${res.text.slice(0, 600)}`);
        prompt = `${task.prompt(input)}\n\nYour previous answer was invalid: ${err}\nAnswer again, fixing that.`;
      }
      throw new Error('invalid after repair');
    },
  };
}

const [mode, file, a3, a4] = process.argv.slice(2) as [string, string, string?, string?];
const data = JSON.parse(readFileSync(file, 'utf8')) as {
  reel: ReelPlan;
  words: { text: string; startMs: number; endMs: number }[];
};
const words: ReelWord[] = data.words.map((w) => ({
  text: w.text,
  startMs: w.startMs,
  endMs: w.endMs,
}));

if (mode === 'direct') {
  const durationMs = data.reel.scenes.at(-1)!.endMs;
  const t0 = Date.now();
  const out = await directReel(labRouter(a3), {
    look: data.reel.look,
    words,
    durationMs,
    model: a3 ?? 'gemini-4-neon',
  });
  console.log('source', out.source, out.error ?? '', `${Date.now() - t0} ms`);
  for (const s of out.plan.scenes)
    console.log(
      s.id,
      s.startMs,
      s.endMs,
      s.layout,
      s.tag ?? '',
      JSON.stringify(s.content).slice(0, 160),
    );
  writeFileSync(
    file.replace(/\.json$/, '.directed.json'),
    JSON.stringify({ reel: out.plan, words: data.words }),
  );
} else {
  const cases = JSON.parse(readFileSync(a3!, 'utf8')) as {
    scene: string;
    note: string;
    parts: ReelNotePart[];
    texts?: string[];
    pictures?: string[];
    caption?: string;
    /** A JPEG of the circled area (as the app attaches). */
    image?: string;
  }[];
  const router = labRouter(a4);
  for (const c of cases) {
    const index = data.reel.scenes.findIndex((s) => s.id === c.scene);
    const scene = data.reel.scenes[index]!;
    const ctx = reelNoteContext(scene, words, data.reel.look);
    const hook =
      index === 0 && data.reel.hook && data.reel.look === 'mono' ? data.reel.hook : undefined;
    const input = reelNoteInput(ctx, {
      sceneIndex: index,
      sceneCount: data.reel.scenes.length,
      note: { text: c.note, region: { x: 0.1, y: 0.1, w: 0.6, h: 0.2 } },
      target: { parts: c.parts, texts: c.texts ?? [], pictures: c.pictures ?? [] },
      caption: c.caption,
      hook,
      ...(c.image ? { image: readFileSync(c.image).toString('base64') } : {}),
    });
    console.log(`\n### ${c.scene} [${c.parts.join(',')}] "${c.note}"`);
    console.log(`  before: ${scene.layout} ${scene.bg ?? ''} ${JSON.stringify(scene.content)}`);
    try {
      const res = await runReelNote(router, input);
      const r = applyReelNote(ctx, res.output, { hook });
      console.log(
        `  ${res.latencyMs} ms, attempts ${res.attempts}, action ${res.output.action}, changed ${r.changed}`,
      );
      console.log(`  message: ${r.message}`);
      console.log(
        `  after:  ${r.scene.layout} ${r.scene.bg ?? ''} ${r.scene.tag ?? ''} ${JSON.stringify(r.scene.content)}`,
      );
      if (r.captions.length) console.log(`  captions: ${JSON.stringify(r.captions)}`);
      if (r.hook !== undefined) console.log(`  hook: ${JSON.stringify(r.hook)}`);
    } catch (e) {
      console.log(`  FAILED: ${(e as Error).message}`);
    }
  }
}
