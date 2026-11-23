import type { ProjectSummary } from '@motionpop/schemas';

/** Relative time, search, sort and stats for the dashboard (spec 11 R5). All pure. */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;

/** "just now", "12 minutes ago", "1 hour ago", "yesterday", "2 days ago", then "Nov 3". */
export function relativeTime(thenMs: number, nowMs: number): string {
  const d = Math.max(0, nowMs - thenMs);
  if (d < MIN) return 'just now';
  if (d < HOUR) return plural(Math.floor(d / MIN), 'minute');
  if (d < DAY) return plural(Math.floor(d / HOUR), 'hour');
  if (d < 2 * DAY) return 'yesterday';
  if (d < 7 * DAY) return `${Math.floor(d / DAY)} days ago`;
  const then = new Date(thenMs);
  const sameYear = then.getFullYear() === new Date(nowMs).getFullYear();
  return then.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** "01:24" (minutes can pass 99). */
export function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Lower case, accents stripped: "Café" matches "cafe". */
export function foldText(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

export function matchesSearch(title: string, query: string): boolean {
  const q = foldText(query);
  return q.length === 0 || foldText(title).includes(q);
}

export type SortKey = 'edited' | 'created' | 'name';

export function sortSummaries(list: readonly ProjectSummary[], key: SortKey): ProjectSummary[] {
  const out = [...list];
  if (key === 'name')
    out.sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  else if (key === 'created') out.sort((a, b) => b.createdAt - a.createdAt);
  else out.sort((a, b) => b.updatedAt - a.updatedAt);
  return out;
}

/** Minutes saved per ready graphic (D-065 #12, a founder question; shown with "~"). */
export const SAVED_MIN_PER_GRAPHIC = 5;

export interface DashboardStats {
  videos: number;
  graphics: number;
  savedMin: number;
  /** Oldest day first, today last. */
  spark: { videos: number[]; graphics: number[]; saved: number[] };
}

/**
 * Stats from the summaries (D-065 #12). `videos` = projects created in the last 7 local days
 * (today included); graphics and saved minutes are totals, bucketed into the sparkline by the
 * day of `updatedAt` (a documented approximation). `tzOffsetMin` uses the
 * `Date#getTimezoneOffset` sign (minutes behind UTC).
 */
export function dashboardStats(
  list: readonly ProjectSummary[],
  nowMs: number,
  tzOffsetMin: number,
): DashboardStats {
  const day = (ms: number) => Math.floor((ms - tzOffsetMin * MIN) / DAY);
  const today = day(nowMs);
  const bucket = (ms: number) => 6 - (today - day(ms));
  const spark = { videos: zeros(), graphics: zeros(), saved: zeros() };
  let videos = 0;
  let graphics = 0;
  let savedMin = 0;
  for (const p of list) {
    const saved = p.readySlotCount * SAVED_MIN_PER_GRAPHIC;
    graphics += p.graphicsGenerated;
    savedMin += saved;
    const c = bucket(p.createdAt);
    if (c >= 0 && c <= 6) {
      videos++;
      add(spark.videos, c, 1);
    }
    const u = bucket(p.updatedAt);
    if (u >= 0 && u <= 6) {
      add(spark.graphics, u, p.graphicsGenerated);
      add(spark.saved, u, saved);
    }
  }
  return { videos, graphics, savedMin, spark };
}

const zeros = (): number[] => new Array<number>(7).fill(0);
const add = (a: number[], i: number, v: number) => {
  a[i] = (a[i] ?? 0) + v;
};

/** "~1h 10m", "~25m", "0m". */
export function formatSaved(min: number): string {
  if (min <= 0) return '0m';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `~${h}h${m > 0 ? ` ${m}m` : ''}` : `~${m}m`;
}

/** "about 30 minutes", "about 1 hour 10 minutes", "no time yet" (spec 35 week line). */
export function formatSavedWords(min: number): string {
  if (min <= 0) return 'no time yet';
  const h = Math.floor(min / 60);
  const m = min % 60;
  const hours = h > 0 ? `${h} ${h === 1 ? 'hour' : 'hours'}` : '';
  const mins = m > 0 ? `${m} ${m === 1 ? 'minute' : 'minutes'}` : '';
  return `about ${[hours, mins].filter(Boolean).join(' ')}`;
}
