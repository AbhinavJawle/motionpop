'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';
import { onAIUsage } from '@/lib/ai/router-client';
import { apiHeaders } from '@/lib/users/bootstrap-client';
import { UsageReporter } from '@/lib/usage/reporter';
import { recordSessionUsage } from '@/lib/usage/usage-store';

/**
 * Started once in the app layout (spec 13 task 11). Signed in: router usage events are buffered and
 * sent to `/api/usage`. Local mode (no Firebase): they go to the in-memory session store only,
 * which Settings labels "This session". Renders nothing.
 */
export function UsageReporterHost() {
  const auth = useAuth();
  const user = auth.status === 'signed-in' ? auth.user : null;
  const local = auth.status === 'local';

  useEffect(() => {
    if (!user) return;
    const reporter = new UsageReporter({
      fetch: (...a) => fetch(...a),
      headers: () => apiHeaders(user.getIdToken),
    });
    void reporter.warm();
    const stopTimer = reporter.start();
    const stopListen = onAIUsage((e) => {
      const wire = reporter.add(e);
      // The same session also shows in Settings right away.
      recordSessionUsage(wire);
    });
    return () => {
      stopListen();
      stopTimer();
      // Send what is left; the page is going away or the user signed out.
      void reporter.flush();
    };
  }, [user]);

  useEffect(() => {
    if (!local) return;
    const reporter = new UsageReporter({
      fetch: () => Promise.reject(new Error('local mode')),
      headers: () => Promise.reject(new Error('local mode')),
    });
    return onAIUsage((e) => recordSessionUsage(reporter.toEvent(e)));
  }, [local]);

  return null;
}
