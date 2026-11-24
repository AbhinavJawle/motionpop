import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildUncommonEarSearchParams,
  fetchUncommonEarTrackAudio,
  searchUncommonEar,
  UncommonEarError,
} from './uncommon-ear.server';

describe('Uncommon Ear server client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds kind-safe query params without mixing music and sfx filters', () => {
    const musicMood = buildUncommonEarSearchParams({ q: 'piano', kind: 'music', tag: 'calm' });
    expect(musicMood.get('kind')).toBe('music');
    expect(musicMood.get('mood')).toBe('calm');
    expect(musicMood.get('sfx')).toBeNull();
    expect(musicMood.get('commercial')).toBe('true');
    expect(musicMood.get('curated')).toBe('true');

    const musicGenre = buildUncommonEarSearchParams({ kind: 'music', tag: 'cinematic' });
    expect(musicGenre.get('genre')).toBe('cinematic');
    expect(musicGenre.get('mood')).toBeNull();

    const sfxFilter = buildUncommonEarSearchParams({ q: 'transition', kind: 'sfx', tag: 'whoosh' });
    expect(sfxFilter.get('kind')).toBe('sfx');
    expect(sfxFilter.get('sfx')).toBe('whoosh');
    expect(sfxFilter.get('mood')).toBeNull();

    // Passing a music tag while kind=sfx is ignored instead of causing 400 invalid_filter_for_kind.
    const wrongKind = buildUncommonEarSearchParams({ kind: 'sfx', tag: 'cinematic' });
    expect(wrongKind.get('sfx')).toBeNull();
    expect(wrongKind.get('genre')).toBeNull();
  });

  it('sends Authorization Bearer header and normalizes search results', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          tracks: [
            {
              id: 'fp-0000000001',
              title: 'Sunrise Walk',
              artist: 'Kevin MacLeod',
              kind: 'music',
              duration_s: 90,
              bpm: 100,
              tags: { genre: ['cinematic'], mood: ['calm'], use: [], instrument: [], sfx: [] },
              license: { id: 'cc0', name: 'CC0 1.0', status: 'verified' },
              terms: { commercial: true, credit: 'none', share_alike: false },
              attribution: 'requested',
              credit_line: '"Sunrise Walk" by Kevin MacLeod (CC0 1.0)',
              preview_url: 'https://media.uncommonear.com/p/fp-0000000001.mp3',
              page_url: 'https://uncommonear.com/t/fp-0000000001/sunrise-walk',
            },
          ],
          total: 1,
          cursor: null,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await searchUncommonEar({ q: 'calm piano', kind: 'music', limit: 3 }, 'ue_secret');
    expect(res.tracks).toHaveLength(1);
    expect(res.tracks[0]).toMatchObject({
      id: 'fp-0000000001',
      title: 'Sunrise Walk',
      artist: 'Kevin MacLeod',
      durationS: 90,
      bpm: 100,
      licenseName: 'CC0 1.0',
      previewUrl: 'https://media.uncommonear.com/p/fp-0000000001.mp3',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('https://api.uncommonear.com/v1/search?');
    expect(url).not.toContain('ue_secret');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer ue_secret');
  });

  it('rejects invalid track IDs before making any network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchUncommonEarTrackAudio('../evil', 'ue_secret')).rejects.toThrow(
      UncommonEarError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
