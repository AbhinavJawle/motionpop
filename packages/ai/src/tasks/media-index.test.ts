import { describe, expect, it, vi } from 'vitest';
import { createRouter } from '../router';
import {
  fallbackIndexClip,
  indexMediaClips,
  inferClipKind,
  mediaIndexJsonSchema,
  sanitizeIndexedClip,
  type MediaIndexOutput,
} from './media-index';

const TINY_JPEG_B64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof';

describe('media.index task (spec 20)', () => {
  it('infers clip kinds cleanly from filename and MIME type', () => {
    expect(inferClipKind('dashboard-screen-recording.mp4', 'video/mp4')).toBe('screen-recording');
    expect(inferClipKind('tokyo-street-walk.mov', 'video/quicktime')).toBe('broll');
    expect(inferClipKind('pricing-ui-screenshot.png', 'image/png')).toBe('screenshot');
    expect(inferClipKind('coffee-mug.jpg', 'image/jpeg')).toBe('photo');
  });

  it('produces a Vertex-safe JSON schema without maximum bounds', () => {
    const schema = JSON.stringify(mediaIndexJsonSchema());
    expect(schema).not.toContain('9007199254740991');
    expect(schema).toContain('"screen-recording"');
    expect(schema).toContain('"moments"');
  });

  it('clamps out-of-range focus and zoom values in sanitizeIndexedClip', () => {
    const clean = sanitizeIndexedClip(
      {
        id: 'clip-1',
        kind: 'screen-recording',
        summary: 'Dashboard metrics view',
        tags: ['Dashboard', 'Metrics'],
        dominantColors: ['#111111'],
        moments: [
          {
            startMs: 500,
            endMs: 99_999,
            focusX: 0.02,
            focusY: 0.99,
            zoom: 2.35,
            description: 'KPI chart',
          },
        ],
      },
      { id: 'clip-1', name: 'dash.mp4', mimeType: 'video/mp4', durationMs: 6000 },
    );
    expect(clean.moments[0]?.endMs).toBe(6000);
    expect(clean.moments[0]?.focusX).toBe(0.1);
    expect(clean.moments[0]?.focusY).toBe(0.9);
    expect(clean.moments[0]?.zoom).toBe(2.2);
    expect(clean.tags).toEqual(['dashboard', 'metrics']);
  });

  it('indexes clips via router and falls back deterministically when offline', async () => {
    const offline = await indexMediaClips(null, [
      {
        id: 'c1',
        name: 'app-demo.mp4',
        mimeType: 'video/mp4',
        width: 1920,
        height: 1080,
        durationMs: 8000,
        frames: [{ atMs: 1000, mimeType: 'image/jpeg', base64: TINY_JPEG_B64 }],
      },
    ]);
    expect(offline.source).toBe('fallback');
    expect(offline.results[0]?.kind).toBe('screen-recording');

    const router = createRouter({
      config: () => ({
        routingOverrides: {},
        routingSlotsDetectDeviceMaxWords: 400,
        modelFast: 'gemini-3.5-flash-lite',
        modelStrong: 'gemini-4-neon',
        modelFilmBuild: 'gemini-3.5-flash-lite',
        killSwitch: false,
      }),
      provider: {
        generate: vi.fn(async () => {
          const out: MediaIndexOutput = {
            clips: [
              {
                id: 'c1',
                kind: 'screen-recording',
                summary: 'Creator clicks Publish button in the Motionpop studio',
                tags: ['publish', 'studio', 'demo'],
                dominantColors: ['#09090d', '#8b7cff'],
                moments: [
                  {
                    startMs: 1200,
                    endMs: 4200,
                    focusX: 0.78,
                    focusY: 0.24,
                    zoom: 1.65,
                    description: 'Publish button hover and click',
                  },
                ],
              },
            ],
          };
          return { text: JSON.stringify(out), ranOn: 'cloud' as const };
        }),
      },
    });
    const live = await indexMediaClips(router, [
      {
        id: 'c1',
        name: 'app-demo.mp4',
        mimeType: 'video/mp4',
        width: 1920,
        height: 1080,
        durationMs: 8000,
        frames: [{ atMs: 1000, mimeType: 'image/jpeg', base64: TINY_JPEG_B64 }],
      },
    ]);
    expect(live.source).toBe('cloud');
    expect(live.results[0]?.summary).toContain('Publish');
    expect(live.results[0]?.moments[0]?.zoom).toBe(1.65);

    const fb = fallbackIndexClip({
      id: 'c2',
      name: 'city_broll.mp4',
      mimeType: 'video/mp4',
      durationMs: 5000,
    });
    expect(fb.kind).toBe('broll');
  });
});
