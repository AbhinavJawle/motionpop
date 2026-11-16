import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ScriptScreen } from '@/components/start/script-screen';

export const metadata: Metadata = { title: 'Script · motionpop' };

export default function ScriptPage() {
  return (
    <Suspense>
      <ScriptScreen />
    </Suspense>
  );
}
