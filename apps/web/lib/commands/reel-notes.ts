import {
  REEL_NOTES_PER_SCENE,
  ReelSceneSchema,
  reelSceneData,
  type EditorProject,
  type FrameNote,
  type ReelNote,
  type ReelScene,
} from '@motionpop/schemas';
import { produce } from 'immer';
import { fixCaptionWords } from '@/lib/reel/caption-fix';
import { CommandRejected, type Command } from './command';
import { noteProblem } from './notes';

/**
 * Frame notes on reel scenes (spec 29 R3): the same shapes and limits as slot notes (spec 09),
 * kept on the scene. Each command is one undo step; a fix is one composite (scene + note status).
 */

function sceneOf(p: EditorProject, sceneId: string): ReelScene {
  if (!p.reel) throw new CommandRejected('This project has no reel');
  const s = p.reel.scenes.find((x) => x.id === sceneId);
  if (!s) throw new CommandRejected(`scene "${sceneId}" does not exist`);
  return s;
}

/** Replaces one scene's notes; undo puts the old list back (absent stays absent). */
function reelNoteCommand(
  label: string,
  sceneId: string,
  change: (notes: readonly ReelNote[], scene: ReelScene) => ReelNote[],
): Command {
  let before: ReelNote[] | undefined;
  let had = false;
  const put = (p: EditorProject, notes: ReelNote[] | undefined) =>
    produce(p, (d) => {
      const s = d.reel?.scenes.find((x) => x.id === sceneId);
      if (!s) return;
      if (notes === undefined) delete s.notes;
      else s.notes = notes;
    });
  return {
    label,
    do(p) {
      const scene = sceneOf(p, sceneId);
      had = scene.notes !== undefined;
      before = scene.notes;
      return put(p, change(scene.notes ?? [], scene));
    },
    undo(p) {
      return put(p, had ? before : undefined);
    },
  };
}

const indexOf = (notes: readonly ReelNote[], id: string) => {
  const i = notes.findIndex((n) => n.id === id);
  if (i < 0) throw new CommandRejected(`note "${id}" does not exist`);
  return i;
};

/** Adds a note; past the cap the oldest fixed note goes first, then the oldest note. */
export function addReelNote(sceneId: string, note: ReelNote): Command {
  return reelNoteCommand('Add note', sceneId, (notes) => {
    const why = noteProblem(note as FrameNote);
    if (why) throw new CommandRejected(why);
    if (notes.some((n) => n.id === note.id)) throw new CommandRejected(`note "${note.id}" exists`);
    let next = [...notes, structuredClone(note)];
    while (next.length > REEL_NOTES_PER_SCENE) {
      const drop = next.findIndex((n) => n.status === 'fixed');
      next = next.filter((_, k) => k !== (drop >= 0 ? drop : 0));
    }
    return next;
  });
}

export function deleteReelNote(sceneId: string, noteId: string): Command {
  return reelNoteCommand('Delete note', sceneId, (notes) => {
    indexOf(notes, noteId);
    return notes.filter((n) => n.id !== noteId);
  });
}

export function setReelNoteStatus(
  sceneId: string,
  noteId: string,
  status: ReelNote['status'],
): Command {
  return reelNoteCommand('Set note status', sceneId, (notes) => {
    const i = indexOf(notes, noteId);
    if (notes[i]!.status === status) throw new CommandRejected('the note already has that status');
    return notes.map((n, k) => (k === i ? { ...n, status } : n));
  });
}

export interface ReelSceneFix {
  /** The scene's new data (its id, times and notes are kept from the project). */
  scene: ReelScene;
  /** New hook title; null removes it; undefined leaves it. */
  hook?: string | null;
  /** Caption fixes inside the scene (spec 29 R4.3). */
  captions?: readonly { find: string; replace: string }[];
}

/**
 * Applies a note's fix to one scene: its layout, background, tag and graphic, the hook band and
 * the caption words under it. Times, id and notes stay. Rejects anything invalid, changing nothing.
 */
export function fixReelScene(sceneId: string, fix: ReelSceneFix, label = 'Fix note'): Command {
  let prev: Pick<EditorProject, 'reel' | 'transcript'> | undefined;
  return {
    label,
    do(p) {
      const old = sceneOf(p, sceneId);
      const data = reelSceneData(fix.scene);
      const next = ReelSceneSchema.safeParse({
        ...data,
        id: old.id,
        startMs: old.startMs,
        endMs: old.endMs,
        ...(old.notes ? { notes: old.notes } : {}),
      });
      if (!next.success) throw new CommandRejected('That scene is not valid');
      let transcript = p.transcript;
      if (fix.captions?.length) {
        const fixed = fixCaptionWords(p.transcript, fix.captions, {
          startMs: old.startMs - 1500,
          endMs: old.endMs + 600,
        });
        if (!fixed) throw new CommandRejected('That caption fix does not match the words');
        transcript = { ...p.transcript, ...fixed };
        if (!fixed.prosody) delete transcript.prosody;
      }
      prev = { reel: p.reel, transcript: p.transcript };
      return produce(p, (d) => {
        const r = d.reel!;
        r.scenes = r.scenes.map((s) => (s.id === sceneId ? next.data : s));
        if (fix.hook === null) delete r.hook;
        else if (fix.hook !== undefined) r.hook = fix.hook;
        d.transcript = transcript;
      });
    },
    undo(p) {
      return produce(p, (d) => {
        if (!prev) return;
        d.reel = prev.reel;
        d.transcript = prev.transcript;
      });
    },
  };
}
