// Live schema check (spec 39 AI QA): sends every structured-output schema the product uses to the
// real Vertex endpoint with a tiny prompt, on every model that task can run on, and reports any
// schema the endpoint refuses. Vertex answers 400 INVALID_ARGUMENT (no detail) when a schema's
// grammar is too big, and the router can't repair that: the task silently falls back. Seen
// 2026-11-23: minItems on `reel.direct`'s scenes array broke every reel. Run it after any schema
// change. Not product code; uses the developer gcloud login (film-lab `generate`).
//
// Usage: npx tsx scripts/schema-live-check.ts [filter]
import { z } from 'zod';
import { APP_CONFIG_DEFAULTS, PIP_MODEL_CHOICES } from '@motionpop/schemas';
import { components, scenes } from '@motionpop/motion';
import { generate } from '../../motion/scripts/film-lab/gemini';
import { reelTemplateDirectTask } from '../src/reel/director';
import { reelNoteJsonSchema } from '../src/reel/note';
import { reelEditJsonSchema, REEL_EDIT_MODEL } from '../src/reel/edit';
import { reelComposeJsonSchema } from '../src/reel/compose';
import { recipeResolveJsonSchema } from '../src/tasks/recipe-resolve';
import { pipPlanJsonSchema, type PipPlanInput } from '../src/tasks/pip-plan';
import { videoDirectJsonSchema } from '../src/tasks/video-direct';
import { mediaIndexJsonSchema } from '../src/tasks/media-index';
import { filmVisionCriticJsonSchema } from '../src/tasks/film-vision-critic';
import { customComposeJsonSchema } from '../src/tasks/custom-compose';
import { componentFillTask } from '../src/tasks/component-fill';
import { slotsDetect } from '../src/tasks/slots-detect';
import { promptPrefill } from '../src/tasks/prompt-prefill';
import { transcribeCloud } from '../src/tasks/transcribe-cloud';
import { filmDirectTask, reelDirectTask } from '../src/tasks/film';

const filter = process.argv[2] ?? '';
// tsx can't load fast-json-patch's named exports (CJS); the schema builder is still checked when
// the import works (vitest-style loaders), and reported as skipped otherwise.
const patchCheck = await import('../src/tasks/patch-check').catch(() => null);
const FAST = APP_CONFIG_DEFAULTS.modelFast;
const STRONG = APP_CONFIG_DEFAULTS.modelStrong;
const PIP = PIP_MODEL_CHOICES.map((m) => m.id);
const fromZod = (t: z.ZodType) =>
  z.toJSONSchema(t, { target: 'draft-7' }) as Record<string, unknown>;

/** The worst case for pip.plan's enums: every list at its cap. */
const pipInput = {
  project: {
    title: 'Check',
    format: '9:16',
    styleId: 'mono',
    mediaBin: Array.from({ length: 24 }, (_, k) => ({
      id: `clip-${k}`,
      name: `Clip ${k}`,
      kind: 'video',
    })),
    styles: Array.from({ length: 12 }, (_, k) => ({ id: `style-${k}`, name: `Style ${k}` })),
    captions: { enabled: true, preset: 'pop' },
    slots: Array.from({ length: 40 }, (_, k) => ({
      ref: `s${k}`,
      componentId: 'bar-chart',
      name: 'Bar chart',
      title: 'Title',
      status: 'ready',
      startMs: k * 1000,
      endMs: k * 1000 + 900,
    })),
    words: [],
    components: Array.from({ length: 16 }, (_, k) => ({
      id: `comp-${k}`,
      name: `C${k}`,
      useWhen: 'x',
    })),
    reel: {
      look: 'mono',
      captions: true,
      theme: 'x',
      sound: 'x',
      cuts: 0,
      scenes: Array.from({ length: 80 }, (_, k) => ({
        ref: `r${k}`,
        template: 'counter',
        layout: 'split',
        startMs: k * 1000,
        endMs: k * 1000 + 900,
        text: 'x',
      })),
    },
  },
  history: [],
  message: 'x',
} as unknown as PipPlanInput;

const paths = Array.from({ length: 40 }, (_, k) => `/items/${k}/label`);
const clips = [{ id: 'clip-1', name: 'Clip', kind: 'video' }];

