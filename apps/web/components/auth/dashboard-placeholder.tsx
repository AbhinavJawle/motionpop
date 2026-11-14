'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Pip } from '@/components/pip/pip';
import { Button } from '@/components/ui/button';
import { signOutUser } from '@/lib/auth/actions';
import { useAuth } from '@/lib/auth/auth-provider';

/** Stand-in for the dashboard (spec 11): who is signed in, start a project, sign out. */
export function DashboardPlaceholder() {
  const auth = useAuth();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const who =
    auth.status === 'signed-in'
      ? (auth.user.displayName ?? auth.user.email ?? 'you')
      : 'this device';

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg px-6">
      <Pip state="idle" size={96} glow look="cursor" decorative seed={11} />
      <p className="label-caps text-violet-ink">YOUR PROJECTS</p>
      <h1
        className="text-[28px] leading-[34px] font-semibold text-text"
        data-testid="dashboard-title"
      >
        Hi, {who}
      </h1>
      <p className="text-[13px] leading-[18px] text-text-2">
        Drop a voice memo and Pip will find the moments.
      </p>
      <div className="mt-2 flex gap-3">
        <Link href="/processing/new">
          <Button variant="primary" size="lg" tabIndex={-1}>
            New project
          </Button>
        </Link>
        {auth.status === 'signed-in' && (
          <Button
            variant="ghost"
            size="lg"
            disabled={leaving}
            onClick={() => {
              setLeaving(true);
              void signOutUser()
                .then(() => router.replace('/sign-in'))
                .finally(() => setLeaving(false));
            }}
          >
            {leaving ? 'Signing out…' : 'Sign out'}
          </Button>
        )}
      </div>
    </main>
  );
}
