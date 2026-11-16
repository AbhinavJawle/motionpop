import { FrameNoteSchema, type FrameNote, type Slot } from '@motionpop/schemas';
import { produce } from 'immer';
import { CommandRejected, type Command } from './command';
import { findSlot } from './slot-helpers';

export const NOTE_TEXT_MAX = 300;

/**
 * Why a note's shape is not acceptable, or undefined. The project schema does not enforce these
 * (a saved project never fails to load because of a limit, D-049); the commands do:
 * a circle has 3 values [cx, cy, r] or 4 [cx, cy, rx, ry]; a path has an even count of 4..128
 * values; every value is in 0..1; the text is at most 300 characters.
 */
export function noteProblem(note: FrameNote): string | undefined {
  const parsed = FrameNoteSchema.safeParse(note);
  if (!parsed.success) return `invalid note: ${parsed.error.issues[0]?.message ?? ''}`;
  const { kind, points } = note.shape;
  if (kind === 'circle' && points.length !== 3 && points.length !== 4) {
    return 'a circle has 3 or 4 values';
  }
  if (kind === 'path' && (points.length % 2 !== 0 || points.length < 4 || points.length > 128)) {
    return 'a path has an even number of values, from 4 to 128';
  }
  if (!points.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)) {
    return 'every shape value must be between 0 and 1';
  }
  if (note.text.length > NOTE_TEXT_MAX)
    return `the note is longer than ${NOTE_TEXT_MAX} characters`;
  return undefined;
}

function replaceNotes(p: Parameters<Command['do']>[0], slotId: string, notes: FrameNote[]) {
  return produce(p, (d) => {
    const target = d.slots.find((x) => x.id === slotId);
    if (target) target.notes = notes;
  });
}

/** A note command: reads the slot's notes, returns the new list or throws. Undo restores the old list. */
function noteCommand(
  label: string,
  slotId: string,
  change: (notes: readonly FrameNote[], slot: Slot, p: Parameters<Command['do']>[0]) => FrameNote[],
): Command {
  let before: FrameNote[] | undefined;
  return {
    label,
    do(p) {
      const slot = findSlot(p, slotId);
      const next = change(slot.notes, slot, p);
      before = slot.notes;
      return replaceNotes(p, slotId, next);
    },
    undo(p) {
      const prev = before;
      return prev ? replaceNotes(p, slotId, prev) : p;
    },
  };
}

function noteIndex(notes: readonly FrameNote[], noteId: string): number {
  const i = notes.findIndex((n) => n.id === noteId);
  if (i < 0) throw new CommandRejected(`note "${noteId}" does not exist`);
  return i;
}

/** Adds a note to the slot. Rejects a bad shape or a repeated id, changing nothing. */
export function addNote(slotId: string, note: FrameNote): Command {
  return noteCommand('Add note', slotId, (notes) => {
    const why = noteProblem(note);
    if (why) throw new CommandRejected(why);
    if (notes.some((n) => n.id === note.id)) throw new CommandRejected(`note "${note.id}" exists`);
    return [...notes, structuredClone(note)];
  });
}

export type NoteEdit = Partial<Pick<FrameNote, 'text' | 'shape' | 'tMs'>>;

/** Changes a note's text, shape or time; the result is checked like a new note. */
export function updateNote(slotId: string, noteId: string, edit: NoteEdit): Command {
  return noteCommand('Edit note', slotId, (notes) => {
    const i = noteIndex(notes, noteId);
    const old = notes[i] as FrameNote;
    const next: FrameNote = { ...old, ...structuredClone(edit) };
    const why = noteProblem(next);
    if (why) throw new CommandRejected(why);
    if (JSON.stringify(next) === JSON.stringify(old)) {
      throw new CommandRejected('the note is unchanged');
    }
    return notes.map((n, k) => (k === i ? next : n));
  });
}

export function deleteNote(slotId: string, noteId: string): Command {
  return noteCommand('Delete note', slotId, (notes) => {
    noteIndex(notes, noteId);
    return notes.filter((n) => n.id !== noteId);
  });
}

/**
 * Marks a note fixed (with the version that fixed it) or open again ("Still there?"). A
 * `fixedVersionId` must name a version of this slot, so in a composite put `applyVersion` first.
 * Reopening drops `fixedVersionId`.
 */
export function setNoteStatus(
  slotId: string,
  noteId: string,
  status: FrameNote['status'],
  fixedVersionId?: string,
): Command {
  return noteCommand('Set note status', slotId, (notes, _slot, p) => {
    const i = noteIndex(notes, noteId);
    if (status === 'fixed' && fixedVersionId !== undefined) {
      if (!p.versions.some((v) => v.id === fixedVersionId && v.slotId === slotId)) {
        throw new CommandRejected(`version "${fixedVersionId}" does not exist on this slot`);
      }
    }
    const old = notes[i] as FrameNote;
    const { fixedVersionId: _drop, ...rest } = old;
    void _drop;
    const next: FrameNote =
      status === 'fixed'
        ? { ...rest, status, ...(fixedVersionId !== undefined ? { fixedVersionId } : {}) }
        : { ...rest, status };
    if (JSON.stringify(next) === JSON.stringify(old)) {
      throw new CommandRejected('the note already has that status');
    }
    return notes.map((n, k) => (k === i ? next : n));
  });
}
