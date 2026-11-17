'use client';

import { APP_CONFIG_DEFAULTS } from '@motionpop/schemas';
import { useEffect } from 'react';
import { z } from 'zod';
import { getAuthSnapshot } from '@/lib/auth/auth-store';
import { loadAppConfig } from '@/lib/firebase/remote-config';
import { editorStore, useEditor } from '@/lib/stores/editor';
import { apiHeaders } from '@/lib/users/bootstrap-client';
import {
  AUTO_PICTURES_MAX,
  MediaHitSchema,
  runAutoPictures,
  type MediaHit,
} from './auto-pictures';
import { addOwnImage } from './generate';

/**
 * Mounts first-load pictures in the editor (spec 07c R1). Waits until the drafts and the device
 * auto-fill have settled, then searches the open media library for the graphics that can take a
 * picture. Free: no credits, no confirm, no paid model. Searches are cached in this browser for a
 * day, and the slots tried are remembered per project, so reopening a project searches nothing.
 */
const SEARCH_TTL_MS = 24 * 60 * 60 * 1000;
const searchKey = (q: string) => `mp:media-search:v1:${q.toLowerCase()}`;
const triedKey = (projectId: string) => `mp:auto-pictures:v1:${projectId}`;
const CachedSchema = z.object({ at: z.number(), hits: z.array(MediaHitSchema) });

/** Parsed JSON from this browser's storage, or null (missing, blocked or corrupt). */
function readJson(key: string): unknown {
  const raw = readLocal(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage full or blocked: the run still works, it just isn't remembered.
  }
}

async function headers(): Promise<HeadersInit> {
  const a = getAuthSnapshot();
  return a.status === 'signed-in' ? apiHeaders(() => a.user.getIdToken()) : {};
}

async function search(q: string): Promise<MediaHit[] | { limited: true }> {
  const cached = CachedSchema.safeParse(readJson(searchKey(q)));
  if (cached.success && Date.now() - cached.data.at < SEARCH_TTL_MS) return cached.data.hits;
  const res = await fetch(`/api/media/search?q=${encodeURIComponent(q)}`, {
    headers: await headers(),
  });
  if (res.status === 429) return { limited: true };
  if (!res.ok) throw new Error(`search ${res.status}`);
  const body = z.object({ results: z.array(MediaHitSchema) }).parse(await res.json());
  writeLocal(searchKey(q), JSON.stringify({ at: Date.now(), hits: body.results }));
  return body.results;
}

async function fetchImage(hit: MediaHit): Promise<Blob> {
  const h = await headers();
  for (const url of [`/api/media/image?id=${hit.id}`, `/api/media/image?id=${hit.id}&thumb=1`]) {
    const res = await fetch(url, { headers: h });
    if (res.ok) {
      const blob = await res.blob();
      if (blob.type.startsWith('image/')) return blob;
    }
  }
  throw new Error('picture unavailable');
}

export function useAutoPictures(): void {
  const projectId = useEditor((s) => s.project?.id ?? null);
  const loadCount = useEditor((s) => s.loadCount);
  useEffect(() => {
    if (!projectId || loadCount === 0) return;
    let cancelled = false;
    const tried = (): Set<string> => {
      const parsed = z.array(z.string()).safeParse(readJson(triedKey(projectId)) ?? []);
      return new Set(parsed.success ? parsed.data : []);
    };
    const markTried = (slotId: string) => {
      const all = tried();
      all.add(slotId);
      writeLocal(triedKey(projectId), JSON.stringify([...all].slice(-200)));
    };
    const go = async () => {
      // Let the drafts land and the device auto-fill finish first: it rewrites a slot's params.
      for (let i = 0; i < 60 && !cancelled && editorStore.getState().autoFilling !== null; i++)
        await new Promise((r) => setTimeout(r, 1000));
      if (cancelled) return;
      const { config } = await loadAppConfig().catch(() => ({ config: APP_CONFIG_DEFAULTS }));
      const max = Math.min(AUTO_PICTURES_MAX, config.imagesPerVideoMax ?? AUTO_PICTURES_MAX);
      const exec = editorStore.getState().exec;
      await runAutoPictures({
        getProject: () => editorStore.getState().project,
        search,
        fetchImage,
        attach: async (req) => {
          const r = await addOwnImage(
            { getProject: () => editorStore.getState().project, exec: (c) => exec(c) },
            { ...req, source: 'openverse' },
          );
          return r.ok;
        },
        tried,
        markTried,
        cancelled: () => cancelled || editorStore.getState().project?.id !== projectId,
        max,
      });
    };
    const t = setTimeout(() => void go().catch(() => {}), 2500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [projectId, loadCount]);
}
