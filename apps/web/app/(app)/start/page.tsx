import type { Metadata } from 'next';
import { StartScreen } from '@/components/start/start-screen';

export const metadata: Metadata = { title: 'New project · motionpop' };

export default function StartPage() {
  return <StartScreen />;
}
