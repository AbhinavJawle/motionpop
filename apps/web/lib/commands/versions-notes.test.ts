import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  EditorProjectSchema,
  VERSIONS_PER_SLOT,
  type EditorProject,
  type FrameNote,
  type SlotTiming,
  type Version,
} from '@motionpop/schemas';
import {
  CommandRejected,
  addNote,
  applyVersion,
  composite,
  deleteNote,
  markFailed,
  pruneVersions,
  restoreVersion,
  setNoteStatus,
  setSlotPrompt,
  setSlotTiming,
  updateNote,
  type Command,
} from './index';
import { checkValid, opArb, projectArb, toCommand, tryDo } from './test-support';

// ---------- generators ----------

let counter = 0;
const version = (slotId: string, componentId: string, over: Partial<Version> = {}): Version => ({
  id: `nv${counter++}`,
  slotId,
  componentId,
  params: { value: counter },
  source: 'user',
  costCredits: 0,
  createdAt: counter,
  label: 'Edited',
  ...over,
});

const timingArb: fc.Arbitrary<SlotTiming> = fc.record(
  {
    speed: fc.double({ min: 0.5, max: 2, noNaN: true }),
    ease: fc.constantFrom('inOut', 'out', 'linear'),
    fade: fc.boolean(),
  },
  { requiredKeys: [] },
);

const noteFor = (id: string, over: Partial<FrameNote> = {}): FrameNote => ({
  id,
  tMs: 100,
  shape: { kind: 'circle', points: [0.5, 0.5, 0.1, 0.2] },
  text: 'make this slower',
  status: 'open',
  ...over,
});

/** Spec 04 projects, plus 0..19 versions per slot (the current one among them) and some notes. */
const richProjectArb: fc.Arbitrary<EditorProject> = projectArb.chain((p) =>
  fc
    .tuple(
      fc.array(fc.integer({ min: 0, max: 19 }), {
        minLength: p.slots.length,
        maxLength: p.slots.length,
      }),
      fc.array(fc.nat(), { minLength: p.slots.length, maxLength: p.slots.length }),
      fc.array(fc.integer({ min: 0, max: 2 }), {
        minLength: p.slots.length,
        maxLength: p.slots.length,
      }),
    )
    .map(([counts, picks, noteCounts]) => {
      const versions: Version[] = [];
      const slots = p.slots.map((s, i) => {
        const mine = Array.from({ length: counts[i] ?? 0 }, (_, k) =>
          version(s.id, s.componentId, { id: `${s.id}-v${k}`, params: { value: k } }),
        );
        versions.push(...mine);
        const cur = mine.length > 0 ? mine[(picks[i] ?? 0) % mine.length] : undefined;
        return {
          ...s,
          ...(cur ? { currentVersionId: cur.id } : {}),
          notes: Array.from({ length: noteCounts[i] ?? 0 }, (_, k) => noteFor(`${s.id}-n${k}`)),
        };
      });
      return { ...p, slots, versions };
    }),
);

const unit = fc.double({ min: 0, max: 1, noNaN: true });
const shapeArb: fc.Arbitrary<FrameNote['shape']> = fc.oneof(
  fc
    .array(unit, { minLength: 3, maxLength: 4 })
    .map((points) => ({ kind: 'circle' as const, points })),
  fc
    .integer({ min: 2, max: 64 })
    .chain((n) => fc.array(unit, { minLength: n * 2, maxLength: n * 2 }))
    .map((points) => ({ kind: 'path' as const, points })),
);
/** Shapes that break one rule each. */
const badShapeArb: fc.Arbitrary<FrameNote['shape']> = fc.oneof(
  fc
    .array(unit, { minLength: 5, maxLength: 9 })
    .map((points) => ({ kind: 'circle' as const, points })),
  fc
    .array(unit, { minLength: 0, maxLength: 2 })
    .map((points) => ({ kind: 'circle' as const, points })),
  fc
    .array(unit, { minLength: 0, maxLength: 3 })
    .map((points) => ({ kind: 'path' as const, points })),
  fc
    .integer({ min: 65, max: 80 })
    .chain((n) => fc.array(unit, { minLength: n * 2, maxLength: n * 2 }))
    .map((points) => ({ kind: 'path' as const, points })),
  fc
    .array(unit, { minLength: 5, maxLength: 5 })
    .map((points) => ({ kind: 'path' as const, points })),
  fc
    .tuple(
      fc.array(unit, { minLength: 3, maxLength: 3 }),
      fc.constantFrom(1.01, -0.01, 7, Number.NaN),
    )
    .map(([points, bad]) => ({ kind: 'circle' as const, points: [...points, bad] })),
);

