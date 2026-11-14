'use client';

import type { Word } from '@motionpop/schemas';
import { motion } from 'motion/react';
import { useMemo } from 'react';
import { useStill } from '@/lib/motion/use-still';

/** Above this many words the strip samples them, so the DOM stays small. */
const MAX_PILLS = 400;

/**
 * The Processing screen's mini timeline (spec 05 R5.3): one pill per word, placed by time.
 * Pills pop in as words arrive, and when cleaning re-times them they glide into place as the
 * pauses close up. Fillers show dimmed until they are cut.
 */
export function WordStrip({
  words,
  keys,
  durationMs,
}: {
  words: Word[];
  keys: number[];
  durationMs: number;
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
    <div className="relative h-[72px] overflow-hidden rounded-xl bg-[rgb(21_21_29/0.7)] shadow-glass">
      <span className="absolute top-3 left-4 font-mono text-[9px] leading-3 tracking-[1.1px] text-text-3">
        YOUR VOICE
      </span>
      {durationMs > 0 && (
        <span className="absolute top-3 right-4 font-mono text-[9px] leading-3 text-text-3">
          {(durationMs / 1000).toFixed(1)}s
        </span>
      )}
      <div className="absolute inset-x-4 top-[34px] h-6">
        {words.length === 0 && (
          <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/8" />
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
              className="absolute top-0 h-full rounded-[3px] bg-[linear-gradient(180deg,var(--color-violet),rgb(139_124_255/0.55))]"
              style={{ left: `${left}%`, width: `${width}%` }}
            />
          );
        })}
      </div>
    </div>
  );
}
