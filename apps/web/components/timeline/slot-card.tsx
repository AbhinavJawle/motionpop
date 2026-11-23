'use client';

import type { Slot } from '@motionpop/schemas';
import {
  CalendarRange,
  Clapperboard,
  Columns2,
  Globe,
  Image as ImageIcon,
  ListOrdered,
  type LucideIcon,
  Quote,
  RotateCcw,
  Sparkles,
  Type,
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
 * breathing), generating (violet gradient + shimmer), ready (thumbnail), selected
 * (violet ring), has a note (red dot), failed (red outline + retry).
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
        selected ? 'top-[6px] h-[40px]' : 'top-[7px] h-[38px]',
        // Spec 38 R3.1: the selected graphic lifts on a hard ink shadow.
        selected && 'rounded-[9px] shadow-[3px_3px_0_var(--color-hard)]',
        className,
      )}
      style={{ ...style, width }}
      {...rest}
    >
      <div
        className={cn(
          'relative flex h-full items-center overflow-hidden rounded-[8px]',
          selected
            ? 'border-2 border-edge'
            : slot.status === 'suggested'
              ? 'border-[1.5px] border-dashed border-edge/45'
              : 'border-[1.5px] border-edge',
          slot.status === 'suggested' && !selected && 'bg-slot-suggested',
          slot.status === 'suggested' && selected && 'bg-slot-selected',
          slot.status === 'generating' && 'bg-slot-generating',
          slot.status === 'ready' &&
            (selected
              ? 'bg-slot-selected bg-linear-to-br from-pip/35 to-violet/30'
              : 'bg-slot-ready bg-linear-to-br from-transparent from-30% to-violet/18'),
          slot.status === 'failed' && 'border-error bg-slot-ready',
          'group-focus-visible:ring-2 group-focus-visible:ring-flame group-focus-visible:ring-offset-1',
        )}
      >
        {slot.status === 'suggested' && !still && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[inherit] bg-pip/15"
            animate={{ opacity: [...breathe.animate.opacity] }}
            transition={breathe.transition}
          />
        )}
        {slot.status === 'generating' && <Shimmer />}

        {slot.status === 'suggested' && (
          <span aria-hidden className="ml-3 w-3 shrink-0 text-[13px] leading-[17px] text-ink">
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
              thumb ? 'h-[25px] bg-mist' : 'h-[28px] bg-mist',
            )}
          >
            {thumb ? (
              <span className="font-poster text-[15px] leading-none text-ink">{thumb}</span>
            ) : (
              <TypeGlyph componentId={slot.componentId} />
            )}
          </span>
        )}

        {!compact && (
          <span
            className={cn(
              'relative min-w-0 flex-1 pr-6 font-sans',
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
                  ? 'text-[11px] leading-[14px] text-text'
                  : 'text-[12px] leading-[15px]',
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
                'mt-0.5 block truncate text-[10px] leading-[13px]',
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
        {/* Ready is the default state and carries no dot (spec 32 R3.3); a note still does. */}
        {hasNote && (
          <span
            aria-label="Has an unresolved note"
            className="absolute top-2.5 right-3.5 size-1.5 rounded-full bg-error"
          />
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
  // Custom graphics: tier 2 and film beats (spec 07b).
  custom: Clapperboard,
};

function TypeGlyph({ componentId }: { componentId: string }) {
  const Icon = GLYPHS[componentId];
  if (!Icon) return <MiniBars />;
  return <Icon className="size-[16px] text-text-2" strokeWidth={1.5} />;
}

function MiniBars() {
  return (
    <span className="flex items-end gap-[3px] pt-1">
      <span className="h-2.5 w-1.5 rounded-[1px] bg-text-3" />
      <span className="h-[15px] w-1.5 rounded-[1px] bg-text-3" />
      <span className="h-5 w-1.5 rounded-[1px] bg-text-2" />
    </span>
  );
}
