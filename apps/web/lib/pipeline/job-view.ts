import { PIPELINE_STEPS } from './events';
import type { Job } from './jobs-store';
import { STEP_TITLES } from './processing-state';

/** Jobs the dashboard shows: everything submitted (drafts still on the configure screen stay out). */
export function dashboardJobs(jobs: Record<string, Job>, order: readonly string[]): Job[] {
  return order
    .map((id) => jobs[id])
    .filter((j): j is Job => j !== undefined && j.status !== 'preparing')
    .reverse();
}

/**
 * The line under a job's title (spec 39 R6.7): "04 · Suggesting graphics" while it runs,
 * "Waiting in line" while queued, the error when it failed, "Ready" when it is done.
 */
export function jobStepLine(job: Pick<Job, 'status' | 'processing' | 'error'>): string {
  switch (job.status) {
    case 'queued':
      return 'Waiting in line';
    case 'done':
      return 'Ready';
    case 'cancelled':
      return 'Cancelled';
    case 'error':
      return job.error ? `Couldn’t finish: ${job.error}` : 'Couldn’t finish';
    case 'preparing':
      return 'Getting ready';
    case 'running': {
      const k = PIPELINE_STEPS.findIndex((s) => job.processing.steps[s].state === 'active');
      const step = PIPELINE_STEPS[k];
      if (!step) return 'Starting';
      const title = job.processing.steps[step].title ?? STEP_TITLES[step];
      return `${String(k + 1).padStart(2, '0')} · ${title}`;
    }
  }
}
