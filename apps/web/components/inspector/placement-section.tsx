'use client';

import type { OverlayAnchor, Slot, SlotPlacement, VideoStageMode } from '@motionpop/schemas';
import {
  Columns2,
  EyeOff,
  Layers,
  Maximize2,
  PictureInPicture2,
  Sparkles,
} from 'lucide-react';
import { setSlotPlacement, setSlotVideoStage } from '@/lib/commands';
import { cn } from '@/lib/cn';
import { useEditor } from '@/lib/stores/editor';

const STAGES: readonly {
  value: VideoStageMode;
  label: string;
  hint: string;
  icon: typeof Layers;
}[] = [
  { value: 'full', label: 'Full', hint: 'Speaker full-frame + frameless HUD', icon: Layers },
  { value: 'split-left', label: 'Split L', hint: 'Speaker left, graphic right', icon: Columns2 },
  { value: 'split-right', label: 'Split R', hint: 'Speaker right, graphic left', icon: Columns2 },
  { value: 'pip', label: 'PiP', hint: 'Speaker bubble + full canvas graphic', icon: PictureInPicture2 },
  { value: 'backdrop', label: 'Dim BG', hint: 'Blurred dimmed speaker behind graphic', icon: Sparkles },
  { value: 'cutaway', label: 'Cutaway', hint: 'Full-screen motion graphic beat', icon: Maximize2 },
];

const ANCHORS: readonly { value: OverlayAnchor; label: string }[] = [
  { value: 'top-right', label: 'Top right' },
  { value: 'top-left', label: 'Top left' },
  { value: 'side-right', label: 'Right' },
  { value: 'side-left', label: 'Left' },
  { value: 'lower-third', label: 'Lower 3rd' },
  { value: 'center', label: 'Center' },
];

/**
 * Video choreography stage controls (spec 18 R5.4, upgraded in spec 19 R4.3): only rendered when
 * `project.video` is present (voiceover-only projects stay unchanged). Lets creators switch any
 * beat between the 6 coupled video-stage layouts (`full`, `split-left`, `split-right`, `pip`,
 * `backdrop`, `cutaway`) and — for legacy non-custom overlay slots — adjust the overlay anchor.
 */
export function PlacementSection({ slot }: { slot: Slot }) {
  const hasVideo = useEditor((s) => Boolean(s.project?.video));
  const defaultAnchor = useEditor((s) => s.project?.video?.defaultOverlayAnchor ?? 'top-right');
  const exec = useEditor((s) => s.exec);

  if (!hasVideo) return null;

  const stage: VideoStageMode =
    slot.videoStage ?? (slot.placement === 'cutaway' ? 'cutaway' : 'full');
  const isLegacyTemplate = slot.componentId !== 'custom';
  const placement: SlotPlacement = slot.placement ?? 'overlay';
  const anchor: OverlayAnchor = slot.overlayAnchor ?? defaultAnchor;

  return (
    <section
      aria-label="Video layer"
      data-testid="placement-section"
      className="mt-5 border-t border-white/6 pt-4"
    >
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] leading-[13px] tracking-[1px] text-text-3 uppercase">
          VIDEO STAGE
        </p>
        {slot.archetype && (
          <span className="rounded-full bg-white/6 px-2 py-0.5 font-mono text-[9.5px] text-text-2">
            {slot.archetype}
          </span>
        )}
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-1.5" role="group" aria-label="Video choreography stage">
        {STAGES.map(({ value, label, hint, icon: Icon }) => {
          const active = stage === value;
          return (
            <button
              key={value}
              type="button"
              title={hint}
              data-testid={`stage-${value}`}
              aria-pressed={active}
              onClick={() => exec(setSlotVideoStage(slot.id, value))}
              className={cn(
                'flex h-8 items-center justify-center gap-1 rounded-lg border text-[11.5px] font-medium transition-colors',
                active
                  ? 'border-violet/50 bg-violet-sel text-text'
                  : 'border-white/8 bg-card text-text-2 hover:text-text',
              )}
            >
              {value === 'cutaway' ? (
                <EyeOff className="size-3" strokeWidth={1.5} aria-hidden />
              ) : (
                <Icon className="size-3" strokeWidth={1.5} aria-hidden />
              )}
              {label}
            </button>
          );
        })}
      </div>

      {isLegacyTemplate && placement === 'overlay' && stage !== 'cutaway' && (
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
