'use client';

import type { Slot } from '@motionpop/schemas';
import { ImagePlus, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { CostChip } from '@/components/ui/chip';
import { setSlotImage } from '@/lib/commands';
import { useCreditsClient } from '@/lib/credits/use-credits-client';
import { imageDataUrl } from '@/lib/images/image-store';
import {
  addOwnImage,
  generateSlotImage,
  imageCost,
  imageRoleOf,
  suggestSubject,
  useImageJobs,
} from '@/lib/images/generate';
import { useAppConfig } from '@/lib/renders/hooks';
import { editorStore, useEditor } from '@/lib/stores/editor';
import { Divider, SectionLabel } from './parts';

/** The asset a slot's score points at, if it is in the project. */
function slotAsset(slot: Slot, assets: ReturnType<typeof editorStore.getState>['project']) {
  const id = (slot.params as { images?: { assetId?: string }[] }).images?.[0]?.assetId;
  return id ? (assets?.assets?.find((a) => a.id === id) ?? null) : null;
}

/**
 * PICTURE (spec 07 R4): for scenes that take one. Describe it and generate it in the look's
 * style (cloud, priced on the button), upload your own, or take it out. While it paints the
 * scene plays its image-free form.
 */
export function PictureSection({ slot }: { slot: Slot }) {
  const role = imageRoleOf(slot.componentId);
  const project = useEditor((s) => s.project);
  const exec = useEditor((s) => s.exec);
  const config = useAppConfig();
  const { client: credits } = useCreditsClient();
  const busy = useImageJobs((s) => s.busy[slot.id]);
  const asset = slotAsset(slot, project);
  const [subject, setSubject] = useState(() => asset?.subject ?? suggestSubject(slot));
  const [thumb, setThumb] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const src = asset?.src;

  useEffect(() => {
    let live = true;
    if (!src) return;
    void imageDataUrl(src).then((u) => live && setThumb(u));
    return () => {
      live = false;
    };
  }, [src]);

  if (!role || !project) return null;
  const cost = imageCost(config);
  const deps = {
    credits,
    config,
    getProject: () => editorStore.getState().project,
    exec: (c: Parameters<typeof exec>[0]) => exec(c),
  };

  const generate = async () => {
    const r = await generateSlotImage(deps, { slotId: slot.id, role, subject });
    if (r.ok) toast(r.reused ? 'Same picture as before, no charge' : 'Picture ready');
    else if (!r.noCredits) toast(r.reason);
  };

  const upload = async (f: File) => {
    const r = await addOwnImage(deps, {
      slotId: slot.id,
      role,
      subject: subject || f.name.replace(/\.[^.]+$/, ''),
      blob: f,
      source: 'upload',
    });
    if (!r.ok) toast(r.reason);
  };

  return (
    <section className="py-4" aria-labelledby={`pic-${slot.id}`}>
      <SectionLabel id={`pic-${slot.id}`}>Picture</SectionLabel>
      <div className="mt-3 flex gap-3">
        <div className="relative flex size-[72px] shrink-0 items-center justify-center overflow-hidden rounded-chip border border-line bg-card-2">
          {busy ? (
            <span className="animate-pulse text-[10px] text-text-3">Painting…</span>
          ) : asset && thumb ? (
            // A data URL of the stored picture; next/image can't optimise it.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt={asset.subject} className="size-full object-contain" />
          ) : (
            <ImagePlus className="size-5 text-text-3" strokeWidth={1.5} aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <textarea
            value={subject}
            onChange={(e) => setSubject(e.target.value.slice(0, 120))}
            rows={2}
            aria-label="What the picture shows"
            placeholder="e.g. an old cargo ship at sea"
            className="h-[52px] w-full resize-none rounded-chip bg-card-2 px-2.5 py-2 text-[12px] leading-[16px] text-text shadow-glass outline-none placeholder:text-text-3 focus:shadow-violet-glow"
          />
          {asset?.attribution && (
            <p className="mt-1 truncate text-[10px] text-text-3" title={asset.attribution}>
              {asset.attribution}
            </p>
          )}
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={!!busy || subject.trim().length < 3}
          onClick={() => void generate()}
        >
          {asset ? 'Repaint' : 'Make picture'}
          <CostChip route="cloud" credits={cost} />
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!!busy}
          onClick={() => file.current?.click()}
        >
          <Upload className="size-3.5" strokeWidth={1.5} aria-hidden />
          Upload
        </Button>
        {asset && (
          <Button
            variant="ghost"
            size="sm"
            aria-label="Remove picture"
            onClick={() => exec(setSlotImage(slot.id, null))}
          >
            <Trash2 className="size-3.5" strokeWidth={1.5} aria-hidden />
          </Button>
        )}
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
      </div>
      <Divider className="mt-4 -mb-4" soft />
    </section>
  );
}
