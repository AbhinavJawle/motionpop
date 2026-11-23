import { LOOK_STILLS } from '@/lib/editor/look-stills';
import { cn } from '@/lib/cn';
import { posterKindFor, StylePoster } from './style-poster';

/**
 * A project's picture (spec 35): a real still of its look when there is one, else the drawn
 * poster with the title in it.
 */
export function ProjectPoster({
  styleId,
  title,
  className,
}: {
  styleId: string;
  title: string;
  className?: string;
}) {
  const still = LOOK_STILLS[styleId];
  if (still) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- small static stills
      <img
        src={still}
        alt=""
        loading="lazy"
        draggable={false}
        className={cn('block object-cover', className)}
      />
    );
  }
  return (
    <StylePoster kind={posterKindFor(styleId)} headline={title} loop={null} className={className} />
  );
}

/** One storyboard tick per slot: a filled box when its graphic is ready, dashed while waiting. */
export function SlotTicks({
  states,
  size = 'sm',
  className,
}: {
  states: readonly ('ready' | 'pending')[];
  size?: 'sm' | 'lg';
  className?: string;
}) {
  const ready = states.filter((s) => s === 'ready').length;
  const box =
    size === 'lg' ? 'h-[18px] w-[26px] rounded-[4px]' : 'h-[10px] w-[14px] rounded-[2.5px]';
  return (
    <span
      role="img"
      aria-label={`${ready} of ${states.length} graphics ready`}
      className={cn(
        'inline-flex flex-wrap items-center',
        size === 'lg' ? 'gap-1.5' : 'gap-1',
        className,
      )}
    >
      {states.map((s, i) => (
        <span
          key={i}
          className={cn(
            box,
            'border-2 border-ink',
            s === 'ready' ? 'bg-ink' : 'border-dashed bg-transparent',
          )}
        />
      ))}
    </span>
  );
}
