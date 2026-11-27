// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  replace: vi.fn(),
  take: null as unknown,
  load: vi.fn(),
  cancel: vi.fn(),
  retry: vi.fn(),
  submit: vi.fn<(id: string, edit: unknown) => boolean>(() => true),
}));

// A stable router, as Next's is: the screen's effects depend on it.
vi.mock('next/navigation', () => {
  const router = { push: h.push, replace: h.replace };
  return { useRouter: () => router };
});
vi.mock('@/components/landing/pip-loop', () => ({ PipLoop: () => null }));
vi.mock('@/lib/intake/pending', () => ({ takePending: () => Promise.resolve(h.take) }));
vi.mock('@/lib/projects/use-project-list', () => ({
  projectLibrary: () => ({ load: h.load }),
}));
vi.mock('@/lib/pipeline/jobs-store', async (orig) => ({
  ...(await orig<typeof import('@/lib/pipeline/jobs-store')>()),
  cancel: h.cancel,
  retry: h.retry,
  submit: h.submit,
}));

import {
  isWatched,
  resetJobsForTest,
  useJobs,
  type Job,
  type JobStatus,
} from '@/lib/pipeline/jobs-store';
import { pipForJob, ProcessingScreen } from './processing-screen';

function mkJob(id: string, status: JobStatus, extra: Partial<Job> = {}): Job {
  return {
    id,
    title: 'My clip',
    kind: 'video',
    source: 'upload',
    media: { name: 'a.mp4', mimeType: 'video/mp4', sizeBytes: 10 },
    status,
    prep: { pct: 100, stage: 'ready' },
    processing: initialProcessing(),
    createdAt: 0,
    progressPct: 40,
    etaMs: 30_000,
    ...extra,
  };
}
const setJob = (job: Job) =>
  act(() => {
    useJobs.setState((s) => ({
      jobs: { ...s.jobs, [job.id]: job },
      order: s.order.includes(job.id) ? s.order : [...s.order, job.id],
    }));
  });

beforeEach(() => {
  h.take = null;
  h.push.mockClear();
  h.replace.mockClear();
  h.cancel.mockClear();
  h.retry.mockClear();
  h.submit.mockClear();
  h.load.mockReset();
  h.load.mockResolvedValue({ ok: false, error: 'not-found' });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  resetJobsForTest();
});

