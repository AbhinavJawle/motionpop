// @vitest-environment happy-dom
import { ReelPlanSchema, type ReelScene } from '@motionpop/schemas';
import { afterEach, describe, expect, it } from 'vitest';
import { lintCustom } from '../components/custom/lint';
import { compileReel } from './compile';
import {
  customFrame,
  REEL_CUSTOM_CSP,
  REEL_CUSTOM_EXPORT_CSP,
  reelCustomDoc,
  reelCustomScene,
  seedOf,
} from './custom';
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

  it('both sandboxed and export documents carry a no-network CSP (export allows self assets)', () => {
    const s = reelCustomScene({ look: 'mono', scene: custom(), words, pictures: {} })!;
    const assets = { js: '/*rt*/', fontCss: '' };
    const sandboxed = reelCustomDoc({ ...s, token: 't' }, assets, { csp: true });
    const exported = reelCustomDoc({ ...s, token: 't' }, assets, { csp: false });
    expect(sandboxed).toContain('http-equiv="Content-Security-Policy"');
    expect(sandboxed).toContain(REEL_CUSTOM_CSP);
    expect(REEL_CUSTOM_CSP).toContain("connect-src 'none'");
    expect(REEL_CUSTOM_CSP).toContain("default-src 'none'");
    // The policy comes before anything that could load.
    expect(sandboxed.indexOf('Content-Security-Policy')).toBeLessThan(sandboxed.indexOf('<style>'));
    expect(exported).toContain('http-equiv="Content-Security-Policy"');
    expect(exported).toContain(REEL_CUSTOM_EXPORT_CSP);
    expect(REEL_CUSTOM_EXPORT_CSP).toContain("connect-src 'none'");
    expect(REEL_CUSTOM_EXPORT_CSP).toContain("img-src 'self' data: blob:");

    const frame = (sandbox: boolean) => {
      const f = customFrame({ doc: document, scene: s, assets, startMs: 0, sandbox });
      const doc = f.el.querySelector('iframe')!.getAttribute('srcdoc') ?? '';
      f.destroy();
      return doc;
    };
    expect(frame(true)).toContain(REEL_CUSTOM_CSP);
    expect(frame(false)).toContain(REEL_CUSTOM_EXPORT_CSP);

    // Regression (C1/M7): lintCustom must inspect expressions inside template literals.
    const issues = lintCustom({
      html: '<div></div>',
      css: '',
      script: 'const x = `${fetch("x")}`; return { seek() {} };',
    });
    expect(issues.some((m) => m.includes('network'))).toBe(true);
  });
});

describe('custom frame lifecycle (spec 30 review)', () => {
  const sceneOf = () => reelCustomScene({ look: 'mono', scene: custom(), words, pictures: {} })!;
  const tokenOf = (f: ReturnType<typeof customFrame>) =>
    /"token":"(mpr-[^"]+)"/.exec(f.el.querySelector('iframe')!.getAttribute('srcdoc') ?? '')![1]!;
  const reply = (f: ReturnType<typeof customFrame>, data: Record<string, unknown>) => {
    const frame = f.el.querySelector('iframe')!;
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { mpReel: tokenOf(f), ...data },
        source: frame.contentWindow as unknown as MessageEventSource,
      }),
    );
  };
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('a frame that starts after the give-up recovers instead of staying frozen', async () => {
    const f = customFrame({
      doc: document,
      scene: sceneOf(),
      assets: { js: '', fontCss: '' },
      startMs: 0,
      sandbox: true,
      timeoutMs: 20,
    });
    document.body.append(f.el);
    await f.ready;
    expect(f.buildError()).toBe('the graphic did not start in time');
    reply(f, { ready: true });
    expect(f.buildError()).toBeNull();
    expect(f.error()).toBeNull();
    f.destroy();
  });

  it('a real build error stays an error, even if a ready follows', async () => {
    const f = customFrame({
      doc: document,
      scene: sceneOf(),
      assets: { js: '', fontCss: '' },
      startMs: 0,
      sandbox: true,
      timeoutMs: 1000,
    });
    document.body.append(f.el);
    reply(f, { error: 'boom' });
    await f.ready;
    reply(f, { ready: true });
    expect(f.buildError()).toBe('boom');
    f.destroy();
  });

  it('ignores replies from other windows or with the wrong token', async () => {
    const f = customFrame({
      doc: document,
      scene: sceneOf(),
      assets: { js: '', fontCss: '' },
      startMs: 0,
      sandbox: true,
      timeoutMs: 1000,
    });
    document.body.append(f.el);
    window.dispatchEvent(
      new MessageEvent('message', { data: { mpReel: tokenOf(f), error: 'spoof' }, source: window }),
    );
    reply(f, { mpReel: 'other', error: 'spoof' });
    await wait(5);
    expect(f.buildError()).toBeNull();
    f.destroy();
  });

  it('a reel torn down before its fonts are in builds no frames (no leaked listeners)', async () => {
    const fonts = {
      load: () => new Promise<FontFace[]>((r) => setTimeout(() => r([]), 20)),
      ready: Promise.resolve(),
    };
    Object.defineProperty(document, 'fonts', { value: fonts, configurable: true });
    try {
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
        },
        [],
      );
      reel.destroy();
      await reel.ready;
      expect(document.querySelector('iframe')).toBeNull();
      expect(reel.customErrors()).toEqual([]);
    } finally {
      delete (document as { fonts?: unknown }).fonts;
    }
  });
});
