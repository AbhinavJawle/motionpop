import type { FilmProgress } from '@motionpop/ai';
import { create } from 'zustand';

/**
 * What film mode is doing right now (spec 07b R5.2), for the button that shows it. UI only: the
 * project never stores it.
 */
export interface FilmActivity {
  /** What the cloud is on: the plan, then the beats. */
  phase: 'storyboard' | 'beats';
  /** Beats finished (ready or failed) and beats in all; 0 of 0 until the storyboard is in. */
  done: number;
  total: number;
  startedAt: number;
  cancelled: boolean;
}

export const useFilmActivity = create<{ film: FilmActivity | null }>(() => ({ film: null }));

export function beginFilm(now = Date.now()): void {
  useFilmActivity.setState({
    film: { phase: 'storyboard', done: 0, total: 0, startedAt: now, cancelled: false },
  });
}

export function endFilm(): void {
  useFilmActivity.setState({ film: null });
}

export function cancelFilm(): void {
  useFilmActivity.setState((s) => (s.film ? { film: { ...s.film, cancelled: true } } : s));
}

export const filmCancelled = (): boolean => useFilmActivity.getState().film?.cancelled === true;

/** Folds one progress event into the activity. */
export function noteFilmProgress(e: FilmProgress): void {
  useFilmActivity.setState((s) => {
    if (!s.film) return s;
    if (e.phase === 'storyboard' && e.state === 'done')
      return { film: { ...s.film, phase: 'beats' } };
    if (e.phase !== 'beat') return s;
    const done = e.state === 'ready' || e.state === 'failed' ? s.film.done + 1 : s.film.done;
    return { film: { ...s.film, phase: 'beats', total: e.count, done } };
  });
}

/** The line under the button while a film is being made. */
export function filmStatusText(f: FilmActivity): string {
  if (f.cancelled) return 'Stopping…';
  if (f.phase === 'storyboard') return 'Pip is storyboarding…';
  if (f.total === 0) return 'Pip is drawing…';
  return `Building beat ${Math.min(f.total, f.done + 1)} of ${f.total}`;
}
