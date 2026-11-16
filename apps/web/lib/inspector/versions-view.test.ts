// @vitest-environment happy-dom
import fc from 'fast-check';
import type { Version } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import {
  canPage,
  glyphKind,
  lastPageStart,
  NO_SELECTION_TOAST,
  pageStart,
  positionLabel,
  relativeTime,
  restorable,
  scrollToVersions,
  slotVersions,
  TILES_PER_PAGE,
  versionTitle,
} from './versions-view';

const v = (id: string, slotId = 's', over: Partial<Version> = {}): Version => ({
  id,
  slotId,
  componentId: 'big-number',
  params: {},
  source: 'user',
  costCredits: 0,
  createdAt: 0,
  ...over,
});

describe('paging by three', () => {
  it('starts on the newest three', () => {
    expect(lastPageStart(0)).toBe(0);
    expect(lastPageStart(2)).toBe(0);
    expect(lastPageStart(3)).toBe(0);
    expect(lastPageStart(7)).toBe(4);
  });
  it('moves by three and stops at the ends', () => {
    expect(pageStart(4, 7, 'older')).toBe(1);
    expect(pageStart(1, 7, 'older')).toBe(0);
    expect(pageStart(0, 7, 'older')).toBe(0);
    expect(pageStart(1, 7, 'newer')).toBe(4);
    expect(pageStart(4, 7, 'newer')).toBe(4);
    expect(canPage(0, 7, 'older')).toBe(false);
    expect(canPage(4, 7, 'older')).toBe(true);
    expect(canPage(4, 7, 'newer')).toBe(false);
    expect(canPage(0, 2, 'newer')).toBe(false);
  });
  it('property: any sequence of pages keeps the window inside the list', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 40 }),
        fc.array(fc.constantFrom('older', 'newer'), { maxLength: 30 }),
        (count, moves) => {
          let start = lastPageStart(count);
          for (const m of moves) {
            start = pageStart(start, count, m);
            expect(start).toBeGreaterThanOrEqual(0);
            expect(start).toBeLessThanOrEqual(lastPageStart(count));
            expect(Math.min(count, start + TILES_PER_PAGE) - start).toBe(Math.min(count, 3));
          }
        },
      ),
    );
  });
});

describe('labels and tooltips', () => {
  it('numbers the current version by position', () => {
    const vs = [v('a'), v('b'), v('c')];
    expect(positionLabel(vs, 'c')).toBe('v3');
    expect(positionLabel(vs, 'a')).toBe('v1');
    expect(positionLabel(vs, undefined)).toBeNull();
    expect(positionLabel(vs, 'zzz')).toBeNull();
  });
  it('reads "label · route · time"', () => {
    expect(
      versionTitle(
        v('a', 's', { label: 'make it slower', source: 'ai-device', createdAt: 0 }),
        120_000,
      ),
    ).toBe('make it slower · on-device · 2 min ago');
    expect(versionTitle(v('a', 's', { source: 'ai-cloud', label: 'Generated' }), 10_000)).toBe(
      'Generated · cloud · just now',
    );
    expect(versionTitle(v('a', 's', { source: 'default' }), 3 * 3600_000)).toBe(
      'Version · template · 3 h ago',
    );
  });
  it('relative times step through minutes, hours and days', () => {
    expect(relativeTime(0, 44_000)).toBe('just now');
    expect(relativeTime(0, 90_000)).toBe('2 min ago');
    expect(relativeTime(0, 2 * 86_400_000)).toBe('2 d ago');
    expect(relativeTime(10, 0)).toBe('just now');
  });
});

describe('restorable and glyphs', () => {
  it('greys versions of another component and the current one', () => {
    const slot = { componentId: 'big-number', currentVersionId: 'b' };
    expect(restorable(slot, v('a'))).toBe(true);
    expect(restorable(slot, v('b'))).toBe(false);
    expect(restorable(slot, v('c', 's', { componentId: 'versus' }))).toBe(false);
  });
  it('picks a glyph per kind of graphic', () => {
    expect(glyphKind('versus')).toBe('split');
    expect(glyphKind('hook-statement')).toBe('lines');
    expect(glyphKind('stat-punch')).toBe('bars');
    expect(glyphKind('anything-else')).toBe('bars');
  });
  it('lists only the slot’s versions, in order', () => {
    const versions = [v('a', 's1'), v('b', 's2'), v('c', 's1')];
    expect(slotVersions({ versions }, 's1').map((x) => x.id)).toEqual(['a', 'c']);
  });
});

describe('scrollToVersions (R5.5)', () => {
  it('returns false when the inspector is not showing versions', () => {
    expect(scrollToVersions(document, true)).toBe(false);
    expect(NO_SELECTION_TOAST).toBe('Select a graphic to see its versions.');
  });
  it('scrolls to the section and focuses the current tile', () => {
    document.body.innerHTML =
      '<section data-inspector-versions><button aria-current="true">v3</button></section>';
    const section = document.querySelector<HTMLElement>('[data-inspector-versions]')!;
    let called: unknown;
    section.scrollIntoView = (arg?: boolean | ScrollIntoViewOptions) => {
      called = arg;
    };
    expect(scrollToVersions(document, true)).toBe(true);
    expect(called).toEqual({ behavior: 'auto', block: 'nearest' });
    expect(document.activeElement?.textContent).toBe('v3');
    document.body.innerHTML = '';
  });
});
