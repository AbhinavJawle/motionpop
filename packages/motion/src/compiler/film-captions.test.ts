import type { EditorProject, Slot } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { filmBeatSlot, fixtureProject } from '../testing/project-fixture';
import { projectCompileInput } from './project';

/** The caption groups that overlap [startMs, endMs) for a project with one custom slot. */
function groupsOver(project: EditorProject, startMs: number, endMs: number) {
  const groups = projectCompileInput(project, { mode: 'preview' }).captions?.groups ?? [];
  return groups.filter((g) => g.openMs < endMs && g.closeMs > startMs);
}

/** The same custom graphic as a film beat and as a plain one (no `film` on its params). */
function plainCustom(slot: Slot): Slot {
  const params: Record<string, unknown> = { ...(slot.params as Record<string, unknown>) };
  delete params['film'];
  return { ...slot, params };
}

const captioned = (slots: Slot[]) => ({
  ...fixtureProject({ slots }),
  captions: { enabled: true, presetId: 'pop' as const },
});

describe('captions during film beats (spec 07b R7)', () => {
  const beat = filmBeatSlot('film-1', 1000, 4000, { tailMs: 0, over: 'out', headMs: 0 });

  it('keeps the caption groups over a film beat', () => {
    expect(groupsOver(captioned([beat]), 1000, 4000).length).toBeGreaterThan(0);
  });

  it('hides the caption groups over a custom graphic that is not a film beat', () => {
    expect(groupsOver(captioned([plainCustom(beat)]), 1000, 4000)).toEqual([]);
  });

  it('keeps film beat captions when the beat has a tail', () => {
    const tailed = filmBeatSlot('film-1', 1000, 4000, { tailMs: 500, over: 'out', headMs: 0 });
    expect(groupsOver(captioned([tailed]), 1000, 4000).length).toBeGreaterThan(0);
  });
});
