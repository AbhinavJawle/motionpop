import { describe, expect, it } from 'vitest';
import type { PipelineEvent } from './events';
import { dashboardJobs, jobStepLine } from './job-view';
import type { Job, JobStatus } from './jobs-store';
import { initialProcessing, reduceProcessing } from './processing-state';

const fold = (...events: PipelineEvent[]) => events.reduce(reduceProcessing, initialProcessing());

function mkJob(id: string, status: JobStatus, extra: Partial<Job> = {}): Job {
  return {
    id,
    title: id,
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

describe('dashboardJobs', () => {
  it('leaves out jobs still on the configure screen and lists the newest first', () => {
    const jobs = {
      a: mkJob('a', 'done'),
      b: mkJob('b', 'preparing'),
      c: mkJob('c', 'running'),
      d: mkJob('d', 'queued'),
    };
    expect(dashboardJobs(jobs, ['a', 'b', 'c', 'd']).map((j) => j.id)).toEqual(['d', 'c', 'a']);
  });

  it('keeps every status after Create: queued, running, done, error and cancelled', () => {
    const statuses: JobStatus[] = ['queued', 'running', 'done', 'error', 'cancelled'];
    const jobs = Object.fromEntries(statuses.map((s) => [s, mkJob(s, s)]));
    expect(dashboardJobs(jobs, statuses).map((j) => j.status)).toEqual([...statuses].reverse());
  });

  it('skips ids that are not in the map and does not touch its input', () => {
    const order = ['a', 'gone', 'b'];
    const jobs = { a: mkJob('a', 'done'), b: mkJob('b', 'done') };
    expect(dashboardJobs(jobs, order).map((j) => j.id)).toEqual(['b', 'a']);
    expect(order).toEqual(['a', 'gone', 'b']);
  });

  it('is empty for no jobs', () => {
    expect(dashboardJobs({}, [])).toEqual([]);
  });
});

describe('jobStepLine', () => {
  const line = (status: JobStatus, extra: Partial<Job> = {}) =>
    jobStepLine(mkJob('j', status, extra));

  it('says what each non-running status means', () => {
    expect(line('queued')).toBe('Waiting in line');
    expect(line('done')).toBe('Ready');
    expect(line('cancelled')).toBe('Cancelled');
    expect(line('preparing')).toBe('Getting ready');
  });

  it('an error carries its reason, or stands alone without one', () => {
    expect(line('error', { error: 'The model timed out.' })).toBe(
      'Couldn’t finish: The model timed out.',
    );
    expect(line('error')).toBe('Couldn’t finish');
  });

  it('a running job with no active step is just starting', () => {
    expect(line('running')).toBe('Starting');
  });

  it('a running job shows the number and title of its active step', () => {
    const steps = ['transcribe', 'clean', 'moments', 'suggest', 'plan'] as const;
    const titles = [
      '01 · Transcribing',
      '02 · Cleaning audio',
      '03 · Finding moments',
      '04 · Suggesting graphics',
      '05 · Planning the video',
    ];
    steps.forEach((step, k) => {
      const processing = fold({ type: 'step', step, state: 'active' });
      expect(line('running', { processing })).toBe(titles[k]);
    });
  });

  it('uses the step title a reel gave it', () => {
    const processing = fold(
      { type: 'titles', titles: { plan: 'Directing the reel' } },
      { type: 'step', step: 'plan', state: 'active' },
    );
    expect(line('running', { processing })).toBe('05 · Directing the reel');
  });

  it('finished steps do not count; the first active one does', () => {
    const processing = fold(
      { type: 'step', step: 'transcribe', state: 'done' },
      { type: 'step', step: 'clean', state: 'done' },
      { type: 'step', step: 'moments', state: 'active' },
    );
    expect(line('running', { processing })).toBe('03 · Finding moments');
  });
});
