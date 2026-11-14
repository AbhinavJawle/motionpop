import type { Format } from '../../contract';
import type { Box } from '../../core/safe-area';

export interface TextSlot {
  box: Box;
  /** Largest and smallest font size in px; fitText picks the size in between. */
  max: number;
  min: number;
  lineHeight: number;
  maxLines: number;
  align: 'left' | 'center';
}

export interface BigNumberLayout {
  context: TextSlot | null;
  number: TextSlot;
  label: TextSlot;
}

interface Spec {
  align: 'left' | 'center';
  /** Column width as a share of the safe area. */
  column: number;
  /** Sizes as a share of frame height. */
  context: number;
  numberMax: number;
  numberMin: number;
  label: number;
  labelLines: number;
  /** Where the block's free space goes: 0.45 sits slightly above centre (optical centre). */
  bias: number;
}

const SPECS: Record<Format, Spec> = {
  '16:9': {
    align: 'left',
    column: 0.78,
    context: 0.03,
    numberMax: 0.26,
    numberMin: 0.11,
    label: 0.05,
    labelLines: 2,
    bias: 0.45,
  },
  '9:16': {
    align: 'center',
    column: 1,
    context: 0.018,
    numberMax: 0.15,
    numberMin: 0.035,
    label: 0.032,
    labelLines: 3,
    bias: 0.42,
  },
  '1:1': {
    align: 'center',
    column: 0.92,
    context: 0.028,
    numberMax: 0.22,
    numberMin: 0.06,
    label: 0.05,
    labelLines: 2,
    bias: 0.45,
  },
};

// Geist's content area is taller than 1em; at line-height 1 the box would always overflow.
const NUMBER_LH = 1.2;
const LABEL_LH = 1.2;
const CONTEXT_LH = 1.2;

/**
 * Pure per-format layout in frame pixels. Every box is sized for its maximum font size and
 * line count, so fitting can only shrink text inside its own box and boxes never overlap.
 * `safe` is the text-safe area already inset for the camera push-in.
 */
export function layoutBigNumber(
  format: Format,
  height: number,
  safe: Box,
  hasContext: boolean,
): BigNumberLayout {
  const s = SPECS[format];
  // Snap the safe box inward to whole pixels so rounding never pushes a box outside it.
  const sx = Math.ceil(safe.x);
  const sy = Math.ceil(safe.y);
  safe = {
    x: sx,
    y: sy,
    width: Math.floor(safe.x + safe.width) - sx,
    height: Math.floor(safe.y + safe.height) - sy,
  };
  const width = Math.floor(safe.width * s.column);
  const x = s.align === 'left' ? safe.x : safe.x + Math.floor((safe.width - width) / 2);

  const ctxSize = Math.round(height * s.context);
  const numMax = Math.round(height * s.numberMax);
  const numMin = Math.round(height * s.numberMin);
  const labelSize = Math.round(height * s.label);

  const ctxH = hasContext ? Math.ceil(ctxSize * CONTEXT_LH) : 0;
  const gap1 = hasContext ? Math.round(ctxSize * 1.2) : 0;
  const numH = Math.ceil(numMax * NUMBER_LH);
  const gap2 = Math.round(labelSize * 0.6);
  const labelH = Math.ceil(labelSize * LABEL_LH * s.labelLines);
  const total = ctxH + gap1 + numH + gap2 + labelH;
  let y = safe.y + Math.floor(Math.max(0, safe.height - total) * s.bias);

  const slot = (
    h: number,
    max: number,
    min: number,
    lineHeight: number,
    maxLines: number,
  ): TextSlot => {
    const out: TextSlot = {
      box: { x, y, width, height: h },
      max,
      min,
      lineHeight,
      maxLines,
      align: s.align,
    };
    return out;
  };

  const context = hasContext
    ? slot(ctxH, ctxSize, Math.round(ctxSize * 0.75), CONTEXT_LH, 1)
    : null;
  y += ctxH + gap1;
  const number = slot(numH, numMax, numMin, NUMBER_LH, 1);
  y += numH + gap2;
  const label = slot(labelH, labelSize, Math.round(labelSize * 0.7), LABEL_LH, s.labelLines);
  return { context, number, label };
}
