// Film lab, setup S4 (docs/research/film-mode.md): film mode itself. The product's own
// orchestration (`makeFilm` in packages/ai: Director, parallel Builders, Critic with repairs) run
// against Vertex with a headless browser as the critic's sandbox.
// Usage: node scripts/run-film-lab.ts film [--model gemini-3.8-flash] [--builder gemini-3.5-flash-lite]
//          [--name s4] [--repairs 2] [--video] [--board path/to/storyboard.json] [--voiceover suez]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer, { type Browser } from 'puppeteer';
import { spokenNumbers, type Storyboard, type TimedBeat } from '@motionpop/schemas';
import { createRouter, type AIProvider } from '../../../ai/src/router';
import {
  beatWords,
  makeFilm,
  type CriticVerdict,
  type FilmBeatParams,
} from '../../../ai/src/film/make-film';
import { compileProject, type CompileSlot } from '../../src/compiler';
import { customParams, lintCustom, lintProp } from '../../src/components/custom';
import { criticText, type CriticSummary } from '../../src/film/critic';
import { KIT_DOC, kitExample } from '../../src/film/doc';
import { looks as craftLooks, editorialExplainer } from '../../src/styles';
import { FIXTURES, loadVoiceover } from './data';
import { generate, setLedger, usage } from './gemini';
import { shoot } from './shoot';

