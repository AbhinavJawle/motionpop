import {
  applyReelCompose,
  reelComposeTask,
  type GraphicSceneBlueprint,
  type ReelComposeInput,
  type ReelComposeOutput,
  type ReelDirectBrief,
  type Router,
} from '@motionpop/ai';
import { KIT_DOC, criticText, lintCustom, pickStageArchetype } from '@motionpop/motion';
import {
  inspectCustomScene,
  reelCustomScene,
  type CustomReport,
  type ReelCustomAssets,
  type ReelCustomScene,
  type ReelImage,
} from '@motionpop/motion/reel';
import {
  REEL_CUSTOM_BUDGET,
  REEL_CUSTOM_LIMITS,
  reelCustomSize,
  reelMediaOf,
  type Format,
  type ImageAsset,
  type ReelMedia,
  type ReelPlan,
  type ReelScene,
  type ReelWord,
} from '@motionpop/schemas';
import { isAbortError, raceAbort, throwIfAborted } from '@/lib/abort';
import { customPictures, loadReelCustomAssets } from './custom-assets';

function shows(m: ReelMedia): string {
  if (m.kind === 'logo') return `the ${m.query.split('|')[0]?.trim() || 'brand'} logo`;
  return `${m.kind === 'photo' ? 'a photo' : m.kind === 'screenshot' ? 'a screenshot' : 'an editorial cutout illustration'} of ${m.query}`;
}

function numbersIn(...texts: string[]): string[] {
  const out = new Set<string>();
  for (const t of texts)
    for (const m of t.matchAll(/\d[\d,.]*/g)) out.add(m[0].replace(/[,.]+$/, '').replace(/,/g, ''));
  return [...out];
}

function problemsOf(report: CustomReport): { text: string; broken: boolean } | null {
  const errors = report.errors.map((e) => `- the script failed: ${e}`);
  const critic = report.summary ? criticText(report.summary.reports) : null;
  if (!errors.length && !critic && report.summary) return null;
  if (!report.summary && !errors.length) errors.push('- the graphic did not build');
  return {
    text: [...errors, ...(critic ? [critic] : [])].join('\n').slice(0, 3800),
    broken: errors.length > 0 || report.summary === null,
  };
}

export interface ComposeGraphicScenesDeps {
  getRouter: () => Promise<Router | null>;
  customAssets?: () => Promise<ReelCustomAssets | null>;
  customPictures?: (ids: string[], assets: readonly ImageAsset[]) => Promise<Record<string, ReelImage>>;
  inspect?: (
    scene: Omit<ReelCustomScene, 'token'>,
    assets: ReelCustomAssets,
    allowNumbers: string[],
  ) => Promise<CustomReport>;
}

/**
 * Elevates storyboarded `mode: 'custom'` graphic scenes into bespoke Film Kit HTML/CSS/SVG/JS
 * motion graphics via `reel.compose`, pre-wired with their fetched cutout illustrations/photos
 * (`m0`, `m1`, ...), style craft rules, and custom `SKILL.md` instructions. Every composed scene
 * is verified in the sandbox (`inspectCustomScene`) with 1 automatic repair pass; any failure
 * gracefully falls back to the scene's structured template so generation never fails.
 */
