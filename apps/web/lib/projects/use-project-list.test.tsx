// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialProcessing } from '../pipeline/processing-state';
import { resetJobsForTest, useJobs, type Job, type JobStatus } from '../pipeline/jobs-store';
import { useProjectList } from './use-project-list';

const list = vi.hoisted(() => vi.fn());

vi.mock('../audio/app-audio-store', () => ({ appAudioStore: () => ({}) }));
vi.mock('../auth/auth-provider', () => ({ useAuth: () => ({ status: 'signed-out' }) }));
vi.mock('../auth/auth-store', () => ({
  authSettled: async () => undefined,
  currentUid: () => null,
}));
vi.mock('../firebase/client', () => ({ firebaseEnabled: () => false }));
vi.mock('./firestore-cloud', () => ({ firestoreCloud: () => ({}) }));
vi.mock('./synced-library', () => ({ SyncedLibrary: class {} }));
vi.mock('./idb-repository', () => ({
  IdbProjectRepository: class {
    list = list;
  },
}));
vi.mock('../tts/generate-voice', () => ({ generateVoice: vi.fn() }));
vi.mock('../intake/pending', () => ({ clearPending: vi.fn(async () => undefined) }));

const listing = (n: number) => ({
  projects: Array.from({ length: n }, (_, i) => ({ id: `p-${i}` })),
  damaged: [],
});

function mkJob(id: string, status: JobStatus): Job {
  return {
    id,
    title: id,
    kind: 'video',
    source: 'upload',
    media: { name: 'a.mp4', mimeType: 'video/mp4', sizeBytes: 10 },
    status,
    prep: { pct: 100, stage: 'ready' },
    processing: initialProcessing(),
    createdAt: 0,
    progressPct: 0,
    etaMs: null,
  };
}

function setJob(job: Job): void {
  act(() => {
    useJobs.setState((s) => ({
      jobs: { ...s.jobs, [job.id]: job },
      order: s.order.includes(job.id) ? s.order : [...s.order, job.id],
    }));
  });
}

beforeEach(() => {
  resetJobsForTest();
  list.mockReset();
  list.mockResolvedValue(listing(1));
});

afterEach(() => {
  cleanup();
  resetJobsForTest();
});

describe('useProjectList and background jobs (spec 39 R6.6)', () => {
  it('loads once on mount', async () => {
    const { result } = renderHook(() => useProjectList());
    await waitFor(() => expect(result.current.list.kind).toBe('ready'));
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('reloads when a job becomes done, and shows the new project', async () => {
    const { result } = renderHook(() => useProjectList());
    await waitFor(() => expect(result.current.list.kind).toBe('ready'));
    setJob(mkJob('j-1', 'running'));
    expect(list).toHaveBeenCalledTimes(1);

    list.mockResolvedValue(listing(2));
    setJob(mkJob('j-1', 'done'));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      const l = result.current.list;
      expect(l.kind === 'ready' && l.listing.projects.length).toBe(2);
    });
  });

  it('reloads once per finished job, not on every store change', async () => {
    const { result } = renderHook(() => useProjectList());
    await waitFor(() => expect(result.current.list.kind).toBe('ready'));
    setJob(mkJob('j-1', 'running'));
    setJob(mkJob('j-1', 'done'));
    setJob(mkJob('j-1', 'done'));
    setJob(mkJob('j-2', 'running'));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    setJob(mkJob('j-2', 'done'));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(3));
  });

  it('does not reload for a job that fails, is cancelled or is still going', async () => {
    const { result } = renderHook(() => useProjectList());
    await waitFor(() => expect(result.current.list.kind).toBe('ready'));
    setJob(mkJob('j-1', 'queued'));
    setJob(mkJob('j-1', 'running'));
    setJob(mkJob('j-1', 'error'));
    setJob(mkJob('j-2', 'cancelled'));
    await new Promise((r) => setTimeout(r, 20));
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('does not reload for a job that was already done when the list mounted', async () => {
    setJob(mkJob('j-old', 'done'));
    const { result } = renderHook(() => useProjectList());
    await waitFor(() => expect(result.current.list.kind).toBe('ready'));
    setJob(mkJob('j-old', 'done'));
    await new Promise((r) => setTimeout(r, 20));
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('stops listening when the list unmounts', async () => {
    const { result, unmount } = renderHook(() => useProjectList());
    await waitFor(() => expect(result.current.list.kind).toBe('ready'));
    unmount();
    setJob(mkJob('j-1', 'done'));
    await new Promise((r) => setTimeout(r, 20));
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('shows an error when the reload fails', async () => {
    const { result } = renderHook(() => useProjectList());
    await waitFor(() => expect(result.current.list.kind).toBe('ready'));
    list.mockRejectedValue(new Error('idb gone'));
    setJob(mkJob('j-1', 'done'));
    await waitFor(() =>
      expect(result.current.list).toEqual({ kind: 'error', message: 'idb gone' }),
    );
  });
});
