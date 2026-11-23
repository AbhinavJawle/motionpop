// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react';
import { APP_CONFIG_DEFAULTS } from '@motionpop/schemas';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialProcessing } from '@/lib/pipeline/processing-state';
import { resetJobsForTest, useJobs, type Job, type JobStatus } from '@/lib/pipeline/jobs-store';
import { JobsHost, watchingJob } from './jobs-host';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/components/ui/toast', () => ({
  toast: { success: mocks.success, error: mocks.error },
}));
vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ status: 'signed-in', user: { uid: 'u-1' } }),
}));
vi.mock('@/lib/credits/use-credits-client', () => ({ useCreditsClient: () => ({ client: null }) }));
vi.mock('@/lib/renders/hooks', () => ({ useAppConfig: () => APP_CONFIG_DEFAULTS }));
vi.mock('@/lib/pipeline/browser-deps', () => ({ browserPipelineDeps: () => ({}) }));
vi.mock('@/lib/tts/generate-voice', () => ({ generateVoice: vi.fn() }));
vi.mock('@/lib/intake/pending', () => ({ clearPending: vi.fn(async () => undefined) }));

function mkJob(id: string, status: JobStatus, extra: Partial<Job> = {}): Job {
  return {
    id,
    title: `Video ${id}`,
    kind: 'video',
    source: 'upload',
    media: { name: 'a.mp4', mimeType: 'video/mp4', sizeBytes: 10 },
    status,
    prep: { pct: 100, stage: 'ready' },
    processing: initialProcessing(),
    createdAt: 0,
    progressPct: 0,
    etaMs: null,
    ...extra,
  };
}

/** Puts jobs in the store, or changes one, the way the store's own `patch` does. */
function setJob(job: Job): void {
  act(() => {
    useJobs.setState((s) => ({
      jobs: { ...s.jobs, [job.id]: job },
      order: s.order.includes(job.id) ? s.order : [...s.order, job.id],
    }));
  });
}

/** A `beforeunload` event; the host calls `preventDefault` on it while a job is live. */
function leave(): { prevented: boolean } {
  const e = new Event('beforeunload', { cancelable: true });
  const spy = vi.spyOn(e, 'preventDefault');
  window.dispatchEvent(e);
  return { prevented: spy.mock.calls.length > 0 };
}

beforeEach(() => {
  resetJobsForTest();
  window.history.pushState({}, '', '/dashboard');
  mocks.push.mockClear();
  mocks.success.mockClear();
  mocks.error.mockClear();
});

afterEach(() => {
  cleanup();
  resetJobsForTest();
});

describe('watchingJob', () => {
  it('is true only for that job’s own processing page', () => {
    expect(watchingJob('/processing/j-1', 'j-1')).toBe(true);
    expect(watchingJob('/processing/j-2', 'j-1')).toBe(false);
    expect(watchingJob('/dashboard', 'j-1')).toBe(false);
    expect(watchingJob('/processing/j-1/extra', 'j-1')).toBe(false);
  });
});

describe('beforeunload (spec 39 R6.5)', () => {
  it('does not ask when no job is live', () => {
    render(<JobsHost />);
    expect(leave().prevented).toBe(false);
    setJob(mkJob('j-1', 'done', { projectId: 'p-1' }));
    setJob(mkJob('j-2', 'error', { error: 'x' }));
    setJob(mkJob('j-3', 'cancelled'));
    expect(leave().prevented).toBe(false);
  });

  it.each(['preparing', 'queued', 'running'] as const)('asks while a job is %s', (status) => {
    render(<JobsHost />);
    setJob(mkJob('j-1', status));
    expect(leave().prevented).toBe(true);
  });

  it('asks when a job is already live as the host mounts', () => {
    setJob(mkJob('j-1', 'running'));
    render(<JobsHost />);
    expect(leave().prevented).toBe(true);
  });

  it('stops asking once the last live job ends, and when the host unmounts', () => {
    const { unmount } = render(<JobsHost />);
    setJob(mkJob('j-1', 'running'));
    setJob(mkJob('j-2', 'queued'));
    expect(leave().prevented).toBe(true);
    setJob(mkJob('j-1', 'done', { projectId: 'p-1' }));
    expect(leave().prevented).toBe(true); // j-2 is still live
    setJob(mkJob('j-2', 'cancelled'));
    expect(leave().prevented).toBe(false);

    setJob(mkJob('j-3', 'running'));
    expect(leave().prevented).toBe(true);
    unmount();
    expect(leave().prevented).toBe(false);
  });
});