type NewOp =
  | {
      kind: 'apply';
      i: number;
      timing?: SlotTiming;
      status?: 'ready' | 'suggested' | 'failed';
    }
  | { kind: 'restore'; i: number; pick: number; missing: boolean }
  | { kind: 'timing'; i: number; patch: SlotTiming | null; badSpeed: boolean }
  | { kind: 'prompt'; i: number; text: string }
  | { kind: 'failed'; i: number; error: string }
  | { kind: 'addNote'; i: number; shape: FrameNote['shape']; text: string; dup: boolean }
  | { kind: 'editNote'; i: number; j: number; shape: FrameNote['shape']; text: string }
  | { kind: 'delNote'; i: number; j: number }
  | { kind: 'noteStatus'; i: number; j: number; status: 'open' | 'fixed'; withVersion: boolean };

const newOpArb: fc.Arbitrary<NewOp> = fc.oneof(
  fc.record({
    kind: fc.constant('apply' as const),
    i: fc.nat(10),
    timing: fc.option(timingArb, { nil: undefined }),
    status: fc.option(fc.constantFrom('ready' as const, 'suggested' as const, 'failed' as const), {
      nil: undefined,
    }),
  }),
  fc.record({
    kind: fc.constant('restore' as const),
    i: fc.nat(10),
    pick: fc.nat(40),
    missing: fc.constant(false),
  }),
  fc.record({
    kind: fc.constant('timing' as const),
    i: fc.nat(10),
    patch: fc.option(timingArb, { nil: null }),
    badSpeed: fc.boolean(),
  }),
  fc.record({
    kind: fc.constant('prompt' as const),
    i: fc.nat(10),
    text: fc.string({ maxLength: 600 }),
  }),
  fc.record({
    kind: fc.constant('failed' as const),
    i: fc.nat(10),
    error: fc.string({ maxLength: 300 }),
  }),
  fc.record({
    kind: fc.constant('addNote' as const),
    i: fc.nat(10),
    shape: fc.oneof(shapeArb, badShapeArb),
    text: fc.string({ maxLength: 340 }),
    dup: fc.boolean(),
  }),
  fc.record({
    kind: fc.constant('editNote' as const),
    i: fc.nat(10),
    j: fc.nat(5),
    shape: fc.oneof(shapeArb, badShapeArb),
    text: fc.string({ maxLength: 340 }),
  }),
  fc.record({ kind: fc.constant('delNote' as const), i: fc.nat(10), j: fc.nat(5) }),
  fc.record({
    kind: fc.constant('noteStatus' as const),
    i: fc.nat(10),
    j: fc.nat(5),
    status: fc.constantFrom('open' as const, 'fixed' as const),
    withVersion: fc.boolean(),
  }),
);

function toNewCommand(op: NewOp, p: EditorProject): Command {
  const slot = p.slots[op.i % Math.max(1, p.slots.length)];
  const id = slot?.id ?? 'missing';
  const comp = slot?.componentId ?? 'x';
  const mineVersions = p.versions.filter((v) => v.slotId === id);
  const note = slot?.notes[('j' in op ? op.j : 0) % Math.max(1, slot.notes.length)];
  switch (op.kind) {
    case 'apply':
      return applyVersion(id, {
        params: { value: counter },
        ...(op.timing ? { timing: op.timing } : {}),
        ...(op.status ? { status: op.status } : {}),
        version: version(id, comp),
      });
    case 'restore':
      return restoreVersion(
        id,
        mineVersions[op.pick % Math.max(1, mineVersions.length)]?.id ?? 'none',
      );
    case 'timing':
      return setSlotTiming(id, op.badSpeed && op.patch ? { ...op.patch, speed: 9 } : op.patch);
    case 'prompt':
      return setSlotPrompt(id, op.text);
    case 'failed':
      return markFailed(id, op.error);
    case 'addNote':
      return addNote(
        id,
        noteFor(op.dup && note ? note.id : `an${counter++}`, { shape: op.shape, text: op.text }),
      );
    case 'editNote':
      return updateNote(id, note?.id ?? 'none', { shape: op.shape, text: op.text });
    case 'delNote':
      return deleteNote(id, note?.id ?? 'none');
    case 'noteStatus':
      return setNoteStatus(
        id,
        note?.id ?? 'none',
        op.status,
        op.withVersion ? mineVersions[0]?.id : undefined,
      );
  }
}

