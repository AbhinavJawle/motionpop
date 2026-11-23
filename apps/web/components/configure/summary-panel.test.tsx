// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Summary } from '@/lib/configure/summary';
import { SummaryPanel } from './summary-panel';

afterEach(cleanup);

const base: Summary = {
  rows: [
    {
      id: 'transcribe',
      label: 'Transcription',
      value: 'Free · on-device',
      credits: 0,
      route: 'device',
    },
    {
      id: 'direct',
      label: 'Reel directing',
      value: '3 credits',
      credits: 3,
      route: 'cloud',
      note: 'Includes the retake check',
    },
  ],
  total: 3,
  totalUpTo: false,
};

const create = () => screen.getByRole('button', { name: /Create|Starting/ }) as HTMLButtonElement;

describe('SummaryPanel', () => {
  it('lists every row with its value and the total, and Create calls back', () => {
    const onCreate = vi.fn();
    render(<SummaryPanel summary={base} creating={false} preparing={null} onCreate={onCreate} />);
    expect(screen.getByText('Transcription')).toBeTruthy();
    expect(screen.getByText('Free · on-device')).toBeTruthy();
    expect(screen.getByText('Includes the retake check')).toBeTruthy();
    expect(screen.getByText('3 credits')).toBeTruthy();
    expect(screen.queryByText('up to')).toBeNull();
    expect(screen.getByText('Nothing is spent until you press Create.')).toBeTruthy();
    expect(create().disabled).toBe(false);
    fireEvent.click(create());
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('shows "up to" beside the total when it is a ceiling', () => {
    render(
      <SummaryPanel
        summary={{ ...base, total: 9, totalUpTo: true }}
        creating={false}
        preparing={null}
        onCreate={() => {}}
      />,
    );
    expect(screen.getByText('up to')).toBeTruthy();
    expect(screen.getByText('9')).toBeTruthy();
  });

  it('a block reason disables Create and is shown', () => {
    const onCreate = vi.fn();
    render(
      <SummaryPanel
        summary={{ ...base, block: 'Needs connection' }}
        creating={false}
        preparing={null}
        onCreate={onCreate}
      />,
    );
    expect(create().disabled).toBe(true);
    expect(screen.getByText('Needs connection')).toBeTruthy();
    fireEvent.click(create());
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('a failed take (disabledReason) wins over the summary block', () => {
    render(
      <SummaryPanel
        summary={{ ...base, block: 'Needs connection' }}
        creating={false}
        preparing={null}
        onCreate={() => {}}
        disabledReason="Choose another file to continue"
      />,
    );
    expect(create().disabled).toBe(true);
    expect(screen.getByText('Choose another file to continue')).toBeTruthy();
    expect(screen.queryByText('Needs connection')).toBeNull();
  });

  it('keeps Create enabled while preparing and says it carries on', () => {
    render(<SummaryPanel summary={base} creating={false} preparing={42} onCreate={() => {}} />);
    expect(create().disabled).toBe(false);
    expect(screen.getByText(/Still preparing \(42%\)/)).toBeTruthy();
  });

  it('is disabled while creating', () => {
    render(<SummaryPanel summary={base} creating preparing={null} onCreate={() => {}} />);
    expect(create().disabled).toBe(true);
    expect(create().textContent).toBe('Starting…');
  });

  it('says "1 credit" for a total of one', () => {
    render(
      <SummaryPanel
        summary={{ ...base, total: 1 }}
        creating={false}
        preparing={null}
        onCreate={() => {}}
      />,
    );
    expect(screen.getByText('credit')).toBeTruthy();
  });
});
