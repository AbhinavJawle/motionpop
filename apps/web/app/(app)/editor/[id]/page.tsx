import type { Metadata } from 'next';
import { EditorScreen } from '@/components/editor/editor-screen';

export const metadata: Metadata = { title: 'Editor · motionpop' };

export default async function EditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const t = typeof sp.t === 'string' ? Number.parseInt(sp.t, 10) : Number.NaN;
  const select = typeof sp.select === 'string' ? sp.select : undefined;
  return (
    <EditorScreen
      id={decodeURIComponent(id)}
      initialMs={Number.isFinite(t) ? t : undefined}
      initialSlot={select}
    />
  );
}
