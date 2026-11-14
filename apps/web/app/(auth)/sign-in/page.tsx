import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SignInScreen } from '@/components/auth/sign-in-screen';

export const metadata: Metadata = { title: 'Sign in · motionpop' };

export default function SignInPage() {
  // useSearchParams (the ?next= target) needs a Suspense boundary.
  return (
    <Suspense>
      <SignInScreen />
    </Suspense>
  );
}
