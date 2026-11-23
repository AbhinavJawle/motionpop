// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialProcessing, reduceProcessing } from '@/lib/pipeline/processing-state';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only removal of a DOM API
delete (Element.prototype as any).animate;
if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as never;
}

const h = vi.hoisted(() => ({
  push: vi.fn(),
  cancel: vi.fn(),
  retry: vi.fn(),
  dismiss: vi.fn(),
}));

vi.mock('next/navigation', () => {
  const router = { push: h.push };
  return { useRouter: () => router };
});
vi.mock('@/lib/pipeline/jobs-store', async (orig) => ({
  ...(await orig<typeof import('@/lib/pipeline/jobs-store')>()),
  cancel: h.cancel,
  retry: h.retry,
  dismiss: h.dismiss,
}));

import { resetJobsForTest, useJobs, type Job, type JobStatus } from '@/lib/pipeline/jobs-store';
import { WorkingSection } from './working-section';

function mkJob(id: string, status: JobStatus, extra: Partial<Job> = {}): Job {
  return {
    id,
    title: `Clip ${id}`,
    kind: 'video',
    source: 'upload',
    media: { name: 'a.mp4', mimeType: 'video/mp4', sizeBytes: 1 },
    status,
    prep: { pct: 100, stage: 'ready' },
    processing: initialProcessing(),
    createdAt: 0,
    progressPct: 0,
    etaMs: null,
    ...extra,
  };
}
const put = (...jobs: Job[]) =>
  act(() => {
    useJobs.setState((s) => ({
      jobs: { ...s.jobs, ...Object.fromEntries(jobs.map((j) => [j.id, j])) },
      order: [...s.order, ...jobs.map((j) => j.id).filter((id) => !s.order.includes(id))],
    }));
  });

beforeEach(() => {
  Object.values(h).forEach((f) => f.mockClear());
});
afterEach(() => {
  cleanup();
  resetJobsForTest();
});

const card = (id: string) =>
  screen.getAllByTestId('job-card').find((c) => c.textContent?.includes(`Clip ${id}`))!;

describe('WorkingSection', () => {
  it('renders nothing with no jobs, and nothing for a job still being configured', () => {
    const { container } = render(<WorkingSection />);
    expect(container.innerHTML).toBe('');
    put(mkJob('a', 'preparing'));
    expect(container.innerHTML).toBe('');
  });

  it('a running card shows its step, bar, ETA, View progress and Cancel', () => {
    put(
      mkJob('a', 'running', {
        recipeLabel: 'Tech Explainer',
        styleLabel: 'Mono Grid',
        progressPct: 45,
        etaMs: 30_000,
        processing: reduceProcessing(initialProcessing(), {
          type: 'step',
          step: 'suggest',
          state: 'active',
        }),
      }),
    );
    render(<WorkingSection />);
    expect(screen.getByRole('heading', { name: 'Working on it' })).toBeTruthy();
    const c = within(card('a'));
    expect(c.getByText('Tech Explainer · Mono Grid')).toBeTruthy();
    expect(c.getByText('04 · Suggesting graphics')).toBeTruthy();
    expect(
      c.getByRole('progressbar', { name: 'Clip a progress' }).getAttribute('aria-valuenow'),
    ).toBe('45');
    expect(c.getByText('45%')).toBeTruthy();
    expect(c.getByText('~30s left')).toBeTruthy();
    expect(c.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(c.queryByRole('button', { name: 'Open' })).toBeNull();
    expect(c.queryByRole('button', { name: /Dismiss/ })).toBeNull();

    fireEvent.click(c.getByRole('button', { name: 'View progress' }));
    expect(h.push).toHaveBeenCalledWith('/processing/a');
    fireEvent.click(c.getByRole('button', { name: 'Cancel' }));
    expect(h.cancel).toHaveBeenCalledWith('a');
  });

  it('a queued card says it waits and still has View progress and Cancel', () => {
    put(mkJob('q', 'queued'));
    render(<WorkingSection />);
    const c = within(card('q'));
    expect(c.getByText('Waiting in line')).toBeTruthy();
    expect(c.getByRole('button', { name: 'View progress' })).toBeTruthy();
    expect(c.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('an error card shows the reason with Retry, Details and Dismiss, and no bar', () => {
    put(mkJob('e', 'error', { error: 'The director timed out.' }));
    render(<WorkingSection />);
    const c = within(card('e'));
    expect(c.getByText('Couldn’t finish: The director timed out.')).toBeTruthy();
    expect(c.queryByRole('progressbar')).toBeNull();
    fireEvent.click(c.getByRole('button', { name: 'Retry' }));
    expect(h.retry).toHaveBeenCalledWith('e');
    fireEvent.click(c.getByRole('button', { name: 'Details' }));
    expect(h.push).toHaveBeenCalledWith('/processing/e');
    fireEvent.click(c.getByRole('button', { name: 'Dismiss Clip e' }));
    expect(h.dismiss).toHaveBeenCalledWith('e');
  });

  it('a problem with the file itself offers no Retry', () => {
    put(mkJob('f', 'error', { error: 'Too long.', intakeError: true }));
    render(<WorkingSection />);
    const c = within(card('f'));
    expect(c.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(c.getByRole('button', { name: 'Details' })).toBeTruthy();
  });

  it('a done card has Open (to the editor) and Dismiss', () => {
    put(mkJob('d', 'done', { projectId: 'p 1' }));
    render(<WorkingSection />);
    const c = within(card('d'));
    expect(c.getByText('Ready')).toBeTruthy();
    expect(c.queryByRole('button', { name: 'Cancel' })).toBeNull();
    fireEvent.click(c.getByRole('button', { name: 'Open' }));
    expect(h.push).toHaveBeenCalledWith('/editor/p%201');
    fireEvent.click(c.getByRole('button', { name: 'Dismiss Clip d' }));
    expect(h.dismiss).toHaveBeenCalledWith('d');
  });

  it('a cancelled card can only be dismissed', () => {
    put(mkJob('c', 'cancelled'));
    render(<WorkingSection />);
    const c = within(card('c'));
    expect(c.getByText('Cancelled')).toBeTruthy();
    expect(c.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Dismiss Clip c',
    ]);
  });

  it('lists newest first and follows the store', () => {
    put(mkJob('a', 'running'), mkJob('b', 'queued'));
    render(<WorkingSection />);
    expect(screen.getAllByTestId('job-card').map((c) => c.getAttribute('data-status'))).toEqual([
      'queued',
      'running',
    ]);
    put(mkJob('a', 'done', { projectId: 'p-1' }));
    expect(card('a').getAttribute('data-status')).toBe('done');
  });

  it('a script job gets the script icon instead of a frame', () => {
    put(mkJob('s', 'running', { script: 'Hello there.', kind: 'voiceover' }));
    const { container } = render(<WorkingSection />);
    expect(container.querySelector('img')).toBeNull();
    put(
      mkJob('v', 'running', {
        media: {
          name: 'v.mp4',
          mimeType: 'video/mp4',
          sizeBytes: 1,
          thumbUrl: 'data:image/jpeg;base64,AA',
        },
      }),
    );
    expect(container.querySelector('img')?.getAttribute('src')).toBe('data:image/jpeg;base64,AA');
  });
});
