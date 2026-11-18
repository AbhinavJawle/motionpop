import { StudioClient } from '@/components/studio/studio-client';

/** The studio: Pireel's editor with Motionpop's providers (spec 17 task 3). */
export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StudioClient projectId={id} />;
}
