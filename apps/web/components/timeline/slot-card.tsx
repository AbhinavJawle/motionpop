'use client';

import type { Slot } from '@motionpop/schemas';
import {
  CalendarRange,
  Columns2,
  Globe,
  Image as ImageIcon,
  ListOrdered,
  Quote,
  RotateCcw,
  Sparkles,
  Type,
  type LucideIcon,
} from 'lucide-react';
import { motion, type HTMLMotionProps } from 'motion/react';
import { forwardRef, type CSSProperties } from 'react';
import { Shimmer } from '@/components/ui/shimmer';
import { cn } from '@/lib/cn';
import { slotCardText, thumbnailValue, type GENERATE_PHASE_TEXT } from '@/lib/editor/slot-display';
import { breathe, springPop } from '@/lib/motion/presets';
import { useStill } from '@/lib/motion/use-still';

export interface SlotCardProps extends Omit<HTMLMotionProps<'div'>, 'children' | 'style'> {
  style?: CSSProperties;
  entry: Slot;
  selected: boolean;
  /** Card width in px (the slot's duration on the timeline). */
  width: number;
  /** The Generate phase while this slot is being generated (the card's subtitle). */
  phase?: keyof typeof GENERATE_PHASE_TEXT;
}

/**
 * One slot on the SLOTS track, in every state from editor-timeline.md: suggested (dashed,
 * breathing), generating (violet gradient + shimmer), ready (thumbnail + mint dot), selected
 * (violet → ember border + bloom), has a note (red dot), failed (red outline + retry).
 */
