import type { Metadata } from 'next';
import { Landing } from '@/components/landing/landing';

export const metadata: Metadata = {
  title: 'motionpop · Bring your voice. We’ll bring the motion.',
  description:
    'Talk, upload or paste a script. Motionpop finds the moments in what you say and lands premium motion graphics on the words.',
};

/** The public landing page (spec 16). Signed-in visitors get a link to their projects. */
export default function Home() {
  return <Landing />;
}
