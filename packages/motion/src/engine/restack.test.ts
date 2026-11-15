// @vitest-environment happy-dom
import { FORMATS } from '@motionpop/schemas';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stack } from '../scenes/layout';
import { editorialExplainer } from '../styles';
import { stage } from './stage';

const ctx = () => {
  const root = document.createElement('div');
  document.body.append(root);
  return {
    root,
    ...FORMATS['16:9'],
    format: '16:9' as const,
    style: editorialExplainer,
    durationMs: 4000,
    keyMomentMs: 600,
    fps: 30 as const,
    seed: 1,
    warn: () => {},
  };
};

describe('stage.restack (spec 07: a short line sits at the optical centre)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('re-stacks texts by the height they set, keeping their gaps, at 0.45 of the free space', () => {
    const c = ctx();
    const st = stage(c, { cues: [{ id: 'a' }] });
    const area = { x: 100, y: 100, width: 1720, height: 880 };
    const slots = stack(
      area,
      1080,
      [
        { id: 'eyebrow', size: 0.028, gap: 1 },
        { id: 'line', size: 0.1, lines: 3, gap: 0.25 },
        { id: 'subline', size: 0.04, lines: 2 },
      ],
      { align: 'center', bias: 0.45 },
    );
    const eyebrow = st.text('eyebrow', 'THE PROBLEM', slots['eyebrow']!);
    const line = st.text('line', 'Short line', slots['line']!);
    const sub = st.text('subline', 'Under it', slots['subline']!);
    const gap1 = line.box.y - (eyebrow.box.y + eyebrow.box.height);
    const gap2 = sub.box.y - (line.box.y + line.box.height);
    // happy-dom has no layout: the line set one line of its three, the others all of theirs.
    const set = new Map([
      [eyebrow.el, eyebrow.box.height],
      [line.el, Math.round(line.box.height / 3)],
      [sub.el, Math.round(sub.box.height / 2)],
    ]);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return set.get(this) ?? 0;
    });
    st.restack([eyebrow, line, null, sub], area);
    const heights = [eyebrow, line, sub].map((a) => set.get(a.el) ?? 0);
    const total = heights.reduce((n, h) => n + h, 0) + gap1 + gap2;
    expect(eyebrow.box.y).toBe(area.y + Math.floor((area.height - total) * 0.45));
    expect(line.box.y).toBe(eyebrow.box.y + heights[0]! + gap1);
    expect(sub.box.y).toBe(line.box.y + heights[1]! + gap2);
    expect(line.box.height).toBe(heights[1]);
    expect(line.el.style.top).toBe(`${line.box.y}px`);
    c.root.remove();
  });

  it('moves nothing without layout', () => {
    const c = ctx();
    const st = stage(c, { cues: [{ id: 'a' }] });
    const box = { x: 0, y: 300, width: 800, height: 200 };
    const a = st.text('a', 'Hello', {
      box,
      max: 60,
      min: 30,
      lineHeight: 1.2,
      maxLines: 2,
      align: 'left',
    });
    st.restack([a], { x: 0, y: 0, width: 800, height: 1000 });
    expect(a.box).toEqual(box);
    c.root.remove();
  });
});
