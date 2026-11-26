import { audioOf, type PipPlan, type PipStep, type StepState } from '@motionpop/schemas';
import type { Command } from '@/lib/commands/command';
import {
  addReelNote,
  addReelSound,
  addVideoCut,
  addVideoPunchIn,
  clearReelScene,
  clearReelSounds,
  composite,
  deleteReelScene,
  deleteSlot,
  setAudio,
  setReelCaptions,
  setReelLook,
  setReelMusicBrief,
  setReelSceneClip,
  setReelTheme,
  setAllSlotsPlacement,
  setAllSlotsVideoStage,
  setAllVideoCutsEnabled,
  setBrand,
  setCaptions,
  setFormat,
  setSlotMediaClip,
  setSlotPlacement,
  setSlotVideoStage,
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
import type { ReelNoteOutcome } from '@/lib/reel/note-fix';
import type { ReelNote } from '@motionpop/schemas';

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
  /** Video reels (spec 37): runs a scene's note through the reel note fix. */
  reelNote?: (sceneId: string, noteId: string) => Promise<ReelNoteOutcome>;
  /** Directs the reel again (charged by the director flow). */
  regenerateReel?: () => Promise<unknown>;
  /** Writes new music from a brief and puts it on the reel; false when none came back. */
  reelMusic?: (brief: string) => Promise<boolean>;
}

/** Why a reel note didn't land, in the plan card's words. */
function reelNoteReason(o: ReelNoteOutcome): string {
  switch (o.kind) {
    case 'no-credits':
      return 'Out of credits';
    case 'blocked':
      return o.reason;
    case 'escalate':
      return o.message;
    case 'changed':
      return 'The scene changed meanwhile';
    default:
      return 'Couldn’t change that scene. The note stays on it to try again.';
  }
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
  'setVideoStage',
  'setBeatClip',
  'toggleCuts',
  'addPunchIn',
  'cutRange',
  'setReelTheme',
  'setReelLook',
  'clearScene',
  'setSound',
  'addSound',
]);

/** Instant steps; generated music runs after them like the other model steps. */
const isInstant = (s: PipStep) =>
  INSTANT.has(s.action) || (s.action === 'setMusic' && s.music !== 'ai');

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
      if (project.reel && project.slots.length === 0)
        return c === 'off' ? { cmd: setReelCaptions(false) } : { cmd: setReelCaptions(true) };
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
    case 'setVideoStage': {
      const st = step.videoStage;
      if (!st) return 'No video stage';
      if (step.slotId) {
        return { cmd: setSlotVideoStage(step.slotId, st), slotId: step.slotId };
      }
      return { cmd: setAllSlotsVideoStage(st) };
    }
    case 'setBeatClip': {
      const clipId = step.clipId ? step.clipId : null;
      if (step.sceneId && project.reel) {
        return { cmd: setReelSceneClip(step.sceneId, clipId) };
      }
      if (!step.slotId) return 'No beat selected';
      return { cmd: setSlotMediaClip(step.slotId, clipId), slotId: step.slotId };
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
    case 'setReelTheme':
      return { cmd: setReelTheme(step.theme ?? null) };
    case 'setReelLook':
      return step.look ? { cmd: setReelLook(step.look) } : 'No look';
    case 'clearScene': {
      if (!step.sceneId) return 'That scene is gone';
      const noVideo =
        Boolean(project.reel?.graphicOnly) ||
        (!project.video &&
          Boolean(project.reel?.scenes.length) &&
          project.reel!.scenes.every((s) => s.layout === 'full'));
      if (noVideo && project.reel) {
        if (project.reel.scenes.length <= 1) return 'Keep at least one scene';
        return { cmd: deleteReelScene(step.sceneId) };
      }
      return { cmd: clearReelScene(step.sceneId) };
    }
    case 'setSound': {
      const a = audioOf(project);
      switch (step.sound) {
        case 'on':
        case 'off':
          return { cmd: setAudio({ autoSfx: step.sound === 'on' }) };
        case 'louder':
        case 'quieter': {
          const next = Math.min(6, Math.max(-24, a.sfxGainDb + (step.sound === 'louder' ? 4 : -5)));
          if (next === a.sfxGainDb && a.autoSfx) return 'Already as far as it goes';
          return { cmd: setAudio({ autoSfx: true, sfxGainDb: next }) };
        }
        case 'clear':
          return { cmd: clearReelSounds() };
        default:
          return 'No sound choice';
      }
    }
    case 'addSound': {
      const w = step.atWord === undefined ? undefined : project.transcript.words[step.atWord];
      if (!w || !step.sfxKind) return 'No word to put it on';
      return { cmd: addReelSound({ kind: step.sfxKind, atMs: w.startMs, gainDb: -2 }) };
    }
    case 'setMusic': {
      const cmds: Command[] = [];
      // A generated track would play over the bed: the choice replaces it.
      if (project.reel?.music) cmds.push(setReelMusicBrief(null));
      if (step.music === 'none') cmds.push(setAudio({ musicId: undefined }));
      else if (step.music === 'calm-pad' || step.music === 'steady-pulse')
        cmds.push(setAudio({ musicId: step.music }));
      else return 'No music choice';
      return { cmd: cmds.length === 1 ? cmds[0]! : composite('Change music', cmds) };
    }
    default:
      return 'Not an instant step';
  }
}

