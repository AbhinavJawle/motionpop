import type { Metadata } from 'next';
import { HowItWorksPage } from '@/components/how-it-works/how-it-works-page';

export const metadata: Metadata = {
  title: 'How it works · motionpop',
  description:
    'Technical architecture of Motionpop: on-device Gemini Nano via Firebase AI Logic, Whisper Web Worker, deterministic HyperFrames motion engine, dual Reel + Motion Graphic engines, and Cloud Run rendering.',
};

export default function Page() {
  return <HowItWorksPage />;
}
