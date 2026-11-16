import fc from 'fast-check';
import { expect } from 'vitest';
import { timelineIssues, type EditorProject, type Slot } from '@motionpop/schemas';
import { limitsFor } from '../timeline/constraints';
import { checkDurations, wordsInRange } from '../timeline/invariants';
import {
  CommandRejected,
  addSlot,
  deleteSlot,
  duplicateSlot,
  moveSlot,
  renameProject,
  resizeSlot,
  setFormat,
  setStyle,
  updateParams,
  type Command,
} from './index';

// Test support for the command tests: the random project and spec 04 operation generators.

// ---------- generators ----------

export const COMPONENTS = ['x', 'big-number'] as const;

export const projectArb: fc.Arbitrary<EditorProject> = fc
  .record({
    words: fc.array(
      fc.tuple(fc.integer({ min: 0, max: 400 }), fc.integer({ min: 100, max: 700 })),
      {
        minLength: 20,
        maxLength: 120,
      },
    ),
    tail: fc.integer({ min: 0, max: 5000 }),
    slotParts: fc.array(
      fc.tuple(
        fc.integer({ min: 0, max: 4000 }),
        fc.integer({ min: 0, max: 1000 }),
        fc.constantFrom(...COMPONENTS),
      ),
      { maxLength: 8 },
    ),
  })
  .map(({ words, tail, slotParts }) => {
    let t = 0;
    const ws = words.map(([gap, len], i) => {
      const startMs = t + gap;
      t = startMs + len;
      return { i, text: `w${i}`, startMs, endMs: t, conf: 1, filler: false };
    });
    const durationMs = t + tail + 1;
    const slots: Slot[] = [];
    let cursor = 0;
    slotParts.forEach(([gap, frac, componentId], i) => {
      const { minMs, maxMs } = limitsFor(componentId);
      const len = minMs + Math.floor(((maxMs - minMs) * frac) / 1000);
      const startMs = cursor + gap;
      const endMs = startMs + len;
      if (endMs > durationMs) return;
      const range = wordsInRange(ws, startMs, endMs);
      if (!range) return;
      cursor = endMs;
      slots.push({
        id: `s${i}`,
        startMs,
        endMs,
        ...range,
        reason: `reason ${i}`,
        componentId,
        skillId: 'skill',
        prompt: '',
        params: { value: i, nested: { a: [1, 2, 3] } },
        status: 'ready',
        notes: [],
      });
    });
    const project: EditorProject = {
      schemaVersion: 1,
      id: 'p1',
      title: 'Title',
      format: '16:9',
      fps: 30,
      styleId: 'style-a',
      durationMs,
      voiceover: { src: 'voice.wav', durationMs },
      transcript: {
        words: ws,
        language: 'en',
        ranOn: 'device',
        timingQuality: 'word',
        cleaned: false,
      },
      slots,
      versions: [],
      createdAt: 1,
      updatedAt: 1,
    };
    return project;
  });

export type Op =
  | { kind: 'add'; start: number; len: number; comp: (typeof COMPONENTS)[number]; dupId: boolean }
  | { kind: 'delete'; i: number }
  | { kind: 'move'; i: number; ms: number }
  | { kind: 'resize'; i: number; edge: 'start' | 'end'; ms: number }
  | { kind: 'duplicate'; i: number }
  | { kind: 'params'; i: number; key: string; value: number; bad: boolean }
  | { kind: 'format'; format: EditorProject['format'] }
  | { kind: 'style'; id: string }
  | { kind: 'rename'; title: string };

export const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.record({
    kind: fc.constant('add' as const),
    start: fc.integer({ min: 0, max: 70_000 }),
    len: fc.integer({ min: 0, max: 14_000 }),
    comp: fc.constantFrom(...COMPONENTS),
    dupId: fc.boolean(),
  }),
  fc.record({ kind: fc.constant('delete' as const), i: fc.nat(10) }),
  fc.record({
    kind: fc.constant('move' as const),
    i: fc.nat(10),
    ms: fc.integer({ min: -5000, max: 80_000 }),
  }),
  fc.record({
    kind: fc.constant('resize' as const),
    i: fc.nat(10),
    edge: fc.constantFrom('start' as const, 'end' as const),
    ms: fc.integer({ min: -5000, max: 80_000 }),
  }),
  fc.record({ kind: fc.constant('duplicate' as const), i: fc.nat(10) }),
  fc.record({
    kind: fc.constant('params' as const),
    i: fc.nat(10),
    key: fc.constantFrom('value', 'label', 'nested'),
    value: fc.integer(),
    bad: fc.boolean(),
  }),
  fc.record({
    kind: fc.constant('format' as const),
    format: fc.constantFrom('16:9', '9:16', '1:1'),
  }),
  fc.record({ kind: fc.constant('style' as const), id: fc.constantFrom('style-a', 'style-b', '') }),
  fc.record({ kind: fc.constant('rename' as const), title: fc.string({ maxLength: 100 }) }),
);

let counter = 0;
export function toCommand(op: Op, p: EditorProject): Command {
  const slot = p.slots[('i' in op ? op.i : 0) % Math.max(1, p.slots.length)];
  const id = slot?.id ?? 'missing';
  switch (op.kind) {
    case 'add': {
      const end = op.start + op.len;
      const range = wordsInRange(p.transcript.words, op.start, end) ?? { wordStart: 0, wordEnd: 0 };
      return addSlot({
        id: op.dupId && slot ? slot.id : `n${counter++}`,
        startMs: op.start,
        endMs: end,
        ...range,
        reason: 'added',
        componentId: op.comp,
        skillId: 'skill',
        prompt: '',
        params: {},
        status: 'suggested',
        notes: [],
      });
    }
    case 'delete':
      return deleteSlot(id);
    case 'move':
      return moveSlot(id, op.ms);
    case 'resize':
      return resizeSlot(id, op.edge, op.ms);
    case 'duplicate':
      return duplicateSlot(id, `d${counter++}`);
    case 'params':
      return updateParams(
        id,
        op.bad
          ? [{ op: 'replace', path: `/missing/${op.key}`, value: op.value }]
          : [{ op: 'add', path: `/${op.key}`, value: op.value }],
      );
    case 'format':
      return setFormat(op.format);
    case 'style':
      return setStyle(op.id);
    case 'rename':
      return renameProject(op.title);
  }
}

/** Apply a command; a rejection must leave the project unchanged. */
export function tryDo(cmd: Command, p: EditorProject): EditorProject | null {
  const snapshot = structuredClone(p);
  try {
    return cmd.do(p);
  } catch (e) {
    expect(e).toBeInstanceOf(CommandRejected);
    expect(p).toEqual(snapshot);
    return null;
  }
}

export function checkValid(p: EditorProject) {
  expect(timelineIssues(p)).toEqual([]);
  expect(checkDurations(p.slots, limitsFor)).toEqual([]);
}
