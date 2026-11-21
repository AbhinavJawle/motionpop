// @vitest-environment happy-dom
import type { FilmBeatResult, Router } from '@motionpop/ai';
import { studioLight } from '@motionpop/motion';
import { describe, expect, it, vi } from 'vitest';
import { runVisionQaPass } from './vision-qa';

function makeBeat(index: number, opts: { stage?: FilmBeatResult['beat']['videoStage']; emptyClean?: boolean } = {}): FilmBeatResult {
  const id = `b${index + 1}`;
  const stage = opts.stage ?? 'split-top-stage';
  return {
    beat: {
      id,
      wordStart: index * 3,
      wordEnd: index * 3 + 2,
      startMs: index * 2000,
      endMs: (index + 1) * 2000,
      keyMomentMs: 500,
      tailMs: 0,
      over: 'out',
      headMs: 0,
      lead: 'type',
      archetype: 'callout-hud',
      videoStage: stage,
      idea: `Visual beat ${index + 1}`,
      text: opts.emptyClean ? [] : [`Point ${index + 1}`],
      landsOn: index * 3 + 1,
      staging: 'Reveal cleanly',
      seam: { kind: 'push', note: 'Next' },
    },
    params: {
      title: `Beat ${index + 1}`,
      html: opts.emptyClean ? '' : `<div class="x">Point ${index + 1}</div>`,
      css: '.x { color: #0A0A0E; }',
      script: 'return { seek() {} };',
      keyMomentMs: 500,
      brief: `Beat ${index + 1}`,
      film: { tailMs: 0, over: 'out', headMs: 0 },
    },
    calls: opts.emptyClean ? 0 : 1,
    repairs: 0,
    problems: null,
    latencyMs: 10,
  };
}

describe('runVisionQaPass full-reel batching (spec 24 R4.3)', () => {
  it('inspects all built visual beats across parallel 6-beat batches and skips empty clean beats', async () => {
    const fakeCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      roundRect: vi.fn(),
      clip: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      drawImage: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: 'left',
    };
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag === 'canvas') {
        const el = origCreate('canvas');
        vi.spyOn(el, 'getContext').mockReturnValue(fakeCtx as unknown as CanvasRenderingContext2D);
        vi.spyOn(el, 'toDataURL').mockReturnValue(
          'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwc=',
        );
        return el;
      }
      return origCreate(tag);
    }) as typeof document.createElement);

    // Mock Image to resolve immediately so SVG foreignObject draw never stalls happy-dom.
    const OrigImage = globalThis.Image;
    class FastImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 720;
      naturalHeight = 1280;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    globalThis.Image = FastImage as unknown as typeof Image;

    try {
      const seenBatches: string[][] = [];
      const router = {
        run: vi.fn(async (_task: unknown, input: { beats: { id: string }[] }) => {
          const ids = input.beats.map((b) => b.id);
          seenBatches.push(ids);
          // Flag the last beat of each batch (b6 in batch 1, b11 in batch 2!)
          const targetId = ids[ids.length - 1]!;
          return {
            output: {
              pass: false,
              summary: `Flagged ${targetId}`,
              flagged: [
                {
                  beatId: targetId,
                  severity: 'fix',
                  issue: 'Low contrast',
                  fixHint: 'Use #0A0A0E ink',
                },
              ],
            },
            ranOn: 'cloud',
            model: 'gemini-4-neon',
            costCredits: 0,
            latencyMs: 5,
            attempts: 1,
            cached: false,
          };
        }),
      } as unknown as Router;

      // 11 beats total: 10 visual + 1 pure empty clean beat (b5)
      const beats: FilmBeatResult[] = Array.from({ length: 11 }, (_, i) =>
        makeBeat(i, i === 4 ? { stage: 'clean', emptyClean: true } : { stage: 'split-top-stage' }),
      );

      const flagged = await runVisionQaPass({
        router,
        beats,
        format: '9:16',
        style: studioLight,
        model: 'gemini-4-neon',
      });

      // 10 visual beats -> 2 parallel batches: [6 beats] + [4 beats]; b5 (empty clean) skipped!
      expect([...seenBatches].sort((a, b) => a[0]!.localeCompare(b[0]!))).toEqual([
        ['b1', 'b2', 'b3', 'b4', 'b6', 'b7'],
        ['b8', 'b9', 'b10', 'b11'],
      ]);
      // Catches defects in BOTH the first half (b7) AND the second half (b11)!
      expect(flagged.map((f) => f.beatId)).toEqual(['b7', 'b11']);
    } finally {
      globalThis.Image = OrigImage;
      vi.restoreAllMocks();
    }
  });
});
