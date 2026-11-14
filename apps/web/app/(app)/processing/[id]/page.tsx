import type { Metadata } from 'next';
import { ProcessingScreen } from '@/components/processing/processing-screen';

export const metadata: Metadata = { title: 'Processing · motionpop' };

export default async function ProcessingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProcessingScreen id={decodeURIComponent(id)} />;
}
