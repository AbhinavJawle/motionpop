import type { EditorProject, Slot, Word } from '@motionpop/schemas';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { demoProject } from '@/lib/projects/fixture';
import { picturableNouns } from '@motionpop/motion';
import {
  AUTO_PICTURES_MAX,
  cleanQuery,
  looksLikeLogo,
  pickHit,
  pictureQueries,
  runAutoPictures,
  type MediaHit,
} from './auto-pictures';

// Spec 07c task 15 (smoke tests written with the code in a Claude Code session; the property
// tests are task 16, for Kiro). No network: searches are fakes.

const SCRIPT =
  'In March 2021, one ship stopped 12% of world trade. The Suez Canal is a narrow shortcut between the Mediterranean and the Red Sea. That is four football pitches, end to end. Every day it sat there, the factory lines waited for coffee and steel. 369 ships queued up at both ends.';

/** Word ranges of the hand-placed slots (inclusive), by the scene they carry. */
function project(script = SCRIPT): EditorProject {
  const words: Word[] = script.split(/\s+/).map((text, i) => ({
    i,
    text,
    startMs: i * 400,
    endMs: i * 400 + 320,
    conf: 0.95,
    filler: false,
  }));
  const at = (w: string) => words.findIndex((x) => x.text.startsWith(w));
  const slot = (id: string, componentId: string, a: number, b: number, content: object) => ({
    id,
    startMs: a * 400,
    endMs: b * 400 + 320,
    wordStart: a,
    wordEnd: b,
    reason: 'test',
    componentId,
    skillId: 'test',
    prompt: '',
    params: { content, beats: [], images: [] },
    status: 'ready' as const,
    notes: [],
  });
  const base = demoProject();
  return {
    ...base,
    durationMs: words.length * 400 + 600,
    transcript: { ...base.transcript, words },
    slots: [
      slot('a', 'stat-punch', at('one'), at('trade.'), {
        value: 12,
        suffix: '%',
        label: 'World trade',
      }),
      slot('b', 'hook-statement', at('The'), at('Sea.'), {
        line: 'The Suez Canal is a narrow shortcut',
      }),
      slot('c', 'hook-statement', at('Every'), at('steel.'), { line: 'The factory lines waited' }),
      slot('d', 'stat-punch', at('369'), at('ends.'), { value: 369, label: 'Ships queued up' }),
    ],
  };
}

const hit = (over: Partial<MediaHit> = {}): MediaHit => ({
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Harbour at dawn',
  thumb: '/t',
  width: 1600,
  height: 1000,
  license: 'cc0',
  attribution: 'Harbour at dawn (CC0)',
  ...over,
});

describe('pictureQueries', () => {
  it('asks for places first, then concrete nouns, never for counted stats', () => {
    // A named landform counts as a place; a concrete noun otherwise; the two counted stats
    // (12 % → a grid, 369 → dots) are never searched.
    expect(pictureQueries(project())).toEqual([
      { slotId: 'b', role: 'subject', query: 'Suez Canal', from: 'place' },
      { slotId: 'c', role: 'subject', query: 'factory', from: 'noun' },
    ]);
  });

  it('skips tried slots and respects the cap', () => {
    const p = project();
    const all = pictureQueries(p);
    expect(pictureQueries(p, { max: 1 })).toHaveLength(Math.min(1, all.length));
    const tried = new Set(all.map((q) => q.slotId));
    expect(pictureQueries(p, { tried })).toEqual([]);
  });

  it('asks nothing for a film', () => {
    // Only whether a film is present matters here, not its storyboard.
    expect(pictureQueries({ ...project(), film: {} } as unknown as EditorProject)).toEqual([]);
  });
});

describe('brand and logo fences', () => {
  it('refuses brand queries and logo-like results', () => {
    expect(cleanQuery('Tesla factory')).toBeNull();
    expect(cleanQuery('factory')).toBe('factory');
    expect(looksLikeLogo('Shipping company logo')).toBe(true);
    expect(looksLikeLogo('Container ship® brand')).toBe(true);
    expect(looksLikeLogo('Container ship in the canal')).toBe(false);
    expect(pickHit([hit({ title: 'ACME logo' }), hit({ title: 'A canal' })])?.title).toBe(
      'A canal',
    );
  });

  it('skips slivers and tiny pictures, and gives a repeat the next hit', () => {
    const hits = [hit({ width: 4000, height: 500 }), hit({ title: 'a' }), hit({ title: 'b' })];
    expect(pickHit(hits)?.title).toBe('a');
    expect(pickHit(hits, 1)?.title).toBe('b');
    expect(pickHit([hit({ width: 300, height: 200 })])).toBeNull();
  });
});

