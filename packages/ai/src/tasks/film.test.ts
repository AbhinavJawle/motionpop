import { describe, expect, it } from 'vitest';
import type { RouterConfig } from '../router';
import {
  filmBuildTask,
  filmDirectTask,
  filmPropsTask,
  reelBuildTask,
  reelDirectTask,
} from './film';

const CONFIG: RouterConfig = {
  routingOverrides: {},
  routingSlotsDetectDeviceMaxWords: 400,
  modelFast: 'fast',
  modelStrong: 'strong',
  modelFilmBuild: 'film-build',
  killSwitch: false,
};

describe('film & reel model routing (spec 07b + spec 24)', () => {
  it('film.build and reel.build use modelFilmBuild', () => {
    expect(filmBuildTask(() => [], '').model(CONFIG)).toBe('film-build');
    expect(reelBuildTask(() => [], '').model(CONFIG)).toBe('film-build');
  });

  it('film.direct, reel.direct and film.props keep modelStrong', () => {
    expect(filmDirectTask.model(CONFIG)).toBe('strong');
    expect(reelDirectTask.model(CONFIG)).toBe('strong');
    expect(filmPropsTask(() => []).model(CONFIG)).toBe('strong');
  });

  it('reel.direct exposes tone, brollQuery, imageSubject, and locked modern stages in JSON Schema even with empty mediaBin', () => {
    const schema = reelDirectTask.jsonSchema?.({
      words: [
        { text: 'hello', startMs: 0, endMs: 300 },
        { text: 'world', startMs: 350, endMs: 700 },
        { text: 'now', startMs: 750, endMs: 1100 },
      ],
      durationMs: 2000,
      format: '9:16',
      look: { name: 'Studio Light', description: 'Crisp studio grid' },
      hasVideo: true,
    }) as {
      properties: {
        tone?: unknown;
        beats: {
          items: {
            properties: {
              videoStage: { enum: string[] };
              brollQuery?: unknown;
              imageSubject?: unknown;
              imageKeyed?: unknown;
            };
          };
        };
      };
    };
    expect(schema.properties.tone).toBeDefined();
    const beatProps = schema.properties.beats.items.properties;
    expect(beatProps.brollQuery).toBeDefined();
    expect(beatProps.imageSubject).toBeDefined();
    expect(beatProps.imageKeyed).toBeDefined();
    expect(beatProps.videoStage.enum).toContain('split-top-stage');
    expect(beatProps.videoStage.enum).toContain('clean');
    expect(beatProps.videoStage.enum).toContain('top-card');
    expect(beatProps.videoStage.enum).not.toContain('backdrop');
    expect(beatProps.videoStage.enum).not.toContain('pip');
  });
});

describe('film & reel thinking levels (spec 13b + spec 24)', () => {
  it('uses MEDIUM thinking on reel.direct and LOW on fast builders', () => {
    expect(filmDirectTask.thinking).toBe('LOW');
    expect(reelDirectTask.thinking).toBe('MEDIUM');
    expect(filmBuildTask(() => [], '').thinking).toBe('LOW');
    expect(reelBuildTask(() => [], '').thinking).toBe('LOW');
    expect(filmPropsTask(() => []).thinking).toBe('LOW');
  });
});
