// @vitest-environment happy-dom
import { ReelPlanSchema, type ReelScene } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { compileReel } from './compile';
import { reelCustomDoc, reelCustomScene, seedOf } from './custom';
import { mountReel } from './mount';

const custom = (o: Partial<ReelScene> = {}): ReelScene => ({
  id: 'c1',
  startMs: 1000,
  endMs: 4000,
  layout: 'split',
  content: {
    template: 'custom',
    title: 'Snappy flow',
    brief: 'Two steps with icons.',
    html: '<div class="t">Heavy lifting</div>',
    css: '.t { color: var(--ink); }',
    script: 'const tl = mp.timeline(); return tl;',
    keyMomentMs: 700,
    media: [
      { kind: 'logo', query: 'Acme|acme.example', asset: 'img1' },
      { kind: 'photo', query: 'a desk' },
    ],
  },
  ...o,
});

const words = [
  { text: 'before', startMs: 500, endMs: 800 },
  { text: 'heavy', startMs: 1200, endMs: 1500 },
  { text: 'lifting', startMs: 1600, endMs: 1900 },
  { text: 'after', startMs: 4100, endMs: 4300 },
];

describe('AI-written reel scenes (spec 30)', () => {
  it('builds the scene from the reel: its area, palette, words from the scene start and pictures by m-index', () => {
    const pic = { src: 'data:image/png;base64,AA', w: 10, h: 10 };
    const s = reelCustomScene({ look: 'mono', scene: custom(), words, pictures: { img1: pic } })!;
    expect(s).toMatchObject({ width: 720, height: 640, durationMs: 3000, seed: seedOf('c1') });
    expect(s.words).toEqual([
      { text: 'heavy', startMs: 200, endMs: 500 },
      { text: 'lifting', startMs: 600, endMs: 900 },
    ]);
    // m0 is the stored logo; m1 has no picture yet, so it isn't offered.
    expect(s.images).toEqual({ m0: pic });
    expect(s.look.id).toBe('mono');
    expect(
      reelCustomScene({ look: 'mono', scene: custom({ layout: 'full' }), words, pictures: {} })!
        .height,
    ).toBe(1060);
    expect(
      reelCustomScene({ look: 'cream', scene: custom({ layout: 'full' }), words, pictures: {} })!
        .height,
    ).toBe(820);
    expect(
      reelCustomScene({
        look: 'mono',
        scene: { ...custom(), content: { template: 'none' } },
        words,
        pictures: {},
      }),
    ).toBeNull();
  });

  it('the scene document carries the code safely (no early </script>) with the runtime flag', () => {
    const s = reelCustomScene({ look: 'mono', scene: custom(), words, pictures: {} })!;
    const doc = reelCustomDoc(
      { ...s, token: 't1', params: { ...s.params, html: '</script><script>alert(1)</script>' } },
      { js: 'console.log("</script>")', fontCss: '' },
    );
    expect(doc.match(/<\/script>/g)).toHaveLength(2);
    expect(doc).toContain('window.__MP_ALLOW_CUSTOM__ = true');
    expect(doc).toContain('width: 720px; height: 640px');
  });

  it('without the runtime the preview shows the title instead (never runs code in the page)', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const plan = ReelPlanSchema.parse({
      v: 1,
      look: 'mono',
      scenes: [custom({ startMs: 0, endMs: 3000 })],
    });
    const reel = mountReel(host, { plan, words, durationMs: 3000, video: { w: 720, h: 1280 } }, []);
    reel.seek(500);
    expect(host.querySelector('iframe')).toBeNull();
    expect(host.textContent?.toUpperCase()).toContain('SNAPPY FLOW');
    reel.destroy();
  });

  it('with the runtime the scene is a sandboxed frame (scripts only, never same-origin)', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const plan = ReelPlanSchema.parse({
      v: 1,
      look: 'mono',
      scenes: [custom({ startMs: 0, endMs: 3000 })],
    });
    const reel = mountReel(
      host,
      {
        plan,
        words,
        durationMs: 3000,
        video: { w: 720, h: 1280 },
        custom: { js: '/*rt*/', fontCss: '' },
        customSandbox: true,
      },
      [],
    );
    const frame = host.querySelector('iframe')!;
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame.getAttribute('data-reel-custom')).toBe('Snappy flow');
    reel.destroy();
    expect(host.querySelector('iframe')).toBeNull();
  });

  it('off screen an AI-written scene stays laid out (its frame builds and measures), hidden by opacity', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const plan = ReelPlanSchema.parse({
      v: 1,
      look: 'mono',
      scenes: [
        {
          id: 'a',
          startMs: 0,
          endMs: 3000,
          layout: 'split',
          content: { template: 'headline', title: 'First' },
        },
        custom({ startMs: 3000, endMs: 6000 }),
      ],
    });
    const reel = mountReel(
      host,
      {
        plan,
        words,
        durationMs: 6000,
        video: { w: 720, h: 1280 },
        custom: { js: '/*rt*/', fontCss: '' },
      },
      [],
    );
    reel.seek(500);
    const sceneOf = (id: string) => host.querySelector<HTMLElement>(`[data-reel-scene="${id}"]`)!;
    const c = sceneOf('c1');
    expect(c.style.display).toBe('block');
    expect(c.style.opacity).toBe('0');
    expect(c.style.visibility).toBe('hidden');
    reel.seek(4500);
    expect(c.style.opacity).toBe('');
    expect(c.style.visibility).toBe('visible');
    // Template scenes still leave the layout entirely.
    expect(sceneOf('a').style.display).toBe('none');
    reel.destroy();
  });

  it('the export inlines the runtime and refuses to compile a custom scene without it', () => {
    const plan = ReelPlanSchema.parse({
      v: 1,
      look: 'mono',
      scenes: [custom({ startMs: 0, endMs: 3000 })],
    });
    const base = {
      plan,
      words,
      durationMs: 3000,
      videoSrc: 'speaker.mp4',
      video: { w: 720, h: 1280 },
      segments: [{ srcStartMs: 0, srcEndMs: 3000 }],
    };
    const assets = {
      reelRuntimeJs: '/*rt*/',
      hyperframesRuntimeJs: '/*hf*/',
      fonts: { Inter: 'AA', Newsreader: 'AA', 'Playfair Display Italic': 'AA', 'Geist Mono': 'AA' },
    };
    expect(() => compileReel(base, assets)).toThrow();
    const html = compileReel(base, { ...assets, reelCustomJs: '/*custom-runtime*/' });
    expect(html).toContain('custom-runtime');
    expect(html).toContain('"customSandbox":false');
  });
});
