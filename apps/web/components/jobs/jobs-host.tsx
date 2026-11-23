'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth/auth-provider';
import { useCreditsClient } from '@/lib/credits/use-credits-client';
import { browserPipelineDeps } from '@/lib/pipeline/browser-deps';
import {
  cancelForOtherUser,
  isLive,
  setJobDepsProvider,
  useJobs,
  type JobStatus,
} from '@/lib/pipeline/jobs-store';
import { useAppConfig } from '@/lib/renders/hooks';

/** Paths where a finished job opens itself (the creator is watching it). */
export const watchingJob = (pathname: string, jobId: string): boolean =>
  pathname === `/processing/${encodeURIComponent(jobId)}` || pathname === `/processing/${jobId}`;

/**
 * Mounted once in the app layout (spec 39 R6.1, R6.5, R6.6): gives the jobs store its live deps,
 * asks before the tab closes while a job is live, and says when a job is ready.
 */
export function JobsHost() {
  const router = useRouter();
  const { client: credits } = useCreditsClient();
  const config = useAppConfig();
  const auth = useAuth();
  const uid = auth.status === 'signed-in' ? auth.user.uid : null;

  // Live deps for jobs (read when a job starts a step, so the latest client is used).
  const live = useRef({ credits, config, uid });
  useEffect(() => {
    live.current = { credits, config, uid };
  }, [credits, config, uid]);
  useEffect(() => {
    setJobDepsProvider(() => ({
      pipeline: browserPipelineDeps({ credits: live.current.credits }),
      credits: live.current.credits,
      config: live.current.config,
      uid: live.current.uid,
    }));
    return () => setJobDepsProvider(null);
  }, []);

  // A different account mid-job: that job stops (R6.10).
  useEffect(() => {
    if (auth.status === 'loading') return;
    cancelForOtherUser(uid);
  }, [uid, auth.status]);

  const anyLive = useJobs((s) => s.order.some((id) => s.jobs[id] && isLive(s.jobs[id])));
  useEffect(() => {
    if (!anyLive) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Older browsers show this text; newer ones show their own.
      e.returnValue = 'Leave? Processing stops and this edit is lost.';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [anyLive]);

  // "Ready" toasts, once per job, unless the creator is watching it (it opens by itself).
  const seen = useRef(new Map<string, JobStatus>());
  useEffect(() => {
    // Jobs that already exist when the host mounts count as seen, so their change is announced.
    const first = useJobs.getState();
    for (const id of first.order) {
      const j = first.jobs[id];
      if (j) seen.current.set(id, j.status);
    }
    return useJobs.subscribe((s) => {
      for (const id of s.order) {
        const j = s.jobs[id];
        if (!j) continue;
        const before = seen.current.get(id);
        seen.current.set(id, j.status);
        if (before === j.status || before === undefined) continue;
        if (j.status === 'done' && j.projectId && !watchingJob(window.location.pathname, id)) {
          const pid = j.projectId;
          toast.success(`“${j.title}” is ready`, {
            action: {
              label: 'Open',
              onClick: () => router.push(`/editor/${encodeURIComponent(pid)}`),
            },
          });
        } else if (j.status === 'error' && !watchingJob(window.location.pathname, id)) {
          toast.error(`“${j.title}” hit a snag`, {
            action: {
              label: 'View',
              onClick: () => router.push(`/processing/${encodeURIComponent(id)}`),
            },
          });
        }
      }
    });
  }, [router]);

  return null;
}
