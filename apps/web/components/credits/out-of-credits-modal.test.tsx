// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeOutOfCredits, openOutOfCredits } from '@/lib/credits/credits-ui';
import { costLine, OutOfCreditsHost, OutOfCreditsModal } from './out-of-credits-modal';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only removal of a DOM API
delete (Element.prototype as any).animate;

afterEach(() => {
  cleanup();
  closeOutOfCredits();
  vi.useRealTimers();
});

describe('costLine', () => {
  it('says the balance and the price of what was attempted', () => {
    expect(costLine({ action: 'generate', cost: 3, balance: 0 })).toBe(
      '0 available · Generate costs 3',
    );
    expect(costLine({ action: 'edit', cost: 1, balance: null })).toBe(
      '0 available · A cloud quick edit costs 1',
    );
  });
});

describe('OutOfCreditsModal', () => {
  it('shows the exact copy, the reason and Keep editing', () => {
    render(
      <OutOfCreditsModal info={{ action: 'generate', cost: 3, balance: 0 }} onClose={() => {}} />,
    );
    expect(screen.getByRole('dialog', { name: 'Pip needs a recharge' })).toBeTruthy();
    expect(screen.getAllByText('Pip needs a recharge').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText('You can still make small edits on your device for free.').length,
    ).toBeGreaterThan(0);
    expect(screen.getByTestId('out-of-credits-cost').textContent).toBe(
      '0 available · Generate costs 3',
    );
    expect(screen.getByRole('button', { name: 'Keep editing' })).toBeTruthy();
  });

  it('is closed without info', () => {
    render(<OutOfCreditsModal info={null} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Keep editing closes it and focuses the quick edit input when there is one', () => {
    vi.useFakeTimers();
    const input = document.createElement('input');
    input.setAttribute('data-quick-edit-input', '');
    document.body.appendChild(input);
    render(<OutOfCreditsHost />);
    act(() => openOutOfCredits({ action: 'generate', cost: 3, balance: 0 }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(document.activeElement).toBe(input);
    input.remove();
  });

  it('Escape closes it', () => {
    const onClose = vi.fn();
    render(<OutOfCreditsModal info={{ action: 'edit', cost: 1, balance: 0 }} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
