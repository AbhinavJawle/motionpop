import { cn } from '@/lib/cn';

/**
 * One dot per slot (projects.png): filled for a ready slot, a dashed ring for one still
 * waiting. Mint on the Continue card and exported projects, violet elsewhere.
 */
export function SlotDots({
  states,
  tone = 'violet',
  className,
}: {
  states: readonly ('ready' | 'pending')[];
  tone?: 'violet' | 'mint';
  className?: string;
}) {
  const ready = states.filter((s) => s === 'ready').length;
  return (
    <span
      className={cn('inline-flex items-center gap-[9px]', className)}
      role="img"
      aria-label={`${ready} of ${states.length} slots ready`}
    >
      {states.map((s, i) =>
        s === 'ready' ? (
          <span
            key={i}
            className={cn('size-[5px] rounded-full', tone === 'mint' ? 'bg-mint' : 'bg-violet')}
          />
        ) : (
          <span
            key={i}
            className={cn(
              'size-[5px] rounded-full border border-dashed',
              tone === 'mint' ? 'border-mint/70' : 'border-violet/70',
            )}
          />
        ),
      )}
    </span>
  );
}
