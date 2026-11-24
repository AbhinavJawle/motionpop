import {
  applyReelCompose,
  applyReelNote,
  applyReelNoteLocal,
  reelComposeTask,
  reelNoteContext,
  reelNoteInput,
  reelNoteLocalInput,
  runReelNote,
  runReelNoteLocal,
  type ReelComposeInput,
  type ReelComposeOutput,
  type ReelNoteContext,
  type Router,
} from '@motionpop/ai';
import { KIT_DOC, REEL_STAGE_EXAMPLES, criticText, lintCustom } from '@motionpop/motion';
import {
  inspectCustomScene,
  reelCustomScene,
  type CustomReport,
  type ReelCustomAssets,
  type ReelCustomScene,
  type ReelImage,
} from '@motionpop/motion/reel';
import {
  APP_CONFIG_DEFAULTS,
  REEL_CUSTOM_BUDGET,
  REEL_CUSTOM_LIMITS,
  reelCustomSize,
  reelMediaOf,
  reelSceneData,
  type AppConfig,
  type ImageAsset,
  type ReelLook,
  type ReelMedia,
  type ReelPlan,
  type ReelScene,
} from '@motionpop/schemas';
import type { Route } from '@/lib/ai/route';
import { composite, fixReelScene, setReel, setReelNoteStatus } from '@/lib/commands';
import { newSpendKey, type CreditsClient } from '@/lib/credits/client';
import { spendWithUi } from '@/lib/credits/spend-with-ui';
import { cropRect, regionOf, type Region } from '@/lib/notes/geometry';
import { jpegBase64 } from '@/lib/notes/note-fix';
import type { EditorStore } from '@/lib/stores/editor';
import type { ReelTarget } from './note-look';

/**
 * Frame note → `reel.note` (spec 29 R4, spec 30): the strong model in the cloud, 1 credit reserved
 * first and returned whenever nothing is applied. When the note needs a new motion graphic, the
 * scene's graphic is written by `reel.compose` (the custom price, reserved before that call), built
 * and reviewed in a sandbox, repaired once when the review finds problems, and only then applied.
 * The fix is one undo step (the scene, the hook, the caption words and the note's status).
 * Pictures the fix asks for are fetched afterwards and land as a second step, so the edit shows at
 * once.
 */
export type ReelNoteOutcome =
  | {
      kind: 'applied';
      ms: number;
      ranOn: 'device' | 'cloud';
      message: string;
      pictures: number;
      /** True when the fix wrote a new motion graphic. */
      composed?: boolean;
    }
  | { kind: 'escalate'; message: string }
  | { kind: 'device-failed' }
  | { kind: 'cloud-failed' }
  | { kind: 'changed' }
  | { kind: 'blocked'; reason: string }
  | { kind: 'no-credits' };

export interface ReelNoteFixDeps {
  store: EditorStore;
  credits: CreditsClient | null;
  getRouter: () => Promise<Router | null>;
  /** What the preview shows under the note's region and a JPEG of the crop, when it can. */
  look: (
    region: Region,
    crop: Region,
    sceneId: string,
  ) => Promise<{ target: ReelTarget; image?: string }>;
  /** Fetches the pictures a one-scene plan asks for (`resolveReelMedia`). */
  fetchMedia?: (
    plan: ReelPlan,
    look: ReelLook,
  ) => Promise<{ plan: ReelPlan; assets: ImageAsset[] }>;
  config?: Pick<AppConfig, 'creditCosts' | 'imageCredits' | 'exportCredits'>;
  newKey?: () => string;
  /** Called when the pictures of an applied fix have landed (or failed). */
  /** How many pictures landed; null when the scene changed meanwhile (nothing to report). */
  onPictures?: (landed: number | null) => void;
  /** The runtime of AI-written scenes, for the review before a new graphic lands (spec 30). */
  customAssets?: () => Promise<ReelCustomAssets | null>;
  /** Stored pictures as data URLs, for the review (`customPictures`). */
  customPictures?: (ids: string[]) => Promise<Record<string, ReelImage>>;
  /** Builds a new graphic in a sandbox and reviews it (defaults to `inspectCustomScene` here). */
  inspect?: (
    scene: Omit<ReelCustomScene, 'token'>,
    assets: ReelCustomAssets,
    allowNumbers: string[],
  ) => Promise<CustomReport>;
  /** Optional cloud fallback route when `route` is on-device and `autoEscalate` is enabled. */
  cloudRoute?: Route;
  /**
   * When true (e.g. Pip's already-approved `editScene` step), an on-device escalation or failure
   * automatically continues to cloud Gemini. Direct frame notes leave this false so a mint
   * `⚡ free · on-device` chip never silently spends credits (spec 09 D-035).
   */
  autoEscalate?: boolean;
  /** The steps of a fix that writes a new graphic, for the UI. */
  onStage?: (stage: 'compose' | 'check' | 'repair') => void;
}

