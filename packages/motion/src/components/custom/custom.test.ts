// @vitest-environment happy-dom
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editorialExplainer } from '../../styles';
import { assertSeekPure } from '../../testing/seek-pure';
import { runScript } from './build';
import { CUSTOM_ALLOW_FLAG, custom, customExample, lintCustom, scopeCss } from './index';

const g = globalThis as unknown as Record<string, unknown>;
beforeAll(() => {
  g[CUSTOM_ALLOW_FLAG] = true;
});
afterAll(() => {
  delete g[CUSTOM_ALLOW_FLAG];
});

const ok = customExample();

function mount(script: string) {
  const root = document.createElement('div');
  document.body.append(root);
  return custom.build(
    {
      root,
      width: 1920,
      height: 1080,
      format: '16:9',
      style: editorialExplainer,
      durationMs: 3000,
      keyMomentMs: 500,
      fps: 30,
      seed: 7,
      warn: () => {},
    },
    { ...ok, script },
  );
}

describe('custom graphic (spec 15)', () => {
  it('the example passes the lint and its params schema', () => {
    expect(lintCustom(ok)).toEqual([]);
    expect(custom.params.safeParse(ok).success).toBe(true);
  });

  it('the example is a pure function of time in every format', () => {
    for (const format of custom.formats) assertSeekPure(custom, ok, { format, durationMs: 4000 });
  });

  it('the clock, randomness, timers and the window are not there for the script', () => {
    const made = runScript(
      'return { seek() {}, probe: [typeof Date, typeof setTimeout, typeof window, typeof document, typeof fetch, typeof globalThis, typeof Function, typeof Math.random, typeof Math.sin] };',
      document.createElement('div'),
      {},
      {},
    ) as { probe: string[] };
    expect(made.probe).toEqual([...Array(8).fill('undefined'), 'function']);
  });

  it('refuses to run outside the composition sandbox', () => {
    delete g[CUSTOM_ALLOW_FLAG];
    expect(() => mount(ok.script)).toThrow(/sandbox/);
    g[CUSTOM_ALLOW_FLAG] = true;
  });

  it('refuses code the lint rejects, and a script that returns no seek', () => {
    expect(() => mount('setTimeout(() => {}, 1); return { seek() {} };')).toThrow(/timers/);
    expect(() => mount('const seek = 1; return {};')).toThrow(/seek/);
  });

  it('scopes every selector to the graphic', () => {
    expect(scopeCss('body { color: red }\n.a, .b span { x: 1 }', 'mpc-1')).toBe(
      '\n.mpc-1 { color: red }\n.mpc-1 .a, .mpc-1 .b span { x: 1 }',
    );
  });
});

describe('lintCustom', () => {
  const base = { html: '<div></div>', css: '.a { color: red }', script: 'return { seek(t) {} };' };
  it.each([
    ['script', 'const n = Date.now(); return { seek(t) {} };', /clock/],
    ['script', 'const r = Math.random(); return { seek(t) {} };', /randomness/],
    ['script', 'requestAnimationFrame(f); return { seek(t) {} };', /animation frames/],
    ['script', 'fetch("x"); return { seek(t) {} };', /network/],
    ['script', 'root.ownerDocument; return { seek(t) {} };', /outside its root/],
    ['script', 'gsap.to(root, {}); return { seek(t) {} };', /GSAP/],
    [
      'script',
      'const img = "https://evil.example.com/a.png"; return { seek(t) {} };',
      /external URL/,
    ],
    ['html', '<img src="https://x.com/a.png">', /external URL/],
    ['html', '<div onclick="x()"></div>', /event handler/],
    ['html', '<script>1</script>', /forbidden tag/],
    ['css', '@keyframes spin { to { transform: rotate(1turn) } }', /@-rule/],
    ['css', '.a { transition: opacity 1s }', /animation or transition/],
    ['css', '.a { background: url(x.png) }', /URL/],
  ])('rejects %s: %s', (field, value, msg) => {
    const issues = lintCustom({ ...base, [field]: value });
    expect(issues.join(' | ')).toMatch(msg);
  });

  it('allows the words "Date" and "window" inside text', () => {
    expect(
      lintCustom({ ...base, script: 'const label = "Date of the window"; return { seek(t) {} };' }),
    ).toEqual([]);
  });
});

describe('custom sizing unit', () => {
  it('defines --u as 1 % of the short side, so 9:16 text is as big as 16:9', () => {
    g[CUSTOM_ALLOW_FLAG] = true;
    for (const [format, width, height] of [
      ['16:9', 1920, 1080],
      ['9:16', 1080, 1920],
    ] as const) {
      const root = document.createElement('div');
      custom.build(
        {
          root,
          width,
          height,
          format,
          style: editorialExplainer,
          durationMs: 3000,
          keyMomentMs: 500,
          fps: 30,
          seed: 1,
          warn: () => {},
        },
        ok,
      );
      expect((root.firstElementChild as HTMLElement).style.getPropertyValue('--u')).toBe('10.8px');
    }
  });
});

describe('custom seek history', () => {
  it('a style write the browser rejects never keeps a value from an earlier seek (regression)', () => {
    g[CUSTOM_ALLOW_FLAG] = true;
    // happy-dom (like a browser for NaN) ignores the invalid write, so without the reset the
    // width set at t=200 survived into t=50 (found by the seek-purity property, 2026-11-16).
    const script =
      "const el = root.querySelector('.headline'); return { seek(t) { el.style.width = t > 100 ? '50%' : 'NaN%'; } };";
    const a = mount(script);
    const b = mount(script);
    a.seek(200);
    a.seek(50);
    b.seek(50);
    const roots = Array.from(document.body.children).slice(-2);
    expect(roots[0]?.innerHTML).toBe(roots[1]?.innerHTML);
  });
});
