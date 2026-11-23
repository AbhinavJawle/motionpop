import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  SEQUENCE_MAX_CHARS,
  buildSlotSequences,
  extractShotSequence,
} from '../../scripts/slot-sequences-lib';
import { SKILLS } from '../slots/catalogue';
import { SLOT_SEQUENCES, shotSequenceOf } from './slot-sequences';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('slot shot sequences', () => {
  it('is in sync with skills/*.md (run `pnpm --filter @motionpop/ai skills:build`)', () => {
    expect(SLOT_SEQUENCES).toEqual(buildSlotSequences(join(root, 'skills')));
  });

  it('has a non-empty sequence for every catalogue skill', () => {
    for (const skill of SKILLS) {
      expect(shotSequenceOf(skill.id), skill.id).not.toBe('');
      expect(shotSequenceOf(skill.id).length).toBeLessThanOrEqual(SEQUENCE_MAX_CHARS);
    }
  });

  it('does not include the recipe files', () => {
    expect(Object.keys(SLOT_SEQUENCES)).not.toContain('tech-explainer');
  });

  it('returns an empty string for an unknown id', () => {
    expect(shotSequenceOf('nope')).toBe('');
    expect(shotSequenceOf('')).toBe('');
    expect(shotSequenceOf('constructor')).toBe('');
    expect(shotSequenceOf('__proto__')).toBe('');
  });
});

describe('extractShotSequence', () => {
  it('takes the section body up to the next heading', () => {
    const md =
      '---\nid: x\n---\n## Intent\nA\n\n## Shot sequence (percent)\n- 0–50%: a\n- 50–100%: b\n\n## Camera\nStatic\n';
    expect(extractShotSequence(md)).toBe('- 0–50%: a\n- 50–100%: b');
  });

  it('returns an empty string without the section', () => {
    expect(extractShotSequence('## Intent\nA\n')).toBe('');
  });

  it('cuts long sections at a line end within the limit', () => {
    const line = `- ${'x'.repeat(98)}`;
    const md = `## Shot sequence\n${Array.from({ length: 30 }, () => line).join('\n')}\n`;
    const out = extractShotSequence(md);
    expect(out.length).toBeLessThanOrEqual(SEQUENCE_MAX_CHARS);
    expect(out.split('\n').every((l) => l === line)).toBe(true);
  });
});