export const SlotCard = forwardRef<HTMLDivElement, SlotCardProps>(function SlotCard(
  { entry: slot, selected, width, phase, className, style, ...rest },
  ref,
) {
  const still = useStill();
  const { title, subtitle } = slotCardText(slot, phase);
  const hasNote = slot.notes.some((n) => n.status === 'open');
  const thumb = slot.status === 'ready' ? thumbnailValue(slot) : null;
  const compact = width < 120;

  return (
    <motion.div
      ref={ref}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${title}, ${subtitle}`}
      data-slot-id={slot.id}
      data-status={slot.status}
      initial={{ scale: 0.92, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={springPop}
      className={cn(
        'group absolute cursor-grab touch-none rounded-[9px] outline-none select-none data-[dragging=move]:cursor-grabbing',
        selected ? 'top-2 h-[47px] p-px' : 'top-2.5 h-[43px]',
        selected &&
          'bg-[linear-gradient(90deg,var(--color-violet),var(--color-ember-pink)_70%,var(--color-ember))] shadow-[0_0_18px_rgb(139_124_255/0.13)]',
        className,
      )}
      style={{ ...style, width }}
      {...rest}
    >
      <div
        className={cn(
          'relative flex h-full items-center overflow-hidden rounded-[8px] shadow-glass',
          slot.status === 'suggested' &&
            !selected &&
            'border border-dashed border-white/14 bg-slot-suggested',
          slot.status === 'suggested' && selected && 'bg-slot-suggested',
          slot.status === 'generating' && 'bg-slot-generating',
          slot.status === 'ready' && (selected ? 'bg-slot-selected' : 'bg-slot-ready'),
          slot.status === 'failed' && 'border border-error/70 bg-slot-ready',
          'group-focus-visible:ring-2 group-focus-visible:ring-violet',
        )}
      >
        {slot.status === 'suggested' && !still && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_0_12px_rgb(139_124_255/0.18)]"
            animate={{ opacity: [...breathe.animate.opacity] }}
            transition={breathe.transition}
          />
        )}
        {slot.status === 'generating' && <Shimmer />}

        {slot.status === 'suggested' && (
          <span aria-hidden className="ml-3 w-3 shrink-0 text-[13px] leading-[17px] text-violet">
            ✦
          </span>
        )}
        {slot.status === 'generating' && (
          <Sparkles
            className="ml-[13px] size-[17px] shrink-0 text-violet-ink"
            strokeWidth={1.5}
            aria-hidden
          />
        )}
        {(slot.status === 'ready' || slot.status === 'failed') && (
          <span
            aria-hidden
            className={cn(
              'ml-[7px] flex w-[39px] shrink-0 items-center justify-center rounded-[5px]',
              thumb ? 'h-[29px] bg-slot-thumb-callout' : 'h-[33px] bg-slot-thumb',
            )}
          >
            {thumb ? (
              <span className="text-[10px] leading-[13px] font-semibold text-ember">{thumb}</span>
            ) : (
              <TypeGlyph componentId={slot.componentId} />
            )}
          </span>
        )}

        {!compact && (
          <span
            className={cn(
              'relative min-w-0 flex-1 pr-6',
              slot.status === 'suggested'
                ? 'ml-2.5'
                : slot.status === 'generating'
                  ? 'ml-2.5'
                  : 'ml-2.5',
            )}
          >
            <span
              className={cn(
                'block truncate leading-[14px] font-medium',
                slot.status === 'generating'
                  ? 'text-[10px] leading-[13px] text-text'
                  : 'text-[11px]',
                slot.status === 'suggested' && 'text-slot-title',
                slot.status === 'ready' &&
                  (selected ? 'text-slot-title-sel' : 'text-slot-title-ready'),
                slot.status === 'failed' && 'text-text',
              )}
            >
              {title}
            </span>
            <span
              className={cn(
                'mt-[3px] block truncate text-[9px] leading-3',
                slot.status === 'failed' ? 'text-error' : 'text-text-3',
              )}
            >
              {subtitle}
            </span>
          </span>
        )}

        {slot.status === 'failed' && !compact && (
          <span className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1 text-[9px] text-text-3">
            <RotateCcw className="size-3" strokeWidth={1.5} aria-hidden /> Retry
          </span>
        )}
        {hasNote ? (
          <span
            aria-label="Has an unresolved note"
            className="absolute top-2.5 right-3.5 size-1.5 rounded-full bg-error"
          />
        ) : (
          slot.status === 'ready' && (
            <span
              aria-hidden
              className="absolute top-[11px] right-3.5 size-[5px] rounded-full bg-mint"
            />
          )
        )}
      </div>
      {width >= 24 && (
        <>
          <ResizeHandle side="left" />
          <ResizeHandle side="right" />
        </>
      )}
    </motion.div>
  );
});

/** 8 px resize zone on each edge (the drag code picks the mode from the pointer x). */
function ResizeHandle({ side }: { side: 'left' | 'right' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'absolute inset-y-0 z-10 flex w-2 cursor-ew-resize items-center justify-center',
        side === 'left' ? 'left-0' : 'right-0',
      )}
    >
      <span className="h-4 w-0.5 rounded-full bg-white/50 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-data-[dragging]:opacity-100" />
    </span>
  );
}

/** Each graphic type's glyph on its card, so the timeline shows what plays where. */
const GLYPHS: Record<string, LucideIcon> = {
  'hook-statement': Type,
  quote: Quote,
  'map-zoom': Globe,
  versus: Columns2,
  'list-stack': ListOrdered,
  timeline: CalendarRange,
  'photo-evidence': ImageIcon,
};

function TypeGlyph({ componentId }: { componentId: string }) {
  const Icon = GLYPHS[componentId];
  if (!Icon) return <MiniBars />;
  return <Icon className="size-[17px] text-violet-ink" strokeWidth={1.5} />;
}

function MiniBars() {
  return (
    <span className="flex items-end gap-[3px] pt-1">
      <span className="h-2.5 w-1.5 rounded-[1px] bg-violet/70" />
      <span className="h-[15px] w-1.5 rounded-[1px] bg-violet/70" />
      <span className="h-5 w-1.5 rounded-[1px] bg-ember" />
    </span>
  );
}
