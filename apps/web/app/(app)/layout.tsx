import { Suspense, type ReactNode } from 'react';
import { AuthGate } from '@/lib/auth/auth-gate';

/** Every `(app)` route needs an account when Firebase is configured (spec 01 R4.2). */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <AuthGate>{children}</AuthGate>
    </Suspense>
  );
}
