import { BEAT_ARCHETYPES, VIDEO_STAGE_MODES } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { lintCustom } from '../components/custom/lint';
import { ARCHETYPE_EXAMPLES, archetypeExample, videoStageZoneGuide } from './archetypes';

describe('archetype few-shot library (spec 19)', () => {
  it('provides a lint-clean mp-kit example for every beat archetype', () => {
    for (const arch of BEAT_ARCHETYPES) {
      const ex = ARCHETYPE_EXAMPLES[arch];
      expect(ex.html.length).toBeGreaterThan(10);
      expect(ex.css.length).toBeGreaterThan(10);
      expect(ex.script.length).toBeGreaterThan(20);
      expect(lintCustom(ex)).toEqual([]);
    }
  });

  it('selects matching examples by archetype or fallback lead', () => {
    expect(archetypeExample('data-chart')).toBe(ARCHETYPE_EXAMPLES['data-chart']);
    expect(archetypeExample(undefined, 'map')).toBe(ARCHETYPE_EXAMPLES['map-story']);
    expect(archetypeExample(undefined, 'number')).toBe(ARCHETYPE_EXAMPLES['hero-stat']);
    expect(archetypeExample(undefined, 'type')).toBe(ARCHETYPE_EXAMPLES['kinetic-type']);
  });

  it('returns non-empty spatial zone guidance for every video stage and format', () => {
    for (const mode of VIDEO_STAGE_MODES) {
      expect(videoStageZoneGuide(mode, '16:9')).toContain(`VIDEO STAGE = ${mode}`);
      expect(videoStageZoneGuide(mode, '9:16')).toContain(`VIDEO STAGE = ${mode}`);
    }
  });
});
