import {
  FilmCancelled,
  beatWords,
  makeFilm,
  rebuildBeat,
  type FilmBeatResult,
  type FilmProgress,
  type FilmResult,
  type Router,
} from '@motionpop/ai';
import {
  KIT_DOC,
  archetypeExample,
  customParams,
  kitExample,
  lintCustom,
  lintProp,
  videoStageZoneGuide,
  type ImageRef,
} from '@motionpop/motion';
import {
  APP_CONFIG_DEFAULTS,
  FILM_MAX_MS,
  costOf,
  filmUnits,
  isMediaStageMode,
  spokenNumbers,
  stagesFromTimedBeats,
  type AppConfig,
  type EditorProject,
  type ImageAsset,
  type MediaClip,
  type ProjectFilm,
  type Slot,
  type Version,
  type VideoStageSegment,
} from '@motionpop/schemas';
import { produce } from 'immer';
import type { Route } from '@/lib/ai/route';
import { appAudioStore } from '@/lib/audio/app-audio-store';
import { CommandRejected, type Command } from '@/lib/commands';
import { loadCompositionAssets } from '@/lib/composition/assets';
import { styleFor } from '@/lib/composition/project-to-compile';
import { newSpendKey, type CreditsClient } from '@/lib/credits/client';
import { spendWithUi } from '@/lib/credits/spend-with-ui';
import { newVersion } from '@/lib/slots/new-version';
import type { EditorStore } from '@/lib/stores/editor';
import { draftedSlotForWords } from '@/lib/timeline/add-graphic';
import { timelineIssues } from '@/lib/timeline/invariants';
import { probeAndSampleVideo } from '@/lib/video/frames';
import { indexUnindexedMediaClips } from '@/lib/video/media-bin';
import { fetchStockMediaClip, generateReelImageAsset } from '@/lib/video/stock-media';
import { inspectInSandbox } from './sandbox-critic';
import { runVisionQaPass } from './vision-qa';

/**
 * Film mode in the editor (spec 07b R5, R6). One credited action for the whole video: the cloud
 * writes a storyboard and every beat, a sandboxed critic checks each one, and the result replaces
 * the video's graphics as one undo step. A beat that couldn't be built gets the quick-mode scene
 * for its words, so the film never has a hole. Nothing is applied, and the credits come back,
 * when no beat came out.
 */
export const COULDNT_FILM = 'Couldn’t make the film. Your graphics are unchanged.';
export const FILM_TOO_LONG = 'Films are for voiceovers up to 3 minutes';

export type FilmOutcome = 'ready' | 'failed' | 'no-credits' | 'blocked' | 'cancelled';
export interface FilmRunResult {
  outcome: FilmOutcome;
  reason?: string;
  ms?: number;
  /** Beats the cloud built, and beats that fell back to a quick-mode scene. */
  built?: number;
  fallbacks?: number;
}

export interface FilmDeps {
  store: EditorStore;
  credits: CreditsClient | null;
  getRouter: () => Promise<Router | null>;
  config?: Pick<AppConfig, 'creditCosts' | 'imageCredits' | 'exportCredits'>;
  doc?: Document;
  now?: () => number;
  newKey?: () => string;
  onProgress?: (e: FilmProgress) => void;
  cancelled?: () => boolean;
  /** The critic; the sandbox by default. Tests pass a stub. */
  inspect?: Parameters<typeof makeFilm>[1]['inspect'];
  /** The model the film was made with, for the version records. */
  model?: string;
}

/** Why a film can't be made for this project right now, or null. */
export function filmBlockedReason(project: EditorProject | null): string | null {
  if (!project) return 'Open a project first';
  if (project.transcript.words.length < 3) return 'Needs a voiceover with words';
  if (project.durationMs > FILM_MAX_MS) return FILM_TOO_LONG;
  return null;
}

/** Credits for a film of this project (the chip and the charge both read this). */
export function filmCost(
  project: Pick<EditorProject, 'durationMs'>,
  cfg: Pick<AppConfig, 'creditCosts' | 'imageCredits' | 'exportCredits'> = APP_CONFIG_DEFAULTS,
): number {
  return costOf('film', filmUnits(project.durationMs), cfg);
}

const said = (project: EditorProject, a: number, b: number): string =>
  project.transcript.words
    .slice(a, b + 1)
    .map((w) => w.text)
    .join(' ')
    .replace(/[.,!?;:]+$/, '');

/**
 * The film's beats as slots and versions (pure). A built beat is a `custom` slot; a failed one is
 * the quick-mode draft for the same words, when one can be drafted.
 */
