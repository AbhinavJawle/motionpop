import type { Metadata } from 'next';
import { Landing } from '@/components/landing/landing';

export const metadata: Metadata = {
  title: 'motionpop · AI short-form video editor & motion graphics studio.',
  description:
    'Edit short-form videos with AI and immaculate motion graphics. Auto-cut retakes, direct vertical reels, and refine frames locally with Chrome Gemini Nano.',
};

/** The public landing page (spec 16). Signed-in visitors get a link to their projects. */
export default function Home() {
  return <Landing />;
}
