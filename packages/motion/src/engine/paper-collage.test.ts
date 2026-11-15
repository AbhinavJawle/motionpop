// @vitest-environment happy-dom
import { contrastRatio, FORMATS, LookSchema } from '@motionpop/schemas';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hookStatement } from '../scenes/hook-statement';
import { statPunch } from '../scenes/stat-punch';
import { stack } from '../scenes/layout';
import { looks, paperCollage } from '../styles';
import { assertSeekPure } from '../testing/seek-pure';
import { buildDecor } from './decor';
import { enter, mark, stage, type SceneContext } from './stage';

const FRAME = { x: 0, y: 0, width: 1920, height: 1080 };

const ctx = (over: Partial<SceneContext> = {}): SceneContext => {
  const root = document.createElement('div');
  document.body.append(root);
  return {
    root,
    ...FORMATS['16:9'],
    format: '16:9',
    style: paperCollage,
    look: paperCollage,
    durationMs: 4000,
    keyMomentMs: 900,
    fps: 30,
    seed: 5,
    warn: () => {},
    ...over,
  };
};

describe('paper-collage look (spec 07 task 22)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is a polished look that parses, with readable ink on every paper it uses', () => {
    expect(looks['paper-collage']).toBe(paperCollage);
    expect(LookSchema.safeParse(paperCollage).success).toBe(true);
    const { ink, bg, accent, highlight, muted } = paperCollage.colors;
    // Ink sits on the kraft, the cream paper and the coral strips and cut pieces.
    for (const on of [bg, accent, highlight])
      expect(contrastRatio(ink, on)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(muted, bg)).toBeGreaterThanOrEqual(4.5);
    expect(paperCollage.personality).toMatchObject({ preset: 'stepped', stepFps: 12 });
    expect(paperCollage.marks?.emphasis).toBe('cutout');
    // A strip without paper is a colour strip (the accent).
    expect(paperCollage.surfaces?.strip).not.toContain('paper');
  });

  it('cuts one seeded piece per word, alternating two colours, inside the frame', () => {
    const words = [
      { x: 10, y: 400, width: 300, height: 110 },
      { x: 340, y: 400, width: 220, height: 110 },
      { x: 590, y: 400, width: 260, height: 110 },
    ];
    const build = () =>
      buildDecor(document, 'cutout', words[0]!, {
        color: '#D96648',
        alt: '#C9B497',
        size: 100,
        stroke: 3,
        seed: 9,
        radius: 0,
        frame: FRAME,
        keepClear: [],
        words,
      });
    const d = build();
    expect(d).toMatchObject({ reveal: 'grow', layer: 'under' });
    const polys = [...d.el.querySelectorAll('polygon')];
    expect(polys.map((p) => p.getAttribute('fill'))).toEqual(['#D96648', '#C9B497', '#D96648']);
    expect(build().el.outerHTML).toBe(d.el.outerHTML);
    // The first word sits at x = 10: its piece is clipped to 2.5 % of the frame width.
    const xs = polys.flatMap((p) =>
      (p.getAttribute('points') ?? '').split(' ').map((pt) => Number(pt.split(',')[0])),
    );
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(FRAME.width * 0.025 - 1);
  });

  it('puts the readable colour on text carried by a coral strip, measured on the accent', () => {
    const c = ctx();
    const st = stage(c, { cues: [{ id: 'a' }] });
    const slots = stack(
      { x: 200, y: 200, width: 1200, height: 600 },
      1080,
      [{ id: 't', size: 0.06 }],
      {
        align: 'left',
      },
    );
    const t = st.text('t', 'of trade sat still', slots['t']!, { emphasis: 'trade' });
    st.surface('strip', 'strip', t);
    const ink = paperCollage.colors.ink;
    expect(t.el.style.color).toBe(ink);
    expect(t.el.dataset.on).toBe('accent');
    // The emphasised word (accent by default) takes it too: accent on accent would vanish.
    expect(t.parts?.every((p) => p.style.color === ink)).toBe(true);
    c.root.remove();
  });

  it('turns carried text with its paper, and only as far as the safe area allows', () => {
    const small = ctx();
    const a = stage(small, { cues: [{ id: 'a' }] });
    const s1 = stack({ x: 700, y: 400, width: 500, height: 200 }, 1080, [{ id: 't', size: 0.05 }], {
      align: 'center',
    });
    const t1 = a.text('t', 'Short line', s1['t']!);
    a.surface('card', 'card', t1);
    a.on('a', enter(t1));
    a.compile().seek(3000);
    expect(t1.el.style.transform).toMatch(/rotate\((-?[1-9][\d.]*|-?0\.[1-9]\d*)deg\)/);
    expect(t1.el.dataset.carriedBy).toBe('card');
    // A three-line block as wide as the safe area has no room to turn: the tilt is dropped.
    const wide = ctx();
    const b = stage(wide, { cues: [{ id: 'a' }] });
    const s2 = stack(b.safe, 1080, [{ id: 't', size: 0.05, lines: 3 }], { align: 'center' });
    const t2 = b.text('t', 'A line as wide as it gets', s2['t']!);
    b.surface('card', 'card', t2);
    b.on('a', enter(t2));
    b.compile().seek(3000);
    expect(t2.el.style.transform).toContain('rotate(0deg)');
    expect(t2.el.dataset.carriedBy).toBeUndefined();
    small.root.remove();
    wide.root.remove();
  });

  it('steps entrances at 12 fps with a seeded wobble that is gone on landing', () => {
    const c = ctx();
    const st = stage(c, { cues: [{ id: 'a', leadMs: 600 }] });
    const slots = stack(
      { x: 300, y: 300, width: 1300, height: 400 },
      1080,
      [{ id: 't', size: 0.06 }],
      {
        align: 'center',
      },
    );
    const t = st.text('t', 'Cut. Paste. Make it move.', slots['t']!);
    st.on('a', enter(t));
    const comp = st.compile();
    const land = comp.report.plan.cues[0]!.landMs;
    const start = comp.report.plan.cues[0]!.startMs;
    const at = (ms: number) => {
      comp.seek(ms);
      return t.el.style.transform;
    };
    // Inside one 83 ms step nothing changes (stop motion), across steps it does.
    const s0 = start + 90;
    expect(at(s0)).toBe(at(s0 + 20));
    const turns = [0, 1, 2, 3].map(
      (k) => /rotate\(([-\d.]+)deg\)/.exec(at(start + 10 + k * 84))?.[1],
    );
    expect(new Set(turns).size).toBeGreaterThan(1);
    expect(at(land + 200)).toContain('rotate(0deg)');
    c.root.remove();
  });

  it('keeps both scenes seek-pure in the look', () => {
    for (const scene of [statPunch, hookStatement] as const) {
      assertSeekPure(scene as never, scene.defaults as never, {
        durationMs: scene.durationMs.ideal,
        format: '16:9',
        style: paperCollage,
      });
    }
  });

  it('marks a stat with one coral cut piece and the readable colour on it', () => {
    const c = ctx();
    const st = stage(c, { cues: [{ id: 'a' }] });
    const slots = stack(
      { x: 300, y: 300, width: 1300, height: 400 },
      1080,
      [{ id: 'n', size: 0.2 }],
      {
        align: 'center',
      },
    );
    const n = st.number('n', 40, { suffix: '%' }, slots['n']!);
    st.on('a', enter(n), mark(n, 'emphasis'));
    st.compile();
    const piece = c.root.querySelector('[data-mark="cutout"]');
    expect(piece?.querySelectorAll('polygon')).toHaveLength(1);
    expect(piece?.querySelector('polygon')?.getAttribute('fill')).toBe(paperCollage.colors.accent);
    expect(n.el.dataset.on).toBe('accent');
    expect(n.el.style.color).toBe(paperCollage.colors.ink);
    c.root.remove();
  });
});