export async function composeGraphicScenes(
  params: {
    plan: ReelPlan;
    blueprints: readonly GraphicSceneBlueprint[];
    visualsByScene: ReadonlyMap<string, readonly ReelMedia[]>;
    assets: readonly ImageAsset[];
    prompt: string;
    format: Format;
    brief?: ReelDirectBrief;
    styleDirection?: string;
    onProgress?: (done: number, total: number, label: string) => void;
    signal?: AbortSignal;
  },
  deps: ComposeGraphicScenesDeps,
): Promise<ReelPlan> {
  const { plan, blueprints, visualsByScene, assets, prompt, format, brief, styleDirection, signal } =
    params;
  const targets = blueprints.filter((b) => b.mode === 'custom' && b.artDirection.trim().length > 0);
  if (targets.length === 0) return plan;

  throwIfAborted(signal);
  const router = await deps.getRouter().catch(() => null);
  if (!router) return plan;

  const runtimeAssets = await (deps.customAssets ?? loadReelCustomAssets)().catch(() => null);
  if (!runtimeAssets) return plan;

  const inspect =
    deps.inspect ??
    ((sc: Omit<ReelCustomScene, 'token'>, a: ReelCustomAssets, allow: string[]) =>
      typeof document !== 'undefined'
        ? inspectCustomScene({ doc: document, scene: sc, assets: a, allowNumbers: allow })
        : Promise.resolve({ summary: null, errors: [] }));

  const task = reelComposeTask(lintCustom, KIT_DOC);
  const largest = REEL_CUSTOM_LIMITS.html + REEL_CUSTOM_LIMITS.css + REEL_CUSTOM_LIMITS.script;
  const nextScenes: ReelScene[] = [...plan.scenes];
  let done = 0;

  for (const bp of targets) {
    throwIfAborted(signal);
    const idx = nextScenes.findIndex((s) => s.id === bp.sceneId);
    if (idx < 0) continue;
    const baseScene = nextScenes[idx]!;
    if (reelCustomSize({ scenes: nextScenes }) + largest > REEL_CUSTOM_BUDGET) break;

    done++;
    params.onProgress?.(done, targets.length, `Designing custom motion scene ${done}/${targets.length}`);

    const pictures: ReelMedia[] = [...(visualsByScene.get(bp.sceneId) ?? bp.visuals)]
      .filter((m) => Boolean(m.asset))
      .slice(0, 6);

    const probe = reelCustomScene({
      look: plan.look,
      theme: plan.theme,
      format,
      noVideo: true,
      captions: false,
      scene: {
        ...baseScene,
        layout: 'full',
        content: {
          template: 'custom',
          title: 'probe',
          brief: '',
          html: '',
          css: '',
          script: 'return {seek(){}}',
        },
      },
      words: [],
      pictures: {},
    });
    if (!probe) continue;

    const pics = await (deps.customPictures ?? customPictures)(
      pictures.flatMap((m) => (m.asset ? [m.asset] : [])),
      assets,
    ).catch(() => ({}));

    const input: ReelComposeInput = {
      note: prompt.slice(0, 300),
      brief: bp.artDirection,
      look: plan.look,
      layout: 'full',
      format,
      graphicOnly: true,
      ...(brief ? { directorBrief: brief } : {}),
      ...(styleDirection ? { styleDirection: styleDirection.slice(0, 2400) } : {}),
      area: { w: probe.width, h: probe.height },
      palette: {
        bg: probe.palette.bg,
        ink: probe.palette.ink,
        muted: probe.palette.muted,
        accent: probe.palette.accent,
        link: probe.palette.link,
      },
      durationMs: Math.max(1000, probe.durationMs),
      ...(baseScene.tag && plan.look === 'mono' ? { tag: baseScene.tag.slice(0, 60) } : {}),
      words: [],
      current: {
        kind: 'template',
        graphic: baseScene.content as unknown as Record<string, unknown>,
      },
      pictures: pictures.map((m, i) => ({
        id: `m${i}`,
        shows: shows(m).slice(0, 120),
      })),
      example: pickStageArchetype({
        styleDirection,
        prompt: `${prompt} ${bp.artDirection}`,
        layout: 'full',
      }),
    };

    const allow = numbersIn(prompt, bp.artDirection, JSON.stringify(baseScene.content));

    const attempt = async (fix?: ReelComposeInput['fix']) => {
      const run = await raceAbort(
        router.run(task, fix ? { ...input, fix } : input, {
          mode: 'ONLY_IN_CLOUD',
          allowCloud: false,
        }),
        signal,
      );
      throwIfAborted(signal);
      const out: ReelComposeOutput = run.output;
      const next = applyReelCompose({ ...baseScene, layout: 'full' }, plan.look, out, pictures);
      if (typeof document === 'undefined') {
        return { out, next, problems: null as { text: string; broken: boolean } | null };
      }
      const sc = reelCustomScene({
        look: plan.look,
        theme: plan.theme,
        format,
        noVideo: true,
        captions: false,
        scene: next,
        words: [],
        pictures: pics,
      });
      const report = sc
        ? await raceAbort(inspect(sc, runtimeAssets, allow), signal)
        : { summary: null, errors: ['no scene'] };
      return { out, next, problems: problemsOf(report) };
    };

    try {
      let got = await attempt();
      if (got.problems) {
        const first = got;
        const firstProblems = got.problems;
        params.onProgress?.(
          done,
          targets.length,
          `Polishing scene ${done}/${targets.length}`,
        );
        try {
          got = await attempt({
            html: first.out.html,
            css: first.out.css,
            script: first.out.script,
            problems: firstProblems.text,
          });
        } catch (err) {
          if (isAbortError(err) || signal?.aborted) throw err;
          got = first;
        }
        if (got.problems?.broken && !firstProblems.broken) got = first;
      }
      if (!got.problems?.broken) {
        nextScenes[idx] = { ...got.next, layout: 'full' };
      }
    } catch (err) {
      if (isAbortError(err) || signal?.aborted) throw err;
      // Keep the scene's fallback template when composition fails so the project still succeeds.
      console.warn('Custom graphic scene composition failed; keeping template fallback:', err);
    }
  }

  return { ...plan, scenes: nextScenes };
}

