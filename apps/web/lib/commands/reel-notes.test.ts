import { fixtureProject } from '@motionpop/motion/testing/project-fixture';
import {
  EditorProjectSchema,
  REEL_NOTES_PER_SCENE,
  TranscriptSchema,
  type EditorProject,
  type ReelNote,
  type ReelPlan,
} from '@motionpop/schemas';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fixCaptionWords } from '@/lib/reel/caption-fix';
import { CommandRejected } from './command';
import { composite } from './command';
import { addReelNote, deleteReelNote, fixReelScene, setReelNoteStatus } from './reel-notes';

const plan: ReelPlan = {
  v: 1,
  look: 'mono',
  focus: { x: 0.5, y: 0.32 },
  captions: true,
  hook: 'Six tools',
  scenes: [
    {
      id: 'r1',
      startMs: 0,
      endMs: 3000,
      layout: 'split',
      bg: 'light',
      content: { template: 'headline', title: 'Hello' },
    },
    { id: 'r2', startMs: 3000, endMs: 6000, layout: 'speaker', content: { template: 'none' } },
  ],
};

const TEXT = 'I use Acme Soft and icachi visuals daily for content'.split(' ');

function project(): EditorProject {
  const base = fixtureProject({ slots: [], durationMs: 6000 });
  return EditorProjectSchema.parse({
    ...base,
    transcript: {
      ...base.transcript,
      words: TEXT.map((text, i) => ({
        i,
        text,
        startMs: 200 + i * 500,
        endMs: 200 + i * 500 + 400,
        conf: 0.9,
        filler: false,
      })),
      prosody: { v: 1, stress: TEXT.map((_, i) => i * 5), pauses: [] },
    },
    reel: plan,
  });
}

const note = (id: string, status: ReelNote['status'] = 'open'): ReelNote => ({
  id,
  tMs: 500,
  shape: { kind: 'circle', points: [0.5, 0.3, 0.1, 0.05] },
  text: 'make it say Hi',
  status,
});

describe('reel note commands (spec 29 R3)', () => {
  it('adds, marks and deletes notes on a scene, each undoing exactly', () => {
    const p = project();
    const add = addReelNote('r1', note('n1'));
    const a = add.do(p);
    expect(a.reel!.scenes[0]!.notes).toHaveLength(1);
    expect(add.undo(a)).toEqual(p);
    const fixed = setReelNoteStatus('r1', 'n1', 'fixed');
    const b = fixed.do(a);
    expect(b.reel!.scenes[0]!.notes![0]!.status).toBe('fixed');
    expect(fixed.undo(b)).toEqual(a);
    const del = deleteReelNote('r1', 'n1');
    const c = del.do(b);
    expect(c.reel!.scenes[0]!.notes).toEqual([]);
    expect(del.undo(c)).toEqual(b);
  });

  it('rejects bad shapes, repeats, unknown scenes and keeps at most the cap', () => {
    const p = project();
    expect(() =>
      addReelNote('r1', { ...note('x'), shape: { kind: 'circle', points: [2, 0, 0] } }).do(p),
    ).toThrow(CommandRejected);
    expect(() => addReelNote('nope', note('x')).do(p)).toThrow(CommandRejected);
    let q = addReelNote('r1', note('n0', 'fixed')).do(p);
    expect(() => addReelNote('r1', note('n0')).do(q)).toThrow(CommandRejected);
    for (let k = 1; k <= REEL_NOTES_PER_SCENE; k++) q = addReelNote('r1', note(`n${k}`)).do(q);
    const notes = q.reel!.scenes[0]!.notes!;
    expect(notes).toHaveLength(REEL_NOTES_PER_SCENE);
    // The fixed note went first.
    expect(notes.some((n) => n.id === 'n0')).toBe(false);
  });

  it('fixes a scene with its note in one undo step, keeping times, id and notes', () => {
    const p = addReelNote('r1', note('n1')).do(project());
    const fix = composite('Fix note', [
      fixReelScene('r1', {
        scene: {
          ...plan.scenes[0]!,
          id: 'other',
          startMs: 99,
          content: { template: 'headline', title: 'Hi' },
        },
        hook: null,
      }),
      setReelNoteStatus('r1', 'n1', 'fixed'),
    ]);
    const next = fix.do(p);
    const s = next.reel!.scenes[0]!;
    expect(s).toMatchObject({ id: 'r1', startMs: 0, endMs: 3000, content: { title: 'Hi' } });
    expect(s.notes![0]!.status).toBe('fixed');
    expect(next.reel!.hook).toBeUndefined();
    expect(fix.undo(next)).toEqual(p);
  });

  it('fixes caption words in the scene and keeps the transcript valid', () => {
    const p = project();
    const cmd = fixReelScene('r1', {
      scene: plan.scenes[0]!,
      captions: [
        { find: 'Acme Soft', replace: 'AcmeSoft' },
        { find: 'icachi', replace: 'eye-catching' },
      ],
    });
    const next = cmd.do(p);
    const text = next.transcript.words.map((w) => w.text).join(' ');
    expect(text).toBe('I use AcmeSoft and eye-catching visuals daily for content');
    expect(TranscriptSchema.safeParse(next.transcript).success).toBe(true);
    const merged = next.transcript.words[2]!;
    expect([merged.startMs, merged.endMs]).toEqual([1200, 2100]);
    expect(cmd.undo(next)).toEqual(p);
    // Outside the scene's window nothing is touched.
    expect(() =>
      fixReelScene('r1', {
        scene: plan.scenes[0]!,
        captions: [{ find: 'content', replace: 'x' }],
      }).do(p),
    ).toThrow(CommandRejected);
  });
});

describe('caption fixes (spec 29 R4.3)', () => {
  it('keeps timings, indices and prosody aligned for any fix (property)', () => {
    const p = project();
    const i = fc.integer({ min: 0, max: TEXT.length - 1 });
    fc.assert(
      fc.property(
        i,
        fc.integer({ min: 1, max: 3 }),
        fc.array(fc.constantFrom('a', 'Bb', 'c.'), { minLength: 1, maxLength: 4 }),
        (start, len, repl) => {
          const find = TEXT.slice(start, start + len).join(' ');
          const out = fixCaptionWords(p.transcript, [{ find, replace: repl.join(' ') }], {
            startMs: 0,
            endMs: 99_999,
          });
          expect(out).not.toBeNull();
          const t = { ...p.transcript, ...out! };
          expect(TranscriptSchema.safeParse(t).success).toBe(true);
          const ws = out!.words;
          expect(ws[0]!.startMs).toBe(p.transcript.words[0]!.startMs);
          expect(ws.at(-1)!.endMs).toBe(p.transcript.words.at(-1)!.endMs);
          for (let k = 1; k < ws.length; k++)
            expect(ws[k]!.startMs).toBeGreaterThanOrEqual(ws[k - 1]!.endMs);
        },
      ),
      { numRuns: 150 },
    );
  });
});