const pkgDir = process.env['MOTION_PKG_DIR'] ?? process.cwd();
const args = process.argv.slice(2);
const opt = (k: string) => {
  const i = args.indexOf('--' + k);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (k: string) => args.includes('--' + k);
const director = opt('model') ?? 'gemini-3.8-flash';
const builder = opt('builder') ?? director;
const lookId = opt('look') ?? 'newsprint';
const name = opt('name') ?? 's4-' + director + (builder === director ? '' : '+' + builder);
const repairs = Number(opt('repairs') ?? 2);
const LOOKS: Record<string, { name: string; description: string }> = {
  newsprint: {
    name: 'Newsprint',
    description:
      'newsprint collage: warm paper ground, Playfair Display serif headlines, a sans for labels and numbers, red accent, blue second colour, yellow highlighter, torn paper cards, hand-drawn marker lines, a flat paper map',
  },
};
const looks: Record<string, unknown> = {
  [editorialExplainer.id]: editorialExplainer,
  ...craftLooks,
};

const outDir = join(pkgDir, '.check', 'film-lab', name);
mkdirSync(outDir, { recursive: true });
setLedger(join(pkgDir, '.check', 'film-lab', 'ledger.jsonl'));
const vo = loadVoiceover(opt('voiceover') ?? 'suez');

// The product's router on a Vertex provider: same prompts, same checks, same repairs.
const provider: AIProvider = {
  async generate(req) {
    const res = await generate({
      model: req.model,
      system: req.system,
      prompt: req.prompt,
      jsonSchema: req.jsonSchema,
      ...(req.thinking ? { thinking: req.thinking } : {}),
    });
    return { text: res.text, ranOn: 'cloud' };
  },
};
let phase: 'direct' | 'build' = 'direct';
const router = createRouter({
  provider,
  config: () => ({
    routingOverrides: {},
    routingSlotsDetectDeviceMaxWords: 400,
    modelFast: builder,
    // The Director and the drawings use the strong model; `--builder` swaps the beat builder.
    modelStrong: phase === 'direct' ? director : builder,
    // Film beat builders (film.build) read this one; `--builder` swaps them too.
    modelFilmBuild: builder,
    killSwitch: false,
  }),
  onUsage: (e) => {
    if (!e.ok)
      console.log('  ' + e.task + ' failed: ' + (e.problems ?? []).join(' | ').slice(0, 300));
  },
});

// The critic's sandbox: one headless page per check, with the beat alone in a composition.
const dist = join(pkgDir, 'dist');
const assets = {
  runtimeJs: readFileSync(join(dist, 'runtime.js'), 'utf8'),
  hyperframesRuntimeJs: readFileSync(join(dist, 'hyperframe.runtime.iife.js'), 'utf8'),
  fonts: JSON.parse(readFileSync(join(dist, 'fonts.json'), 'utf8')) as Record<string, string>,
  textures: JSON.parse(readFileSync(join(dist, 'textures.json'), 'utf8')) as {
    grain: string;
    paper: string;
  },
};
// Figures a beat may show: the narration's own (the storyboard's text was checked against them).
const allowNumbers = [...spokenNumbers(vo.words)];
let browser: Browser | null = null;
const criticLog: Record<string, { round: number; reports: CriticSummary['reports'] }[]> = {};

async function inspect(params: FilmBeatParams, beat: TimedBeat): Promise<CriticVerdict> {
  const parsed = customParams.safeParse(params);
  if (!parsed.success)
    return {
      fixes: '- ' + parsed.error.issues.map((x) => x.message).join('\n- '),
      blocking: 1,
      broken: true,
    };
  browser ??= await puppeteer.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const dur = beat.endMs - beat.startMs;
  const slot: CompileSlot = {
    id: beat.id,
    componentId: 'custom',
    startMs: 0,
    endMs: dur,
    params: parsed.data,
    words: beatWords(beat, vo.words),
    ...(beat.tailMs ? { tailMs: beat.tailMs, over: beat.over } : {}),
  };
  const html = compileProject(
    {
      format: '16:9',
      durationMs: dur + beat.tailMs + 100,
      style: looks[lookId] as never,
      slots: [slot],
      film: true,
    },
    assets,
  );
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 0.5 });
    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForFunction('!!window.__motionpop', { timeout: 30_000 });
    await page.evaluate('window.__motionpop.ready');
    const out = (await page.evaluate(
      (id: string, wants: boolean, head: number, lead: string, allow: string[]) => {
        const m = (
          window as unknown as {
            __motionpop: {
              inspect: (id: string, o: object) => unknown;
              sounds: () => Record<string, unknown[]>;
              warnings: { slotId: string; message: string }[];
            };
          }
        ).__motionpop;
        return {
          summary: m.inspect(id, { wantsPicture: wants, headMs: head, lead, allowNumbers: allow }),
          sounds: m.sounds()[id] ?? [],
          warnings: m.warnings,
        };
      },
      beat.id,
      beat.lead !== 'type',
      beat.headMs,
      beat.lead,
      allowNumbers,
    )) as {
      summary: CriticSummary | null;
      sounds: FilmBeatParams['cues'];
      warnings: { message: string }[];
    };
    const reports = out.summary?.reports ?? [];
    // Kit warnings (a word that isn't spoken, a place the map doesn't know) go back as notes.
    const notes = out.warnings.map((w) => '- ' + w.message);
    (criticLog[beat.id] ??= []).push({ round: criticLog[beat.id]?.length ?? 0, reports });
    const text = criticText(reports);
    return {
      fixes: text === null ? null : [text, ...notes].join('\n'),
      blocking: reports.filter((r) => r.level === 'fix').length,
      broken: reports.some((r) => r.rule === 'error'),
      ...(out.sounds?.length ? { cues: out.sounds } : {}),
    };
  } finally {
    await page.close();
  }
}

const boardPath = opt('board');
const saved =
  boardPath && existsSync(boardPath)
    ? (JSON.parse(readFileSync(boardPath, 'utf8')) as Storyboard)
    : undefined;
