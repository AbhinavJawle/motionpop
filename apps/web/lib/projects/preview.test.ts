import { EditorProjectSchema, type EditorProject } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { summaryFromDoc, toCloud } from './cloud-docs';
import { demoProject } from './fixture';
import { buildProjectPreview } from './preview';
import { summarise } from './summary';

function makeReelProject(): EditorProject {
  return EditorProjectSchema.parse({
    schemaVersion: 1,
    id: 'p-reel',
    title: 'talking_head_raw_footage (360p)',
    format: '9:16',
    fps: 30,
    styleId: 'studio-light',
    durationMs: 36_700,
    voiceover: { src: 'idb:voice', durationMs: 36_700, source: 'upload', originalSrc: 'idb:vid' },
    video: {
      src: 'idb:vid',
      width: 1080,
      height: 1920,
      originalDurationMs: 40_000,
      posterUrl: 'data:image/jpeg;base64,FAKEPOSTER',
      cuts: [{ id: 'c1', startMs: 0, endMs: 1500, kind: 'silence', reason: 'lead', enabled: true }],
      punchIns: [],
      defaultOverlayAnchor: 'top-right',
    },
    reel: {
      v: 1,
      look: 'mono',
      scenes: [
        {
          id: 's1',
          startMs: 0,
          endMs: 3500,
          layout: 'split',
          bg: 'light',
          content: {
            template: 'headline',
            kicker: 'used that replaced',
            title: 'MY TEAM OF',
            accent: 'FIVE',
          },
        },
        {
          id: 's2',
          startMs: 3500,
          endMs: 7000,
          layout: 'card',
          bg: 'light',
          content: {
            template: 'counter',
            value: 5,
            decimals: 0,
            prefix: '',
            suffix: 'x',
            label: 'Faster shipping',
          },
        },
      ],
    },
    transcript: {
      words: [
        { i: 0, text: 'Five', startMs: 0, endMs: 400, conf: 1, filler: false },
        { i: 1, text: 'tools', startMs: 450, endMs: 900, conf: 1, filler: false },
      ],
      language: 'en',
      ranOn: 'device',
      timingQuality: 'word',
      cleaned: true,
    },
    slots: [],
    versions: [],
    createdAt: 100,
    updatedAt: 200,
  });
}

describe('buildProjectPreview & summarise (spec 41)', () => {
  it('extracts the real video poster, first non-cut time, opening reel graphic and scene count', () => {
    const p = makeReelProject();
    const s = summarise(p);
    expect(s.status).toBe('ready');
    expect(s.slotCount).toBe(2);
    expect(s.readySlotCount).toBe(2);
    expect(s.slotStates).toEqual(['ready', 'ready']);
    expect(s.preview).toMatchObject({
      kind: 'reel',
      videoSrc: 'idb:vid',
      videoPoster: 'data:image/jpeg;base64,FAKEPOSTER',
      reelLook: 'mono',
      reelLayout: 'split',
      reelSceneCount: 2,
      heroKind: 'headline',
      kicker: 'used that replaced',
      headline: 'MY TEAM OF',
      subline: 'FIVE',
    });
    expect(s.preview?.videoAtMs).toBeGreaterThanOrEqual(1500);
  });

  it('extracts the real hero slot content for motion-graphic projects instead of a generic placeholder', () => {
    const p = demoProject(1000);
    p.title = 'How does the world work';
    p.slots = [
      {
        id: 's1',
        startMs: 0,
        endMs: 4000,
        wordStart: 0,
        wordEnd: 4,
        componentId: 'hook-statement',
        skillId: 'calm-explanation',
        status: 'ready',
        reason: 'opening hook',
        prompt: 'opening',
        params: { content: { eyebrow: 'BIG QUESTION', line: 'How does the world work?' } },
        notes: [],
      },
    ];
    const preview = buildProjectPreview(p);
    expect(preview).toMatchObject({
      kind: 'motion',
      heroKind: 'hook-statement',
      kicker: 'BIG QUESTION',
      headline: 'How does the world work?',
    });
    expect(preview.headline).not.toContain('40%');
  });

  it('backfills reel preview and ready status from bodyJson for existing Firestore docs without preview', () => {
    const p = makeReelProject();
    const cloud = toCloud(p, 'u1');
    // Simulate a pre-spec-41 Firestore doc with no `preview` and legacy `slotCount: 0`
    const legacyDoc = {
      ...cloud.project,
      status: 'draft' as const,
      slotCount: 0,
      readySlotCount: 0,
      slotStates: [],
    };
    delete (legacyDoc as { preview?: unknown }).preview;

    const summary = summaryFromDoc(p.id, legacyDoc);
    expect(summary).not.toBeNull();
    expect(summary?.status).toBe('ready');
    expect(summary?.slotCount).toBe(2);
    expect(summary?.preview).toMatchObject({
      kind: 'reel',
      videoSrc: 'idb:vid',
      headline: 'MY TEAM OF',
      kicker: 'used that replaced',
      subline: 'FIVE',
      reelSceneCount: 2,
    });
  });
});
