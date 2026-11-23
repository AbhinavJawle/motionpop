'use client';

import { motion, useAnimationControls, type Easing, type Transition } from 'motion/react';
import { useEffect, useRef, type CSSProperties } from 'react';
import styles from './signup-cta.module.css';

/**
 * Pip for the sign-up CTA, animated with `motion` from five transparent layers
 * (public/pip-cta, cut from the plush mascot; source and tools in apps/web/rive/pip-cta).
 *
 * Two boxes share one 800 x 760 space whose button edge is y = 640: the body box sits behind the
 * button face, the hands box in front of the border. Each box nests Bounce > Perk > Look > Float,
 * so the press hop, the hover perk, the waiting loop and the idle float never touch the same
 * element. Hover and press never restart the float; hover turns Pip to face you, and leaving
 * starts the waiting loop again (spec 36).
 */

export interface PipCtaMascotProps {
  hover: boolean;
  /** Increments on every press; each change fires the hop. */
  pressCount: number;
  /** Reduced motion: the same pose, without any movement. */
  still?: boolean;
}

// ---------------------------------------------------------------- geometry (artboard units)
const AW = 800;
const AH = 760;
const EDGE = 640;
const PIVOT = { x: 400, y: EDGE };
const HAND_CONTACT = 18;

type Box = { x: number; y: number; w: number; h: number };
const LAYERS = {
  body: { x: 72, y: 101, w: 659, h: 662 },
  eye_l: { x: 296, y: 333, w: 100, h: 163 },
  eye_r: { x: 414, y: 334, w: 98, h: 162 },
  hand_l: { x: 128 - 101.48, y: 637 - 101.48, w: 202.96, h: 202.96 },
  hand_r: { x: 654 - 99.12, y: 637 - 99.12, w: 198.24, h: 198.24 },
} satisfies Record<string, Box>;
type LayerName = keyof typeof LAYERS;

const pct = (v: number, of: number) => `${(v / of) * 100}%`;
const boxStyle = (b: Box): CSSProperties => ({
  left: pct(b.x, AW),
  top: pct(b.y, AH),
  width: pct(b.w, AW),
  height: pct(b.h, AH),
});
const origin = (x: number, y: number) => `${pct(x, AW)} ${pct(y, AH)}`;
/** A vertical move in artboard units, as a share of the full-size wrapper's height. */
const dy = (units: number) => `${(units / AH) * 100}%`;

const eyePivot = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h * 0.6 }); // lids close a touch low
const EYES_MID = {
  x: (eyePivot(LAYERS.eye_l).x + eyePivot(LAYERS.eye_r).x) / 2,
  y: (eyePivot(LAYERS.eye_l).y + eyePivot(LAYERS.eye_r).y) / 2,
};
const handContact = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 + HAND_CONTACT });

// ---------------------------------------------------------------- idle loop (6 s, seamless)
// Sums of whole-loop sinusoids, so the last frame meets the first in value and velocity.
const L = 360; // frames at 60 fps
const W1 = (2 * Math.PI) / L;
const W2 = 2 * W1;
const bodyY = (t: number) => -9 * Math.sin(W2 * t) - 3 * Math.sin(W1 * t + 0.7);
const bodyTilt = (t: number) => 1.2 * Math.sin(W1 * t + 0.3) + 0.35 * Math.sin(W2 * t + 1.4);
const bodySY = (t: number) => 1 + 0.014 * Math.sin(W2 * t - 0.5); // squash just after the low point
const bodySX = (t: number) => 1 - 0.6 * (bodySY(t) - 1);
const handY = (dx: number) => (t: number) =>
  0.3 * bodyY(t - 8) - 0.35 * dx * Math.sin((bodyTilt(t - 8) * Math.PI) / 180);
const handRot = (sign: number, phase: number) => (t: number) =>
  0.6 * bodyTilt(t - 10) + sign * 1.4 * Math.sin(W1 * t + phase);
const handSY = (t: number) => 1 + 0.7 * (bodySY(t - 6) - 1);
const handSX = (t: number) => 1 - 0.5 * (handSY(t) - 1);

const STEPS = 72; // a key every 5 frames; linear between them is indistinguishable from the curve
const FRAMES = Array.from({ length: STEPS + 1 }, (_, i) => (i * L) / STEPS);
const sample = (f: (t: number) => number) => FRAMES.map(f);
const LOOP: Transition = { duration: L / 60, ease: 'linear', repeat: Infinity };

