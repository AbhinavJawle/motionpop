'use client';

import type { OverlayAnchor, Slot, SlotPlacement } from '@motionpop/schemas';
import { Layers, Maximize2 } from 'lucide-react';
import { setSlotPlacement } from '@/lib/commands';
import { cn } from '@/lib/cn';
import { useEditor } from '@/lib/stores/editor';

const ANCHORS: readonly { value: OverlayAnchor; label: string }[] = [
  { value: 'top-right', label: 'Top right' },
  { value: 'top-left', label: 'Top left' },
  { value: 'side-right', label: 'Right' },
  { value: 'side-left', label: 'Left' },
  { value: 'lower-third', label: 'Lower 3rd' },
  { value: 'center', label: 'Center' },
];

/**
 * Video layer placement controls (spec 18 R5.4): only rendered when `project.video` is present
 * (voiceover-only projects stay unchanged). Lets creators flip any graphic between transparent
 * overlay over the speaker and full-screen cutaway, and adjust overlay position.
 */
export function PlacementSection({ slot }: { slot: Slot }) {
  const hasVideo = useEditor((s) => Boolean(s.project?.video));
  const defaultAnchor = useEditor((s) => s.project?.video?.defaultOverlayAnchor ?? 'top-right');
  const exec = useEditor((s) => s.exec);

  if (!hasVideo) return null;

  const placement: SlotPlacement = slot.placement ?? 'overlay';
  const anchor: OverlayAnchor = slot.overlayAnchor ?? defaultAnchor;

  return (
    <section aria-label="Video layer" className="mt-5 border-t border-white/6 pt-4">
      <p className="font-mono text-[10px] leading-[13px] tracking-[1px] text-text-3 uppercase">
        VIDEO LAYER
      </p>
      <div className="mt-2.5 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          aria-pressed={placement === 'overlay'}
          onClick={() => exec(setSlotPlacement(slot.id, 'overlay', anchor))}
          className={cn(
            'flex h-8 items-center justify-center gap-1.5 rounded-lg border text-[12px] font-medium transition-colors',
            placement === 'overlay'
              ? 'border-violet/50 bg-violet-sel text-text'
              : 'border-white/8 bg-card text-text-2 hover:text-text',
          )}
        >
          <Layers className="size-3.5" strokeWidth={1.5} aria-hidden />
          Overlay
        </button>
        <button
          type="button"
          aria-pressed={placement === 'cutaway'}
          onClick={() => exec(setSlotPlacement(slot.id, 'cutaway'))}
          className={cn(
            'flex h-8 items-center justify-center gap-1.5 rounded-lg border text-[12px] font-medium transition-colors',
            placement === 'cutaway'
              ? 'border-violet/50 bg-violet-sel text-text'
              : 'border-white/8 bg-card text-text-2 hover:text-text',
          )}
        >
          <Maximize2 className="size-3.5" strokeWidth={1.5} aria-hidden />
          Full-screen
        </button>
      </div>

      {placement === 'overlay' && (
        <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label="Overlay position">
          {ANCHORS.map((a) => (
            <button
              key={a.value}
              type="button"
              aria-pressed={anchor === a.value}
              onClick={() => exec(setSlotPlacement(slot.id, 'overlay', a.value))}
              className={cn(
                'h-6 rounded-full px-2.5 text-[11px] transition-colors',
                anchor === a.value
                  ? 'bg-violet-sel text-text'
                  : 'border border-white/8 text-text-2 hover:text-text',
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
