import {
  FilmCancelled,
  beatWords,
  makeFilm,
  type FilmBeatResult,
  type FilmProgress,
  type FilmResult,
  type Router,
} from '@motionpop/ai';
import { KIT_DOC, customParams, kitExample, lintCustom, lintProp } from '@motionpop/motion';
import {
  APP_CONFIG_DEFAULTS,
  FILM_MAX_MS,
  costOf,
  filmUnits,
  spokenNumbers,
  type AppConfig,
  type EditorProject,
  type ProjectFilm,
  type Slot,
  type Version,
} from '@motionpop/schemas';
import { produce } from 'immer';
import type { Route } from '@/lib/ai/route';
import { CommandRejected, type Command } from '@/lib/commands';
import { loadCompositionAssets } from '@/lib/composition/assets';
import { styleFor } from '@/lib/composition/project-to-compile';
import { newSpendKey, type CreditsClient } from '@/lib/credits/client';
import { spendWithUi } from '@/lib/credits/spend-with-ui';
import { newVersion } from '@/lib/slots/new-version';
import type { EditorStore } from '@/lib/stores/editor';
import { draftedSlotForWords } from '@/lib/timeline/add-graphic';
import { timelineIssues } from '@/lib/timeline/invariants';
import { inspectInSandbox } from './sandbox-critic';

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
}): Command {
  let before: Pick<EditorProject, 'slots' | 'versions' | 'film'> | undefined;
  return {
    label: 'Make it a film',
    do(p) {
      const next = produce(p, (d) => {
        d.slots = structuredClone(input.slots);
        d.versions.push(...structuredClone(input.versions));
        d.film = structuredClone(input.film);
      });
      const issue = timelineIssues(next)[0];
      if (issue) throw new CommandRejected(issue);
      before = { slots: p.slots, versions: p.versions, ...(p.film ? { film: p.film } : {}) };
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
        },
        {
          router,
          lint: lintCustom,
          lintProp,
          kitDoc: KIT_DOC,
          example: kitExample(),
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
