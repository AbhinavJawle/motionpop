import { describe, expect, it } from 'vitest';
import {
  beginFilm,
  cancelFilm,
  endFilm,
  filmCancelled,
  filmStatusText,
  noteFilmProgress,
  useFilmActivity,
  type FilmActivity,
} from './film-activity';

const now = () => useFilmActivity.getState().film;

describe('film activity', () => {
  it('begins in the storyboard phase with nothing done', () => {
    beginFilm(42);
    expect(now()).toEqual({
      phase: 'storyboard',
      done: 0,
      total: 0,
      startedAt: 42,
      cancelled: false,
    });
    endFilm();
  });

  it('moves to the beats phase when the storyboard is done', () => {
    beginFilm(1);
    noteFilmProgress({ phase: 'storyboard', state: 'done' });
    expect(now()?.phase).toBe('beats');
    expect(now()?.total).toBe(0);
    endFilm();
  });

  it('counts a beat as done when it is ready or failed, and sets the total', () => {
    beginFilm(1);
    noteFilmProgress({ phase: 'storyboard', state: 'done' });
    noteFilmProgress({ phase: 'beat', beatId: 'b1', index: 0, count: 4, state: 'building' });
    expect(now()).toMatchObject({ done: 0, total: 4 });
    noteFilmProgress({ phase: 'beat', beatId: 'b1', index: 0, count: 4, state: 'ready' });
    noteFilmProgress({ phase: 'beat', beatId: 'b2', index: 1, count: 4, state: 'failed' });
    expect(now()).toMatchObject({ done: 2, total: 4 });
    endFilm();
  });

  it('does not count a beat that is only being checked or repaired', () => {
    beginFilm(1);
    noteFilmProgress({ phase: 'beat', beatId: 'b1', index: 0, count: 2, state: 'checking' });
    noteFilmProgress({ phase: 'beat', beatId: 'b1', index: 0, count: 2, state: 'repairing' });
    expect(now()?.done).toBe(0);
    endFilm();
  });

  it('ignores progress when no film is running', () => {
    endFilm();
    noteFilmProgress({ phase: 'storyboard', state: 'done' });
    expect(now()).toBeNull();
  });

  it('marks the film cancelled, and endFilm clears it', () => {
    beginFilm(1);
    expect(filmCancelled()).toBe(false);
    cancelFilm();
    expect(filmCancelled()).toBe(true);
    expect(now()?.cancelled).toBe(true);
    endFilm();
    expect(now()).toBeNull();
    expect(filmCancelled()).toBe(false);
  });

  it('cancelling with no film running changes nothing', () => {
    endFilm();
    cancelFilm();
    expect(now()).toBeNull();
  });

  describe('filmStatusText', () => {
    const base: FilmActivity = {
      phase: 'storyboard',
      done: 0,
      total: 0,
      startedAt: 0,
      cancelled: false,
    };

    it('says what the cloud is doing in each state', () => {
      expect(filmStatusText(base)).toBe('Pip is storyboarding…');
      expect(filmStatusText({ ...base, phase: 'beats' })).toBe('Pip is drawing…');
      expect(filmStatusText({ ...base, phase: 'beats', total: 5, done: 2 })).toBe(
        'Building beat 3 of 5',
      );
      expect(filmStatusText({ ...base, phase: 'beats', total: 5, done: 5 })).toBe(
        'Building beat 5 of 5',
      );
      expect(filmStatusText({ ...base, cancelled: true })).toBe('Stopping…');
    });
  });
});
