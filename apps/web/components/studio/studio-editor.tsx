'use client';

import { PireelEditor } from '@pireel/studio-ui/editor';
import { motionpopProviders } from '@/lib/studio/providers';

const providers = motionpopProviders();

export function StudioEditor({ projectId }: { projectId: string }) {
  return <PireelEditor projectId={projectId} locale="en" providers={providers} className="h-screen w-full" />;
}