/** A note over the whole frame that carries Pip's brief for one scene (spec 37 R2.1). */
function sceneNote(
  project: NonNullable<ReturnType<EditorStore['getState']>['project']>,
  sceneId: string,
  text: string,
  id: string,
): ReelNote | null {
  const scene = project.reel?.scenes.find((s) => s.id === sceneId);
  if (!scene) return null;
  // The graphic's key moment: past the entrance, before the exit.
  const tMs = Math.round(
    Math.min(scene.endMs - scene.startMs - 1, (scene.endMs - scene.startMs) * 0.6),
  );
  return {
    id,
    tMs: Math.max(0, tMs),
    shape: { kind: 'circle', points: [0.5, 0.5, 0.5, 0.5] },
    text: text.slice(0, 300),
    status: 'open',
  };
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
  const instant = steps.filter(isInstant);
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
  for (const s of steps.filter((x) => !isInstant(x))) {
    const before = deps.store.getState().history.past.length;
    set(s.id, 'running');
    try {
      const reason = await runModelStep(deps, s);
      if (reason === null) set(s.id, 'done');
      else set(s.id, 'skipped', reason);
    } catch {
      set(s.id, 'skipped', 'Couldn’t change it');
    }
    if (states[s.id]?.state === 'done' && s.slotId) slotIds.add(s.slotId);
    entries.push(...deps.store.getState().history.past.slice(before));
  }

  return {
    states,
    slotIds: [...slotIds],
    changes: Object.values(states).filter((x) => x.state === 'done').length,
    entries,
  };
}

/** Runs one step that calls a model. Null when it landed, else why it was skipped. */
async function runModelStep(deps: ApplyDeps, s: PipStep): Promise<string | null> {
  const project = deps.store.getState().project;
  if (!project) return 'The project closed';
  switch (s.action) {
    case 'editScene': {
      if (!s.sceneId || !project.reel?.scenes.some((x) => x.id === s.sceneId))
        return 'That scene is gone';
      if (!deps.reelNote) return 'Scene edits need cloud AI';
      const noteId = `pip-${(deps.newId ?? (() => crypto.randomUUID().slice(0, 8)))()}`;
      const note = sceneNote(project, s.sceneId, s.instruction ?? s.label, noteId);
      if (!note) return 'That scene is gone';
      if (!deps.store.getState().exec(addReelNote(s.sceneId, note))) return 'Couldn’t add the note';
      const out = await deps.reelNote(s.sceneId, noteId);
      return out.kind === 'applied' ? null : reelNoteReason(out);
    }
    case 'regenerateReel':
      if (!project.reel) return 'This project has no reel';
      if (!deps.regenerateReel) return 'Needs cloud AI';
      await deps.regenerateReel();
      return null;
    case 'setMusic': {
      if (!project.reel) return 'This project has no reel';
      if (!deps.reelMusic) return 'Needs cloud AI';
      return (await deps.reelMusic(s.instruction ?? '')) ? null : 'Couldn’t write that music';
    }
    case 'addImage': {
      const slot = s.slotId ? project.slots.find((x) => x.id === s.slotId) : undefined;
      if (!slot || !s.slotId) return 'That graphic is gone';
      const role = imageRoleOf(slot.componentId);
      if (!role) return 'That graphic doesn’t take a picture';
      const r = await generateSlotImage(
        {
          credits: deps.credits,
          ...(deps.config ? { config: deps.config } : {}),
          getProject: () => deps.store.getState().project,
          exec: (c) => deps.store.getState().exec(c),
        },
        { slotId: s.slotId, role, subject: s.instruction ?? '' },
      );
      return r.ok ? null : r.noCredits ? 'Out of credits' : r.reason;
    }
    case 'updateSlot': {
      if (!s.slotId || !project.slots.some((x) => x.id === s.slotId)) return 'That graphic is gone';
      const out = await runQuickEdit(deps, s.slotId, s.instruction ?? '', deps.editRoute);
      if (out.kind === 'applied') return null;
      return out.kind === 'blocked'
        ? out.reason
        : out.kind === 'no-credits'
          ? 'Out of credits'
          : out.kind === 'escalate'
            ? out.message
            : 'Couldn’t change it';
    }
    case 'generateSlot': {
      if (!s.slotId || !project.slots.some((x) => x.id === s.slotId)) return 'That graphic is gone';
      const r = await generateSlot(deps, s.slotId, deps.generateRoute);
      if (r.outcome === 'ready') return null;
      return r.outcome === 'no-credits' ? 'Out of credits' : 'Couldn’t generate';
    }
    default:
      return 'Not a step Pip can run';
  }
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
