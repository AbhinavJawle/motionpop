'use client';

import { Clapperboard, X } from 'lucide-react';
import { motion } from 'motion/react';
import { CostChip } from '@/components/ui/chip';
import { Tooltip } from '@/components/ui/tooltip';
import { useFilm } from '@/lib/film/use-film';
import { buttonMotion } from '@/lib/motion/presets';
import { cancelFilm, filmStatusText } from '@/lib/stores/film-activity';

/**
 * "Make it a film" (spec 07b R5.1, R5.2; not in the designs): the whole video written by the
 * cloud, with the cost on the button before the click. While a film is being made the button
 * becomes its progress line with a stop control; the current graphics keep playing until the
 * film replaces them in one undo step.
 */
export function FilmButton() {
  const { cost, film, disabledReason, run, route, hasFilm } = useFilm();
  if (film) {
    const share = film.total > 0 ? film.done / film.total : 0;
    return (
      <span
        role="status"
        className="relative inline-flex h-7 items-center gap-2 overflow-hidden rounded-chip border border-violet/40 bg-violet/12 pr-1 pl-2.5 text-[12px] leading-4 font-medium text-violet-ink"
      >
        <motion.span
          aria-hidden
          className="absolute inset-y-0 left-0 bg-violet/25"
          initial={false}
          animate={{ width: `${Math.round(Math.max(0.06, share) * 100)}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
        <Clapperboard className="relative size-3.5" strokeWidth={1.75} aria-hidden />
        <span className="relative">{filmStatusText(film)}</span>
        <Tooltip content="Stop. Nothing changes and the credits come back">
          <button
            type="button"
            aria-label="Stop making the film"
            onClick={cancelFilm}
            className="relative flex size-5 items-center justify-center rounded-full text-violet-ink hover:bg-white/10"
          >
            <X className="size-3" strokeWidth={2} aria-hidden />
          </button>
        </Tooltip>
      </span>
    );
  }
  return (
    <Tooltip
      content={
        disabledReason ??
        'Pip storyboards the whole voiceover and draws every beat: one world, a picture for each idea'
      }
    >
      <span>
        <motion.button
          type="button"
          {...buttonMotion}
          disabled={disabledReason !== null}
          onClick={run}
          className="inline-flex h-7 items-center gap-1.5 rounded-chip bg-violet px-2.5 text-[12px] leading-4 font-medium text-white shadow-violet-glow transition-opacity disabled:opacity-45"
        >
          <Clapperboard className="size-3.5" strokeWidth={1.75} aria-hidden />
          {hasFilm ? 'Remake the film' : 'Make it a film'}
          {route.kind === 'cloud' && <CostChip route="cloud" credits={cost} />}
        </motion.button>
      </span>
    </Tooltip>
  );
}
