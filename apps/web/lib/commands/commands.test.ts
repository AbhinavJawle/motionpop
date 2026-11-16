import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  EditorProjectSchema,
  timelineIssues,
  type EditorProject,
  type Slot,
} from '@motionpop/schemas';
import { limitsFor } from '../timeline/constraints';
import { wordsInRange } from '../timeline/invariants';
import {
  CommandRejected,
  HISTORY_CAP,
  addSlot,
  composite,
  deleteSlot,
  duplicateSlot,
  emptyHistory,
  exec,
  moveSlot,
  redo,
  renameProject,
  resizeSlot,
  setFormat,
  setStyle,
  undo,
  updateParams,
  type Command,
  type History,
} from './index';
import { checkValid, opArb, projectArb, toCommand, tryDo } from './test-support';

// ---------- generators (shared with versions-notes.test.ts) ----------

// ---------- generator validity ----------

describe('generator', () => {
  it('produces valid projects', () => {
    fc.assert(
      fc.property(projectArb, (p) => {
        checkValid(p);
        expect(EditorProjectSchema.safeParse(p).success).toBe(true);
      }),
    );
  });
});

// ---------- properties ----------

describe('command properties', () => {
  it('undo(do(s)) equals s for every command type', () => {
    fc.assert(
      fc.property(projectArb, opArb, (s, op) => {
        const before = structuredClone(s);
        const cmd = toCommand(op, s);
        const next = tryDo(cmd, s);
        if (!next) return;
        expect(s).toEqual(before); // input never mutated
        checkValid(next);
        expect(cmd.undo(next)).toEqual(before);
      }),
      { numRuns: 500 },
    );
  });

  it('random sequences keep the invariants; rejected commands change nothing', () => {
    fc.assert(
      fc.property(projectArb, fc.array(opArb, { maxLength: 40 }), (s, ops) => {
        let p = s;
        for (const op of ops) {
          const next = tryDo(toCommand(op, p), p);
          if (next) p = next;
          checkValid(p);
        }
        expect(EditorProjectSchema.safeParse(p).success).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('move keeps duration; resize ends within limits when the gap allows', () => {
    fc.assert(
      fc.property(
        projectArb,
        fc.nat(10),
        fc.constantFrom('start' as const, 'end' as const),
        fc.integer({ min: -5000, max: 80_000 }),
        (s, i, edge, ms) => {
          const slot = s.slots[i % Math.max(1, s.slots.length)];
          if (!slot) return;
          const moved = moveSlot(slot.id, ms)
            .do(s)
            .slots.find((x) => x.id === slot.id);
          expect(moved ? moved.endMs - moved.startMs : -1).toBe(slot.endMs - slot.startMs);

          const resized = resizeSlot(slot.id, edge, ms)
            .do(s)
            .slots.find((x) => x.id === slot.id);
          const { minMs, maxMs } = limitsFor(slot.componentId);
          const d = resized ? resized.endMs - resized.startMs : -1;
          expect(d).toBeGreaterThanOrEqual(minMs);
          expect(d).toBeLessThanOrEqual(maxMs);
        },
      ),
    );
  });

  it('moving and resizing re-derive the word range', () => {
    fc.assert(
      fc.property(projectArb, fc.nat(10), fc.integer({ min: 0, max: 60_000 }), (s, i, ms) => {
        const slot = s.slots[i % Math.max(1, s.slots.length)];
        if (!slot) return;
        const moved = moveSlot(slot.id, ms)
          .do(s)
          .slots.find((x) => x.id === slot.id);
        if (!moved) throw new Error('slot vanished');
        const range = wordsInRange(s.transcript.words, moved.startMs, moved.endMs);
        if (range) expect({ wordStart: moved.wordStart, wordEnd: moved.wordEnd }).toEqual(range);
      }),
    );
  });

  it('composite undo restores the original in one step', () => {
    fc.assert(
      fc.property(projectArb, fc.array(opArb, { maxLength: 15 }), (s, ops) => {
        const before = structuredClone(s);
        let p = s;
        const cmds: Command[] = [];
        for (const op of ops) {
          const cmd = toCommand(op, p);
          const next = tryDo(cmd, p);
          if (next) {
            cmds.push(cmd);
            p = next;
          }
        }
        const c = composite('batch', cmds);
        const done = c.do(s);
        expect(done).toEqual(p);
        expect(c.undo(done)).toEqual(before);
      }),
      { numRuns: 200 },
    );
  });
});

describe('history properties', () => {
  it('exec/undo/redo round trip', () => {
    fc.assert(
      fc.property(projectArb, fc.array(opArb, { maxLength: 30 }), (s, ops) => {
        const states: EditorProject[] = [s];
        let h: History = emptyHistory;
        let p = s;
        for (const op of ops) {
          const cmd = toCommand(op, p);
          if (!tryDo(cmd, p)) continue;
          const r = exec(h, p, cmd);
          h = r.history;
          p = r.project;
          states.push(p);
          expect(h.future).toHaveLength(0);
        }
        const final = p;
        for (let k = states.length - 2; k >= 0; k--) {
          const r = undo(h, p);
          h = r.history;
          p = r.project;
          expect(p).toEqual(states[k]);
        }
        for (let k = 1; k < states.length; k++) {
          const r = redo(h, p);
          h = r.history;
          p = r.project;
          expect(p).toEqual(states[k]);
        }
        expect(p).toEqual(final);
      }),
      { numRuns: 150 },
    );
  });

  it('never exceeds the cap and drops the oldest', () => {
    fc.assert(
      fc.property(projectArb, fc.integer({ min: 190, max: 260 }), (s, n) => {
        let h: History = emptyHistory;
        let p = s;
        for (let k = 0; k < n; k++) {
          const r = exec(h, p, renameProject(`t${k}`));
          h = r.history;
          p = r.project;
          expect(h.past.length).toBeLessThanOrEqual(HISTORY_CAP);
        }
        expect(h.past).toHaveLength(Math.min(n, HISTORY_CAP));
        while (h.past.length > 0) {
          const r = undo(h, p);
          h = r.history;
          p = r.project;
        }
        // the oldest commands were dropped, so undo stops at the state before the kept ones
        expect(p.title).toBe(n > HISTORY_CAP ? `t${n - HISTORY_CAP - 1}` : 'Title');
      }),
      { numRuns: 10 },
    );
  });
});

// ---------- unit tests ----------

const fixture = (): EditorProject => {
  const words = Array.from({ length: 40 }, (_, i) => ({
    i,
    text: `w${i}`,
    startMs: i * 500,
    endMs: i * 500 + 400,
    conf: 1,
    filler: false,
  }));
  const mk = (id: string, startMs: number, endMs: number): Slot => ({
    id,
    startMs,
    endMs,
    ...(wordsInRange(words, startMs, endMs) ?? { wordStart: 0, wordEnd: 0 }),
    reason: 'r',
    componentId: 'x',
    skillId: 'skill',
    prompt: '',
    params: { a: 1, list: [1, 2] },
    status: 'ready',
    notes: [],
  });
  return {
    schemaVersion: 1,
    id: 'p',
    title: 'T',
    format: '16:9',
    fps: 30,
    styleId: 'style-a',
    durationMs: 20_000,
    voiceover: { src: 'v', durationMs: 20_000 },
    transcript: { words, language: 'en', ranOn: 'device', timingQuality: 'word', cleaned: false },
    slots: [mk('a', 1000, 3000), mk('b', 4000, 6000)],
    versions: [],
    createdAt: 1,
    updatedAt: 1,
  };
};

describe('rejections', () => {
  const p = fixture();
  const base = p.slots[0] as Slot;

  it('addSlot rejects overlap, out-of-bounds, short, long and duplicate-id slots', () => {
    const slot = (over: Partial<Slot>): Slot => ({ ...base, id: 'new', ...over });
    for (const bad of [
      slot({ startMs: 2500, endMs: 4500 }),
      slot({ startMs: 19_000, endMs: 21_000 }),
      slot({ startMs: 7000, endMs: 7500 }),
      slot({ startMs: 7000, endMs: 20_000 }),
      slot({ id: 'a', startMs: 8000, endMs: 10_000 }),
      slot({ startMs: 7000.5, endMs: 9000 }),
    ]) {
      expect(() => addSlot(bad).do(p)).toThrow(CommandRejected);
    }
    expect(addSlot(slot({ startMs: 6000, endMs: 8000 })).do(p).slots).toHaveLength(3);
  });

  it('missing ids are rejected', () => {
    for (const c of [
      deleteSlot('zz'),
      moveSlot('zz', 0),
      resizeSlot('zz', 'end', 5000),
      duplicateSlot('zz', 'n'),
      updateParams('zz', []),
    ]) {
      expect(() => c.do(p)).toThrow(CommandRejected);
    }
  });

  it('non-finite times are rejected', () => {
    expect(() => moveSlot('a', Number.NaN).do(p)).toThrow(CommandRejected);
    expect(() => resizeSlot('a', 'end', Number.POSITIVE_INFINITY).do(p)).toThrow(CommandRejected);
  });

  it('duplicateSlot places the copy in the next gap, or rejects when none fits', () => {
    const dup = duplicateSlot('a', 'a2').do(p);
    const copy = dup.slots.find((s) => s.id === 'a2');
    // gap 3000..4000 is too small for 2000 ms, so it lands after 'b'
    expect(copy?.startMs).toBe(6000);
    expect(dup.slots.map((s) => s.id)).toEqual(['a', 'a2', 'b']);
    expect(timelineIssues(dup)).toEqual([]);

    const tight = { ...p, durationMs: 7000 };
    expect(() => duplicateSlot('b', 'b2').do(tight)).toThrow(CommandRejected);
  });

  it('duplicateSlot uses a gap right after the source when it fits', () => {
    const roomy = produceSlots(p, [
      { ...base, id: 'a', startMs: 1000, endMs: 3000 },
      { ...base, id: 'b', startMs: 8000, endMs: 10_000 },
    ]);
    const copy = duplicateSlot('a', 'a2')
      .do(roomy)
      .slots.find((s) => s.id === 'a2');
    expect(copy).toMatchObject({ startMs: 3000, endMs: 5000 });
  });

  it('updateParams rejects invalid patches and never mutates the input', () => {
    const before = structuredClone(p);
    for (const patch of [
      [{ op: 'replace', path: '/nope', value: 1 }],
      [{ op: 'remove', path: '/nope' }],
      [{ op: 'test', path: '/a', value: 2 }],
      [{ op: 'replace', path: '', value: 5 }],
      [{ op: 'replace', path: '', value: [1] }],
      [{ op: 'bogus', path: '/a' }],
      [{ op: 'add', path: '/__proto__/x', value: 1 }],
    ] as unknown as Parameters<typeof updateParams>[1][]) {
      expect(() => updateParams('a', patch).do(p)).toThrow(CommandRejected);
    }
    expect(p).toEqual(before);
  });

  it('updateParams applies add/replace/remove and undoes', () => {
    const cmd = updateParams('a', [
      { op: 'replace', path: '/a', value: 9 },
      { op: 'add', path: '/list/-', value: 3 },
      { op: 'add', path: '/b', value: 'x' },
    ]);
    const next = cmd.do(p);
    expect(next.slots[0]?.params).toEqual({ a: 9, list: [1, 2, 3], b: 'x' });
    expect(cmd.undo(next)).toEqual(p);
  });

  it('project commands validate input', () => {
    expect(() => renameProject('   ').do(p)).toThrow(CommandRejected);
    expect(() => renameProject('x'.repeat(81)).do(p)).toThrow(CommandRejected);
    expect(renameProject('  Hi  ').do(p).title).toBe('Hi');
    expect(renameProject('x'.repeat(80)).do(p).title).toHaveLength(80);
    expect(() => setStyle('').do(p)).toThrow(CommandRejected);
    expect(setFormat('9:16').do(p).format).toBe('9:16');
    expect(setStyle('style-b').do(p).styleId).toBe('style-b');
  });

  it('a rejected child makes the composite throw without a result', () => {
    const c = composite('batch', [renameProject('ok'), deleteSlot('zz')]);
    expect(() => c.do(p)).toThrow(CommandRejected);
    expect(p.title).toBe('T');
  });

  it('move and resize stop at neighbours', () => {
    const moved = moveSlot('a', 3500).do(p).slots[0];
    expect(moved).toMatchObject({ startMs: 2000, endMs: 4000 });
    const resized = resizeSlot('a', 'end', 9000).do(p).slots[0];
    expect(resized?.endMs).toBe(4000);
    const short = resizeSlot('a', 'end', 1100).do(p).slots[0];
    expect(short?.endMs).toBe(2000);
  });

  it('undo and redo on empty history are no-ops', () => {
    expect(undo(emptyHistory, p)).toEqual({ history: emptyHistory, project: p });
    expect(redo(emptyHistory, p)).toEqual({ history: emptyHistory, project: p });
  });

  it('a rejected exec leaves history untouched and exec clears the future', () => {
    const r1 = exec(emptyHistory, p, renameProject('One'));
    expect(() => exec(r1.history, r1.project, deleteSlot('zz'))).toThrow(CommandRejected);
    const u = undo(r1.history, r1.project);
    expect(u.history.future).toHaveLength(1);
    const r2 = exec(u.history, u.project, renameProject('Two'));
    expect(r2.history.future).toHaveLength(0);
  });
});

function produceSlots(p: EditorProject, slots: Slot[]): EditorProject {
  return {
    ...p,
    slots: slots.map((s) => ({
      ...s,
      ...(wordsInRange(p.transcript.words, s.startMs, s.endMs) ?? {}),
    })),
  };
}
