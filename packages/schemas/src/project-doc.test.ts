import { describe, expect, it } from 'vitest';
import { ProjectDocSchema, ProjectSummarySchema } from './project-doc';
import { EditorProjectSchema } from './project';
import { PendingIntakeSchema, StartDraftSchema } from './start';

const doc = () => ({
  schemaVersion: 1,
  ownerId: 'u1',
  title: 'Demo',
  format: '16:9',
  fps: 30,
  styleId: 'editorial-explainer',
  durationMs: 18_000,
  voiceover: { src: 'idb:a', durationMs: 18_000, source: 'upload' },
  status: 'ready',
  slotCount: 3,
  readySlotCount: 2,
  slotStates: ['ready', 'ready', 'pending'],
  graphicsGenerated: 1,
  lastOpenedAt: 3,
  createdAt: 1,
  updatedAt: 2,
});

describe('ProjectDocSchema', () => {
  it('parses a valid document', () => {
    expect(ProjectDocSchema.safeParse(doc()).success).toBe(true);
  });

  it.each([
    ['readySlotCount > slotCount', { readySlotCount: 4 }],
    ['an 81-character title', { title: 'x'.repeat(81) }],
    ['a non-integer time', { updatedAt: 2.5 }],
    ['status exported', { status: 'exported' }],
    ['an unknown status', { status: 'weird' }],
  ])('rejects %s', (_, patch) => {
    expect(ProjectDocSchema.safeParse({ ...doc(), ...patch }).success).toBe(false);
  });

  it('rejects peaks on the voiceover', () => {
    const d = doc();
    expect(
      ProjectDocSchema.safeParse({ ...d, voiceover: { ...d.voiceover, peaks: [0, 1] } }).success,
    ).toBe(false);
  });

  it('a summary parses and the refined editor schema still runs the timeline check', () => {
    const rest: Record<string, unknown> = doc();
    delete rest.ownerId;
    delete rest.voiceover;
    expect(ProjectSummarySchema.safeParse({ ...rest, id: 'p1' }).success).toBe(true);
    const bad = EditorProjectSchema.safeParse({
      ...rest,
      id: 'p1',
      voiceover: { src: 'idb:a', durationMs: 18_000 },
      transcript: {
        words: [],
        language: 'en',
        ranOn: 'device',
        timingQuality: 'word',
        cleaned: false,
      },
      slots: [{ id: 's', startMs: 0, endMs: 99_000, wordStart: 0, wordEnd: 0 }],
      versions: [],
    });
    expect(bad.success).toBe(false);
  });
});

describe('start schemas', () => {
  it('a draft falls back to its defaults', () => {
    expect(StartDraftSchema.parse({})).toEqual({ title: 'Untitled Project', format: '16:9' });
  });

  it('a pending intake needs a stored ref', () => {
    expect(
      PendingIntakeSchema.safeParse({ source: 'record', name: 'Take', cleanup: true }).success,
    ).toBe(false);
    expect(
      PendingIntakeSchema.safeParse({ ref: 'idb:x', source: 'record', name: 'Take', cleanup: true })
        .success,
    ).toBe(true);
  });
});
