import type { Metadata } from 'next';
import { SkillsPage } from '@/components/skills/skills-page';

export const metadata: Metadata = {
  title: 'Skills · motionpop',
  description:
    'Every Reel Director Skill and Motion-Graphic Slot Skill registered in Motionpop, plus where skills live and how to add new ones.',
};

export default function Page() {
  return <SkillsPage />;
}
