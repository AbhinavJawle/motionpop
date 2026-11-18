'use client';

import dynamic from 'next/dynamic';

// The editor uses WebCodecs, OPFS and IndexedDB at import time: browser only.
const StudioEditor = dynamic(() => import('./studio-editor').then((m) => m.StudioEditor), {
  ssr: false,
  loading: () => <div className="h-screen w-full" />,
});

export function StudioClient({ projectId }: { projectId: string }) {
  return <StudioEditor projectId={projectId} />;
}
