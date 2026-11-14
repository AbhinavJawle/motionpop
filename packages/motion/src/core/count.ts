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
  if (tMs >= startMs + durMs) return formatCount(to, fmt);
  const scale = 10 ** (fmt.decimals ?? 0);
  const target = Math.round(to * scale);
  if (Math.round(from * scale) === target) return formatCount(to, fmt);
  const raw = tween(tMs, startMs, durMs, from, to, ease) * scale;
  // Round toward `from`; the 1e-9 guard keeps exact steps (float noise) from dropping a unit.
  const stepped = to >= from ? Math.floor(raw + 1e-9) : Math.ceil(raw - 1e-9);
  const v = (to >= from ? Math.min(stepped, target - 1) : Math.max(stepped, target + 1)) / scale;
  return formatCount(v, fmt);
}
