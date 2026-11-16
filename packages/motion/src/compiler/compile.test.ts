import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { compileProject } from './compile';
import { editorialExplainer as style, testInverted } from '../styles';
import type { CompileInput } from './types';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const fonts = { Geist: 'AAAA', 'Geist Mono': 'BBBB' };
const assets = {
  runtimeJs: '/*mp*/',
  hyperframesRuntimeJs: '/*hf*/',
  fonts,
  textures: { grain: PNG, paper: PNG },
};
const input: CompileInput = {
  format: '16:9',
  durationMs: 18000,
  style,
  voiceSrc: 'assets/voice.wav',
  slots: [
    { id: 'slot-1', startMs: 4200, endMs: 7800, componentId: 'big-number', params: { value: 40 } },
    { id: 'slot-2', startMs: 12000, endMs: 15000, componentId: 'big-number', params: { value: 2 } },
  ],
};

describe('compileProject', () => {
  it('emits one .clip per slot with data-start/data-duration in seconds', () => {
    const html = compileProject(input, assets);
    expect(html).toContain(
      'id="slot-1" class="clip mp-slot" data-start="4.2" data-duration="3.6" data-track-index="1"',
    );
    expect(html).toContain(
      'id="slot-2" class="clip mp-slot" data-start="12" data-duration="3" data-track-index="1"',
    );
  });

  it('sets the root duration and size and includes the voice clip', () => {
    const html = compileProject(input, assets);
    expect(html).toContain('data-composition-id="motionpop" data-width="1920" data-height="1080"');
    expect(html).toContain('data-duration="18"');
    expect(html).toContain(
      '<audio id="voice" class="clip" data-start="0" data-duration="18" data-track-index="0" data-volume="1" src="assets/voice.wav">',
    );
  });

  it('adds the bed as its own audio clip on track 2 only when given', () => {
    expect(compileProject(input, assets)).not.toContain('id="bed"');
    const html = compileProject({ ...input, bedSrc: 'assets/bed.wav' }, assets);
    expect(html).toContain(
      '<audio id="bed" class="clip" data-start="0" data-duration="18" data-track-index="2" data-volume="1" src="assets/bed.wav">',
    );
  });

  it('embeds the HyperFrames runtime before the project and our runtime', () => {
    const html = compileProject(input, assets);
    const hf = html.indexOf('/*hf*/');
    const proj = html.indexOf('window.__MP_PROJECT__');
    const mp = html.indexOf('/*mp*/');
    expect(hf).toBeGreaterThan(-1);
    expect(hf).toBeLessThan(proj);
    expect(proj).toBeLessThan(mp);
  });

  it('cannot be broken out of by a closing script tag in params', () => {
    const evil = {
      ...input,
      slots: [{ ...input.slots[0]!, params: { label: '</script><script>alert(1)</script>' } }],
    };
    const html = compileProject(evil, assets);
    expect(html).not.toContain('</script><script>alert(1)');
  });

  it('rejects non-integer or empty slot times', () => {
    expect(() =>
      compileProject({ ...input, slots: [{ ...input.slots[0]!, startMs: 4200.5 }] }, assets),
    ).toThrow(/integer ms/);
    expect(() =>
      compileProject({ ...input, slots: [{ ...input.slots[0]!, endMs: 4200 }] }, assets),
    ).toThrow(/endMs > startMs/);
  });
});

describe('fonts', () => {
  it('embeds @font-face for bundled families used by the style', () => {
    const html = compileProject(
      {
        format: '16:9',
        durationMs: 4000,
        style: testInverted,
        slots: [],
      },
      {
        runtimeJs: '',
        hyperframesRuntimeJs: '',
        fonts: { ...fonts, Inter: 'CCCC' },
      },
    );
    expect(html.match(/@font-face/g)?.length).toBe(2);
    expect(html).toContain("font-family: 'Geist'; src: url(data:font/woff2;base64,AAAA)");
    expect(html).toContain("font-family: 'Geist Mono'; src: url(data:font/woff2;base64,BBBB)");
    expect(html).not.toContain('CCCC');
  });
});

const payload = (html: string): Record<string, unknown> => {
  const m = /window\.__MP_PROJECT__ = (.*);<\/script>/.exec(html);
  return JSON.parse(m?.[1] ?? 'null') as Record<string, unknown>;
};

describe('compiler v1', () => {
  it.each([
    ['16:9', 1920, 1080],
    ['9:16', 1080, 1920],
    ['1:1', 1080, 1080],
  ] as const)('sizes %s from FORMATS', (format, w, h) => {
    const html = compileProject({ ...input, format }, assets);
    expect(html).toContain(`data-width="${w}" data-height="${h}"`);
    expect(html).toContain(`#mp-root { position: relative; width: ${w}px; height: ${h}px;`);
    expect(payload(html)).toMatchObject({ width: w, height: h, format });
  });

  it('paints background, paper, grain and vignette layers behind the slots in style mode', () => {
    const html = compileProject(input, assets);
    const order = [
      'class="mp-bg"',
      'class="mp-paper"',
      'class="mp-grain"',
      'class="mp-vignette"',
      'id="voice"',
      'id="slot-1"',
      'id="mp-captions"',
    ].map((s) => html.indexOf(s));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain(
      `.mp-bg { position: absolute; inset: 0; background: ${style.colors.bg}; }`,
    );
    expect(html).toContain(`opacity: ${style.texture.grain};`);
  });

  it('omits background and texture in transparent mode', () => {
    const html = compileProject(
      { ...input, background: 'transparent' },
      { ...assets, textures: undefined },
    );
    expect(html).not.toContain('class="mp-bg"');
    expect(html).not.toContain('class="mp-texture"');
    expect(html).toContain('html, body { margin: 0; background: transparent; }');
  });

  it('skips texture tiles for a pack without grain or paper', () => {
    const html = compileProject(
      { ...input, style: testInverted },
      { ...assets, textures: undefined },
    );
    expect(html).toContain('class="mp-bg"');
    expect(html).not.toContain('mp-grain');
  });

  it('fails loudly when font data or texture tiles are missing', () => {
    expect(() => compileProject(input, { ...assets, fonts: { Geist: 'AAAA' } })).toThrow(
      /Geist Mono/,
    );
    expect(() => compileProject(input, { ...assets, textures: undefined })).toThrow(
      /texture tiles/,
    );
  });

  it('only accepts base64 PNG data URLs for tiles', () => {
    expect(() =>
      compileProject(input, {
        ...assets,
        textures: { grain: 'https://example.com/x.png', paper: PNG },
      }),
    ).toThrow(/data URL/);
  });

  it('writes mode into the runtime payload (default preview)', () => {
    expect(payload(compileProject(input, assets)).mode).toBe('preview');
    expect(payload(compileProject({ ...input, mode: 'render' }, assets)).mode).toBe('render');
  });

  it('round-trips integer-ms slot times through the seconds in the HTML', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 600_000 }),
        fc.integer({ min: 1, max: 60_000 }),
        (startMs, len) => {
          const html = compileProject(
            {
              ...input,
              durationMs: startMs + len,
              slots: [
                { id: 's', startMs, endMs: startMs + len, componentId: 'big-number', params: {} },
              ],
            },
            assets,
          );
          const m =
            /id="s" class="clip mp-slot" data-start="([\d.]+)" data-duration="([\d.]+)"/.exec(html);
          expect(Math.round(Number(m?.[1]) * 1000)).toBe(startMs);
          expect(Math.round(Number(m?.[2]) * 1000)).toBe(len);
        },
      ),
      { numRuns: 200 },
    );
  });
});
