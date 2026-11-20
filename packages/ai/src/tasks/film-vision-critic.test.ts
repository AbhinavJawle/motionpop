import { describe, expect, it, vi } from 'vitest';
import { createRouter } from '../router';
import {
  critiqueContactSheet,
  filmVisionCriticJsonSchema,
  type FilmVisionCriticOutput,
} from './film-vision-critic';

const TINY_JPEG_B64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof';

describe('film.vision-critic task (spec 22)', () => {
  it('produces a Vertex-safe JSON schema without maximum bounds', () => {
    const raw = JSON.stringify(filmVisionCriticJsonSchema());
    expect(raw).not.toContain('9007199254740991');
    expect(raw).toContain('"fixHint"');
    expect(raw).toContain('"flagged"');
  });

  it('caps fixes to 2 valid beat ids and drops unknown beat ids', async () => {
    const router = createRouter({
      config: () => ({
        routingOverrides: {},
        routingSlotsDetectDeviceMaxWords: 400,
        modelFast: 'gemini-3.5-flash-lite',
        modelStrong: 'gemini-4-neon',
        modelFilmBuild: 'gemini-3.5-flash-lite',
        killSwitch: false,
      }),
      provider: {
        generate: vi.fn(async () => {
          const out: FilmVisionCriticOutput = {
            pass: false,
            summary: 'Beat 2 has low contrast',
            flagged: [
              {
                beatId: 'b2',
                severity: 'fix',
                issue: 'Dark text on dark video',
                fixHint: 'Use white text with soft bottom scrim',
              },
              {
                beatId: 'b99',
                severity: 'fix',
                issue: 'Bogus beat id',
                fixHint: 'Should be ignored',
              },
              {
                beatId: 'b3',
                severity: 'fix',
                issue: 'Cramped right column',
                fixHint: 'Reduce label width to 42%',
              },
              {
                beatId: 'b1',
                severity: 'fix',
                issue: 'Third fix should be capped',
                fixHint: 'Capped out',
              },
            ],
          };
          return { text: JSON.stringify(out), ranOn: 'cloud' as const };
        }),
      },
    });

    const verdict = await critiqueContactSheet(router, {
      format: '9:16',
      lookName: 'Creator Dark',
      beats: [
        { id: 'b1', videoStage: 'full', archetype: 'kinetic-type', text: ['Hook'] },
        { id: 'b2', videoStage: 'split-left', archetype: 'hero-stat', text: ['3x'] },
        { id: 'b3', videoStage: 'screen-showcase', archetype: 'callout-hud', text: ['Live'] },
      ],
      contactSheetBase64: TINY_JPEG_B64,
    });

    expect(verdict.pass).toBe(false);
    expect(verdict.flagged.map((f) => f.beatId)).toEqual(['b2', 'b3']);
  });

  it('passes safely when offline', async () => {
    const verdict = await critiqueContactSheet(null, {
      format: '16:9',
      lookName: 'Keynote Clean',
      beats: [{ id: 'b1', text: ['Hello'] }],
      contactSheetBase64: TINY_JPEG_B64,
    });
    expect(verdict.pass).toBe(true);
    expect(verdict.flagged).toEqual([]);
  });
});
