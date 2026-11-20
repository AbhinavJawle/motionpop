import type { PipPlan, PipStep, StepState } from '@motionpop/schemas';
import type { Command } from '@/lib/commands/command';
import {
  addVideoCut,
  addVideoPunchIn,
  composite,
  deleteSlot,
  setAllSlotsPlacement,
  setAllVideoCutsEnabled,
  setBrand,
  setCaptions,
  setFormat,
  setSlotPlacement,
  setStyle,
} from '@/lib/commands';
import { cleanedToSourceMs, keptSourceSegments } from '@motionpop/schemas';
import { addSlot } from '@/lib/commands/slots';
import type { Route } from '@/lib/ai/route';
import { generateSlot, type GenerateDeps } from '@/lib/slots/generate';
import { generateSlotImage, imageRoleOf } from '@/lib/images/generate';
import { runQuickEdit, type QuickEditDeps } from '@/lib/slots/quick-edit';
import { slotForWords } from '@/lib/timeline/create';
import type { EditorStore } from '@/lib/stores/editor';

/**
 * Apply all (spec 10 design §7), lean: every instant step (style, format, captions, add, remove)
 * lands as ONE composite command, so one undo restores them. Steps that call a model (a quick edit
 * or a regeneration) then run one by one through the same flows as the inspector, with their own
 * credits, refunds and versions. `undoPlan` walks back exactly the history entries this run added.
 */
export interface ApplyDeps extends QuickEditDeps, GenerateDeps {
  store: EditorStore;
  editRoute: Route;
  generateRoute: Route;
  newId?: () => string;
}

export interface ApplyResult {
  states: Record<string, { state: StepState; reason?: string }>;
  slotIds: string[];
  changes: number;
  /** The history entries this run added, newest last (for Undo). */
  entries: Command[];
}

const INSTANT = new Set<PipStep['action']>([
  'setStyle',
  'setBrand',
  'setFormat',
  'setCaptions',
  'addSlot',
  'removeSlot',
  'setPlacement',
  'toggleCuts',
  'addPunchIn',
  'cutRange',
]);

function instantCommand(
  step: PipStep,
  deps: ApplyDeps,
  project: NonNullable<ReturnType<EditorStore['getState']>['project']>,
): { cmd: Command; slotId?: string } | string {
  switch (step.action) {
    case 'setStyle':
      return step.styleId ? { cmd: setStyle(step.styleId) } : 'No style';
    case 'setBrand':
      return step.brand ? { cmd: setBrand(step.brand) } : 'No brand colours saved';
    case 'setFormat':
      return step.format ? { cmd: setFormat(step.format) } : 'No format';
    case 'setCaptions': {
      const c = step.captions;
      if (!c) return 'No caption choice';
      if (c === 'on' || c === 'off') return { cmd: setCaptions({ enabled: c === 'on' }) };
      return { cmd: setCaptions({ enabled: true, presetId: c }) };
    }
    case 'removeSlot':
      return step.slotId && project.slots.some((s) => s.id === step.slotId)
        ? { cmd: deleteSlot(step.slotId), slotId: step.slotId }
        : 'That graphic is gone';
    case 'addSlot': {
      if (step.atWord === undefined) return 'No word to place it on';
      const id = (deps.newId ?? (() => `slot-${crypto.randomUUID().slice(0, 8)}`))();
      const slot = slotForWords(project, step.atWord, step.atWord + 3, id);
      if (!slot) return 'Those words already have a graphic';
      const withIntent = {
        ...slot,
        ...(step.componentId ? { componentId: step.componentId } : {}),
        ...(step.instruction ? { prompt: step.instruction, reason: step.instruction } : {}),
      };
      return { cmd: addSlot(withIntent), slotId: id };
    }
    case 'setPlacement': {
      const pl = step.placement;
      if (!pl) return 'No placement';
      if (step.slotId) {
        return { cmd: setSlotPlacement(step.slotId, pl, step.overlayAnchor), slotId: step.slotId };
      }
      return { cmd: setAllSlotsPlacement(pl, step.overlayAnchor) };
    }
    case 'toggleCuts':
      return project.video
        ? { cmd: setAllVideoCutsEnabled(step.cutEnabled ?? true) }
        : 'No video track';
    case 'addPunchIn': {
      if (!project.video || step.atWord === undefined) return 'No word to zoom on';
      const w = project.transcript.words[step.atWord];
      if (!w) return 'Word not found';
      const startMs = Math.max(0, w.startMs);
      const endMs = Math.min(project.durationMs, Math.max(w.endMs, startMs + 2400));
      if (endMs <= startMs) return 'Not enough room for a punch-in';
      return {
        cmd: addVideoPunchIn({
          id: `punch-${crypto.randomUUID().slice(0, 6)}`,
          startMs,
          endMs,
          scale: 1.18,
          focusX: 0.5,
          focusY: 0.35,
          reason: step.instruction || step.label,
        }),
      };
    }
    case 'cutRange': {
      if (!project.video || step.atWord === undefined) return 'No word to cut';
      const wStart = project.transcript.words[step.atWord];
      const wEnd =
        project.transcript.words[
          step.wordEnd ?? Math.min(project.transcript.words.length - 1, step.atWord + 4)
        ];
      if (!wStart || !wEnd) return 'Words not found';
      const segs = keptSourceSegments(project.video.originalDurationMs, project.video.cuts);
      const startMs = cleanedToSourceMs(wStart.startMs, segs);
      const endMs = Math.min(
        project.video.originalDurationMs,
        Math.max(startMs + 120, cleanedToSourceMs(wEnd.endMs, segs)),
      );
      return {
        cmd: addVideoCut({
          id: `cut-${crypto.randomUUID().slice(0, 6)}`,
          startMs,
          endMs,
          kind: 'manual',
          reason: step.instruction || step.label,
          enabled: true,
        }),
      };
    }
    default:
      return 'Not an instant step';
  }
}