const TOO_MANY = 'This reel holds too many new graphics. Undo one first.';

const sceneJson = (s: ReelScene | undefined) => (s ? JSON.stringify(reelSceneData(s)) : '');

export async function runReelNoteFix(
  deps: ReelNoteFixDeps,
  sceneId: string,
  noteId: string,
  route: Route,
): Promise<ReelNoteOutcome> {
  if (route.kind === 'disabled') return { kind: 'blocked', reason: route.reason };
  if (route.kind !== 'cloud' && route.kind !== 'device')
    return { kind: 'blocked', reason: 'Needs cloud AI' };
  const project = deps.store.getState().project;
  const reel = project?.reel;
  const index = reel?.scenes.findIndex((s) => s.id === sceneId) ?? -1;
  const scene = reel?.scenes[index];
  const note = scene?.notes?.find((n) => n.id === noteId);
  if (!project || !reel || !scene || !note) return { kind: 'changed' };
  const text = note.text.trim();
  if (text === '') return { kind: 'blocked', reason: 'Type what to change' };

  // Read the preview at the note's own frame, before any wait: paused, on the note's time (a
  // press of Space or a scrub during the spend would otherwise show the model another frame).
  const state = deps.store.getState();
  if (state.playing) state.setPlaying(false);
  const noteMs = scene.startMs + note.tMs;
  if (Math.abs(state.playheadMs - noteMs) > 40) state.setPlayhead(noteMs);
  // The reel is always 9:16.
  const region = regionOf(note.shape, 9 / 16);
  const seen: { target: ReelTarget; image?: string | undefined } = await Promise.resolve()
    .then(() => deps.look(region, cropRect(region), sceneId))
    .catch(() => ({ target: { parts: [], texts: [], pictures: [] } }));

  const words = project.transcript.words.map((w) => ({
    text: w.text,
    startMs: w.startMs,
    endMs: w.endMs,
  }));
  const ctx = reelNoteContext(scene, words, reel.look);
  const showsHook = index === 0 && reel.hook !== undefined && reel.look === 'mono';
  const image = jpegBase64(seen.image);
  const stale = () => {
    const nowReel = deps.store.getState().project?.reel;
    const nowScene = nowReel?.scenes.find((s) => s.id === sceneId);
    const nowNote = nowScene?.notes?.find((n) => n.id === noteId);
    return (
      !nowReel ||
      !nowScene ||
      !nowNote ||
      nowNote.status !== 'open' ||
      sceneJson(nowScene) !== sceneJson(scene) ||
      nowReel.hook !== reel.hook ||
      nowReel.look !== reel.look
    );
  };

  // Hybrid AI fast path: try multimodal on-device Gemini Nano first (0 credits, works offline).
  // Direct frame notes never silently charge credits (D-035): when Nano escalates or fails, the
  // bubble surfaces the reason + one-click "Try in the cloud". Callers with pre-approved credit
  // spend (Pip's `editScene` plan step) pass `autoEscalate: true` to seamlessly continue to cloud.
  if (route.kind === 'device') {
    const canAutoEscalate =
      Boolean(deps.autoEscalate) && deps.cloudRoute?.kind === 'cloud' && Boolean(deps.credits);
    const router = await deps.getRouter().catch(() => null);
    if (!router) {
      if (!canAutoEscalate) return { kind: 'device-failed' };
    } else {
      let escalateMessage: string | null = null;
      let threw = false;
      try {
        const localInput = reelNoteLocalInput(ctx, {
          noteText: text,
          caption: seen.target.caption,
          hook: showsHook ? reel.hook : undefined,
          image,
        });
        const localRes = await runReelNoteLocal(router, localInput);
        if (stale()) return { kind: 'changed' };
        const applied = applyReelNoteLocal(ctx, localRes.output, {
          hook: showsHook ? reel.hook : undefined,
        });
        if (applied.changed && !applied.escalate) {
          const ok = deps.store.getState().exec(
            composite('Fix note', [
              fixReelScene(sceneId, {
                scene: applied.scene,
                ...(applied.hook !== undefined ? { hook: applied.hook } : {}),
                ...(applied.captions.length ? { captions: applied.captions } : {}),
              }),
              setReelNoteStatus(sceneId, noteId, 'fixed'),
            ]),
          );
          if (ok) {
            return {
              kind: 'applied',
              ms: localRes.latencyMs,
              ranOn: 'device',
              message: applied.message,
              pictures: 0,
            };
          }
        }
        escalateMessage =
          applied.message || 'Needs cloud AI for a full graphic rewrite or custom animation.';
      } catch {
        threw = true;
      }
      if (!canAutoEscalate) {
        if (threw) return { kind: 'device-failed' };
        return {
          kind: 'escalate',
          message:
            escalateMessage ||
            'Needs cloud AI for a full graphic rewrite or custom animation.',
        };
      }
    }
  }

  if (!deps.credits) return { kind: 'blocked', reason: 'Sign in to use cloud AI' };

  const spent = await spendWithUi(
    deps.credits,
    { action: 'edit', key: (deps.newKey ?? newSpendKey)(), refId: sceneId },
    deps.config ?? APP_CONFIG_DEFAULTS,
  );
  if (spent === null) return { kind: 'no-credits' };
  if (!spent.ok) {
    return spent.reason === 'insufficient'
      ? { kind: 'no-credits' }
      : { kind: 'blocked', reason: 'Couldn’t reserve the credit' };
  }
  const txId = spent.txId;
  const credits = deps.credits;
  const refund = async () => {
    await credits.refund(txId).catch(() => undefined);
  };
  const failed = (): ReelNoteOutcome => ({ kind: 'cloud-failed' });

  // Every path below refunds by hand before it returns; this catches what throws in between
  // (a scene the context can't describe, an unexpected note shape) so the credit never sticks.
  let charged = false;
  // The new graphic's own spend, once it exists: refunded with the note's if anything throws.
  const composedSpend: { refund?: () => Promise<void> } = {};
  const fixAfterSpend = async (): Promise<ReelNoteOutcome> => {
    const router = await deps.getRouter().catch(() => null);
    if (!router) {
      await refund();
      return failed();
    }

    let input;
    try {
      input = reelNoteInput(ctx, {
        sceneIndex: index,
        sceneCount: reel.scenes.length,
        note: { text: text.slice(0, 300), region },
        target: seen.target,
        caption: seen.target.caption,
        hook: showsHook ? reel.hook : undefined,
        image,
      });
    } catch {
      await refund();
      return failed();
    }

    let res;
    try {
      res = await runReelNote(router, input);
    } catch {
      await refund();
      return failed();
    }

    // The scene or the note moved on while the model worked: never overwrite what the user did.
    if (stale()) {
      await refund();
      return { kind: 'changed' };
    }

    let result;
    try {
      result = applyReelNote(ctx, res.output, { hook: showsHook ? reel.hook : undefined });
    } catch {
      await refund();
      return failed();
    }
    if (result.compose) {
      if (!result.compose.brief) {
        await refund();
        return failed();
      }
      // Room for one more graphic of the largest size? Ask before spending on it.
      const others = reelCustomSize({ scenes: reel.scenes.filter((s) => s.id !== sceneId) });
      const largest = REEL_CUSTOM_LIMITS.html + REEL_CUSTOM_LIMITS.css + REEL_CUSTOM_LIMITS.script;
      if (others + largest > REEL_CUSTOM_BUDGET) {
        await refund();
        return { kind: 'blocked', reason: TOO_MANY };
      }
      const composed = await composeScene(deps, {
        ctx,
        router,
        note: text,
        brief: result.compose.brief,
        layout: result.compose.layout,
        image,
        sceneId,
      });
      if (composed.kind !== 'ok') {
        await refund();
        return composed.outcome;
      }
      composedSpend.refund = composed.refund;
      if (stale()) {
        await composed.refund();
        await refund();
        return { kind: 'changed' };
      }
      const nextReel = deps.store.getState().project?.reel;
      const size = nextReel
        ? reelCustomSize({
            scenes: nextReel.scenes.map((s) => (s.id === sceneId ? composed.scene : s)),
          })
        : 0;
      if (size > REEL_CUSTOM_BUDGET) {
        await composed.refund();
        await refund();
        return { kind: 'blocked', reason: TOO_MANY };
      }
      const ok = deps.store
        .getState()
        .exec(
          composite('Fix note', [
            fixReelScene(sceneId, { scene: composed.scene }),
            setReelNoteStatus(sceneId, noteId, 'fixed'),
          ]),
        );
      if (!ok) {
        await composed.refund();
        await refund();
        return failed();
      }
      charged = true;
      const wanted = reelMediaOf({ scenes: [composed.scene] }).filter((m) => !m.asset);
      if (wanted.length && deps.fetchMedia) {
        void fetchPictures(deps, sceneId, composed.scene).then((n) => deps.onPictures?.(n));
      }
      return {
        kind: 'applied',
        ms: res.latencyMs + composed.ms,
        ranOn: 'cloud',
        message: composed.message || result.message,
        pictures: wanted.length,
        composed: true,
      };
    }
    if (!result.changed) {
      await refund();
      return {
        kind: 'escalate',
        message: result.message || 'Pip couldn’t change that here. Try saying it another way.',
      };
    }

    const ok = deps.store.getState().exec(
      composite('Fix note', [
        fixReelScene(sceneId, {
          scene: result.scene,
          ...(result.hook !== undefined ? { hook: result.hook } : {}),
          ...(result.captions.length ? { captions: result.captions } : {}),
        }),
        setReelNoteStatus(sceneId, noteId, 'fixed'),
      ]),
    );
    if (!ok) {
      await refund();
      return failed();
    }
    charged = true;

    // New pictures (a different logo, a new subject) are fetched now and land as a second step.
    const wanted = reelMediaOf({ scenes: [result.scene] }).filter((m) => !m.asset);
    if (wanted.length && deps.fetchMedia) {
      void fetchPictures(deps, sceneId, result.scene).then((n) => deps.onPictures?.(n));
    }
    const ranOn = 'cloud' as const;
    return {
      kind: 'applied',
      ms: res.latencyMs,
      ranOn,
      message: result.message,
      pictures: wanted.length,
    };
  };
  try {
    return await fixAfterSpend();
  } catch {
    if (!charged) {
      await composedSpend.refund?.();
      await refund();
    }
    return failed();
  }
}