const HERO_TEMPLATE_PRIORITY: Readonly<Record<string, number>> = {
  image: 100,
  chart: 95,
  flow: 90,
  compare: 88,
  headline: 84,
  counter: 80,
  list: 76,
  browser: 74,
  website: 72,
  checklist: 70,
  progress: 68,
  quote: 64,
  terminal: 62,
  statement: 58,
  stack: 55,
  logo: 45,
  logos: 45,
};

/**
 * Picks up to `maxScenes` highest-impact hero scenes from a talking-head or voiceover reel to
 * upgrade into bespoke Film Kit custom animations — skipping `speaker`, `none`, `cta`, `punch`,
 * `custom`, and very short beats (<1.8 s), and spacing picks out across the timeline.
 */
export function selectHeroReelScenes(
  scenes: readonly ReelScene[],
  maxScenes: number,
  noVideo: boolean,
): ReelScene[] {
  if (maxScenes <= 0) return [];
  const scored: { scene: ReelScene; idx: number; score: number }[] = [];
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i]!;
    if (!noVideo && s.layout === 'speaker') continue;
    if (s.content.template === 'custom' || s.content.template === 'none' || s.content.template === 'cta' || s.content.template === 'punch') {
      continue;
    }
    const dur = s.endMs - s.startMs;
    if (dur < 1800) continue;
    const base = HERO_TEMPLATE_PRIORITY[s.content.template] ?? 40;
    const hasFetchedMedia = reelMediaOf({ scenes: [s] }).some((m) => Boolean(m.asset)) ? 22 : 0;
    const hookBonus = i === 0 ? 30 : 0;
    const layoutBonus = s.layout === 'full' ? 14 : s.layout === 'split' ? 8 : 0;
    scored.push({ scene: s, idx: i, score: base + hasFetchedMedia + hookBonus + layoutBonus });
  }
  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);

  const picked: { scene: ReelScene; idx: number }[] = [];
  for (const cand of scored) {
    if (picked.length >= maxScenes) break;
    // Avoid back-to-back upgrades when plenty of scenes exist so pacing breathes naturally.
    const adjacent = scenes.length >= 6 && picked.some((p) => Math.abs(p.idx - cand.idx) === 1);
    if (adjacent) continue;
    picked.push({ scene: cand.scene, idx: cand.idx });
  }
  picked.sort((a, b) => a.idx - b.idx);
  return picked.map((p) => p.scene);
}