describe('runAutoPictures', () => {
  it('attaches one picture per query and stops on a rate limit', async () => {
    const p = project();
    const n = pictureQueries(p).length;
    const attached: string[] = [];
    const tried = new Set<string>();
    const added = await runAutoPictures({
      getProject: () => p,
      search: async () => [hit(), hit({ title: 'second' })],
      fetchImage: async () => new Blob(['x'], { type: 'image/webp' }),
      attach: async (r) => {
        attached.push(r.slotId);
        return true;
      },
      tried: () => tried,
      markTried: (id) => tried.add(id),
      cancelled: () => false,
    });
    expect(added).toBe(n);
    expect(attached).toHaveLength(n);

    let calls = 0;
    const limited = await runAutoPictures({
      getProject: () => p,
      search: async () => {
        calls++;
        return { limited: true };
      },
      fetchImage: async () => new Blob(),
      attach: async () => true,
      tried: () => new Set(),
      markTried: () => {},
      cancelled: () => false,
    });
    expect(limited).toBe(0);
    expect(calls).toBe(1);
  });
});

// Spec 07c task 16: property tests over random projects (Kiro run 20). Still no network.

const BRAND_LIST = ['apple', 'google', 'tesla', 'samsung', 'nike', 'coca', 'disney', 'openai'];
// Person names are kept out of the random vocabulary: a name followed by a landform word
// ("Chen Sea") is tagged as a place, which is a known gap (see the it.fails test below).
const PERSON_NAMES = ['John', 'Smith', 'Maria'];
const PLACE_NAMES = ['Suez', 'Canal', 'Red', 'Sea', 'Gobi', 'Desert', 'Mediterranean'];
const NOUNS = ['ships', 'factory', 'coffee', 'steel', 'harbour', 'growth', 'time', 'trucks'];
const FILLERS = ['the', 'is', 'in', 'of', 'and', 'it', 'at', 'a'];
const VOCAB = [
  ...BRAND_LIST,
  ...PERSON_NAMES,
  ...PLACE_NAMES,
  ...NOUNS,
  ...FILLERS,
  '369',
  '12%',
  '$4bn',
];

/** A random editor project: words from VOCAB, slots over random word ranges, some with pictures. */
const projectArb = fc
  .record({
    words: fc.array(fc.constantFrom(...VOCAB), { minLength: 12, maxLength: 60 }),
    slots: fc.array(
      fc.record({
        a: fc.nat(40),
        len: fc.integer({ min: 1, max: 12 }),
        componentId: fc.constantFrom('stat-punch', 'hook-statement', 'quote', 'list-stack'),
        value: fc.integer({ min: 0, max: 900 }),
        suffix: fc.constantFrom('', '%', 'k', 'bn'),
        picture: fc.boolean(),
        status: fc.constantFrom('ready', 'failed', 'generating'),
      }),
      { maxLength: 6 },
    ),
  })
  .map(({ words, slots }) => {
    const base = project();
    const ws: Word[] = words.map((text, i) => ({
      i,
      text,
      startMs: i * 400,
      endMs: i * 400 + 320,
      conf: 0.95,
      filler: false,
    }));
    const out: Slot[] = [];
    const assets: NonNullable<EditorProject['assets']> = [];
    slots.forEach((r, k) => {
      const a = r.a % ws.length;
      const b = Math.min(ws.length - 1, a + r.len - 1);
      const content: Record<string, unknown> =
        r.componentId === 'stat-punch'
          ? { value: r.value, suffix: r.suffix || undefined, label: 'label' }
          : r.componentId === 'hook-statement'
            ? { line: words.slice(a, b + 1).join(' ') || 'line' }
            : { quote: words.slice(a, b + 1).join(' ') || 'quote' };
      const images = r.picture ? [{ assetId: `asset-${k}` }] : [];
      if (r.picture) assets.push({ id: `asset-${k}`, status: 'ready' } as never);
      out.push({
        id: `s${k}`,
        startMs: a * 400,
        endMs: b * 400 + 320,
        wordStart: a,
        wordEnd: b,
        reason: 'test',
        componentId: r.componentId,
        skillId: 'test',
        prompt: '',
        params: { content, beats: [], images },
        status: r.status,
        notes: [],
      } as unknown as Slot);
    });
    return {
      ...base,
      durationMs: ws.length * 400 + 600,
      transcript: { ...base.transcript, words: ws },
      slots: out,
      assets,
    } as EditorProject;
  });