export async function applyPlan(
  deps: ApplyDeps,
  plan: PipPlan,
  onStep: (id: string, state: StepState, reason?: string) => void,
): Promise<ApplyResult> {
  const states: ApplyResult['states'] = {};
  const set = (id: string, state: StepState, reason?: string) => {
    states[id] = reason ? { state, reason } : { state };
    onStep(id, state, reason);
  };
  const slotIds = new Set<string>();
  const entries: Command[] = [];
  const steps = plan.steps.filter((s) => s.include);
  for (const s of plan.steps) if (!s.include) set(s.id, 'skipped', 'Left out');

  // 1. Instant steps, one undo entry. Each is tried on the project as it stands after the earlier ones.
  const instant = steps.filter((s) => INSTANT.has(s.action));
  if (instant.length) {
    const cmds: Command[] = [];
    let project = deps.store.getState().project;
    for (const s of instant) {
      if (!project) break;
      const r = instantCommand(s, deps, project);
      if (typeof r === 'string') {
        set(s.id, 'skipped', r);
        continue;
      }
      // Run it on a scratch copy first: a step that can't apply is skipped, not the whole plan.
      try {
        project = r.cmd.do(project);
      } catch {
        set(s.id, 'skipped', 'Couldn’t apply that');
        continue;
      }
      cmds.push(r.cmd);
      if (r.slotId) slotIds.add(r.slotId);
      set(s.id, 'done');
    }
    if (cmds.length) {
      const cmd = composite('Pip plan', cmds);
      if (deps.store.getState().exec(cmd)) entries.push(cmd);
    }
  }

  // 2. Model steps, one by one.
  for (const s of steps.filter((x) => !INSTANT.has(x.action))) {
    const before = deps.store.getState().history.past.length;
    if (!s.slotId || !deps.store.getState().project?.slots.some((x) => x.id === s.slotId)) {
      set(s.id, 'skipped', 'That graphic is gone');
      continue;
    }
    set(s.id, 'running');
    try {
      if (s.action === 'addImage') {
        const slot = deps.store.getState().project?.slots.find((x) => x.id === s.slotId);
        const role = slot ? imageRoleOf(slot.componentId) : null;
        if (!role) set(s.id, 'skipped', 'That graphic doesn’t take a picture');
        else {
          const r = await generateSlotImage(
            {
              credits: deps.credits,
              ...(deps.config ? { config: deps.config } : {}),
              getProject: () => deps.store.getState().project,
              exec: (c) => deps.store.getState().exec(c),
            },
            { slotId: s.slotId, role, subject: s.instruction ?? '' },
          );
          if (r.ok) set(s.id, 'done');
          else set(s.id, 'skipped', r.noCredits ? 'Out of credits' : r.reason);
        }
      } else if (s.action === 'updateSlot') {
        const out = await runQuickEdit(deps, s.slotId, s.instruction ?? '', deps.editRoute);
        if (out.kind === 'applied') set(s.id, 'done');
        else
          set(
            s.id,
            'skipped',
            out.kind === 'blocked'
              ? out.reason
              : out.kind === 'no-credits'
                ? 'Out of credits'
                : out.kind === 'escalate'
                  ? out.message
                  : 'Couldn’t change it',
          );
      } else {
        const r = await generateSlot(deps, s.slotId, deps.generateRoute);
        if (r.outcome === 'ready') set(s.id, 'done');
        else
          set(s.id, 'skipped', r.outcome === 'no-credits' ? 'Out of credits' : 'Couldn’t generate');
      }
    } catch {
      set(s.id, 'skipped', 'Couldn’t change it');
    }
    if (states[s.id]?.state === 'done') slotIds.add(s.slotId);
    entries.push(...deps.store.getState().history.past.slice(before));
  }

  return {
    states,
    slotIds: [...slotIds],
    changes: Object.values(states).filter((x) => x.state === 'done').length,
    entries,
  };
}

/** Undo what a plan run added, newest first, stopping at anything the user did since. */
export function undoPlan(store: EditorStore, entries: readonly Command[]): number {
  const mine = new Set(entries);
  let n = 0;
  for (;;) {
    const past = store.getState().history.past;
    const top = past[past.length - 1];
    if (!top || !mine.has(top)) break;
    store.getState().undo();
    mine.delete(top);
    n++;
  }
  return n;
}
