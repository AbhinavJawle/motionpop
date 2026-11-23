// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DASHBOARD_COPY } from '@/lib/dashboard/copy';
import { EmptyCard } from './empty-card';

const push = vi.hoisted(() => vi.fn());
const handOffSample = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock('@/lib/intake/hand-off', () => ({ CONFIGURE: '/start/configure', handOffSample }));
vi.mock('@/components/ui/toast', () => ({ toast: { error: toastError } }));
vi.mock('@/components/landing/pip-loop', () => ({ PipLoop: () => null }));

beforeEach(() => {
  push.mockReset();
  handOffSample.mockReset();
  toastError.mockReset();
});
afterEach(cleanup);

const sampleButton = () => screen.getByRole('button', { name: DASHBOARD_COPY.empty.sample });

describe('EmptyCard sample (spec 39 R2.1)', () => {
  it('is a button that stores the sample and goes straight to the configure screen', async () => {
    handOffSample.mockResolvedValue({ ok: true });
    render(<EmptyCard drag="idle" onWake={() => {}} />);
    expect(screen.queryByRole('link', { name: DASHBOARD_COPY.empty.sample })).toBeNull();
    fireEvent.click(sampleButton());
    await waitFor(() => expect(push).toHaveBeenCalledWith('/start/configure'));
    expect(handOffSample).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalledWith('/processing/new');
  });

  it('a second tap while it is working does nothing', async () => {
    handOffSample.mockResolvedValue({ ok: true });
    render(<EmptyCard drag="idle" onWake={() => {}} />);
    fireEvent.click(sampleButton());
    fireEvent.click(sampleButton());
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(handOffSample).toHaveBeenCalledTimes(1);
  });

  it('a sample that could not be stored shows the reason and stays on the dashboard', async () => {
    handOffSample.mockResolvedValue({ ok: false, message: 'Couldn’t start the sample.' });
    render(<EmptyCard drag="idle" onWake={() => {}} />);
    fireEvent.click(sampleButton());
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Couldn’t start the sample.'));
    expect(push).not.toHaveBeenCalled();
    // The button works again.
    expect((sampleButton() as HTMLButtonElement).disabled).toBe(false);
  });
});
