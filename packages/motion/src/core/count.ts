import { outExpo, type Ease } from './ease';
import { tween } from './interp';

export interface CountFormat {
  prefix?: string;
  suffix?: string;
  decimals?: number;
  /** BCP 47 locale for thousands separators. Defaults to "en-US". */
  locale?: string;
}

/** Formats a number exactly as the final frame shows it. */
export function formatCount(value: number, fmt: CountFormat = {}): string {
  const decimals = fmt.decimals ?? 0;
  // Negative zero, or a negative that rounds to zero at these decimals, must not render as "-0".
  const scale = 10 ** decimals;
  // Half away from zero, like toLocaleString.
  const shown = Math.round(Math.abs(value) * scale) === 0 ? 0 : value;
  const body = shown.toLocaleString(fmt.locale ?? 'en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${fmt.prefix ?? ''}${body}${fmt.suffix ?? ''}`;
}

/**
 * Count-up text at time `tMs`. Lands exactly on `to` at `startMs + durMs` and holds it,
 * so the final rendered string always equals `formatCount(to, fmt)`. Intermediate values round
 * toward `from`, so the final value first appears exactly at the landing time (the spoken word),
 * never earlier because an ease-out got within rounding distance.
 */
export function countAt(
  tMs: number,
  startMs: number,
  durMs: number,
  from: number,
  to: number,
  fmt: CountFormat = {},
  ease: Ease = outExpo,
): string {
  const final = formatCount(to, fmt);
  if (tMs >= startMs + durMs) return final;
  // Nothing to count when the start already reads as the final value.
  if (formatCount(from, fmt) === final) return final;
  const scale = 10 ** (fmt.decimals ?? 0);
  // The display rounds half away from zero (toLocaleString); `Math.round` rounds half up, so
  // -0.05 at 1 decimal became 0, equal to `from`, and the counter showed "-0.1" from the start.
  // Found by a flaky big-number property (2026-11-15); the target now rounds like the display.
  const target = Math.sign(to) * Math.round(Math.abs(to) * scale);
  const raw = tween(tMs, startMs, durMs, from, to, ease) * scale;
  // Round toward `from`; the 1e-9 guard keeps exact steps (float noise) from dropping a unit.
  const up = to >= from;
  const stepped = up ? Math.floor(raw + 1e-9) : Math.ceil(raw - 1e-9);
  let v = (up ? Math.min(stepped, target - 1) : Math.max(stepped, target + 1)) / scale;
  // Belt and braces: binary floats and the display's decimal rounding can still disagree by a
  // unit; never show the final string before the landing.
  for (let k = 0; k < 2 && formatCount(v, fmt) === final; k++) v += (up ? -1 : 1) / scale;
  return formatCount(v, fmt);
}
