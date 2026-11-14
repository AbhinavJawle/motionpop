'use client';

import { motion, type Transition } from 'motion/react';
import { useId, useRef } from 'react';
import { cn } from '@/lib/cn';
import { useStill } from '@/lib/motion/use-still';
import {
  ARMS,
  BODY_GRADIENT_VECTOR,
  BODY_PATH,
  BODY_STOPS,
  CLOSED_EYES,
  LYING_BODY_PATH,
  EYES,
  FACE_COLOR,
  MOUTHS,
  VIEWBOX,
} from './geometry';
import { BEHIND, HEAD_WORN, PipPropLayer, Zzz } from './props';
import { STATES, resolveProps, type PipProp, type PipState } from './states';
import { useBlink } from './use-blink';
import { useLook, type Look } from './use-look';

export interface PipProps {
  state?: PipState;
  /** Height (and width) in px. */
  size?: number;
  /** Fixed gaze −1..1. `"cursor"` follows the pointer. */
  look?: Look | 'cursor';
  props?: readonly PipProp[];
  /** Ember bloom under Pip (hero placements). */
  glow?: boolean;
  /** Hide from assistive tech when nearby text already says what Pip says. */
  decorative?: boolean;
  /** Seeds blink timing so it is stable per mount (and in tests). */
  seed?: number;
  className?: string;
}

const HAPPY_EYES = {
  left: 'M40.2 48.6Q43.75 42.6 47.3 48.6',
  right: 'M60.5 47Q64.05 41 67.6 47',
} as const;

const faceSpring: Transition = { type: 'spring', stiffness: 300, damping: 24 };
const instant: Transition = { duration: 0 };

/** Arm rotations (deg) per arms mode; null = hidden. Positive rotates clockwise around the shoulder. */
const ARM_POSE = {
  none: { left: null, right: null },
  pockets: { left: null, right: null },
  wave: { left: 10, right: -70 },
  up: { left: 80, right: -80 },
  open: { left: 30, right: -30 },
  hug: { left: -25, right: 25 },
} as const;

/**
 * Pip, the Motionpop ghost (pip-mascot.md). SVG + `motion`, UI only.
 * Under reduced motion every state renders its static pose: no float, blink, loops or confetti.
 */
