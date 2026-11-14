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
  const body = value.toLocaleString(fmt.locale ?? 'en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${fmt.prefix ?? ''}${body}${fmt.suffix ?? ''}`;
}

/**
 * Count-up text at time `tMs`. Lands exactly on `to` at `startMs + durMs` and holds it,
 * so the final rendered string always equals `formatCount(to, fmt)`.
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
  const v = Math.round(tween(tMs, startMs, durMs, from, to, ease) * scale) / scale;
  return formatCount(v, fmt);
}
