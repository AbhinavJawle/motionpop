import type { Metadata } from 'next';
import { RecordScreen } from '@/components/start/record-screen';

export const metadata: Metadata = { title: 'Recording · motionpop' };

export default function RecordPage() {
  return <RecordScreen />;
}
