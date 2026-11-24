'use client';

import { useEffect, useState } from 'react';
import { appAudioStore } from '@/lib/audio/app-audio-store';
import { imageDataUrl } from '@/lib/images/image-store';

/**
 * Cached client-side video keyframe & image-asset thumbnail loader (spec 41).
 *
 * New video uploads already store `video.posterUrl`. For older projects (already saved in
 * IndexedDB or Firestore without `posterUrl`), this lazily reads the video blob once through
 * `appAudioStore()`, captures a crisp 480 px JPEG frame at the first non-cut timestamp, and
 * caches the data URL both in memory and in a dedicated IndexedDB store (`mp-project-thumbs`)
 * so reloads are instant. At most 2 video decoders run concurrently.
 */

const DB_NAME = 'mp-project-thumbs';
const STORE_NAME = 'thumbs';
const MAX_WIDTH = 480;
const JPEG_QUALITY = 0.78;
const MAX_CONCURRENT = 2;

const memCache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

let activeJobs = 0;
const queue: Array<() => void> = [];

function schedule<T>(work: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      activeJobs += 1;
      work()
        .then(resolve, reject)
        .finally(() => {
          activeJobs -= 1;
          const next = queue.shift();
          if (next) next();
        });
    };
    if (activeJobs < MAX_CONCURRENT) run();
    else queue.push(run);
  });
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openThumbDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function readIdbThumb(key: string): Promise<string | null> {
  const db = await openThumbDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeIdbThumb(key: string, value: string): Promise<void> {
  const db = await openThumbDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** Decodes one frame from a video Blob into a crisp JPEG data URL. Never throws. */
export async function extractVideoFrame(blob: Blob, atMs = 300): Promise<string | null> {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('metadata timeout')), 5000);
      video.onloadedmetadata = () => {
        clearTimeout(timer);
        resolve();
      };
      video.onerror = () => {
        clearTimeout(timer);
        reject(new Error('video load failed'));
      };
      video.src = url;
    });

    const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
    const targetSec = Math.max(0.08, Math.min(dur - 0.08, atMs / 1000));

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('seek timeout')), 4000);
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      const fail = () => {
        clearTimeout(timer);
        reject(new Error('seek failed'));
      };
      video.addEventListener('seeked', done, { once: true });
      video.addEventListener('error', fail, { once: true });
      video.currentTime = targetSec;
    });

    const vw = video.videoWidth || 1080;
    const vh = video.videoHeight || 1920;
    const scale = Math.min(1, MAX_WIDTH / vw);
    const cw = Math.max(64, Math.round(vw * scale));
    const ch = Math.max(64, Math.round(vh * scale));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, cw, ch);
    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    return dataUrl.startsWith('data:image/') ? dataUrl : null;
  } catch {
    return null;
  } finally {
    video.removeAttribute('src');
    try {
      video.load();
    } catch {
      // ignore jsdom/happy-dom unimplemented load
    }
    URL.revokeObjectURL(url);
  }
}

async function resolveVideoThumb(videoSrc: string, atMs: number): Promise<string | null> {
  const key = `v:${videoSrc}@${Math.round(atMs / 250)}`;
  if (memCache.has(key)) return memCache.get(key) ?? null;
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async (): Promise<string | null> => {
    const cached = await readIdbThumb(key);
    if (cached) {
      memCache.set(key, cached);
      return cached;
    }
    const url = await schedule(async () => {
      const blob = await appAudioStore()
        .get(videoSrc)
        .catch(() => null);
      if (!blob) return null;
      return extractVideoFrame(blob, atMs);
    });
    memCache.set(key, url);
    if (url) void writeIdbThumb(key, url);
    return url;
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, promise);
  return promise;
}

/**
 * Returns a real JPEG thumbnail URL for a video project. Uses `initialPoster` immediately when
 * saved; otherwise lazily extracts and caches a frame from `appAudioStore()`.
 */
export function useVideoThumb(
  videoSrc: string | undefined,
  atMs = 300,
  initialPoster?: string,
): string | null {
  const cacheKey = videoSrc ? `v:${videoSrc}@${Math.round(atMs / 250)}` : null;
  const [loaded, setLoaded] = useState<{ key: string; url: string | null } | null>(null);

  useEffect(() => {
    if (initialPoster || !videoSrc || !cacheKey) return;
    let live = true;
    void resolveVideoThumb(videoSrc, atMs).then((res) => {
      if (live) setLoaded({ key: cacheKey, url: res });
    });
    return () => {
      live = false;
    };
  }, [videoSrc, atMs, initialPoster, cacheKey]);

  if (initialPoster) return initialPoster;
  if (!cacheKey) return null;
  if (loaded?.key === cacheKey) return loaded.url;
  return memCache.get(cacheKey) ?? null;
}

const assetCache = new Map<string, string | null>();

const isDirectImageUrl = (src: string) =>
  src.startsWith('data:') || src.startsWith('http') || src.startsWith('/');

/** Resolves a project's image asset ref (`idb:…`, Storage path, or data URL) for photo thumbnails. */
export function useAssetThumb(imageSrc: string | undefined): string | null {
  const [loaded, setLoaded] = useState<{ src: string; url: string | null } | null>(null);

  useEffect(() => {
    if (!imageSrc || isDirectImageUrl(imageSrc) || assetCache.has(imageSrc)) return;
    let live = true;
    void imageDataUrl(imageSrc)
      .catch(() => null)
      .then((res) => {
        assetCache.set(imageSrc, res);
        if (live) setLoaded({ src: imageSrc, url: res });
      });
    return () => {
      live = false;
    };
  }, [imageSrc]);

  if (!imageSrc) return null;
  if (isDirectImageUrl(imageSrc)) return imageSrc;
  if (loaded?.src === imageSrc) return loaded.url;
  return assetCache.get(imageSrc) ?? null;
}