export function Pip({
  state = 'idle',
  size = 96,
  look,
  props: extraProps,
  glow = false,
  decorative = false,
  seed = 1,
  className,
}: PipProps) {
  const still = useStill();
  const def = STATES[state];
  const rootRef = useRef<HTMLDivElement>(null);
  const cursor = useLook(rootRef, look === 'cursor' && !still);
  const fixed = look && look !== 'cursor' ? look : { x: 0, y: 0 };
  const gazeLook = look === 'cursor' ? cursor : fixed;
  const blinking = useBlink(def.blinks && !still, seed);
  const gradId = `pip-body-${useId().replace(/:/g, '')}`;
  const shown = resolveProps(state, extraProps);
  const arms = ARM_POSE[def.arms];

  const bodyAnimate = {
    rotate: def.pose.rotate,
    scale: def.pose.scale,
    y: def.pose.y,
    scaleX: 1,
    scaleY: 1,
    ...(!still && def.motion ? def.motion.animate : {}),
  };
  const bodyTransition: Transition =
    still || !def.motion
      ? { ...faceSpring, ...(still ? instant : {}) }
      : def.motion.repeat
        ? { duration: def.motion.duration, ease: 'easeInOut', repeat: Infinity }
        : { duration: def.motion.duration, ease: 'easeOut' };

  const eyeOffset = {
    x: def.gaze.x + gazeLook.x * 2.6,
    y: def.gaze.y + gazeLook.y * 2,
    ...(def.faceShift
      ? {
          x: def.gaze.x + gazeLook.x * 2.6 + def.faceShift.x,
          y: def.gaze.y + gazeLook.y * 2 + def.faceShift.y,
        }
      : {}),
  };
  const eyeOpen = (side: 'left' | 'right') =>
    !blinking &&
    (def.eyes === 'open' || def.eyes === 'wide' || (def.eyes === 'wink' && side === 'left'));
  const eyeClosed = (side: 'left' | 'right') =>
    def.eyes === 'closed' || (def.eyes === 'wink' && side === 'right');

  return (
    <div
      ref={rootRef}
      data-pip-state={state}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : def.label}
      aria-hidden={decorative || undefined}
      className={cn('pointer-events-none relative inline-block shrink-0', className)}
      style={{ width: size, height: size }}
    >
      {glow && (
        <div
          aria-hidden
          className="bg-ember-bloom absolute"
          style={{ left: '-35%', right: '-35%', top: '55%', bottom: '-30%' }}
        />
      )}
      <svg
        viewBox={VIEWBOX}
        width={size}
        height={size}
        overflow="visible"
        className="relative block"
        aria-hidden
      >
        <defs>
          <linearGradient id={gradId} {...BODY_GRADIENT_VECTOR}>
            {BODY_STOPS.map((s) => (
              <stop key={s.offset} offset={s.offset} stopColor={s.color} />
            ))}
          </linearGradient>
        </defs>

        {shown
          .filter((p) => BEHIND.includes(p))
          .map((p) => (
            <PipPropLayer key={p} prop={p} still={still} />
          ))}

        <motion.g
          data-part="body"
          style={{ originX: 0.5, originY: 0.6 }}
          initial={false}
          animate={bodyAnimate}
          transition={bodyTransition}
        >
          {(['left', 'right'] as const).map((side) => {
            const rot = arms[side];
            return (
              <motion.path
                key={side}
                data-part={`arm-${side}`}
                d={ARMS[side].d}
                fill={`url(#${gradId})`}
                style={{ originX: ARMS[side].origin[0], originY: ARMS[side].origin[1] }}
                initial={false}
                animate={
                  rot === null
                    ? { opacity: 0, rotate: 0, scale: 0.4 }
                    : def.arms === 'wave' && side === 'right' && !still
                      ? { opacity: 1, scale: 1, rotate: [rot, rot - 30, rot] }
                      : { opacity: 1, scale: 1, rotate: rot }
                }
                transition={
                  still
                    ? instant
                    : def.arms === 'wave' && side === 'right'
                      ? { duration: 0.55, repeat: Infinity, ease: 'easeInOut' }
                      : faceSpring
                }
              />
            );
          })}

          <motion.path
            data-part="silhouette"
            fill={`url(#${gradId})`}
            initial={false}
            animate={{ d: def.body === 'lie' ? LYING_BODY_PATH : BODY_PATH }}
            transition={still ? instant : faceSpring}
          />

          {def.arms === 'pockets' && (
            <g data-part="pockets" style={{ stroke: FACE_COLOR }} strokeWidth={1.2} fill="#F5F2FA">
              <path d="M27 74Q22 80 26.5 83.5Q31 82 31.5 76Z" />
              <path d="M75 72Q80.5 77.5 76.5 81.5Q72 80.5 71.6 74.4Z" />
            </g>
          )}

          <motion.g
            data-part="face"
            initial={false}
            animate={eyeOffset}
            transition={still ? instant : faceSpring}
            style={{ fill: FACE_COLOR, stroke: FACE_COLOR }}
          >
            {(['left', 'right'] as const).map((side) => {
              const e = EYES[side];
              const wide = def.eyes === 'wide';
              const happy = def.eyes === 'happy';
              return (
                <g key={side} data-part={`eye-${side}`}>
                  <motion.ellipse
                    cx={e.cx}
                    cy={e.cy}
                    rx={wide ? e.rx * 1.12 : e.rx}
                    ry={e.ry}
                    stroke="none"
                    initial={false}
                    animate={{
                      scaleY: eyeOpen(side) ? (wide ? 1.15 : 1) : 0.08,
                      opacity: eyeOpen(side) || (blinking && !happy && !eyeClosed(side)) ? 1 : 0,
                    }}
                    transition={blinking ? { duration: 0.06 } : still ? instant : faceSpring}
                  />
                  <motion.path
                    d={happy ? HAPPY_EYES[side] : CLOSED_EYES[side]}
                    fill="none"
                    strokeWidth={2.6}
                    strokeLinecap="round"
                    initial={false}
                    animate={{ opacity: happy || eyeClosed(side) ? 1 : 0 }}
                    transition={still ? instant : { duration: 0.15 }}
                  />
                </g>
              );
            })}
            <motion.path
              data-part="mouth"
              fill="none"
              strokeWidth={2.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={false}
              animate={{ d: MOUTHS[def.mouth] }}
              transition={still ? instant : faceSpring}
            />
          </motion.g>
        </motion.g>

        {state === 'done' && !still && (
          <motion.circle
            key="flash"
            cx={50}
            cy={52}
            r={42}
            fill="none"
            strokeWidth={2}
            style={{ stroke: 'var(--color-mint)' }}
            initial={{ scale: 0.8, opacity: 0.7 }}
            animate={{ scale: 1.3, opacity: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          />
        )}

        {shown
          .filter((p) => !BEHIND.includes(p) && !HEAD_WORN.includes(p))
          .map((p) => (
            <PipPropLayer key={p} prop={p} still={still} />
          ))}
        {shown.some((p) => HEAD_WORN.includes(p)) && (
          <motion.g
            data-part="head-props"
            style={{ originX: 0.5, originY: 1 }}
            initial={false}
            animate={def.headOffset ?? { x: 0, y: 0, scale: 1 }}
            transition={still ? instant : faceSpring}
          >
            {shown
              .filter((p) => HEAD_WORN.includes(p))
              .map((p) => (
                <PipPropLayer key={p} prop={p} still={still} />
              ))}
          </motion.g>
        )}
        {state === 'sleeping' && <Zzz still={still} />}
      </svg>
    </div>
  );
}
