import type { Metadata } from 'next';
import { ConfigureScreen } from '@/components/configure/configure-screen';

export const metadata: Metadata = { title: 'Set up your edit · motionpop' };

export default function ConfigurePage() {
  return <ConfigureScreen />;
}