/** Fetches the fix's new pictures and sets them on the scene, if the scene is still as fixed. */
async function fetchPictures(
  deps: ReelNoteFixDeps,
  sceneId: string,
  fixed: ReelScene,
): Promise<number | null> {
  const reel = deps.store.getState().project?.reel;
  if (!reel || !deps.fetchMedia) return 0;
  try {
    const mini: ReelPlan = { ...reel, scenes: [fixed] };
    const got = await deps.fetchMedia(mini, reel.look);
    const nowReel = deps.store.getState().project?.reel;
    const nowScene = nowReel?.scenes.find((s) => s.id === sceneId);
    // Only onto the scene as the fix left it (the user may have undone or edited it since).
    if (!nowReel || !nowScene || sceneJson(nowScene) !== sceneJson(fixed)) return null;
    const withPics = got.plan.scenes[0];
    if (!withPics || got.assets.length === 0) return 0;
    const next: ReelPlan = {
      ...nowReel,
      scenes: nowReel.scenes.map((s) =>
        s.id === sceneId ? { ...withPics, ...(s.notes ? { notes: s.notes } : {}) } : s,
      ),
    };
    const landed = reelMediaOf({ scenes: [withPics] }).filter((m) => m.asset).length;
    deps.store.getState().exec(setReel(next, 'Add the picture', got.assets));
    return landed;
  } catch {
    return 0;
  }
}