export function filmSlots(
  project: EditorProject,
  film: FilmResult,
  o: { now: number; id: (i: number) => string; model?: string; doc?: Document },
): { slots: Slot[]; versions: Version[]; built: number; fallbacks: number } {
  const empty: EditorProject = { ...project, slots: [] };
  const slots: Slot[] = [];
  const versions: Version[] = [];
  let built = 0;
  let fallbacks = 0;
  film.beats.forEach((b: FilmBeatResult, i) => {
    const id = o.id(i);
    const parsed = b.params ? customParams.safeParse(b.params) : null;
    if (parsed?.success && lintCustom(parsed.data).length === 0) {
      const params = parsed.data as unknown as Record<string, unknown>;
      const version = newVersion({
        slotId: id,
        componentId: 'custom',
        params,
        source: 'ai-cloud',
        model: o.model,
        label: 'Film',
        now: o.now,
      });
      slots.push({
        id,
        startMs: b.beat.startMs,
        endMs: b.beat.endMs,
        wordStart: b.beat.wordStart,
        wordEnd: b.beat.wordEnd,
        reason: `You said '${said(project, b.beat.wordStart, b.beat.wordEnd)}'`,
        componentId: 'custom',
        skillId: 'film',
        prompt: b.beat.idea.slice(0, 500),
        params,
        status: 'ready',
        notes: [],
        currentVersionId: version.id,
        ...(b.beat.videoStage ? { videoStage: b.beat.videoStage } : {}),
        ...(b.beat.archetype ? { archetype: b.beat.archetype } : {}),
        ...(b.beat.clipId ? { clipId: b.beat.clipId } : {}),
        ...(b.beat.clipStartMs !== undefined ? { clipStartMs: b.beat.clipStartMs } : {}),
        ...(b.beat.clipEndMs !== undefined ? { clipEndMs: b.beat.clipEndMs } : {}),
        ...(b.beat.clipFocusX !== undefined ? { clipFocusX: b.beat.clipFocusX } : {}),
        ...(b.beat.clipFocusY !== undefined ? { clipFocusY: b.beat.clipFocusY } : {}),
        ...(b.beat.clipZoom !== undefined ? { clipZoom: b.beat.clipZoom } : {}),
        ...(project.video
          ? { placement: b.beat.videoStage === 'cutaway' ? 'cutaway' : 'overlay' }
          : {}),
      });
      versions.push(version);
      built++;
      return;
    }
    // Quick mode for this stretch: drafted from its own words, inside the beat's span.
    const draft = draftedSlotForWords(
      { ...empty, slots: [...slots] },
      b.beat.wordStart,
      b.beat.wordEnd,
      id,
      o.doc,
    );
    if (draft && draft.status === 'ready' && draft.startMs >= b.beat.startMs) {
      slots.push({ ...draft, endMs: Math.min(draft.endMs, b.beat.endMs) });
      fallbacks++;
    }
  });
  return { slots, versions, built, fallbacks };
}

/**
 * Replaces the video's graphics with the film's, as one undo step: the slots, the new versions
 * and the saved storyboard. Undo brings back exactly what was there.
 */
export function applyFilm(input: {
  slots: Slot[];
  versions: Version[];
  film: ProjectFilm;
  videoStages?: VideoStageSegment[];
  mediaBin?: MediaClip[];
  assets?: ImageAsset[];
}): Command {
  let before:
    | (Pick<EditorProject, 'slots' | 'versions' | 'film'> & {
        videoStages?: VideoStageSegment[];
        mediaBin?: MediaClip[];
        assets?: ImageAsset[];
      })
    | undefined;
  return {
    label: 'Make it a film',
    do(p) {
      const next = produce(p, (d) => {
        d.slots = structuredClone(input.slots);
        d.versions.push(...structuredClone(input.versions));
        d.film = structuredClone(input.film);
        if (d.video && input.videoStages) {
          d.video.stages = structuredClone(input.videoStages);
        }
        if (input.mediaBin) {
          d.mediaBin = structuredClone(input.mediaBin);
        }
        if (input.assets?.length) {
          const existing = d.assets ?? [];
          const seen = new Set(existing.map((a) => a.id));
          d.assets = [...existing, ...structuredClone(input.assets.filter((a) => !seen.has(a.id)))].slice(0, 60);
        }
      });
      const issue = timelineIssues(next)[0];
      if (issue) throw new CommandRejected(issue);
      before = {
        slots: p.slots,
        versions: p.versions,
        ...(p.film ? { film: p.film } : {}),
        ...(p.video?.stages ? { videoStages: p.video.stages } : {}),
        ...(p.mediaBin ? { mediaBin: p.mediaBin } : {}),
        ...(p.assets ? { assets: p.assets } : {}),
      };
      return next;
    },
    undo(p) {
      const prev = before;
      if (!prev) return p;
      return produce(p, (d) => {
        d.slots = prev.slots as typeof d.slots;
        d.versions = prev.versions as typeof d.versions;
        if (prev.film) d.film = prev.film as typeof d.film;
        else delete d.film;
        if (d.video) {
          if (prev.videoStages) d.video.stages = prev.videoStages as typeof d.video.stages;
          else delete d.video.stages;
        }
        if (prev.mediaBin) d.mediaBin = prev.mediaBin as typeof d.mediaBin;
        else delete d.mediaBin;
        if (prev.assets) d.assets = prev.assets as typeof d.assets;
        else delete d.assets;
      });
    },
  };
}

