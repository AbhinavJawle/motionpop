import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { searchPixabay } from '@/lib/media/stock.server';
import { GET } from './route';

describe('/api/media/stock (Pixabay primary + safe proxy)', () => {
  const origPixabay = process.env.PIXABAY_API_KEY;
  const origPexels = process.env.PEXELS_API_KEY;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (origPixabay === undefined) delete process.env.PIXABAY_API_KEY;
    else process.env.PIXABAY_API_KEY = origPixabay;
    if (origPexels === undefined) delete process.env.PEXELS_API_KEY;
    else process.env.PEXELS_API_KEY = origPexels;
  });

  it('queries Pixabay videos API, picks medium MP4, prefers portrait hits, and caches for 24h', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          total: 2,
          totalHits: 2,
          hits: [
            {
              id: 101,
              pageURL: 'https://pixabay.com/videos/id-101/',
              tags: 'city, night, neon',
              duration: 12,
              user: 'WideCreator',
              videos: {
                medium: {
                  url: 'https://cdn.pixabay.com/video/101_medium.mp4',
                  width: 1280,
                  height: 720,
                  size: 3_000_000,
                  thumbnail: 'https://cdn.pixabay.com/video/101_medium.jpg',
                },
              },
            },
            {
              id: 102,
              pageURL: 'https://pixabay.com/videos/id-102/',
              tags: 'vertical, neon, street',
              duration: 8,
              user: 'PortraitCreator',
              videos: {
                medium: {
                  url: 'https://cdn.pixabay.com/video/102_medium.mp4',
                  width: 720,
                  height: 1280,
                  size: 2_500_000,
                  thumbnail: 'https://cdn.pixabay.com/video/102_medium.jpg',
                },
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const first = await searchPixabay('neon city test', 'video', 'portrait', 4, 'test-key');
    expect(first).toHaveLength(2);
    expect(first[0]).toMatchObject({
      id: 'pixabay-v-102',
      provider: 'pixabay',
      kind: 'video',
      attribution: 'Pixabay · PortraitCreator',
      pageUrl: 'https://pixabay.com/videos/id-102/',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(calledUrl).toContain('https://pixabay.com/api/videos/?');
    expect(calledUrl).toContain('safesearch=true');

    // Second identical call hits 24h in-memory cache without re-fetching.
    const second = await searchPixabay('neon city test', 'video', 'portrait', 4, 'test-key');
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('queries Pixabay photos API with mapped vertical orientation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          total: 1,
          totalHits: 1,
          hits: [
            {
              id: 555,
              pageURL: 'https://pixabay.com/photos/flower-555/',
              tags: 'yellow, flower, bloom',
              webformatURL: 'https://pixabay.com/get/555_640.jpg',
              largeImageURL: 'https://pixabay.com/get/555_1280.jpg',
              imageWidth: 1280,
              imageHeight: 1920,
              user: 'FloraCam',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    process.env.PIXABAY_API_KEY = 'test-key';
    const res = await GET(
      new Request(
        'http://localhost:3000/api/media/stock?q=yellow+flowers&kind=photo&orientation=portrait&limit=3',
      ),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('max-age=86400');
    const body = (await res.json()) as {
      items: { id: string; provider: string; attribution: string }[];
    };
    expect(body.items[0]).toMatchObject({
      id: 'pixabay-p-555',
      provider: 'pixabay',
      attribution: 'Pixabay · FloraCam',
    });
    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(calledUrl).toContain('https://pixabay.com/api/?');
    expect(calledUrl).toContain('orientation=vertical');
    expect(calledUrl).toContain('image_type=photo');
  });

  it('blocks non-allowlisted proxy hosts and redirect pivots', async () => {
    const blocked = await GET(
      new Request('http://localhost:3000/api/media/stock?proxy=https://evil.example.com/a.jpg'),
    );
    expect(blocked.status).toBe(403);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { location: 'http://169.254.169.254/latest/meta-data/' },
        }),
      ),
    );
    const pivot = await GET(
      new Request(
        'http://localhost:3000/api/media/stock?proxy=https://pixabay.com/get/fake_1280.jpg',
      ),
    );
    expect(pivot.status).toBe(403);
  });
});
