import { describe, expect, it } from 'vitest';
import { componentFillTask } from './component-fill';
import { customComposeTask } from './custom-compose';
import { directPlan } from './direct-plan';
import { editPatchTask } from './edit-patch';
import {
  filmBuildTask,
  filmDirectTask,
  filmPropsTask,
  reelBuildTask,
  reelDirectTask,
} from './film';
import { noteFixTask } from './note-fix';
import { pipPlanTask } from './pip-plan';
import { promptPrefill } from './prompt-prefill';
import { recipeResolveTask } from './recipe-resolve';
import { slotsDetect } from './slots-detect';
import { transcribeCloud } from './transcribe-cloud';
import type { TaskDef } from '../router';
import { reelComposeTask } from '../reel/compose';
import { reelNoteTask } from '../reel/note';

/** Every cloud task definition the package ships (spec 13b R3.5). */
function allTasks(): TaskDef<never, unknown>[] {
  const none = () => undefined;
  return [
    componentFillTask(none),
    customComposeTask(() => []),
    directPlan,
    editPatchTask(none),
    filmDirectTask,
    filmBuildTask(() => [], ''),
    filmPropsTask(() => []),
    reelDirectTask,
    reelBuildTask(() => [], ''),
    noteFixTask(none),
    reelNoteTask(),
    reelComposeTask(() => [], ''),
    pipPlanTask(),
    promptPrefill,
    recipeResolveTask,
    slotsDetect,
    transcribeCloud,
  ] as unknown as TaskDef<never, unknown>[];
}

/** The caps of design §5, so a change to a cap is a change to this table too. */
const EXPECTED: Record<string, number> = {
  'component.fill': 2048,
  'custom.compose': 8192,
  'direct.plan': 4096,
  'edit.patch': 1024,
  'film.direct': 6144,
  'film.build': 8192,
  'film.props': 6144,
  'reel.direct': 8192,
  'reel.build': 8192,
  'note.fix': 1024,
  'reel.note': 8192,
  'reel.compose': 24576,
  'pip.plan': 4096,
  'prompt.prefill': 512,
  'recipe.resolve': 300,
  'slots.detect': 4096,
  'transcribe.cloud': 16384,
};

describe('output caps (spec 13b R3.5)', () => {
  it('every task definition sets a positive integer maxOutputTokens', () => {
    for (const t of allTasks()) {
      expect(Number.isInteger(t.maxOutputTokens), t.id).toBe(true);
      expect(t.maxOutputTokens ?? 0, t.id).toBeGreaterThan(0);
    }
  });

  it('covers every task of the catalogue, and each cap matches the design table', () => {
    const tasks = allTasks();
    expect(tasks.map((t) => t.id).sort()).toEqual(Object.keys(EXPECTED).sort());
    for (const t of tasks) expect(t.maxOutputTokens, t.id).toBe(EXPECTED[t.id]);
  });
});
