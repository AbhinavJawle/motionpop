'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Pip } from '@/components/pip/pip';
import { useAuth } from './auth-provider';
import { signInHref } from './next-path';

/**
 * Protects `(app)` routes (spec 01 R4.2): signed-out users go to `/sign-in?next=<path>`.
 * In local mode (no Firebase config) everything opens. Server routes check tokens themselves.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    if (auth.status !== 'signed-out') return;
    const query = search.toString();
    router.replace(signInHref(query ? `${pathname}?${query}` : pathname));
  }, [auth.status, pathname, search, router]);

  if (auth.status === 'signed-in' || auth.status === 'local') return <>{children}</>;
  return (
    <main
      className="flex min-h-dvh items-center justify-center bg-bg"
      aria-busy="true"
      data-testid="auth-gate-wait"
    >
      <Pip state="sleeping" size={72} decorative seed={3} />
      <span className="sr-only">Checking your account…</span>
    </main>
  );
}