export async function makeFilmForProject(deps: FilmDeps, route: Route): Promise<FilmRunResult> {
  const { store } = deps;
  const now = deps.now ?? Date.now;
  if (route.kind === 'disabled') return { outcome: 'blocked', reason: route.reason };
  if (route.kind !== 'cloud') return { outcome: 'blocked', reason: 'Needs cloud AI' };
  const project = store.getState().project;
  const blocked = filmBlockedReason(project);
  if (!project || blocked) return { outcome: 'blocked', reason: blocked ?? 'Open a project first' };
  if (!deps.credits) return { outcome: 'blocked', reason: 'Sign in to use cloud AI' };

  const cfg = deps.config ?? APP_CONFIG_DEFAULTS;
  const started = now();
  let txId: string | null = null;
  const refund = async () => {
    const id = txId;
    txId = null;
    if (id && deps.credits) await deps.credits.refund(id);
  };
  try {
    const spent = await spendWithUi(
      deps.credits,
      {
        action: 'film',
        units: filmUnits(project.durationMs),
        key: (deps.newKey ?? newSpendKey)(),
        refId: project.id,
      },
      cfg,
    );
    if (spent === null) return { outcome: 'no-credits' };
    if (!spent.ok)
      return spent.reason === 'insufficient'
        ? { outcome: 'no-credits' }
        : { outcome: 'blocked', reason: 'Couldn’t reserve the credits' };
    txId = spent.txId;

    const [router, assets] = await Promise.all([
      deps.getRouter().catch(() => null),
      deps.inspect ? Promise.resolve(null) : loadCompositionAssets().catch(() => null),
    ]);
    if (!router) {
      await refund();
      return { outcome: 'failed', reason: COULDNT_FILM };
    }
    const style = styleFor(project);
    const words = project.transcript.words.map((w) => ({
      text: w.text,
      startMs: w.startMs,
      endMs: w.endMs,
    }));
    const allowNumbers = [...spokenNumbers(words)];
    const hasVideo = Boolean(project.video);
    const stressedWords = project.transcript.prosody?.stress
      ? project.transcript.prosody.stress
          .map((score, idx) => (score >= 65 ? idx : -1))
          .filter((idx) => idx >= 0)
          .slice(0, 40)
      : [];

    // Sample speaker keyframes + auto-index any unindexed Media Bin clips IN PARALLEL (Spec 20/22)
    // so Gemini 4 Neon gets both A-roll framing and B-roll/screen/screenshot understanding faster.
    const framesPromise = (async (): Promise<
      { timeMs: number; mimeType: 'image/jpeg' | 'image/png'; base64: string }[]
    > => {
      if (!hasVideo || !project.video || typeof window === 'undefined') return [];
      try {
        const blob = await appAudioStore().get(project.video.src);
        if (!blob) return [];
        const probe = await probeAndSampleVideo(blob, 3);
        return probe.frames.map((f) => ({
          timeMs: f.atMs,
          mimeType: 'image/jpeg' as const,
          base64: f.base64,
        }));
      } catch {
        return [];
      }
    })();

    const mediaBinPromise = project.mediaBin?.length
      ? indexUnindexedMediaClips(project.mediaBin, router, {
          now,
        }).catch(() => null)
      : Promise.resolve(null);

    const [frames, idxRes] = await Promise.all([framesPromise, mediaBinPromise]);
    let indexedMediaBin: MediaClip[] | undefined = project.mediaBin;
    let mediaBinUpdated = false;
    if (idxRes && idxRes.indexedCount > 0) {
      indexedMediaBin = idxRes.clips;
      mediaBinUpdated = true;
    }
    const directMediaBin = (indexedMediaBin ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      ...(c.durationMs !== undefined ? { durationMs: c.durationMs } : {}),
      summary: c.summary ?? c.name,
      tags: c.tags ?? [],
      moments: (c.moments ?? []).slice(0, 6),
    }));

    const executedSnapshots: Record<string, string> = {};
    const generatedAssets: ImageAsset[] = [];
    const inlineImages: Record<string, ImageRef> = {};

    const resolveBeatMedia: Parameters<typeof makeFilm>[1]['resolveBeatMedia'] =
      typeof window !== 'undefined' && !deps.inspect && hasVideo
        ? async (board) => {
            const nextBeats = [...board.beats];
            const beatImages: Record<string, { id: string; subject: string; keyed: boolean }> = {};

            // 1. Auto-fetch up to 2 external stock B-roll clips/photos (Pexels + Wikimedia Commons).
            const stockTargets = nextBeats
              .map((b, idx) => ({ b, idx }))
              .filter(({ b }) => Boolean(b.brollQuery) && !b.clipId)
              .slice(0, 2);

            await Promise.all(
              stockTargets.map(async ({ b, idx }) => {
                if (!b.brollQuery) return;
                const clip = await fetchStockMediaClip(b.brollQuery, {
                  format: project.format,
                  preferVideo: true,
                });
                if (!clip) return;
                indexedMediaBin = [...(indexedMediaBin ?? []), clip];
                mediaBinUpdated = true;
                const nextStage =
                  b.videoStage && isMediaStageMode(b.videoStage)
                    ? b.videoStage
                    : clip.kind === 'broll'
                      ? ('split-top-broll' as const)
                      : ('media-card-pop' as const);
                nextBeats[idx] = {
                  ...b,
                  videoStage: nextStage,
                  clipId: clip.id,
                  clipStartMs: 0,
                  clipFocusX: 0.5,
                  clipFocusY: 0.45,
                  clipZoom: 1.06,
                };
              }),
            );

            // 2. Generate up to 2 studio-lit AI cutouts / editorial visuals sequentially (avoids 429).
            const imageTargets = nextBeats
              .filter((b) => Boolean(b.imageSubject) && !b.clipId)
              .slice(0, 2);
            for (const b of imageTargets) {
              if (!b.imageSubject || deps.cancelled?.()) break;
              const made = await generateReelImageAsset(b.imageSubject, style, {
                keyed: b.imageKeyed !== false,
                now,
              });
              if (!made) continue;
              generatedAssets.push(made.asset);
              inlineImages[made.asset.id] = {
                src: made.dataUrl,
                width: made.asset.width ?? 1024,
                height: made.asset.height ?? 1024,
                keyed: made.asset.keyed,
              };
              beatImages[b.id] = {
                id: made.asset.id,
                subject: made.asset.subject,
                keyed: made.asset.keyed,
              };
            }

            return { board: { ...board, beats: nextBeats }, beatImages };
          }
        : undefined;

    const inspect: FilmDeps['inspect'] =
      deps.inspect ??
      (assets
        ? (params, beat) =>
            inspectInSandbox({
              params,
              beat,
              words: beatWords(beat, words),
              format: project.format,
              style,
              assets,
              allowNumbers,
              ...(hasVideo ? { hasVideo: true } : {}),
              ...(hasVideo && (beat.videoStage ?? 'full') !== 'cutaway'
                ? { transparent: true }
                : {}),
              ...(Object.keys(inlineImages).length ? { images: inlineImages } : {}),
              onSnapshot: (beatId, html) => {
                executedSnapshots[beatId] = html;
              },
              ...(deps.doc ? { doc: deps.doc } : {}),
            })
        : undefined);

    let film: FilmResult;
    try {
      film = await makeFilm(
        {
          words,
          durationMs: project.durationMs,
          format: project.format,
          look: { name: style.name, description: style.description.slice(0, 300) },
          ...(hasVideo ? { hasVideo: true } : {}),
          ...(frames.length ? { frames } : {}),
          ...(directMediaBin.length ? { mediaBin: directMediaBin } : {}),
          ...(stressedWords.length ? { stressedWords } : {}),
        },
        {
          router,
          lint: lintCustom,
          lintProp,
          kitDoc: KIT_DOC,
          example: kitExample(),
          exampleFor: (beat) => archetypeExample(beat.archetype, beat.lead),
          stageGuideFor: videoStageZoneGuide,
          ...(resolveBeatMedia ? { resolveBeatMedia } : {}),
          ...(deps.model ? { model: deps.model } : {}),
          ...(inspect ? { inspect } : {}),
          ...(deps.onProgress ? { onProgress: deps.onProgress } : {}),
          ...(deps.cancelled ? { cancelled: deps.cancelled } : {}),
          concurrency: 6,
          // One critic repair per beat (spec 13b R3.3): the second costs more than it fixes.
          maxRepairs: 1,
        },
      );
    } catch (e) {
      await refund();
      return e instanceof FilmCancelled
        ? { outcome: 'cancelled' }
        : { outcome: 'failed', reason: COULDNT_FILM };
    }

    // Spec 22 + 23 R8.1: single-call Multimodal Vision Critic over REAL executed frames composited
    // with the speaker's true stage geometry + live caption rail.
    if (typeof window !== 'undefined' && !deps.inspect && !deps.cancelled?.()) {
      const flagged = await runVisionQaPass({
        router,
        beats: film.beats,
        format: project.format,
        style,
        frames,
        executedSnapshots,
      }).catch(() => []);
      if (flagged.length > 0 && !deps.cancelled?.()) {
        const patched = [...film.beats];
        await Promise.all(
          flagged.map(async (flag) => {
            const idx = patched.findIndex((b) => b.beat.id === flag.beatId);
            if (idx < 0) return;
            const orig = patched[idx]!;
            const nextIdea = `${orig.beat.idea} [Visual QA fix: ${flag.fixHint}]`.slice(0, 500);
            try {
              const rebuilt = await rebuildBeat(
                {
                  words,
                  durationMs: project.durationMs,
                  format: project.format,
                  look: { name: style.name, description: style.description.slice(0, 300) },
                  ...(hasVideo ? { hasVideo: true } : {}),
                  ...(frames.length ? { frames } : {}),
                  ...(directMediaBin.length ? { mediaBin: directMediaBin } : {}),
                  ...(stressedWords.length ? { stressedWords } : {}),
                },
                {
                  router,
                  lint: lintCustom,
                  lintProp,
                  kitDoc: KIT_DOC,
                  example: kitExample(),
                  exampleFor: (beat) => archetypeExample(beat.archetype, beat.lead),
                  stageGuideFor: videoStageZoneGuide,
                  ...(deps.model ? { model: deps.model } : {}),
                  ...(inspect ? { inspect } : {}),
                  storyboard: film.storyboard,
                  props: film.props,
                  maxRepairs: 1,
                },
                idx,
                nextIdea,
              );
              if (rebuilt.params) patched[idx] = rebuilt;
            } catch {
              // Keep the original beat if surgical polish fails.
            }
          }),
        );
        film = { ...film, beats: patched };
      }
    }

    // The film was made for the video as it was: a different voiceover or length is another film.
    const current = store.getState().project;
    if (
      !current ||
      current.id !== project.id ||
      current.durationMs !== project.durationMs ||
      current.transcript.words.length !== project.transcript.words.length
    ) {
      await refund();
      return { outcome: 'failed', reason: 'The voiceover changed. Try again.' };
    }
    const stamp = now();
    const seed = stamp.toString(36);
    const made = filmSlots(current, film, {
      now: stamp,
      id: (i) => `film-${seed}-${i + 1}`,
      ...(deps.model ? { model: deps.model } : {}),
      ...(deps.doc ? { doc: deps.doc } : typeof document !== 'undefined' ? { doc: document } : {}),
    });
    if (made.built === 0) {
      await refund();
      return { outcome: 'failed', reason: COULDNT_FILM };
    }
    const videoStages = current.video
      ? stagesFromTimedBeats(film.beats.map((b) => b.beat))
      : undefined;
    const ok = store.getState().exec(
      applyFilm({
        slots: made.slots,
        versions: made.versions,
        film: {
          storyboard: film.storyboard,
          props: film.props,
          madeAt: stamp,
          ...(deps.model ? { model: deps.model } : {}),
        },
        ...(videoStages ? { videoStages } : {}),
        ...(mediaBinUpdated && indexedMediaBin ? { mediaBin: indexedMediaBin } : {}),
        ...(generatedAssets.length ? { assets: generatedAssets } : {}),
      }),
    );
    if (!ok) {
      await refund();
      return { outcome: 'failed', reason: COULDNT_FILM };
    }
    return { outcome: 'ready', ms: now() - started, built: made.built, fallbacks: made.fallbacks };
  } catch {
    await refund();
    return { outcome: 'failed', reason: COULDNT_FILM };
  }
}
