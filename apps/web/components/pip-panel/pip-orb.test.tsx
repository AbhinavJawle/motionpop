// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ORB_PIP_STATE, PipOrb, type OrbMood } from './pip-orb';

describe('PipOrb (spec 38 R2.3)', () => {
  // Reduced motion: Pip holds each pose still, so nothing animates past unmount.
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }));
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });
  const moods: OrbMood[] = ['idle', 'listening', 'thinking', 'done'];

  it.each(moods)('%s carries its mood and the matching Pip pose', (mood) => {
    const { container, unmount } = render(<PipOrb mood={mood} />);
    expect(screen.getByTestId('pip-orb').dataset.mood).toBe(mood);
    expect(container.querySelector('[data-pip-state]')?.getAttribute('data-pip-state')).toBe(
      ORB_PIP_STATE[mood],
    );
    unmount();
  });

  it('is decorative and sized from its prop', () => {
    render(<PipOrb size={40} />);
    const orb = screen.getByTestId('pip-orb');
    expect(orb.getAttribute('aria-hidden')).toBe('true');
    expect(orb.style.getPropertyValue('--s')).toBe('40px');
  });
});
