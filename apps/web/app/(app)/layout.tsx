import { Suspense, type ReactNode } from 'react';
import { UsageReporterHost } from '@/components/credits/usage-reporter-host';
import { OutOfCreditsHost } from '@/components/credits/out-of-credits-modal';
import { AuthGate } from '@/lib/auth/auth-gate';

/** Every `(app)` route needs an account when Firebase is configured (spec 01 R4.2). */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <AuthGate>{children}</AuthGate>
      <OutOfCreditsHost />
      <UsageReporterHost />
    </Suspense>
  );
}
