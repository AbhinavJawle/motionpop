import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PricingPage } from '@/components/pricing/pricing-page';

export const metadata: Metadata = {
  title: 'Pricing · motionpop',
  description:
    'Start with 15 free credits and unlimited on-device Chrome Gemini Nano edits. Buy one-time cloud credit packs via Dodo Payments whenever you need more.',
};

export default function PricingRoutePage() {
  return (
    <Suspense>
      <PricingPage />
    </Suspense>
  );
}
