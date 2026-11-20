import { describe, expect, it } from 'vitest';
import type { RouterConfig } from '../router';
import { filmBuildTask, filmDirectTask, filmPropsTask } from './film';

const CONFIG: RouterConfig = {
  routingOverrides: {},
  routingSlotsDetectDeviceMaxWords: 400,
  modelFast: 'fast',
  modelStrong: 'strong',
  modelFilmBuild: 'film-build',
  killSwitch: false,
};

describe('film model routing (spec 07b model setting)', () => {
  it('film.build uses modelFilmBuild', () => {
    const task = filmBuildTask(() => [], '');
    expect(task.model(CONFIG)).toBe('film-build');
  });

  it('film.direct and film.props keep modelStrong', () => {
    expect(filmDirectTask.model(CONFIG)).toBe('strong');
    expect(filmPropsTask(() => []).model(CONFIG)).toBe('strong');
  });
});

describe('film thinking levels (spec 13b R3.2, tuned for fast Reels in spec 20)', () => {
  it('film.direct, film.build and film.props use LOW thinking for responsive storyboarding', () => {
    expect(filmDirectTask.thinking).toBe('LOW');
    expect(filmBuildTask(() => [], '').thinking).toBe('LOW');
    expect(filmPropsTask(() => []).thinking).toBe('LOW');
  });
});
