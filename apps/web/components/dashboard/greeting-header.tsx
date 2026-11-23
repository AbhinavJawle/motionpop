'use client';

import { Bubble, poster } from '@/components/paper/kit';
import { PipLoop } from '@/components/landing/pip-loop';
import { useAuth } from '@/lib/auth/auth-provider';
import { greet } from '@/lib/dashboard/greeting';
import { cn } from '@/lib/cn';

/** "Good afternoon, Abhinav" → ["Good afternoon,", "Abhinav."] for the two poster lines. */
function posterLines(line: string): [string, string] {
  const i = line.indexOf(',');
  if (i < 0) return [line, ''];
  const tail = line.slice(i + 1).trim();
  return [line.slice(0, i + 1), /[.?!]$/.test(tail) ? tail : `${tail}.`];
}

/**
 * The greeting (spec 35): the time-aware line set as a two-line poster title, with Pip holding
 * the clapper and saying the subline. Pip never takes a click (spec 11 R2.3).
 */
export function GreetingHeader({ now }: { now: number | null }) {
  const auth = useAuth();
  const name = auth.status === 'signed-in' ? auth.user.displayName : null;
  const g = now === null ? null : greet(new Date(now).getHours(), name);
  const [a, b] = g ? posterLines(g.line) : [' ', ' '];

  return (
    <section className="relative flex items-end justify-between gap-6 pt-16 pb-10">
      <h1
        data-testid="dashboard-title"
        className={cn(poster, 'text-[clamp(64px,9vw,128px)]')}
        aria-label={g?.line}
      >
        <span className="block">{a}</span>
        <span className="block">{b}</span>
      </h1>
      <div className="relative hidden h-[250px] w-[300px] shrink-0 md:block" aria-hidden>
        {g && (
          <Bubble right className="absolute top-6 right-[40px] whitespace-nowrap">
            {g.subline}
          </Bubble>
        )}
        <PipLoop name="clapper" className="absolute -right-6 -bottom-10 size-[230px] select-none" />
      </div>
    </section>
  );
}
