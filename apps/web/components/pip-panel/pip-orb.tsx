'use client';

import type { PipState } from '@/components/pip/states';
import { Pip } from '@/components/pip/pip';
import { cn } from '@/lib/cn';
import s from './pip-orb.module.css';

/** What Pip is doing in the conversation (spec 38 R2.3). */
export type OrbMood = 'idle' | 'listening' | 'thinking' | 'done';

/** The Pip pose for each mood. */
export const ORB_PIP_STATE: Record<OrbMood, PipState> = {
  idle: 'idle',
  listening: 'listening',
  thinking: 'thinking',
  done: 'done',
};

/**
 * Pip glowing in its own light (spec 38 R2.2): the panel's centre while the conversation is empty,
 * and a small badge in its header after. The light turns faster and brighter as Pip listens and
 * thinks; a finished plan sends one ring out. Reduced motion keeps the still pose and light.
 */
export function PipOrb({
  mood = 'idle',
  size = 148,
  className,
}: {
  mood?: OrbMood;
  size?: number;
  className?: string;
}) {
  const small = size < 64;
  return (
    <div
      data-mood={mood}
      data-testid="pip-orb"
      aria-hidden
      className={cn(s.orb, small && s.small, className)}
      style={{ ['--s' as string]: `${size}px` }}
    >
      <span className={s.halo} />
      <div className={s.wheel}>
        <span className={cn(s.light, s.blue)} />
      </div>
      <div className={s.wheel}>
        <span className={cn(s.light, s.violet)} />
      </div>
      <div className={s.wheel}>
        <span className={cn(s.light, s.ember)} />
      </div>
      <span className={s.sweep} />
      <span className={s.core} />
      <span className={s.ring} />
      <span className={s.pip}>
        <Pip
          size={Math.round(size * (small ? 0.7 : 0.5))}
          state={ORB_PIP_STATE[mood]}
          decorative
          {...(small ? { look: { x: 0, y: 0 } } : {})}
        />
      </span>
    </div>
  );
}