describe('done toast (spec 39 R6.6)', () => {
  it('says the video is ready, with Open to the editor', () => {
    render(<JobsHost />);
    setJob(mkJob('j-1', 'running'));
    expect(mocks.success).not.toHaveBeenCalled();
    setJob(mkJob('j-1', 'done', { projectId: 'p 1' }));

    expect(mocks.success).toHaveBeenCalledTimes(1);
    const [title, opts] = mocks.success.mock.calls[0]!;
    expect(title).toBe('“Video j-1” is ready');
    expect(opts.action.label).toBe('Open');
    opts.action.onClick();
    expect(mocks.push).toHaveBeenCalledWith('/editor/p%201');
  });

  it('says nothing when the creator is watching that job’s processing page', () => {
    window.history.pushState({}, '', '/processing/j-1');
    expect(window.location.pathname).toBe('/processing/j-1');
    render(<JobsHost />);
    setJob(mkJob('j-1', 'running'));
    setJob(mkJob('j-1', 'done', { projectId: 'p-1' }));
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it('still says it when the creator is watching a different job', () => {
    window.history.pushState({}, '', '/processing/j-2');
    render(<JobsHost />);
    setJob(mkJob('j-1', 'running'));
    setJob(mkJob('j-1', 'done', { projectId: 'p-1' }));
    expect(mocks.success).toHaveBeenCalledTimes(1);
  });

  it('speaks once per job, not on every later store change', () => {
    render(<JobsHost />);
    setJob(mkJob('j-1', 'running'));
    setJob(mkJob('j-1', 'done', { projectId: 'p-1' }));
    setJob(mkJob('j-2', 'running'));
    setJob(mkJob('j-1', 'done', { projectId: 'p-1', progressPct: 100 }));
    expect(mocks.success).toHaveBeenCalledTimes(1);
    setJob(mkJob('j-2', 'done', { projectId: 'p-2' }));
    expect(mocks.success).toHaveBeenCalledTimes(2);
  });

  it('does not say it for a job that finished without a project', () => {
    render(<JobsHost />);
    setJob(mkJob('j-1', 'running'));
    setJob(mkJob('j-1', 'done'));
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it('announces a job that was already running when the host mounted', () => {
    setJob(mkJob('j-1', 'running'));
    render(<JobsHost />);
    setJob(mkJob('j-1', 'done', { projectId: 'p-1' }));
    expect(mocks.success).toHaveBeenCalledTimes(1);
  });

  it('does not repeat the toast after the host remounts on a finished job', () => {
    const first = render(<JobsHost />);
    setJob(mkJob('j-1', 'running'));
    setJob(mkJob('j-1', 'done', { projectId: 'p-1' }));
    first.unmount();
    render(<JobsHost />);
    setJob(mkJob('j-1', 'done', { projectId: 'p-1', progressPct: 100 }));
    expect(mocks.success).toHaveBeenCalledTimes(1);
  });
});

describe('error toast', () => {
  it('offers View when a job fails out of sight', () => {
    render(<JobsHost />);
    setJob(mkJob('j-1', 'running'));
    setJob(mkJob('j-1', 'error', { error: 'boom' }));
    expect(mocks.error).toHaveBeenCalledTimes(1);
    const [title, opts] = mocks.error.mock.calls[0]!;
    expect(title).toBe('“Video j-1” hit a snag');
    opts.action.onClick();
    expect(mocks.push).toHaveBeenCalledWith('/processing/j-1');
  });

  it('stays quiet when the creator is looking at that job', () => {
    window.history.pushState({}, '', '/processing/j-1');
    render(<JobsHost />);
    setJob(mkJob('j-1', 'running'));
    setJob(mkJob('j-1', 'error', { error: 'boom' }));
    expect(mocks.error).not.toHaveBeenCalled();
  });
});
