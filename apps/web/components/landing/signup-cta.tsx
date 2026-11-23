'use client';

import Link from 'next/link';
import {
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { useStill } from '@/lib/motion/use-still';
import PipCtaMascot from './pip-cta-mascot';
import styles from './signup-cta.module.css';

export interface SignupCTAProps {
  href: string;
  /** Visible text. Defaults to the design's "Sign up & create". */
  children?: ReactNode;
  className?: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}

/** The arrow is drawn, not an icon font, so its stroke scales with the button. */
function Arrow() {
  return (
    <svg className={styles.arrow} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5.5 18.5 18 6M8 6h10v10"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The sign-up call to action: a real link with Pip peeking over its top edge. Pip's body sits
 * behind the button and its paws rest over the border (two layered rigs around the button face).
 * Hovering perks Pip up; pressing makes it hop; neither restarts the idle float.
 */
export function SignupCTA({
  href,
  children = 'Sign up & create',
  className,
  onClick,
}: SignupCTAProps) {
  const still = useStill();
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [pressCount, setPressCount] = useState(0);

  const press = () => setPressCount((n) => n + 1);
  const onPointerEnter = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') setHover(true);
  };
  const onPointerLeave = () => {
    setHover(false);
    setPressed(false);
  };
  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    setPressed(true);
    press();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.repeat) {
      setPressed(true);
      press();
    }
  };

  return (
    <div className={className ? `${styles.stage} ${className}` : styles.stage}>
      <Link
        href={href}
        className={styles.button}
        data-hover={hover}
        data-pressed={pressed}
        onClick={onClick}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onPointerDown={onPointerDown}
        onPointerUp={() => setPressed(false)}
        onPointerCancel={() => setPressed(false)}
        onFocus={(e) => setHover(e.currentTarget.matches(':focus-visible'))}
        onBlur={() => setHover(false)}
        onKeyDown={onKeyDown}
        onKeyUp={() => setPressed(false)}
      >
        <span className={styles.glow} aria-hidden="true" />
        <PipCtaMascot hover={hover} pressCount={pressCount} still={still} />
        <span className={styles.surface} aria-hidden="true" />
        <span className={styles.label}>{children}</span>
        <Arrow />
      </Link>
    </div>
  );
}