describe('ProcessingScreen: a job in the store', () => {
  it('shows the steps, the progress and Continue in background beside Cancel', () => {
    setJob(
      mkJob('j-1', 'running', {
        recipeLabel: 'Tech Explainer',
        styleLabel: 'Mono Grid',
        processing: reduceProcessing(initialProcessing(), {
          type: 'step',
          step: 'transcribe',
          state: 'active',
          detail: 'Listening',
        }),
      }),
    );
    render(<ProcessingScreen id="j-1" />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Editing your video.');
    expect(screen.getByText('My clip')).toBeTruthy();
    expect(screen.getByText(/Tech Explainer · Mono Grid/)).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Processing steps' }).children).toHaveLength(5);
    expect(screen.getByText('Listening')).toBeTruthy();
    expect(
      screen.getByRole('progressbar', { name: 'Edit progress' }).getAttribute('aria-valuenow'),
    ).toBe('40');
    expect(screen.getByTestId('job-eta').textContent).toMatch(/left/);
    expect(screen.getByText('Your video')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Continue in background' }));
    expect(h.push).toHaveBeenCalledWith('/dashboard');
    expect(h.cancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(h.cancel).toHaveBeenCalledWith('j-1');
  });

  it('shows the local AI model badge instead of "cloud, free" when steps run on a local LLM', () => {
    setJob(
      mkJob('j-local', 'running', {
        processing: reduceProcessing(initialProcessing(), {
          type: 'step',
          step: 'suggest',
          state: 'active',
          detail: 'Writing the story',
          route: 'local-llm',
          routeLabel: 'qwen3.5:9b',
        }),
      }),
    );
    render(<ProcessingScreen id="j-local" />);
    expect(screen.getByText('qwen3.5:9b · local')).toBeTruthy();
    expect(screen.queryByText('cloud, free')).toBeNull();
  });

  it('a voice job keeps the voice headline and strip label', () => {
    setJob(mkJob('j-1', 'running', { kind: 'voiceover' }));
    render(<ProcessingScreen id="j-1" />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Turning your voice into motion.',
    );
    expect(screen.getByText('Your voice')).toBeTruthy();
  });

  it('a queued job says it waits and still offers both buttons', () => {
    setJob(mkJob('j-2', 'queued', { progressPct: 0, etaMs: null }));
    render(<ProcessingScreen id="j-2" />);
    expect(screen.getByText('Waiting for the edit before this one…')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue in background' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('follows the store as the job moves on', () => {
    setJob(mkJob('j-1', 'running', { progressPct: 10 }));
    render(<ProcessingScreen id="j-1" />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('10');
    setJob(mkJob('j-1', 'running', { progressPct: 70 }));
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('70');
  });

  describe('an error', () => {
    it('shows the reason with Try again and Choose another file', () => {
      setJob(mkJob('j-1', 'error', { error: 'The directing step failed.' }));
      render(<ProcessingScreen id="j-1" />);
      expect(screen.getByRole('alert').textContent).toBe('The directing step failed.');
      expect(screen.queryByRole('button', { name: 'Continue in background' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(h.retry).toHaveBeenCalledWith('j-1');
      expect(screen.getByRole('button', { name: 'Choose another file' })).toBeTruthy();
    });

    it('a problem with the file itself offers no Try again', () => {
      setJob(mkJob('j-1', 'error', { error: 'That file is too long.', intakeError: true }));
      render(<ProcessingScreen id="j-1" />);
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Choose another file' })).toBeTruthy();
    });

    it('Choose another file removes the job and goes to Start', () => {
      setJob(mkJob('j-1', 'error', { error: 'x' }));
      render(<ProcessingScreen id="j-1" />);
      fireEvent.click(screen.getByRole('button', { name: 'Choose another file' }));
      expect(useJobs.getState().jobs['j-1']).toBeUndefined();
      expect(h.push).toHaveBeenCalledWith('/start');
    });
  });

  it('a cancelled job says nothing was saved and offers Start again', () => {
    setJob(mkJob('j-1', 'cancelled'));
    render(<ProcessingScreen id="j-1" />);
    expect(screen.getByText('This edit was cancelled. Nothing was saved.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Start again' }));
    expect(h.push).toHaveBeenCalledWith('/start');
  });

  describe('done', () => {
    it('opens the editor after the celebration delay and dismisses the job', () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      setJob(mkJob('j-1', 'running'));
      render(<ProcessingScreen id="j-1" />);
      setJob(mkJob('j-1', 'done', { projectId: 'p 1', progressPct: 100 }));
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Here it comes.');
      expect(h.push).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(1099);
      });
      expect(h.push).not.toHaveBeenCalled();
      expect(useJobs.getState().jobs['j-1']).toBeDefined();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(h.push).toHaveBeenCalledWith('/editor/p%201');
      expect(useJobs.getState().jobs['j-1']).toBeUndefined();
    });

    it('a finished job without a project id does not open anything', () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      setJob(mkJob('j-1', 'done'));
      render(<ProcessingScreen id="j-1" />);
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(h.push).not.toHaveBeenCalled();
    });

    it('leaving before the delay is over keeps the job for the dashboard card', () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      setJob(mkJob('j-1', 'done', { projectId: 'p-1' }));
      const { unmount } = render(<ProcessingScreen id="j-1" />);
      unmount();
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(h.push).not.toHaveBeenCalled();
      expect(useJobs.getState().jobs['j-1']).toBeDefined();
    });
  });

  it('watches the job while it shows it, and lets go when it leaves', () => {
    setJob(mkJob('j-1', 'running'));
    expect(isWatched('j-1')).toBe(false);
    const { unmount } = render(<ProcessingScreen id="j-1" />);
    expect(isWatched('j-1')).toBe(true);
    unmount();
    expect(isWatched('j-1')).toBe(false);
  });
});

describe('ProcessingScreen: /processing/new', () => {
  const take = (extra: Record<string, unknown> = {}) => ({
    blob: new Blob(['not really audio'], { type: 'audio/wav' }),
    meta: { ref: 'ref-1', source: 'upload', name: 'one line.wav', cleanup: false, ...extra },
    draft: { title: 'Untitled Project', format: '16:9' },
  });

  it('a pending single graphic prepares, submits with the default choices and moves on', async () => {
    h.take = take({ single: true, words: [] });
    render(<ProcessingScreen id="new" />);
    await waitFor(() => expect(h.replace).toHaveBeenCalledTimes(1));
    const jobId = Object.keys(useJobs.getState().jobs)[0]!;
    expect(h.replace).toHaveBeenCalledWith(`/processing/${jobId}`);
    expect(h.submit).toHaveBeenCalledTimes(1);
    const [id, edit] = h.submit.mock.calls[0]! as [string, { v: number; recipeId: string }];
    expect(id).toBe(jobId);
    expect(edit).toMatchObject({ v: 1, recipeId: 'tech-explainer' });
  });

  it('a normal pending take goes to the configure screen, nothing is prepared or submitted', async () => {
    h.take = take();
    render(<ProcessingScreen id="new" />);
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/start/configure'));
    expect(h.submit).not.toHaveBeenCalled();
    expect(Object.keys(useJobs.getState().jobs)).toEqual([]);
  });

  it('nothing pending shows the drop zone and looks up no project', async () => {
    render(<ProcessingScreen id="new" />);
    expect(
      await screen.findByRole('button', {
        name: 'Drop a video or voiceover here, or choose a file',
      }),
    ).toBeTruthy();
    expect(h.replace).not.toHaveBeenCalled();
    expect(h.load).not.toHaveBeenCalled();
  });
});

describe('ProcessingScreen: any other id', () => {
  it('a project id opens the editor', async () => {
    h.load.mockResolvedValue({ ok: true, project: {} });
    render(<ProcessingScreen id="p-9" />);
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/editor/p-9'));
  });

  it('an unknown id with no project was interrupted by a reload', async () => {
    render(<ProcessingScreen id="j-gone" />);
    expect(await screen.findByText('This upload was interrupted. Nothing was saved.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Choose another file' }));
    expect(h.replace).toHaveBeenCalledWith('/start');
    expect(h.cancel).not.toHaveBeenCalled();
  });

  it('is not marked watched when there is no job', async () => {
    render(<ProcessingScreen id="j-gone" />);
    await screen.findByText(/interrupted/);
    expect(isWatched('j-gone')).toBe(false);
  });
});

describe('pipForJob (live step-reactive Pip mascots)', () => {
  it('maps each pipeline step to its matching Pip character', () => {
    const withStep = (step: 'transcribe' | 'clean' | 'moments' | 'suggest' | 'plan') =>
      mkJob('j-pip', 'running', {
        processing: reduceProcessing(initialProcessing(), { type: 'step', step, state: 'active' }),
      });
    expect(pipForJob(withStep('transcribe'), false)).toBe('sound');
    expect(pipForJob(withStep('clean'), false)).toBe('craft');
    expect(pipForJob(withStep('moments'), false)).toBe('caption');
    expect(pipForJob(withStep('suggest'), false)).toBe('sketch');
    expect(pipForJob(withStep('plan'), false)).toBe('sketch');
    expect(pipForJob(withStep('plan'), true)).toBe('juggle');
  });
});
