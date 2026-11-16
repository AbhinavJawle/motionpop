import type { ProjectSummary } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { clock, dashboardStats, formatSaved, matchesSearch, relativeTime } from './format';
import { firstName, greet } from './greeting';

const DAY = 86_400_000;

describe('greeting', () => {
  it('covers every hour with the night flag exactly at 23..4', () => {
    const night = Array.from({ length: 24 }, (_, h) => greet(h, 'Ada Lovelace').night);
    expect(night.map((n, h) => (n ? h : -1)).filter((h) => h >= 0)).toEqual([0, 1, 2, 3, 4, 23]);
    expect(greet(23, 'Ada Lovelace').line).toBe('Working late, Ada?');
    expect(greet(5, 'Ada').line).toBe('Good morning, Ada');
    expect(greet(12, 'Ada').line).toBe('Good afternoon, Ada');
    expect(greet(17, null).line).toBe('Good evening, there');
    expect(firstName('   ')).toBe('there');
  });
});

describe('format helpers', () => {
  it('relative time', () => {
    const now = Date.UTC(2026, 10, 17, 12);
    expect(relativeTime(now - 10_000, now)).toBe('just now');
    expect(relativeTime(now - 12 * 60_000, now)).toBe('12 minutes ago');
    expect(relativeTime(now - 60 * 60_000, now)).toBe('1 hour ago');
    expect(relativeTime(now - DAY - 1, now)).toBe('yesterday');
    expect(relativeTime(now - 2 * DAY, now)).toBe('2 days ago');
    expect(relativeTime(now - 30 * DAY, now)).toMatch(/^Oct \d+$/);
  });

  it('clock, saved and search', () => {
    expect(clock(84_000)).toBe('01:24');
    expect(formatSaved(70)).toBe('~1h 10m');
    expect(formatSaved(25)).toBe('~25m');
    expect(formatSaved(0)).toBe('0m');
    expect(matchesSearch('Café numbers', 'CAFE')).toBe(true);
    expect(matchesSearch('Q3 in numbers', 'money')).toBe(false);
  });

  it('stats: sparkline sums equal the windowed totals', () => {
    const now = Date.UTC(2026, 10, 17, 12);
    const p = (createdAt: number, ready: number, gen: number): ProjectSummary => ({
      id: String(createdAt),
      title: 't',
      format: '16:9',
      styleId: 's',
      durationMs: 1000,
      status: 'draft',
      slotCount: 4,
      readySlotCount: ready,
      slotStates: [],
      graphicsGenerated: gen,
      lastOpenedAt: createdAt,
      createdAt,
      updatedAt: createdAt,
    });
    const s = dashboardStats(
      [p(now, 3, 2), p(now - 2 * DAY, 1, 5), p(now - 30 * DAY, 4, 1)],
      now,
      0,
    );
    expect(s.videos).toBe(2);
    expect(s.graphics).toBe(8);
    expect(s.savedMin).toBe(40);
    expect(s.spark.videos.reduce((a, b) => a + b)).toBe(2);
    expect(s.spark.graphics.reduce((a, b) => a + b)).toBe(7);
    expect(s.spark.videos[6]).toBe(1);
  });
});