describe('auto-pictures properties (spec 07c R1.2–R1.7)', () => {
  it('never asks for more than the cap, whatever the cap', () => {
    fc.assert(
      fc.property(
        projectArb,
        fc.option(fc.integer({ min: 0, max: 20 }), { nil: undefined }),
        (p, max) => {
          const qs = pictureQueries(p, max === undefined ? {} : { max });
          expect(qs.length).toBeLessThanOrEqual(
            Math.min(AUTO_PICTURES_MAX, max ?? AUTO_PICTURES_MAX),
          );
        },
      ),
    );
  });

  it('never returns a tried slot, a slot with a ready picture, or a counted stat', () => {
    fc.assert(
      fc.property(projectArb, (p) => {
        const all = pictureQueries(p);
        const withPicture = new Set(
          p.slots
            .filter((s) => {
              const id = (s.params as { images?: { assetId?: string }[] }).images?.[0]?.assetId;
              return (
                id !== undefined &&
                (p.assets ?? []).some((a) => a.id === id && a.status === 'ready')
              );
            })
            .map((s) => s.id),
        );
        for (const q of all) {
          expect(withPicture.has(q.slotId)).toBe(false);
        }
        const tried = new Set(all.map((q) => q.slotId));
        expect(pictureQueries(p, { tried })).toEqual([]);
      }),
    );
  });

  it('never searches a brand, and only searches nouns from the lexicon or landform places', () => {
    fc.assert(
      fc.property(projectArb, (p) => {
        for (const q of pictureQueries(p)) {
          const parts = q.query
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .filter(Boolean);
          for (const w of parts) expect(BRAND_LIST).not.toContain(w);
          // Nouns come from the lexicon list only, so a name can never be searched as one.
          if (q.from === 'noun')
            expect(picturableNouns([q.query])).toEqual([q.query.toLowerCase()]);
          // A place query is a name ending in a landform (see the known gap below for person names).
          if (q.from === 'place') expect(q.query).toMatch(/(Canal|Sea|Desert)$/);
        }
      }),
    );
  });

  it('refuses every logo-like title, sliver and tiny picture', () => {
    const badTitles = fc.constantFrom(
      'ACME logo',
      'Brand ™ mark',
      'Old poster',
      'Infographic of trade',
      'Screenshot of app',
      'Icon set',
      'Shipping © agency',
    );
    fc.assert(
      fc.property(badTitles, (title) => {
        expect(pickHit([hit({ title })])).toBeNull();
      }),
    );
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4000 }), fc.integer({ min: 1, max: 4000 }), (w, h) => {
        const r = w / h;
        const ok = r >= 0.5 && r <= 2.2 && Math.max(w, h) >= 480;
        const picked = pickHit([hit({ width: w, height: h, title: 'A quiet canal' })]);
        expect(picked !== null).toBe(ok);
      }),
    );
  });

  it('makes exactly one search after a rate limit, however many queries there are', async () => {
    await fc.assert(
      fc.asyncProperty(projectArb, async (p) => {
        if (pictureQueries(p).length < 2) return;
        let calls = 0;
        const added = await runAutoPictures({
          getProject: () => p,
          search: async () => {
            calls++;
            return { limited: true };
          },
          fetchImage: async () => new Blob(),
          attach: async () => true,
          tried: () => new Set(),
          markTried: () => {},
          cancelled: () => false,
        });
        expect(calls).toBe(1);
        expect(added).toBe(0);
      }),
      { numRuns: 40 },
    );
  });

  it('never attaches to a slot that changed meanwhile', async () => {
    await fc.assert(
      fc.asyncProperty(projectArb, async (p) => {
        const queries = pictureQueries(p);
        if (queries.length === 0) return;
        // Between the search and the attach, every slot loses its graphic (deleted).
        let attached = 0;
        const gone: EditorProject = { ...p, slots: [] };
        await runAutoPictures({
          getProject: () => gone,
          search: async () => [hit()],
          fetchImage: async () => new Blob(),
          attach: async () => {
            attached++;
            return true;
          },
          tried: () => new Set(),
          markTried: () => {},
          cancelled: () => false,
        });
        expect(attached).toBe(0);
      }),
      { numRuns: 40 },
    );
  });
});

/** A project with one hook slot over `script`, for a single targeted case. */
function oneSlot(script: string): EditorProject {
  const base = project();
  const words: Word[] = script.split(/\s+/).map((text, i) => ({
    i,
    text,
    startMs: i * 400,
    endMs: i * 400 + 320,
    conf: 0.95,
    filler: false,
  }));
  const s = {
    ...(base.slots[1] as Slot),
    wordStart: 0,
    wordEnd: words.length - 1,
    startMs: 0,
    endMs: words.length * 400,
    componentId: 'hook-statement',
    params: { content: { line: script }, beats: [], images: [] },
  } as Slot;
  return { ...base, transcript: { ...base.transcript, words }, slots: [s] };
}

describe('known gap (spec 07c R1.2)', () => {
  // KNOWN BUG, found by the property test above: the tagger reads "Chen Sea" as a place, so a
  // person's name that ends in a landform word is searched. The desired result is no query.
  // Fixing it needs the tagger to know person names, so it stays a documented failure here.
  it.fails('does not search a person name that ends in a landform word', () => {
    expect(pictureQueries(oneSlot('Chen Sea stood still here'))).toEqual([]);
  });
});