// ----- a new motion graphic for the scene (spec 30) ------------------------------------------------

type Composed =
  | { kind: 'ok'; scene: ReelScene; message: string; ms: number; refund: () => Promise<void> }
  | { kind: 'fail'; outcome: ReelNoteOutcome };

/** What a stored picture shows, in a few words, for the model. */
function shows(m: ReelMedia): string {
  if (m.kind === 'logo') return `the ${m.query.split('|')[0]?.trim() || 'brand'} logo`;
  return `${m.kind === 'photo' ? 'a photo' : m.kind === 'screenshot' ? 'a screenshot' : 'an illustration'} of ${m.query}`;
}

/** Figures the new graphic may show (the critic reports any other number), as plain digits. */
function numbersIn(...texts: string[]): string[] {
  const out = new Set<string>();
  for (const t of texts)
    for (const m of t.matchAll(/\d[\d,.]*/g)) out.add(m[0].replace(/[,.]+$/, '').replace(/,/g, ''));
  return [...out];
}

/** The review's problems as one repair message, or null when the graphic is fine. */
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

async function composeScene(
  deps: ReelNoteFixDeps,
  p: {
    ctx: ReelNoteContext;
    router: Router;
    note: string;
    brief: string;
    layout: ReelScene['layout'];
    image: string | undefined;
    sceneId: string;
  },
): Promise<Composed> {
  const failed: Composed = { kind: 'fail', outcome: { kind: 'cloud-failed' } };
  const { scene, look, words } = p.ctx;
  if (!deps.credits)
    return { kind: 'fail', outcome: { kind: 'blocked', reason: 'Sign in to use cloud AI' } };
  const assets = await (deps.customAssets?.() ?? Promise.resolve(null)).catch(() => null);
  if (!assets) return failed;

  // The pictures the code may show: a custom scene's own list, or the template's fetched ones.
  const pictures: ReelMedia[] =
    scene.content.template === 'custom'
      ? [...(scene.content.media ?? [])]
      : reelMediaOf({ scenes: [scene] })
          .filter((m) => m.asset)
          .slice(0, 6);
  const target: ReelScene = { ...scene, layout: p.layout };
  const theme = deps.store.getState().project?.reel?.theme;
  const probe = reelCustomScene({
    look,
    theme,
    scene: {
      ...target,
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
  if (!probe) return failed;

  const spent = await spendWithUi(
    deps.credits,
    { action: 'custom', key: (deps.newKey ?? newSpendKey)(), refId: p.sceneId },
    deps.config ?? APP_CONFIG_DEFAULTS,
  );
  if (spent === null) return { kind: 'fail', outcome: { kind: 'no-credits' } };
  if (!spent.ok) {
    return {
      kind: 'fail',
      outcome:
        spent.reason === 'insufficient'
          ? { kind: 'no-credits' }
          : { kind: 'blocked', reason: 'Couldn’t reserve the credits' },
    };
  }
  const credits = deps.credits;
  const txId = spent.txId;
  const refund = async () => {
    await credits.refund(txId).catch(() => undefined);
  };

  const composeAfterSpend = async (): Promise<Composed> => {
    const c = scene.content;
    const input: ReelComposeInput = {
      note: p.note.slice(0, 300),
      brief: p.brief,
      look,
      layout: p.layout,
      area: { w: probe.width, h: probe.height },
      palette: {
        bg: probe.palette.bg,
        ink: probe.palette.ink,
        muted: probe.palette.muted,
        accent: probe.palette.accent,
        link: probe.palette.link,
      },
      durationMs: Math.max(300, probe.durationMs),
      // The reel pins the tag over the graphic (mono, graphic layouts).
      ...(scene.tag && look === 'mono' && p.layout !== 'speaker'
        ? { tag: scene.tag.slice(0, 60) }
        : {}),
      words: probe.words
        .slice(0, 240)
        .map((w) => ({ text: w.text.slice(0, 60), startMs: w.startMs })),
      current:
        c.template === 'custom'
          ? {
              kind: 'custom',
              title: c.title,
              brief: c.brief,
              html: c.html,
              css: c.css,
              script: c.script,
            }
          : { kind: 'template', graphic: p.ctx.graphic as Record<string, unknown> },
      // Ids stay positional (m<i> is media[i]); a picture not fetched yet is flagged as such.
      pictures: pictures.map((m, i) => ({
        id: `m${i}`,
        shows: (m.asset ? shows(m) : `${shows(m).slice(0, 90)} (not fetched: avoid)`).slice(0, 120),
      })),
      example:
        p.layout === 'speaker'
          ? REEL_STAGE_EXAMPLES['clean-cta']
          : REEL_STAGE_EXAMPLES['split-inspector'],
      ...(p.image ? { image: p.image } : {}),
    };
    const task = reelComposeTask(lintCustom, KIT_DOC);
    const inspect =
      deps.inspect ??
      ((sc: Omit<ReelCustomScene, 'token'>, a: ReelCustomAssets, allow: string[]) =>
        inspectCustomScene({ doc: document, scene: sc, assets: a, allowNumbers: allow }));
    const pics = await (
      deps.customPictures?.(pictures.flatMap((m) => (m.asset ? [m.asset] : []))) ??
      Promise.resolve({})
    ).catch(() => ({}));
    const allow = numbersIn(
      p.note,
      p.brief,
      probe.words.map((w) => w.text).join(' '),
      JSON.stringify(input.current),
    );

    let ms = 0;
    const attempt = async (fix?: ReelComposeInput['fix']) => {
      deps.onStage?.(fix ? 'repair' : 'compose');
      const run = await p.router.run(task, fix ? { ...input, fix } : input, {
        mode: 'ONLY_IN_CLOUD',
        allowCloud: false,
      });
      ms += run.latencyMs;
      const out: ReelComposeOutput = run.output;
      const next = applyReelCompose(target, look, out, pictures);
      deps.onStage?.('check');
      const sc = reelCustomScene({ look, theme, scene: next, words, pictures: pics });
      const report = sc
        ? await inspect(sc, assets, allow)
        : { summary: null, errors: ['no scene'] };
      return { out, next, problems: problemsOf(report) };
    };

    let got = await attempt();
    if (got.problems) {
      const first = got;
      try {
        got = await attempt({
          html: first.out.html,
          css: first.out.css,
          script: first.out.script,
          problems: first.problems!.text,
        });
      } catch {
        got = first;
      }
      // A repair that broke a graphic which only had layout notes: keep the first one.
      if (got.problems?.broken && !first.problems!.broken) got = first;
      // Layout notes that survive the repair don't block; a graphic that fails to build does.
      if (got.problems?.broken) {
        await refund();
        return failed;
      }
    }
    return { kind: 'ok', scene: got.next, message: got.out.message, ms, refund };
  };
  try {
    return await composeAfterSpend();
  } catch {
    await refund();
    return failed;
  }
}
