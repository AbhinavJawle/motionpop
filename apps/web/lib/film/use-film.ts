'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
import { getRouter } from '@/lib/ai/router-client';
import type { Route } from '@/lib/ai/route';
import { useRoute } from '@/lib/ai/use-route';
import { useCreditsBalance, useCreditsClient } from '@/lib/credits/use-credits-client';
import { usePipModel } from '@/lib/pip/model-store';
import { useAppConfig } from '@/lib/renders/hooks';
import { useAIActivity } from '@/lib/stores/ai-activity';
import { editorStore, useEditor } from '@/lib/stores/editor';
import { consumeAutoChoreograph } from './auto-choreograph';
import {
  beginFilm,
  endFilm,
  filmCancelled,
  noteFilmProgress,
  useFilmActivity,
} from '@/lib/stores/film-activity';
import { PIP_IS_ON_IT } from '@/lib/slots/generate';
import {
  COULDNT_FILM,
  filmBlockedReason,
  filmCost,
  makeFilmForProject,
  type FilmDeps,
} from './film';

/** One film, with the activity, the progress and the toasts (spec 07b R5). */
export async function runFilm(deps: FilmDeps, route: Route): Promise<void> {
  if (useFilmActivity.getState().film || useAIActivity.getState().busy) {
    toast(PIP_IS_ON_IT);
    return;
  }
  beginFilm();
  let result;
  try {
    result = await makeFilmForProject(
      { ...deps, onProgress: noteFilmProgress, cancelled: filmCancelled },
      route,
    );
  } catch {
    result = { outcome: 'failed' as const, reason: COULDNT_FILM };
  } finally {
    endFilm();
  }
  if (result.outcome === 'ready') {
    const secs = Math.round((result.ms ?? 0) / 1000);
    const quick = result.fallbacks
      ? ` ${result.fallbacks} ${result.fallbacks === 1 ? 'beat uses' : 'beats use'} a quick graphic.`
      : '';
    toast.success(`Your film is ready (${secs}s).${quick}`, {
      description: 'Undo brings your old graphics back.',
    });
  } else if (result.outcome === 'cancelled') toast('Film stopped. Nothing changed.');
  else if (result.outcome === 'failed')
    toast(result.reason ?? COULDNT_FILM, {
      action: { label: 'Retry', onClick: () => void runFilm(deps, route) },
    });
  else if (result.outcome === 'blocked' && result.reason) toast(result.reason);
}

export function useFilm() {
  const base = useRoute('film');
  const project = useEditor((s) => s.project);
  const { client: credits } = useCreditsClient();
  const balance = useCreditsBalance();
  const config = useAppConfig();
  const film = useFilmActivity((s) => s.film);
  const cost = project ? filmCost(project, config) : 0;
  // The route prices one unit; a film costs its length.
  const route: Route =
    base.kind === 'cloud'
      ? { ...base, credits: cost, insufficient: balance !== null && balance < cost }
      : base;
  const disabledReason = film
    ? PIP_IS_ON_IT
    : (filmBlockedReason(project) ?? (route.kind === 'disabled' ? route.reason : null));
  const run = () => {
    if (disabledReason !== null) return;
    const selectedModel = usePipModel.getState().model || config.modelStrong;
    void runFilm(
      { store: editorStore, credits, getRouter, config, model: selectedModel },
      route,
    );
  };
  return {
    route,
    cost,
    film,
    disabledReason,
    run,
    hasFilm: Boolean(project?.film),
    hasCredits: credits !== null,
  };
}

/**
 * Automatically starts the gapless Video Choreography Engine once when a freshly processed video
 * project opens in the editor (spec 19 R4.2). Waits until auth/credits and cloud AI are ready.
 */
export function useAutoChoreograph(ready: boolean): void {
  const project = useEditor((s) => s.project);
  const busy = useAIActivity((s) => s.busy !== null);
  const { disabledReason, run, route, hasCredits } = useFilm();
  const projectId = project?.id ?? null;
  const hasVideo = Boolean(project?.video);
  const hasFilm = Boolean(project?.film);

  useEffect(() => {
    if (!ready || !projectId || !hasVideo || hasFilm || busy || !hasCredits) return;
    if (disabledReason !== null || route.kind !== 'cloud' || route.insufficient) return;
    if (!consumeAutoChoreograph(projectId)) return;
    run();
  }, [ready, projectId, hasVideo, hasFilm, busy, hasCredits, disabledReason, route, run]);
}
