// @vitest-environment happy-dom
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  still: false,
  props: [] as { hover: boolean; pressCount: number; still?: boolean }[],
}));
vi.mock('@/lib/motion/use-still', () => ({ useStill: () => h.still }));
// The rig itself is motion + images; the stub records what the CTA asks of Pip.
vi.mock('./pip-cta-mascot', () => ({
  default: (p: { hover: boolean; pressCount: number; still?: boolean }) => {
    h.props.push(p);
    return <span data-testid="mascot" />;
  },
}));

import { SignupCTA } from './signup-cta';

const WEB = join(import.meta.dirname, '..', '..');
const last = () => h.props.at(-1);

beforeEach(() => {
  h.still = false;
  h.props = [];
});
afterEach(() => cleanup());

describe('SignupCTA', () => {
  it('is one real link with the exact text; the art and the arrow stay out of its name', () => {
    render(<SignupCTA href="/sign-in?next=/start" />);
    const link = screen.getByRole('link', { name: 'Sign up & create' });
    expect(link.getAttribute('href')).toBe('/sign-in?next=/start');
    expect(link.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByTestId('mascot')).toBeTruthy();
  });

  it('hover perks Pip up (mouse), touch does not', () => {
    render(<SignupCTA href="/x" />);
    const link = screen.getByRole('link');
    fireEvent.pointerEnter(link, { pointerType: 'touch' });
    expect(last()?.hover).toBe(false);
    fireEvent.pointerEnter(link, { pointerType: 'mouse' });
    expect(link.getAttribute('data-hover')).toBe('true');
    expect(last()?.hover).toBe(true);
    fireEvent.pointerLeave(link, { pointerType: 'mouse' });
    expect(last()?.hover).toBe(false);
  });

  it('each primary press (pointer or Enter) fires one hop; other buttons and key repeats do not', () => {
    render(<SignupCTA href="/x" />);
    const link = screen.getByRole('link');
    fireEvent.pointerDown(link, { button: 0, pointerType: 'mouse' });
    expect(link.getAttribute('data-pressed')).toBe('true');
    fireEvent.pointerUp(link, { button: 0, pointerType: 'mouse' });
    expect(link.getAttribute('data-pressed')).toBe('false');
    fireEvent.pointerDown(link, { button: 2, pointerType: 'mouse' });
    fireEvent.keyDown(link, { key: 'Enter' });
    fireEvent.keyDown(link, { key: 'Enter', repeat: true });
    fireEvent.keyDown(link, { key: 'a' });
    expect(last()?.pressCount).toBe(2);
  });

  it('passes reduced motion through, so Pip holds still', () => {
    h.still = true;
    render(<SignupCTA href="/x">Join</SignupCTA>);
    expect(last()?.still).toBe(true);
    expect(screen.getByRole('link', { name: 'Join' })).toBeTruthy();
  });

  it('ships every art layer', () => {
    for (const n of ['body', 'eye_l', 'eye_r', 'hand_l', 'hand_r'])
      expect(existsSync(join(WEB, 'public/pip-cta', `${n}.webp`)), n).toBe(true);
  });
});
