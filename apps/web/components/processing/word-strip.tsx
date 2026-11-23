'use client';

import type { Slot, Word } from '@motionpop/schemas';
import { motion } from 'motion/react';
import { useMemo } from 'react';
import { cn } from '@/lib/cn';
import { slotCardText } from '@/lib/editor/slot-display';
import { springPop } from '@/lib/motion/presets';
import { useStill } from '@/lib/motion/use-still';

/** Above this many words the strip samples them, so the DOM stays small. */
const MAX_PILLS = 400;

/**
 * The Processing screen's mini timeline (spec 05 R5.3): one pill per word, placed by time.
 * Pills pop in as words arrive, and when cleaning re-times them they glide into place as the
 * pauses close up. Fillers show dimmed until they are cut. Suggested slots (spec 06 R4.2) pop
 * in above the words they belong to, dashed like suggested cards on the editor timeline.
 */
export function WordStrip({
  words,
  keys,
  durationMs,
  slots = [],
}: {
  words: Word[];
  keys: number[];
  durationMs: number;
  slots?: Slot[];
}) {
  const still = useStill();
  const shown = useMemo(() => {
    const all = words.map((w, k) => ({ w, key: keys[k] ?? -1 - k }));
    if (all.length <= MAX_PILLS) return all;
    const step = all.length / MAX_PILLS;
    return Array.from({ length: MAX_PILLS }, (_, k) => all[Math.floor(k * step)]).filter(
      (x): x is { w: Word; key: number } => x !== undefined,
    );
  }, [words, keys]);

  return (
    <div className="relative h-[112px] overflow-hidden rounded-[16px] border-2 border-ink bg-paper">
      <span className="absolute top-2.5 left-4 text-[11px] font-semibold">Your voice</span>
      {durationMs > 0 && (
        <span className="absolute top-2.5 right-4 text-[11px] tabular">
          {(durationMs / 1000).toFixed(1)}s
        </span>
      )}
      <div className="absolute inset-x-4 top-[32px] h-[26px]" data-testid="strip-slots">
        {durationMs > 0 &&
          slots.map((slot, k) => {
            const left = (slot.startMs / durationMs) * 100;
            const width = ((slot.endMs - slot.startMs) / durationMs) * 100;
            const { title } = slotCardText(slot);
            return (
              <motion.span
                key={slot.id}
                data-status={slot.status}
                title={`${title} · ${slot.reason}`}
                initial={still ? false : { opacity: 0, scale: 0.85, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ ...springPop, delay: still ? 0 : 0.08 + k * 0.09 }}
                className={cn(
                  'absolute top-0 flex h-full items-center gap-1.5 overflow-hidden rounded-[6px] border-2 border-ink px-2',
                  slot.status === 'ready' ? 'bg-pip' : 'border-dashed bg-paper',
                )}
                style={{ left: `${left}%`, width: `${width}%` }}
              >
                <span aria-hidden className={cn('shrink-0 text-[10px] leading-3')}>
                  {slot.status === 'ready' ? '●' : '✦'}
                </span>
                <span className="truncate text-[11px] leading-3 font-medium">{title}</span>
              </motion.span>
            );
          })}
      </div>
      <div className="absolute inset-x-4 top-[66px] h-6">
        {words.length === 0 && (
          <span className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 border-t-2 border-dashed border-ink/40" />
        )}
        {shown.map(({ w, key }, k) => {
          const left = durationMs > 0 ? (w.startMs / durationMs) * 100 : 0;
          const width =
            durationMs > 0 ? Math.max(0.4, ((w.endMs - w.startMs) / durationMs) * 100) : 0;
          return (
            <motion.span
              key={key}
              layout={!still}
              initial={still ? false : { opacity: 0, scaleY: 0.3 }}
              animate={{ opacity: w.filler ? 0.35 : 1, scaleY: 1 }}
              transition={{
                type: 'spring',
                stiffness: 380,
                damping: 30,
                delay: still ? 0 : Math.min(k, 60) * 0.012,
              }}
              title={w.text}
              className="absolute top-0 h-full rounded-[3px] bg-ink"
              style={{ left: `${left}%`, width: `${width}%` }}
            />
          );
        })}
      </div>
    </div>
  );
}
