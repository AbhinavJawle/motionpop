// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import PipCtaMascot from './pip-cta-mascot';

afterEach(() => cleanup());

describe('PipCtaMascot', () => {
  it('draws the body and eyes behind the button and the paws in front, all hidden from assistive tech', () => {
    const { container } = render(<PipCtaMascot hover={false} pressCount={0} still />);
    const boxes = [...container.children];
    expect(boxes).toHaveLength(2);
    for (const b of boxes) expect(b.getAttribute('aria-hidden')).toBe('true');
    const srcs = (b: Element) => [...b.querySelectorAll('img')].map((i) => i.getAttribute('src'));
    expect(srcs(boxes[0]!)).toEqual([
      '/pip-cta/body.webp',
      '/pip-cta/eye_l.webp',
      '/pip-cta/eye_r.webp',
    ]);
    expect(srcs(boxes[1]!)).toEqual(['/pip-cta/hand_l.webp', '/pip-cta/hand_r.webp']);
  });
});