/** Per-slot checks of spec 09 P3. */
function checkSlotInvariants(p: EditorProject): void {
  checkValid(p);
  for (const s of p.slots) {
    const mine = p.versions.filter((v) => v.slotId === s.id);
    expect(mine.length).toBeLessThanOrEqual(VERSIONS_PER_SLOT);
    if (s.currentVersionId !== undefined) {
      expect(mine.some((v) => v.id === s.currentVersionId)).toBe(true);
    }
    expect(s.timing === undefined || Object.keys(s.timing).length > 0).toBe(true);
  }
  expect(EditorProjectSchema.safeParse(p).success).toBe(true);
}

// ---------- properties ----------

describe('P3: version, timing, prompt and note commands', () => {
  it('the generated projects satisfy the invariants', () => {
    fc.assert(
      fc.property(richProjectArb, (p) => checkSlotInvariants(p)),
      { numRuns: 100 },
    );
  });

  it('undo(do(s)) equals s for every new command; the input is never mutated; a rejection changes nothing', () => {
    fc.assert(
      fc.property(richProjectArb, newOpArb, (s, op) => {
        const before = structuredClone(s);
        const cmd = toNewCommand(op, s);
        const next = tryDo(cmd, s);
        expect(s).toEqual(before);
        if (!next) return;
        checkSlotInvariants(next);
        expect(cmd.undo(next)).toEqual(before);
      }),
      { numRuns: 800 },
    );
  });

  it('random sequences mixed with the spec 04 commands keep every invariant', () => {
    const mixed = fc.oneof(
      newOpArb.map((o) => ({ n: o })),
      opArb.map((o) => ({ o })),
    );
    fc.assert(
      fc.property(richProjectArb, fc.array(mixed, { maxLength: 40 }), (s, ops) => {
        let p = s;
        for (const op of ops) {
          const cmd = 'n' in op ? toNewCommand(op.n, p) : toCommand(op.o, p);
          const next = tryDo(cmd, p);
          if (next) p = next;
          checkSlotInvariants(p);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('applying many versions keeps 20 per slot, the current one, the newest ones, and other slots untouched', () => {
    fc.assert(
      fc.property(
        richProjectArb.filter((p) => p.slots.length >= 2),
        fc.integer({ min: 1, max: 45 }),
        (s, n) => {
          const [a, b] = s.slots as [
            EditorProject['slots'][number],
            EditorProject['slots'][number],
          ];
          const otherBefore = s.versions.filter((v) => v.slotId === b.id);
          let p = s;
          const ids: string[] = [];
          for (let k = 0; k < n; k++) {
            const v = version(a.id, a.componentId);
            ids.push(v.id);
            p = applyVersion(a.id, { params: { value: k }, version: v }).do(p);
            const mine = p.versions.filter((x) => x.slotId === a.id);
            expect(mine.length).toBeLessThanOrEqual(VERSIONS_PER_SLOT);
            expect(p.slots.find((x) => x.id === a.id)?.currentVersionId).toBe(v.id);
            expect(mine.at(-1)?.id).toBe(v.id);
          }
          expect(p.versions.filter((v) => v.slotId === b.id)).toEqual(otherBefore);
          // The survivors of the last n applied versions are the newest ones, in order.
          const mine = p.versions.filter((x) => x.slotId === a.id).map((v) => v.id);
          const tail = ids.slice(-Math.min(ids.length, VERSIONS_PER_SLOT));
          expect(mine.slice(-tail.length)).toEqual(tail);
        },
      ),
      { numRuns: 60 },
    );
  });

  it('pruning never drops the kept version, even when it is the oldest', () => {
    const vs = Array.from({ length: 25 }, (_, k) => version('s', 'x', { id: `p${k}` }));
    const kept = pruneVersions(vs, 's', 'p0');
    expect(kept).toHaveLength(VERSIONS_PER_SLOT);
    expect(kept[0]?.id).toBe('p0');
    expect(kept.map((v) => v.id)).not.toContain('p1');
    expect(pruneVersions(vs.slice(0, 20), 's', undefined)).toHaveLength(20);
  });

  it('an invalid note shape is rejected by addNote and updateNote and changes nothing', () => {
    fc.assert(
      fc.property(
        richProjectArb.filter((p) => p.slots.length > 0),
        badShapeArb,
        (s, bad) => {
          const slot = s.slots[0]!;
          const before = structuredClone(s);
          expect(() => addNote(slot.id, noteFor('bad', { shape: bad })).do(s)).toThrow(
            CommandRejected,
          );
          const existing = slot.notes[0];
          if (existing) {
            expect(() => updateNote(slot.id, existing.id, { shape: bad }).do(s)).toThrow(
              CommandRejected,
            );
          }
          expect(s).toEqual(before);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('a valid note shape is accepted and undone exactly', () => {
    fc.assert(
      fc.property(
        richProjectArb.filter((p) => p.slots.length > 0),
        shapeArb,
        (s, shape) => {
          const slot = s.slots[0]!;
          const cmd = addNote(slot.id, noteFor('fresh', { shape }));
          const next = cmd.do(s);
          expect(next.slots[0]?.notes.at(-1)?.shape).toEqual(shape);
          expect(cmd.undo(next)).toEqual(s);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ---------- examples and edge cases ----------

describe('commands: examples', () => {
  const base = (): EditorProject => {
    const p = fc.sample(
      richProjectArb.filter((x) => x.slots.length >= 1),
      { numRuns: 1, seed: 7 },
    )[0]!;
    return {
      ...p,
      versions: [],
      slots: p.slots.map((s, i) =>
        i === 0
          ? (() => {
              const { currentVersionId: _drop, ...rest } = s;
              void _drop;
              return {
                ...rest,
                componentId: 'big-number',
                params: { value: 1 },
                notes: [noteFor('n1')],
              };
            })()
          : s,
      ),
    } as EditorProject;
  };
  const sid = (p: EditorProject) => p.slots[0]!.id;

  it('applyVersion sets params, timing, current version and status, and the version carries the timing', () => {
    const p = base();
    const v = version(sid(p), 'big-number', {
      label: 'Generated',
      source: 'ai-cloud',
      costCredits: 3,
    });
    const next = applyVersion(sid(p), {
      params: { value: 45 },
      timing: { speed: 0.8 },
      version: v,
    }).do(p);
    const s = next.slots[0]!;
    expect(s).toMatchObject({
      params: { value: 45 },
      timing: { speed: 0.8 },
      currentVersionId: v.id,
      status: 'ready',
    });
    expect(next.versions.at(-1)).toMatchObject({
      id: v.id,
      timing: { speed: 0.8 },
      costCredits: 3,
    });
  });

  it('applyVersion without timing clears the slot timing, and an empty timing is never stored', () => {
    const p = base();
    const withTiming = applyVersion(sid(p), {
      params: {},
      timing: { fade: false },
      version: version(sid(p), 'big-number'),
    }).do(p);
    const cleared = applyVersion(sid(p), {
      params: {},
      timing: {},
      version: version(sid(p), 'big-number'),
    }).do(withTiming);
    expect(cleared.slots[0]).not.toHaveProperty('timing');
    expect(cleared.versions.at(-1)).not.toHaveProperty('timing');
  });

  it("applyVersion rejects a gone slot, another slot's version, another component and a repeated id", () => {
    const p = base();
    const v = version(sid(p), 'big-number');
    expect(() => applyVersion('nope', { params: {}, version: v }).do(p)).toThrow(CommandRejected);
    expect(() =>
      applyVersion(sid(p), { params: {}, version: { ...v, slotId: 'other' } }).do(p),
    ).toThrow(CommandRejected);
    expect(() =>
      applyVersion(sid(p), { params: {}, version: { ...v, componentId: 'stat-punch' } }).do(p),
    ).toThrow(CommandRejected);
    const once = applyVersion(sid(p), { params: {}, version: v }).do(p);
    expect(() => applyVersion(sid(p), { params: {}, version: v }).do(once)).toThrow(
      CommandRejected,
    );
    expect(() =>
      applyVersion(sid(p), {
        params: {},
        timing: { speed: 5 },
        version: version(sid(p), 'big-number'),
      }).do(p),
    ).toThrow(CommandRejected);
  });

  it('restoreVersion brings back params and timing; a version without timing clears it; the current one and foreign ones are rejected', () => {
    const p0 = base();
    const v1 = version(sid(p0), 'big-number', { id: 'r1' });
    const v2 = version(sid(p0), 'big-number', { id: 'r2' });
    let p = applyVersion(sid(p0), { params: { value: 10 }, version: v1 }).do(p0);
    p = applyVersion(sid(p), { params: { value: 20 }, timing: { speed: 0.5 }, version: v2 }).do(p);
    const restoreR1 = restoreVersion(sid(p), 'r1');
    const back = restoreR1.do(p);
    expect(back.slots[0]).toMatchObject({ params: { value: 10 }, currentVersionId: 'r1' });
    expect(back.slots[0]).not.toHaveProperty('timing');
    expect(restoreR1.undo(back)).toEqual(p);
    expect(() => restoreVersion(sid(p), 'r2').do(p)).toThrow(CommandRejected);
    expect(() => restoreVersion(sid(p), 'zzz').do(p)).toThrow(CommandRejected);
    const foreign: EditorProject = {
      ...p,
      versions: [...p.versions, version(sid(p), 'stat-punch', { id: 'f1' })],
    };
    expect(() => restoreVersion(sid(p), 'f1').do(foreign)).toThrow(CommandRejected);
    const forward = restoreVersion(sid(p), 'r2').do(back);
    expect(forward.slots[0]?.timing).toEqual({ speed: 0.5 });
  });

  it('setSlotTiming merges, resets a key with undefined, clears with null, and rejects no-ops and bad values', () => {
    const p = base();
    const a = setSlotTiming(sid(p), { speed: 0.8 }).do(p);
    const b = setSlotTiming(sid(p), { ease: 'out' }).do(a);
    expect(b.slots[0]?.timing).toEqual({ speed: 0.8, ease: 'out' });
    const c = setSlotTiming(sid(p), { speed: undefined, ease: undefined }).do(b);
    expect(c.slots[0]).not.toHaveProperty('timing');
    expect(setSlotTiming(sid(p), null).do(b).slots[0]).not.toHaveProperty('timing');
    expect(() => setSlotTiming(sid(p), { speed: 0.8 }).do(a)).toThrow(CommandRejected);
    expect(() => setSlotTiming(sid(p), null).do(p)).toThrow(CommandRejected);
    expect(() => setSlotTiming(sid(p), { speed: 3 }).do(p)).toThrow(CommandRejected);
  });

  it('setSlotPrompt trims, rejects unchanged and over-long text, and undoes', () => {
    const p = base();
    const next = setSlotPrompt(sid(p), '  A calm number  ').do(p);
    expect(next.slots[0]?.prompt).toBe('A calm number');
    expect(() => setSlotPrompt(sid(p), 'A calm number').do(next)).toThrow(CommandRejected);
    expect(() => setSlotPrompt(sid(p), 'x'.repeat(501)).do(p)).toThrow(CommandRejected);
    const cmd = setSlotPrompt(sid(p), 'hello');
    expect(cmd.undo(cmd.do(p))).toEqual(p);
  });

  it('markFailed sets the status and error, and undo restores the slot', () => {
    const p = base();
    const cmd = markFailed(sid(p), "Couldn't generate");
    const next = cmd.do(p);
    expect(next.slots[0]).toMatchObject({ status: 'failed', error: "Couldn't generate" });
    expect(cmd.undo(next)).toEqual(p);
  });

  it('a fixed note: applyVersion + setNoteStatus is one undo step that restores params and note', () => {
    const p = base();
    const v = version(sid(p), 'big-number', { id: 'fix1' });
    const cmd = composite('Fix note', [
      applyVersion(sid(p), { params: { value: 2 }, timing: { speed: 0.8 }, version: v }),
      setNoteStatus(sid(p), 'n1', 'fixed', 'fix1'),
    ]);
    const next = cmd.do(p);
    expect(next.slots[0]?.notes[0]).toMatchObject({ status: 'fixed', fixedVersionId: 'fix1' });
    expect(cmd.undo(next)).toEqual(p);
    const reopened = setNoteStatus(sid(p), 'n1', 'open').do(next);
    expect(reopened.slots[0]?.notes[0]).toEqual(noteFor('n1'));
  });

  it('setNoteStatus rejects a version that is not on the slot, a missing note and a no-op', () => {
    const p = base();
    expect(() => setNoteStatus(sid(p), 'n1', 'fixed', 'ghost').do(p)).toThrow(CommandRejected);
    expect(() => setNoteStatus(sid(p), 'nope', 'open').do(p)).toThrow(CommandRejected);
    expect(() => setNoteStatus(sid(p), 'n1', 'open').do(p)).toThrow(CommandRejected);
  });

  it('notes: add, edit, delete; a repeated id and an unchanged edit are rejected', () => {
    const p = base();
    const added = addNote(
      sid(p),
      noteFor('n2', { shape: { kind: 'path', points: [0, 0, 1, 1] } }),
    ).do(p);
    expect(added.slots[0]?.notes.map((n) => n.id)).toEqual(['n1', 'n2']);
    expect(() => addNote(sid(p), noteFor('n2')).do(added)).toThrow(CommandRejected);
    const edited = updateNote(sid(p), 'n2', { text: 'brighter' }).do(added);
    expect(edited.slots[0]?.notes[1]?.text).toBe('brighter');
    expect(() => updateNote(sid(p), 'n2', { text: 'brighter' }).do(edited)).toThrow(
      CommandRejected,
    );
    const gone = deleteNote(sid(p), 'n1').do(edited);
    expect(gone.slots[0]?.notes.map((n) => n.id)).toEqual(['n2']);
    expect(() => deleteNote(sid(p), 'n1').do(gone)).toThrow(CommandRejected);
    const del = deleteNote(sid(p), 'n1');
    const after = del.do(edited);
    expect(del.undo(after)).toEqual(edited);
  });

  it('a note shape is checked: circle with 3 or 4 values, path with an even count in 4..128, all in 0..1, text up to 300', () => {
    const p = base();
    const ok =
      (shape: FrameNote['shape'], text = 'x') =>
      () =>
        addNote(sid(p), noteFor('c', { shape, text })).do(p);
    expect(ok({ kind: 'circle', points: [0.5, 0.5, 0.1] })).not.toThrow();
    expect(ok({ kind: 'circle', points: [0.5, 0.5, 0.1, 0.2] })).not.toThrow();
    expect(ok({ kind: 'circle', points: [0.5, 0.5] })).toThrow(CommandRejected);
    expect(ok({ kind: 'path', points: [0, 0, 1, 1] })).not.toThrow();
    expect(ok({ kind: 'path', points: Array(128).fill(0.5) })).not.toThrow();
    expect(ok({ kind: 'path', points: Array(130).fill(0.5) })).toThrow(CommandRejected);
    expect(ok({ kind: 'path', points: [0, 0, 1] })).toThrow(CommandRejected);
    expect(ok({ kind: 'circle', points: [0.5, 0.5, 1.2] })).toThrow(CommandRejected);
    expect(ok({ kind: 'circle', points: [0.5, 0.5, Number.NaN] })).toThrow(CommandRejected);
    expect(ok({ kind: 'circle', points: [0.5, 0.5, 0.1] }, 'x'.repeat(300))).not.toThrow();
    expect(ok({ kind: 'circle', points: [0.5, 0.5, 0.1] }, 'x'.repeat(301))).toThrow(
      CommandRejected,
    );
  });
});