console.log(name + ': director ' + director + ', builder ' + builder + ', repairs ' + repairs);
const film = await makeFilm(
  {
    words: vo.words,
    durationMs: vo.durationMs,
    format: '16:9',
    look: LOOKS[lookId] ?? { name: lookId, description: '' },
  },
  {
    router,
    lint: lintCustom,
    lintProp,
    kitDoc: KIT_DOC,
    example: kitExample(),
    inspect,
    maxRepairs: repairs,
    concurrency: 5,
    ...(saved ? { storyboard: saved } : {}),
    onProgress: (e) => {
      if (e.phase === 'storyboard' && e.state === 'done') phase = 'build';
      if (e.phase !== 'beat') console.log('  ' + e.phase + ' ' + e.state);
      else if (e.state === 'ready' || e.state === 'failed' || e.state === 'repairing')
        console.log('  ' + e.beatId + ' ' + e.state);
    },
  },
);
if (browser) await (browser as Browser).close();
writeFileSync(join(outDir, 'storyboard.json'), JSON.stringify(film.storyboard, null, 1));
writeFileSync(join(outDir, 'props.json'), JSON.stringify(film.props, null, 1));
writeFileSync(join(outDir, 'beats.json'), JSON.stringify(film.beats, null, 1));
writeFileSync(join(outDir, 'critic.json'), JSON.stringify(criticLog, null, 1));

const slots: CompileSlot[] = [];
for (const b of film.beats) {
  if (!b.params) continue;
  slots.push({
    id: b.beat.id,
    componentId: 'custom',
    startMs: b.beat.startMs,
    endMs: b.beat.endMs,
    params: b.params,
    words: beatWords(b.beat, vo.words),
    ...(b.beat.tailMs ? { tailMs: b.beat.tailMs, over: b.beat.over } : {}),
  });
}
const shot = await shoot({
  outDir,
  format: '16:9',
  lookId,
  durationMs: vo.durationMs,
  slots,
  film: true,
  voice: join(FIXTURES, vo.audio),
  video: flag('video'),
  label: name,
  wantsPicture: Object.fromEntries(film.beats.map((b) => [b.beat.id, b.beat.lead !== 'type'])),
});
const summary = {
  setup: 's4',
  director,
  builder,
  title: film.storyboard.title,
  calls: film.calls,
  latencyMs: film.latencyMs,
  beats: film.beats.map((b) => ({
    id: b.beat.id,
    lead: b.beat.lead,
    seam: b.beat.seam.kind,
    ms: b.beat.endMs - b.beat.startMs,
    valid: b.params !== null,
    calls: b.calls,
    repairs: b.repairs,
    left: b.problems,
    runtimeErrors: shot.errors
      .filter((e) => e.slotId === b.beat.id)
      .map((e) => e.phase + ': ' + e.message),
    critic: shot.critic[b.beat.id]?.reports ?? [],
    stats: shot.critic[b.beat.id]?.stats ?? null,
  })),
  usage: { ...usage },
};
writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 1));
console.log(
  '"' +
    film.storyboard.title +
    '": ' +
    film.beats.length +
    ' beats, ' +
    film.calls +
    ' calls, ' +
    Math.round(film.latencyMs / 1000) +
    ' s',
);
for (const b of summary.beats) {
  const fixes = b.critic.filter((c) => c.level === 'fix').map((c) => c.rule);
  console.log(
    [
      b.id,
      b.lead.padEnd(7),
      ('→' + b.seam).padEnd(7),
      (b.ms / 1000).toFixed(1) + 's',
      b.valid ? 'ok ' : 'BAD',
      'calls=' + b.calls,
      'repairs=' + b.repairs,
      'shapes=' + (b.stats?.shapes ?? '-'),
      'words=' + (b.stats?.textWords ?? '-'),
      b.runtimeErrors.length ? 'ERR ' + (b.runtimeErrors[0] ?? '').slice(0, 80) : '',
      fixes.length ? 'left:' + fixes.join(',') : '',
    ].join(' '),
  );
}
console.log('sheet → ' + shot.sheet + (shot.video ? '\nvideo → ' + shot.video : ''));
console.log('cost: $' + usage.usd.toFixed(4) + ' over ' + usage.calls + ' calls');
process.exit(0);
