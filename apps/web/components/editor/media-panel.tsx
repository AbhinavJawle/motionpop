'use client';

import { Search, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { getAuthSnapshot } from '@/lib/auth/auth-store';
import { addOwnImage, imageRoleOf } from '@/lib/images/generate';
import { sceneFor } from '@/lib/motion/registry';
import { editorStore, useEditor } from '@/lib/stores/editor';
import { apiHeaders } from '@/lib/users/bootstrap-client';

const HitSchema = z.object({
  id: z.string(),
  title: z.string(),
  thumb: z.string(),
  width: z.number(),
  height: z.number(),
  license: z.string(),
  attribution: z.string(),
});
type Hit = z.infer<typeof HitSchema>;

async function headers(): Promise<HeadersInit> {
  const a = getAuthSnapshot();
  return a.status === 'signed-in' ? apiHeaders(() => a.user.getIdToken()) : {};
}

/**
 * The Media panel: real photos under open licences (CC0 and CC BY, searched on Openverse, credit
 * kept with the picture) and your own uploads, dropped into the selected graphic. Free.
 */
export function MediaPanelBody() {
  const project = useEditor((s) => s.project);
  const selected = useEditor((s) => s.selectedSlotId);
  const exec = useEditor((s) => s.exec);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [state, setState] = useState<'idle' | 'searching' | 'failed'>('idle');
  const [adding, setAdding] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  if (!project) return null;
  const slot = project.slots.find((s) => s.id === selected) ?? null;
  const role = slot ? imageRoleOf(slot.componentId) : null;
  const target = slot && role ? { slot, role } : null;
  const hint = !slot
    ? 'Select a graphic on the timeline, then pick a picture.'
    : !role
      ? `${sceneFor(slot.componentId)?.name ?? 'This graphic'} doesn’t take a picture. Try a stat, a line, a list, a quote or a photo.`
      : `Pictures go into “${sceneFor(slot.componentId)?.name ?? 'the graphic'}”.`;
  const deps = {
    getProject: () => editorStore.getState().project,
    exec: (c: Parameters<typeof exec>[0]) => exec(c),
  };

  const search = async () => {
    const words = q.trim();
    if (words.length < 2) return;
    setState('searching');
    try {
      const res = await fetch(`/api/media/search?q=${encodeURIComponent(words)}`, {
        headers: await headers(),
      });
      if (!res.ok) throw new Error(String(res.status));
      const body = z.object({ results: z.array(HitSchema) }).parse(await res.json());
      setHits(body.results);
      setState('idle');
    } catch {
      setState('failed');
    }
  };

  const use = async (hit: Hit) => {
    if (!target) return toast(hint);
    setAdding(hit.id);
    try {
      const res = await fetch(`/api/media/image?id=${hit.id}`, { headers: await headers() });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const r = await addOwnImage(deps, {
        slotId: target.slot.id,
        role: target.role,
        subject: hit.title,
        blob,
        source: 'openverse',
        attribution: hit.attribution,
      });
      toast(r.ok ? 'Picture added' : r.reason);
    } catch {
      toast('Couldn’t fetch that picture. Try another.');
    } finally {
      setAdding(null);
    }
  };

  const upload = async (f: File) => {
    if (!target) return toast(hint);
    const r = await addOwnImage(deps, {
      slotId: target.slot.id,
      role: target.role,
      subject: f.name.replace(/\.[^.]+$/, ''),
      blob: f,
      source: 'upload',
    });
    toast(r.ok ? 'Picture added' : r.reason);
  };

  return (
    <div className="flex h-full flex-col px-5 pt-4 pb-4">
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-white/6 pb-3">
        <h2 className="text-[17px] leading-[22px] font-semibold text-text">Media</h2>
        <Button variant="secondary" size="sm" onClick={() => file.current?.click()}>
          <Upload className="size-3.5" strokeWidth={1.5} aria-hidden />
          Upload
        </Button>
        <input
          ref={file}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void upload(f);
          }}
        />
      </header>
      <form
        className="mt-4 flex items-center gap-2 rounded-chip bg-card-2 px-3 shadow-glass focus-within:shadow-violet-glow"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <Search className="size-4 shrink-0 text-text-3" strokeWidth={1.5} aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value.slice(0, 80))}
          placeholder="Search free photos, e.g. cargo ship"
          aria-label="Search free photos"
          className="h-9 w-full bg-transparent text-[13px] text-text outline-none placeholder:text-text-3"
        />
      </form>
      <p className="mt-2 text-[11px] leading-[14px] text-text-3">{hint}</p>
      <div className="-mx-1 mt-3 min-h-0 flex-1 overflow-y-auto px-1 pb-6">
        {state === 'searching' && <p className="text-[12px] text-text-3">Looking…</p>}
        {state === 'failed' && (
          <p className="text-[12px] text-warn">The photo search didn’t answer. Try again.</p>
        )}
        {hits && hits.length === 0 && state === 'idle' && (
          <p className="text-[12px] text-text-3">Nothing found. Try simpler words.</p>
        )}
        {hits && hits.length > 0 && (
          <ul className="grid grid-cols-2 gap-2">
            {hits.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  disabled={adding !== null}
                  onClick={() => void use(h)}
                  title={h.attribution}
                  className="group relative block aspect-[4/3] w-full overflow-hidden rounded-chip border border-line bg-card-2 disabled:opacity-60"
                >
                  {/* Openverse thumbnails through our route; next/image can't optimise them. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={h.thumb}
                    alt={h.title}
                    loading="lazy"
                    className="size-full object-cover transition-transform group-hover:scale-105"
                  />
                  <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-0.5 text-left text-[9px] text-white/85">
                    {adding === h.id ? 'Adding…' : h.license === 'cc0' ? 'CC0' : 'CC BY'} ·{' '}
                    {h.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-[11px] leading-[14px] text-text-3">
          Photos come from Openverse under CC0 or CC BY. The credit line is kept with each picture.
        </p>
      </div>
    </div>
  );
}
