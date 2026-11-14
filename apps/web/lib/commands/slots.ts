import { applyPatch, validate, type Operation } from 'fast-json-patch';
import { produce } from 'immer';
import type { EditorProject, Slot } from '@motionpop/schemas';
import { clampMove, clampResize, limitsFor } from '../timeline/constraints';
import { timelineIssues, wordsInRange } from '../timeline/invariants';
import { CommandRejected, type Command } from './command';

function findSlot(p: EditorProject, id: string): Slot {
  const s = p.slots.find((x) => x.id === id);
  if (!s) throw new CommandRejected(`slot "${id}" does not exist`);
  return s;
}

function requireMs(name: string, ms: number): void {
  if (!Number.isFinite(ms)) throw new CommandRejected(`${name} must be a finite number`);
}

/** Why `slot` cannot be added to `p` (limits, bounds, overlap, words), or undefined if it fits. */
function misfit(p: EditorProject, slot: Slot): string | undefined {
  if (!Number.isInteger(slot.startMs) || !Number.isInteger(slot.endMs)) {
    return 'slot times must be integer milliseconds';
  }
  const { minMs, maxMs } = limitsFor(slot.componentId);
  const d = slot.endMs - slot.startMs;
  if (d < minMs || d > maxMs) return `duration ${d} ms is outside ${minMs}..${maxMs} ms`;
  return timelineIssues({
    durationMs: p.durationMs,
    slots: [...p.slots, slot],
    transcript: p.transcript,
  })[0];
}

/** Safety net: a command never returns a project that breaks the timeline invariants. */
function checked(next: EditorProject): EditorProject {
  const issue = timelineIssues(next)[0];
  if (issue) throw new CommandRejected(issue);
  return next;
}

function removeById(p: EditorProject, id: string): EditorProject {
  return produce(p, (d) => {
    const i = d.slots.findIndex((s) => s.id === id);
    if (i >= 0) d.slots.splice(i, 1);
  });
}

function restore(p: EditorProject, before: Slot | undefined): EditorProject {
  if (!before) return p;
  return produce(p, (d) => {
    const i = d.slots.findIndex((s) => s.id === before.id);
    if (i >= 0) d.slots[i] = before;
  });
}

function withRange(p: EditorProject, id: string, startMs: number, endMs: number): EditorProject {
  const words = wordsInRange(p.transcript.words, startMs, endMs);
  return checked(
    produce(p, (d) => {
      const s = d.slots.find((x) => x.id === id);
      if (!s) return;
      s.startMs = startMs;
      s.endMs = endMs;
      if (words) {
        s.wordStart = words.wordStart;
        s.wordEnd = words.wordEnd;
      }
    }),
  );
}

export function addSlot(slot: Slot): Command {
  return {
    label: 'Add slot',
    do(p) {
      const why = misfit(p, slot);
      if (why) throw new CommandRejected(why);
      const copy = structuredClone(slot);
      return produce(p, (d) => {
        d.slots.push(copy);
      });
    },
    undo: (p) => removeById(p, slot.id),
  };
}

export function deleteSlot(id: string): Command {
  let removed: { slot: Slot; index: number } | undefined;
  return {
    label: 'Delete slot',
    do(p) {
      const slot = findSlot(p, id);
      removed = { slot, index: p.slots.indexOf(slot) };
      return removeById(p, id);
    },
    undo(p) {
      const r = removed;
      if (!r) return p;
      return produce(p, (d) => {
        d.slots.splice(r.index, 0, r.slot);
      });
    },
  };
}

export function moveSlot(id: string, startMs: number): Command {
  let before: Slot | undefined;
  return {
    label: 'Move slot',
    do(p) {
      requireMs('startMs', startMs);
      const s = findSlot(p, id);
      before = s;
      const start = clampMove(p.slots, id, startMs, p.durationMs);
      return withRange(p, id, start, start + (s.endMs - s.startMs));
    },
    undo: (p) => restore(p, before),
  };
}

export function resizeSlot(id: string, edge: 'start' | 'end', ms: number): Command {
  let before: Slot | undefined;
  return {
    label: 'Resize slot',
    do(p) {
      requireMs('ms', ms);
      const s = findSlot(p, id);
      before = s;
      const edgeMs = clampResize(p.slots, id, edge, ms, limitsFor(s.componentId), p.durationMs);
      return edge === 'start'
        ? withRange(p, id, edgeMs, s.endMs)
        : withRange(p, id, s.startMs, edgeMs);
    },
    undo: (p) => restore(p, before),
  };
}

/** Copy `id` into the next free gap after it. Rejects if no gap fits. */
export function duplicateSlot(id: string, newId: string): Command {
  return {
    label: 'Duplicate slot',
    do(p) {
      const source = findSlot(p, id);
      const len = source.endMs - source.startMs;
      const after = p.slots
        .filter((s) => s.startMs >= source.endMs)
        .sort((a, b) => a.startMs - b.startMs);
      let cursor = source.endMs;
      let start: number | undefined;
      for (const s of after) {
        if (s.startMs - cursor >= len) {
          start = cursor;
          break;
        }
        cursor = Math.max(cursor, s.endMs);
      }
      if (start === undefined && p.durationMs - cursor >= len) start = cursor;
      if (start === undefined) throw new CommandRejected('no free gap after the slot fits a copy');

      const end = start + len;
      const words = wordsInRange(p.transcript.words, start, end);
      if (!words) throw new CommandRejected('no words in the free gap for a copy');

      const copy: Slot = {
        ...structuredClone(source),
        id: newId,
        startMs: start,
        endMs: end,
        wordStart: words.wordStart,
        wordEnd: words.wordEnd,
        notes: [],
      };
      delete copy.currentVersionId;
      const why = misfit(p, copy);
      if (why) throw new CommandRejected(why);
      return produce(p, (d) => {
        const i = d.slots.findIndex((s) => s.id === id);
        d.slots.splice(i + 1, 0, copy);
      });
    },
    undo: (p) => removeById(p, newId),
  };
}

/** Apply an RFC 6902 patch to a slot's params. The patch is validated; the input is never mutated. */
export function updateParams(id: string, patch: ReadonlyArray<Operation>): Command {
  let before: Slot['params'] | undefined;
  return {
    label: 'Edit params',
    do(p) {
      const s = findSlot(p, id);
      const ops = structuredClone([...patch]);
      let next: unknown;
      try {
        const error = validate(ops, s.params);
        if (error) throw new CommandRejected(`invalid patch: ${error.message}`);
        next = applyPatch(structuredClone(s.params), ops, true, false).newDocument;
      } catch (e) {
        if (e instanceof CommandRejected) throw e;
        throw new CommandRejected(`invalid patch: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (typeof next !== 'object' || next === null || Array.isArray(next)) {
        throw new CommandRejected('params must stay an object');
      }
      const params = next as Slot['params'];
      before = s.params;
      return produce(p, (d) => {
        const target = d.slots.find((x) => x.id === id);
        if (target) target.params = params;
      });
    },
    undo(p) {
      const prev = before;
      if (!prev) return p;
      return produce(p, (d) => {
        const target = d.slots.find((x) => x.id === id);
        if (target) target.params = prev;
      });
    },
  };
}
