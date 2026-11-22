import { describe, expect, it } from 'vitest';
import { lintCustom, lintProp } from './lint';

const base = { html: '<div></div>', css: '.a { color: red }' };
const scriptOf = (body: string) => ({ ...base, script: `${body}\nreturn { seek(t) {} };` });

describe('lintCustom: film additions (spec 07b)', () => {
  it('accepts a script that ends with return tl;', () => {
    expect(lintCustom({ ...base, script: 'const tl = mp.timeline();\nreturn tl;' })).toEqual([]);
  });

  it('accepts { parent: card } and { top: "12%" }', () => {
    expect(lintCustom(scriptOf('const card = mp.paper({ parent: root, top: "12%" });'))).toEqual(
      [],
    );
  });

  it('accepts x.top, mp.window and a property called parent', () => {
    expect(
      lintCustom(
        scriptOf('const x = { top: 1 }; const y = x.top + x.parent; mp.window({ kind: "doc" });'),
      ),
    ).toEqual([]);
  });

  it.each([
    ['parent.foo', /outside its root/],
    ['top.location', /outside its root/],
    ['window.open(1)', /outside its root/],
    ['document.body', /outside its root/],
    ['const d = new Date()', /clock/],
    ['const r = Math.random()', /randomness/],
  ])('still rejects %s', (body, msg) => {
    expect(lintCustom(scriptOf(body)).join(' | ')).toMatch(msg);
  });
});

describe('lintProp (film shared drawings)', () => {
  it('accepts one svg with a viewBox and shapes', () => {
    expect(
      lintProp(
        '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#111"/><path d="M0 0 L10 10" stroke="#111"/></svg>',
      ),
    ).toEqual([]);
  });

  it('rejects a missing viewBox', () => {
    expect(lintProp('<svg width="10" height="10"><circle cx="5" cy="5" r="4"/></svg>')).toContain(
      'needs a viewBox',
    );
  });

  it('rejects a script', () => {
    expect(
      lintProp('<svg viewBox="0 0 10 10"><script>alert(1)</script><circle r="1"/></svg>').join('|'),
    ).toMatch(/forbidden tag/);
  });

  it('rejects an image', () => {
    expect(
      lintProp('<svg viewBox="0 0 10 10"><image href="a.png" width="10" height="10"/></svg>').join(
        '|',
      ),
    ).toMatch(/forbidden tag/);
  });

  it('rejects text', () => {
    expect(
      lintProp('<svg viewBox="0 0 10 10"><text x="1" y="5">Hi</text></svg>').join('|'),
    ).toMatch(/forbidden tag/);
  });

  it('rejects a url(', () => {
    expect(
      lintProp('<svg viewBox="0 0 10 10"><rect width="5" height="5" fill="url(#g)"/></svg>').join(
        '|',
      ),
    ).toMatch(/loads a URL/);
  });
});