const BODY_IDLE = {
  y: sample(bodyY).map(dy),
  rotate: sample(bodyTilt),
  scaleX: sample(bodySX),
  scaleY: sample(bodySY),
};
const BLINK = {
  scaleY: [1, 1, 0.14, 0.14, 1, 1],
  transition: {
    duration: L / 60,
    repeat: Infinity,
    times: [0, 214 / L, 219 / L, 221 / L, 231 / L, 1],
    ease: [
      [0, 0, 1, 1],
      [0.55, 0, 0.9, 0.45],
      [0, 0, 1, 1],
      [0.22, 1, 0.36, 1],
      [0, 0, 1, 1],
    ],
  } satisfies Transition,
};
const handIdle = (dx: number, sign: number, phase: number) => ({
  y: sample(handY(dx)).map(dy),
  rotate: sample(handRot(sign, phase)),
  scaleX: sample(handSX),
  scaleY: sample(handSY),
});
const HAND_L_IDLE = handIdle(handContact(LAYERS.hand_l).x - PIVOT.x, 1, 2.0);
const HAND_R_IDLE = handIdle(handContact(LAYERS.hand_r).x - PIVOT.x, -1, 0.6);

// ---------------------------------------------------------------- waiting loop (9 s)
// Pip waits for you: looks left, looks right, drums its paws on the edge, then floats a while.
const LL = 540; // frames at 60 fps
const smooth = (a: number, b: number, t: number) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};
/** -1 looking left, 0 facing you, 1 looking right. */
const look = (t: number) =>
  -smooth(60, 86, t) + smooth(168, 194, t) + smooth(238, 264, t) - smooth(350, 376, t);
/** 1 while Pip watches its own paws drum. */
const drumWatch = (t: number) => smooth(380, 394, t) - smooth(452, 468, t);
const tap = (t: number, at: number) => Math.exp(-(((t - at) / 4.5) ** 2));
const LOOK_STEP = 2; // fine enough for the paw taps
const LOOK_FRAMES = Array.from({ length: LL / LOOK_STEP + 1 }, (_, i) => i * LOOK_STEP);
const lookSample = (f: (t: number) => number) => LOOK_FRAMES.map(f);
const LOOK_LOOP: Transition = { duration: LL / 60, ease: 'linear', repeat: Infinity };
/** A horizontal move in artboard units, as a share of the full-size wrapper's width. */
const dx = (units: number) => `${(units / AW) * 100}%`;

const BODY_LOOK = {
  x: lookSample((t) => 16 * look(t)).map(dx),
  y: lookSample((t) => -6 * Math.abs(look(t)) + 4 * drumWatch(t)).map(dy),
  rotate: lookSample((t) => 7 * look(t)),
};
const EYES_LOOK = {
  x: lookSample((t) => 22 * look(t)).map(dx),
  y: lookSample((t) => -5 * Math.abs(look(t)) + 9 * drumWatch(t)).map(dy),
  scaleY: lookSample((t) => 1 - 0.08 * drumWatch(t)),
};
const pawDrum = (taps: number[]) => ({
  y: lookSample((t) => -18 * taps.reduce((sum, at) => sum + tap(t, at), 0)).map(dy),
  rotate: lookSample((t) => -4 * taps.reduce((sum, at) => sum + tap(t, at), 0)),
});
const HAND_L_DRUM = pawDrum([398, 428]);
const HAND_R_DRUM = pawDrum([413, 443]);
const FACING = { x: '0%', y: '0%', rotate: 0, scaleY: 1 };
const FACE_YOU: Transition = { duration: 0.35, ease: [0.22, 1, 0.36, 1] };

// ---------------------------------------------------------------- hover and press
const PERK_IN: Transition = { duration: 0.3, ease: [0.22, 1, 0.36, 1] };
const PERK_OUT: Transition = { duration: 0.42, ease: [0.45, 0, 0.55, 1] };
const LIN: Easing = [0, 0, 1, 1];
const SOFT: Easing = [0.3, 0, 0.5, 1];
const OUT: Easing = [0.22, 1, 0.36, 1];
const IN: Easing = [0.55, 0, 0.9, 0.45];
const IO: Easing = [0.45, 0, 0.55, 1];
const HOP_EASE: Easing[] = [SOFT, OUT, IN, IO, IO, LIN];
// a small dip with the button, a happy hop, a soft landing, settle (48 frames)
const HOP_TIMES = [0, 6, 18, 29, 37, 46, 48].map((f) => f / 48);
const HOP_SY = [1, 0.962, 1.026, 0.982, 1.006, 1, 1];
const BODY_HOP = {
  y: [0, 6, -20, 3, -3, 0, 0].map(dy),
  scaleY: HOP_SY,
  scaleX: HOP_SY.map((s) => 1 - 0.65 * (s - 1)),
  transition: { duration: 0.8, times: HOP_TIMES, ease: HOP_EASE },
};
const HANDS_HOP = {
  y: [0, 4, -6, 1.5, -1, 0, 0].map(dy),
  transition: {
    duration: 0.8,
    times: [0, 6, 19, 30, 38, 46, 48].map((f) => f / 48),
    ease: HOP_EASE,
  },
};

