import type { Metadata } from 'next';
import { ShareNotFound, ShareVideo } from '@/components/share/share-view';
import { sharePageDeps } from '@/lib/renders/share-deps.server';
import { loadShareView, type ShareView } from '@/lib/renders/share-page.server';
import { renderMode } from '@/lib/renders/mode.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A shared video is for the people holding the link: never indexed (R5.4). */
export const metadata: Metadata = {
  title: 'Shared video · motionpop',
  robots: { index: false, follow: false },
};

/** `/share/{id}` (R5.4, not designed): a server component, Admin reads and a signed URL. */
export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let view: ShareView = { kind: 'not-found' };
  try {
    const mode = renderMode();
    // Offline mode has no Firebase: there are no shares to read.
    if (mode !== 'offline') view = await loadShareView(sharePageDeps(mode), id);
  } catch (err) {
    console.error(JSON.stringify({ event: 'share-page-failed', error: String(err).slice(0, 200) }));
  }
  return view.kind === 'found' ? <ShareVideo {...view} /> : <ShareNotFound />;
}
