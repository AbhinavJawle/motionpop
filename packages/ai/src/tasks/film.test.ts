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