/**
 * Selective bespoke Film Kit hero-scene upgrade pass for Upload Video (Talking-Head Reels) and
 * Voiceover / Script Reels. Upgrades the top 2–4 highest-impact `full` or `split` moments into
 * layered, word-synced custom HTML/CSS/SVG/JS motion graphics using the chosen style craft rules,
 * community/user `SKILL.md`, and fetched cutout visuals (`m0`/`m1`), with sandbox visual QA +
 * 1 auto-repair pass and instant fallback to the original template on any failure.
 */
export async function composeReelHeroScenes(
  params: {
    plan: ReelPlan;
    words: readonly ReelWord[];
    assets: readonly ImageAsset[];
    format: Format;
    noVideo: boolean;
    brief?: ReelDirectBrief;
    styleDirection?: string;
    styleId?: string;
    maxScenes?: number;
    onProgress?: (done: number, total: number, label: string) => void;
    signal?: AbortSignal;
  },
  deps: ComposeGraphicScenesDeps,
): Promise<ReelPlan> {
  const { plan, words, assets, format, noVideo, brief, styleDirection, styleId, signal } = params;
  const maxScenes = params.maxScenes ?? (noVideo ? 4 : 3);
  const targets = selectHeroReelScenes(plan.scenes, maxScenes, noVideo);
  if (targets.length === 0) return plan;

  throwIfAborted(signal);
  const router = await deps.getRouter().catch(() => null);
  if (!router) return plan;

  const runtimeAssets = await (deps.customAssets ?? loadReelCustomAssets)().catch(() => null);
  if (!runtimeAssets) return plan;

  const inspect =
    deps.inspect ??
    ((sc: Omit<ReelCustomScene, 'token'>, a: ReelCustomAssets, allow: string[]) =>
      typeof document !== 'undefined'
        ? inspectCustomScene({ doc: document, scene: sc, assets: a, allowNumbers: allow })
        : Promise.resolve({ summary: null, errors: [] }));

  const task = reelComposeTask(lintCustom, KIT_DOC);
  const largest = REEL_CUSTOM_LIMITS.html + REEL_CUSTOM_LIMITS.css + REEL_CUSTOM_LIMITS.script;
  const nextScenes: ReelScene[] = [...plan.scenes];
  let done = 0;

  for (const target of targets) {
    throwIfAborted(signal);
    const idx = nextScenes.findIndex((s) => s.id === target.id);
    if (idx < 0) continue;
    const baseScene = nextScenes[idx]!;
    if (reelCustomSize({ scenes: nextScenes }) + largest > REEL_CUSTOM_BUDGET) break;

    done++;
    params.onProgress?.(
      done,
      targets.length,
      `Crafting custom hero scene ${done}/${targets.length}`,
    );

    const pictures: ReelMedia[] = reelMediaOf({ scenes: [baseScene] })
      .filter((m) => Boolean(m.asset))
      .slice(0, 6);

    const probe = reelCustomScene({
      look: plan.look,
      theme: plan.theme,
      format,
      ...(noVideo ? { noVideo: true, captions: plan.captions } : {}),
      scene: {
        ...baseScene,
        content: {
          template: 'custom',
          title: 'probe',
          brief: '',
          html: '',
          css: '',
          script: 'return {seek(){}}',
        },
      },
      words,
      pictures: {},
    });
    if (!probe) continue;

    const pics = await (deps.customPictures ?? customPictures)(
      pictures.flatMap((m) => (m.asset ? [m.asset] : [])),
      assets,
    ).catch(() => ({}));

    const spokenLine = probe.words.map((w) => w.text).join(' ').trim();
    const sceneBrief = [
      `Elevate this ${baseScene.layout} ${baseScene.content.template} beat into a bespoke studio-grade motion graphic matching the chosen visual style & director skill.`,
      spokenLine ? `Spoken narration during this beat: "${spokenLine.slice(0, 220)}". Sync key reveals to the spoken word timestamps.` : '',
      pictures.length > 0
        ? `Feature the already-fetched cutout/media asset(s) (${pictures.map((_, i) => `m${i}`).join(', ')}) prominently with mp.image(..., { shadow: true }).`
        : 'Build rich multi-layer HTML/CSS/SVG depth (textured `.mp-backdrop`, bold focal visual/diagram/metric, crisp motion choreography).',
      baseScene.layout === 'split'
        ? 'This is a SPLIT stage above the speaker — keep typography bold and spacious inside the clipped top container with zero clutter.'
        : '',
    ]
      .filter(Boolean)
      .join(' ');

    const input: ReelComposeInput = {
      note: (spokenLine || `Elevate ${baseScene.content.template} hero scene`).slice(0, 300),
      brief: sceneBrief.slice(0, 1200),
      look: plan.look,
      layout: baseScene.layout,
      format,
      graphicOnly: false,
      ...(brief ? { directorBrief: brief } : {}),
      ...(styleDirection ? { styleDirection: styleDirection.slice(0, 2400) } : {}),
      area: { w: probe.width, h: probe.height },
      palette: {
        bg: probe.palette.bg,
        ink: probe.palette.ink,
        muted: probe.palette.muted,
        accent: probe.palette.accent,
        link: probe.palette.link,
      },
      durationMs: Math.max(800, probe.durationMs),
      ...(baseScene.tag && plan.look === 'mono' && baseScene.layout !== 'speaker'
        ? { tag: baseScene.tag.slice(0, 60) }
        : {}),
      words: probe.words
        .slice(0, 240)
        .map((w) => ({ text: w.text.slice(0, 60), startMs: w.startMs })),
      current: {
        kind: 'template',
        graphic: baseScene.content as unknown as Record<string, unknown>,
      },
      pictures: pictures.map((m, i) => ({
        id: `m${i}`,
        shows: shows(m).slice(0, 120),
      })),
      example: pickStageArchetype({
        styleDirection,
        styleId,
        prompt: `${spokenLine} ${brief?.skillName ?? ''} ${brief?.style ?? ''}`,
        layout: baseScene.layout,
      }),
    };

    const allow = numbersIn(spokenLine, JSON.stringify(baseScene.content));

    const attempt = async (fix?: ReelComposeInput['fix']) => {
      const run = await raceAbort(
        router.run(task, fix ? { ...input, fix } : input, {
          mode: 'ONLY_IN_CLOUD',
          allowCloud: false,
        }),
        signal,
      );
      throwIfAborted(signal);
      const out: ReelComposeOutput = run.output;
      const next = applyReelCompose(baseScene, plan.look, out, pictures);
      if (typeof document === 'undefined') {
        return { out, next, problems: null as { text: string; broken: boolean } | null };
      }
      const sc = reelCustomScene({
        look: plan.look,
        theme: plan.theme,
        format,
        ...(noVideo ? { noVideo: true, captions: plan.captions } : {}),
        scene: next,
        words,
        pictures: pics,
      });
      const report = sc
        ? await raceAbort(inspect(sc, runtimeAssets, allow), signal)
        : { summary: null, errors: ['no scene'] };
      return { out, next, problems: problemsOf(report) };
    };

    try {
      let got = await attempt();
      if (got.problems) {
        const first = got;
        const firstProblems = got.problems;
        params.onProgress?.(
          done,
          targets.length,
          `Polishing hero scene ${done}/${targets.length}`,
        );
        try {
          got = await attempt({
            html: first.out.html,
            css: first.out.css,
            script: first.out.script,
            problems: firstProblems.text,
          });
        } catch (err) {
          if (isAbortError(err) || signal?.aborted) throw err;
          got = first;
        }
        if (got.problems?.broken && !firstProblems.broken) got = first;
      }
      if (!got.problems?.broken) {
        nextScenes[idx] = { ...got.next, layout: baseScene.layout };
      }
    } catch (err) {
      if (isAbortError(err) || signal?.aborted) throw err;
      console.warn('Hero reel scene composition failed; keeping template fallback:', err);
    }
  }

  return { ...plan, scenes: nextScenes };
}
