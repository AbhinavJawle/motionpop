'use client';

import { Pip } from '@/components/pip/pip';
import { useAuth } from '@/lib/auth/auth-provider';
import { DASHBOARD_COPY as C } from '@/lib/dashboard/copy';
import { greet } from '@/lib/dashboard/greeting';

/**
 * Eyebrow, time-aware greeting and Pip (projects.png): eyebrow at y 126, greeting 36 px at
 * y 148, subline 15 px at y 209, Pip ~110 px top right with an ember glow; nightcap at night.
 * Pip never takes a click (R2.3).
 */
export function GreetingHeader({ now }: { now: number | null }) {
  const auth = useAuth();
  const name = auth.status === 'signed-in' ? auth.user.displayName : null;
  const g = now === null ? null : greet(new Date(now).getHours(), name);

  return (
    <section className="relative h-[200px] pt-[42px]">
      <p className="label-caps text-[11px] leading-[14px] tracking-[1.4px] text-ember">
        {C.eyebrow}
      </p>
      <h1
        data-testid="dashboard-title"
        className="mt-[11px] h-[44px] text-[36px] leading-[44px] font-semibold tracking-[-0.6px] text-text"
      >
        {g?.line ?? '\u00a0'}
      </h1>
      <p className="mt-[13px] h-5 text-[15px] leading-5 text-text-2">{g?.subline ?? '\u00a0'}</p>
      <div className="pointer-events-none absolute top-[14px] right-[78px]" aria-hidden>
        <Pip
          size={118}
          look="cursor"
          glow
          decorative
          seed={3}
          props={g?.night ? ['nightcap'] : []}
        />
      </div>
    </section>
  );
}