interface Case {
  id: string;
  models: readonly string[];
  schema: () => Record<string, unknown>;
}
const cases: Case[] = [
  {
    id: 'reel.direct',
    models: [STRONG],
    schema: () => reelTemplateDirectTask().jsonSchema!({} as never),
  },
  { id: 'reel.note', models: PIP, schema: reelNoteJsonSchema },
  { id: 'reel.edit', models: [REEL_EDIT_MODEL, STRONG], schema: reelEditJsonSchema },
  { id: 'reel.compose', models: PIP, schema: reelComposeJsonSchema },
  { id: 'recipe.resolve', models: [FAST], schema: recipeResolveJsonSchema },
  { id: 'pip.plan', models: PIP, schema: () => pipPlanJsonSchema(pipInput) },
  { id: 'video.direct', models: [STRONG], schema: videoDirectJsonSchema },
  { id: 'media.index', models: [STRONG], schema: mediaIndexJsonSchema },
  { id: 'film.vision-critic', models: [STRONG], schema: filmVisionCriticJsonSchema },
  { id: 'custom.compose', models: [STRONG], schema: () => customComposeJsonSchema },
  ...(patchCheck
    ? [
        {
          id: 'edit.patch / note.fix',
          models: [FAST],
          schema: () => patchCheck.patchJsonSchema(paths),
        },
      ]
    : []),
  { id: 'slots.detect', models: [STRONG, FAST], schema: () => fromZod(slotsDetect.output) },
  { id: 'prompt.prefill', models: [FAST], schema: () => fromZod(promptPrefill.output) },
  { id: 'transcribe.cloud', models: [FAST], schema: () => fromZod(transcribeCloud.output) },
  { id: 'film.direct', models: [STRONG], schema: () => filmDirectTask.jsonSchema!({} as never) },
  {
    id: 'film.direct+clips',
    models: [STRONG],
    schema: () => filmDirectTask.jsonSchema!({ mediaBin: clips } as never),
  },
  {
    id: 'reel.direct (v2 film)',
    models: [STRONG],
    schema: () => reelDirectTask.jsonSchema!({} as never),
  },
];
// Self-test: a schema known to be refused (2026-11-23), to prove the check catches a 400.
if (process.env.SCHEMA_SELFTEST)
  cases.push({
    id: 'selftest: reel.direct with bounded scenes (must be refused)',
    models: [STRONG],
    schema: () => {
      const s = reelTemplateDirectTask().jsonSchema!({} as never) as {
        properties: { scenes: Record<string, unknown> };
      };
      return {
        ...s,
        properties: { ...s.properties, scenes: { ...s.properties.scenes, minItems: 7 } },
      };
    },
  });
const all = { ...components, ...scenes } as Record<string, { params: z.ZodType }>;
for (const id of Object.keys(all)) {
  const fill = componentFillTask((c) => all[c]?.params);
  cases.push({
    id: `component.fill:${id}`,
    models: [FAST],
    schema: () => fill.jsonSchema!({ componentId: id } as never),
  });
}

const run = cases.filter((c) => c.id.includes(filter));
const bad: string[] = [];
let ok = 0;
const queue = run.flatMap((c) => c.models.map((m) => ({ c, m })));
async function worker() {
  for (let job = queue.shift(); job; job = queue.shift()) {
    const { c, m } = job;
    let schema: Record<string, unknown>;
    try {
      schema = c.schema();
    } catch (err) {
      bad.push(`${c.id} (schema build threw: ${String(err).slice(0, 120)})`);
      continue;
    }
    try {
      await generate({
        model: m,
        system: 'Answer with the smallest valid JSON.',
        prompt: 'Return a minimal valid answer.',
        jsonSchema: schema,
        maxOutputTokens: 64,
        temperature: 0,
      });
      ok++;
    } catch (err) {
      const msg = String(err);
      // A truncated answer (64 tokens) still means the schema was accepted.
      if (/MAX_TOKENS|truncat|JSON/i.test(msg) && !/\b400\b/.test(msg)) ok++;
      else bad.push(`${c.id} on ${m}: ${msg.replace(/\s+/g, ' ').slice(0, 160)}`);
    }
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
console.log(
  `${ok} accepted, ${bad.length} refused${patchCheck ? '' : ' (edit.patch skipped: loader)'}`,
);
for (const b of bad) console.log('  ✗', b);
process.exit(bad.length ? 1 : 0);
