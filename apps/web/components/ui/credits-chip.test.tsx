// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreditsChip } from './credits-chip';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only removal of a DOM API
delete (Element.prototype as any).animate;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CreditsChip', () => {
  it('shows the number when the balance is known', () => {
    render(<CreditsChip credits={17} />);
    expect(screen.getByRole('button', { name: '17 credits' })).toBeTruthy();
    expect(screen.queryByTestId('credits-loading')).toBeNull();
  });

  it('shimmers without a number while the balance is unknown (R5.4)', () => {
    render(<CreditsChip credits={null} />);
    const chip = screen.getByRole('button', { name: 'Credits loading' });
    expect(chip.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByTestId('credits-loading')).toBeTruthy();
    expect(chip.textContent?.trim()).toBe('');
  });
});