function Layer({ name }: { name: LayerName }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- fixed art layers inside an animated rig; next/image adds nothing here
    <img
      className={styles.layer}
      style={boxStyle(LAYERS[name])}
      src={`/pip-cta/${name}.webp`}
      alt=""
      draggable={false}
    />
  );
}

const PIVOT_ORIGIN = origin(PIVOT.x, PIVOT.y);

export default function PipCtaMascot({ hover, pressCount, still = false }: PipCtaMascotProps) {
  const bodyHop = useAnimationControls();
  const handsHop = useAnimationControls();
  const lastPress = useRef(pressCount);
  useEffect(() => {
    if (pressCount === lastPress.current) return;
    lastPress.current = pressCount;
    if (still) return;
    void bodyHop.start(BODY_HOP);
    void handsHop.start(HANDS_HOP);
  }, [pressCount, still, bodyHop, handsHop]);

  const perk = hover && !still;
  const perkTransition = perk ? PERK_IN : PERK_OUT;
  const idle = !still;
  // waiting: only when nobody is pointing at the button
  const waiting = idle && !hover;
  const lookTransition = waiting ? LOOK_LOOP : FACE_YOU;

  return (
    <>
      <span className={`${styles.art} ${styles.body}`} aria-hidden="true">
        <motion.span
          className={styles.rig}
          style={{ transformOrigin: PIVOT_ORIGIN }}
          animate={bodyHop}
        >
          <motion.span
            className={styles.rig}
            style={{ transformOrigin: PIVOT_ORIGIN }}
            animate={
              perk
                ? { y: dy(-12), scaleX: 0.988, scaleY: 1.024 }
                : { y: '0%', scaleX: 1, scaleY: 1 }
            }
            transition={perkTransition}
          >
            <motion.span
              className={styles.rig}
              style={{ transformOrigin: PIVOT_ORIGIN }}
              animate={waiting ? BODY_LOOK : FACING}
              transition={lookTransition}
            >
              <motion.span
                className={styles.rig}
                style={{ transformOrigin: PIVOT_ORIGIN }}
                animate={idle ? BODY_IDLE : undefined}
                transition={LOOP}
              >
                <Layer name="body" />
                <motion.span
                  className={styles.rig}
                  style={{ transformOrigin: origin(EYES_MID.x, EYES_MID.y) }}
                  animate={
                    perk
                      ? { y: dy(-4), scaleX: 1.07, scaleY: 1.08 }
                      : { y: '0%', scaleX: 1, scaleY: 1 }
                  }
                  transition={perkTransition}
                >
                  <motion.span
                    className={styles.rig}
                    style={{ transformOrigin: origin(EYES_MID.x, EYES_MID.y) }}
                    animate={waiting ? EYES_LOOK : FACING}
                    transition={lookTransition}
                  >
                    {(['eye_l', 'eye_r'] as const).map((eye) => {
                      const p = eyePivot(LAYERS[eye]);
                      return (
                        <motion.span
                          key={eye}
                          className={styles.rig}
                          style={{ transformOrigin: origin(p.x, p.y) }}
                          animate={idle ? { scaleY: BLINK.scaleY } : undefined}
                          transition={BLINK.transition}
                        >
                          <Layer name={eye} />
                        </motion.span>
                      );
                    })}
                  </motion.span>
                </motion.span>
              </motion.span>
            </motion.span>
          </motion.span>
        </motion.span>
      </span>

      <span className={`${styles.art} ${styles.hands}`} aria-hidden="true">
        <motion.span className={styles.rig} animate={handsHop}>
          <motion.span
            className={styles.rig}
            animate={{ y: perk ? dy(-3) : '0%' }}
            transition={perkTransition}
          >
            {(
              [
                ['hand_l', HAND_L_IDLE, HAND_L_DRUM, 4],
                ['hand_r', HAND_R_IDLE, HAND_R_DRUM, -4],
              ] as const
            ).map(([hand, idleKeys, drumKeys, grip]) => {
              const c = handContact(LAYERS[hand]);
              const o = origin(c.x, c.y);
              return (
                // paws grip the edge as the body lifts
                <motion.span
                  key={hand}
                  className={styles.rig}
                  style={{ transformOrigin: o }}
                  animate={
                    perk
                      ? { scaleX: 1.035, scaleY: 0.955, rotate: grip }
                      : { scaleX: 1, scaleY: 1, rotate: 0 }
                  }
                  transition={perkTransition}
                >
                  <motion.span
                    className={styles.rig}
                    style={{ transformOrigin: o }}
                    animate={waiting ? drumKeys : FACING}
                    transition={lookTransition}
                  >
                    <motion.span
                      className={styles.rig}
                      style={{ transformOrigin: o }}
                      animate={idle ? idleKeys : undefined}
                      transition={LOOP}
                    >
                      <Layer name={hand} />
                    </motion.span>
                  </motion.span>
                </motion.span>
              );
            })}
          </motion.span>
        </motion.span>
      </span>
    </>
  );
}
