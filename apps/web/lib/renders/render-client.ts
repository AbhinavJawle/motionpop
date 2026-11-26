import {
  CreateRenderResponseSchema,
  CreateShareResponseSchema,
  DownloadResponseSchema,
  reelMediaOf,
  RenderApiErrorSchema,
  RenderStatusResponseSchema,
  RenderErrorCodeSchema,
  type CreateRenderResponse,
  type EditorProject,
  type RenderApiError,
  type RenderOptions,
  type RenderStatusResponse,
} from '@motionpop/schemas';
import { getAuthClient, getDb, getStorageClient } from '../firebase/client';
import { apiHeaders } from '../users/bootstrap-client';
import {
  resolveReferencedMediaClipBlobs,
  resolveStockAudioBlobs,
  resolveStockOverlayBlobs,
  resolveVideoBlob,
  uploadReferencedMediaClips,
  uploadStockAudio,
  uploadStockOverlays,
  uploadVideo,
  uploadVoice,
  VoiceError,
} from './voice-upload';
import { assetsInUse } from '@motionpop/motion/compiler';
import { ensureUploaded } from '@/lib/images/image-store';

// The client half of an export (spec 08 design §12). Cloud mode (Firebase configured: the real
// project or the emulators) uploads the voice, posts to `/api/renders` and watches the render doc
// with `onSnapshot`. Offline mode (no Firebase config, development only) posts one multipart
// request to `/api/local-renders` and polls.

/** What the UI knows about a render: the public status view, plus where its thumbnail is. */
export interface RenderView extends RenderStatusResponse {
  /** Storage path of `thumb.jpg` (cloud and emulator modes). */
  thumbPath?: string;
}

export interface StartInput {
  requestId: string;
  options: RenderOptions;
  expectedCost: number;
  project: EditorProject;
  voice: Blob;
}

export type StartFailure =
  | { ok: false; error: RenderApiError['error'] | 'network' | 'offline'; detail?: RenderApiError }
  | { ok: false; error: 'voice-missing' | 'too-large'; detail?: undefined };

export type StartResult = ({ ok: true; replay: boolean } & CreateRenderResponse) | StartFailure;

export interface RenderClient {
  readonly mode: 'cloud' | 'offline';
  start(input: StartInput): Promise<StartResult>;
  /** Calls `onView` with every change. Returns the stop function. */
  watch(
    renderId: string,
    onView: (view: RenderView) => void,
    onError?: (e: unknown) => void,
  ): () => void;
  /** Asks the server to sweep a stalled render and returns its view (R4.6). */
  check(renderId: string): Promise<RenderView | null>;
  downloadUrl(renderId: string): Promise<string>;
  /** The share link, created once per render. Null when this mode has no share links. */
  share(renderId: string): Promise<string | null>;
  /** An object URL (or route URL) of the finished render's `thumb.jpg`; null when there is none. */
  thumbnailUrl(view: RenderView, renderId: string): Promise<string | null>;
}

// ---------------------------------------------------------------------------------------------
// Parsing the answers (pure, tested)

const CLOUD_PARSE_ERRORS = RenderApiErrorSchema;

/** Turns a `/api/renders` or `/api/local-renders` response into a result. Never throws. */
export async function parseStartResponse(res: Response): Promise<StartResult> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }
  if (res.status === 200 || res.status === 201) {
    const ok = CreateRenderResponseSchema.safeParse(body);
    if (ok.success) return { ok: true, replay: res.status === 200, ...ok.data };
    return { ok: false, error: 'start-failed' };
  }
  const err = CLOUD_PARSE_ERRORS.safeParse(body);
  if (err.success) return { ok: false, error: err.data.error, detail: err.data };
  return { ok: false, error: res.status === 401 ? 'unauthorized' : 'start-failed' };
}

/** A status answer or a Firestore doc's data as a view, or null when it does not parse. */
export function toView(renderId: string, raw: unknown): RenderView | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const candidate = {
    renderId,
    status: r['status'],
    progress: r['progress'],
    ...(RenderErrorCodeSchema.safeParse(r['error']).success ? { error: r['error'] } : {}),
    costCredits: r['costCredits'],
    title: r['title'],
    format: r['format'],
    resolution: r['resolution'],
    durationMs: r['durationMs'],
    ...(typeof r['sizeBytes'] === 'number' ? { sizeBytes: r['sizeBytes'] } : {}),
    ...(r['transparent'] === true ? { transparent: true } : {}),
  };
  const parsed = RenderStatusResponseSchema.safeParse(candidate);
  if (!parsed.success) return null;
  const thumbPath = typeof r['thumbPath'] === 'string' ? r['thumbPath'] : undefined;
  return { ...parsed.data, ...(thumbPath ? { thumbPath } : {}) };
}

// ---------------------------------------------------------------------------------------------
// Offline

export const OFFLINE_POLL_MS = 700;

export function offlineRenderClient(): RenderClient {
  return {
    mode: 'offline',
    async start({ requestId, options, expectedCost, project, voice }) {
      const form = new FormData();
      form.set('request', JSON.stringify({ requestId, options, expectedCost, project }));
      form.set('voice', voice, 'voice');
      const isReel = Boolean(project.reel && project.video);
      const skipSourceVideo = Boolean(options.transparent) && !isReel;
      const videoBlob = skipSourceVideo ? null : await resolveVideoBlob(project).catch(() => null);
      if (videoBlob) form.set('video', videoBlob, 'source.mp4');
      const [clipBlobs, ovBlobs, auBlobs] = await Promise.all([
        !skipSourceVideo
          ? resolveReferencedMediaClipBlobs(project).catch(() => ({}))
          : Promise.resolve({}),
        resolveStockOverlayBlobs(project).catch(() => ({})),
        resolveStockAudioBlobs(project).catch(() => ({})),
      ]);
      for (const [id, { blob, ext }] of Object.entries(clipBlobs)) {
        form.set(`mediaClip:${id}`, blob, `clip.${ext}`);
      }
      for (const [id, { blob, ext }] of Object.entries(ovBlobs)) {
        form.set(`stockOv:${id}`, blob, `stock-ov.${ext}`);
      }
      for (const [id, { blob, ext }] of Object.entries(auBlobs)) {
        form.set(`stockAu:${id}`, blob, `stock-au.${ext}`);
      }
      try {
        return await parseStartResponse(
          await fetch('/api/local-renders', { method: 'POST', body: form }),
        );
      } catch {
        return { ok: false, error: 'network' };
      }
    },
    watch(renderId, onView, onError) {
      let stopped = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const tick = async () => {
        try {
          const res = await fetch(`/api/local-renders/${renderId}`, { cache: 'no-store' });
          if (res.ok) {
            const view = toView(renderId, await res.json());
            if (view && !stopped) onView(view);
            if (view && (view.status === 'done' || view.status === 'error')) return;
          } else if (res.status === 404) {
            // The dev server restarted: the render is gone.
            onError?.(new Error('render not found'));
            return;
          }
        } catch (e) {
          onError?.(e);
        }
        if (!stopped) timer = setTimeout(() => void tick(), OFFLINE_POLL_MS);
      };
      void tick();
      return () => {
        stopped = true;
        if (timer) clearTimeout(timer);
      };
    },
    async check(renderId) {
      const res = await fetch(`/api/local-renders/${renderId}`, { cache: 'no-store' });
      return res.ok ? toView(renderId, await res.json()) : null;
    },
    async downloadUrl(renderId) {
      return `/api/local-renders/${renderId}/file`;
    },
    async share() {
      return null;
    },
    async thumbnailUrl(_view, renderId) {
      return `/api/local-renders/${renderId}/thumb`;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Cloud and emulator

async function currentHeaders(): Promise<HeadersInit> {
  const auth = await getAuthClient();
  const user = auth.currentUser;
  if (!user) throw new Error('not signed in');
  return apiHeaders(() => user.getIdToken());
}

export function cloudRenderClient(): RenderClient {
  return {
    mode: 'cloud',
    async start({ requestId, options, expectedCost, project, voice }) {
      let uid: string;
      let voicePath: string;
      let videoPath: string | undefined;
      let clipPaths: Record<string, string> | undefined;
      let stockOverlayPaths: Record<string, string> | undefined;
      let stockAudioPaths: Record<string, string> | undefined;
      try {
        const auth = await getAuthClient();
        if (!auth.currentUser) return { ok: false, error: 'unauthorized' };
        uid = auth.currentUser.uid;
        voicePath = await uploadVoice(uid, project.id, voice);
        const isReel = Boolean(project.reel && project.video);
        const skipSourceVideo = Boolean(options.transparent) && !isReel;
        if (project.video && !skipSourceVideo) {
          const videoBlob = await resolveVideoBlob(project).catch(() => null);
          if (videoBlob) {
            const uploaded = await uploadVideo(uid, project.id, videoBlob).catch(() => null);
            if (uploaded) videoPath = uploaded;
          }
        }
        if (!skipSourceVideo) {
          const uploadedClips = await uploadReferencedMediaClips(uid, project).catch(() => ({}));
          if (Object.keys(uploadedClips).length > 0) clipPaths = uploadedClips;
        }
        // Upload visible Stock Media & audible Stock Audio across ALL project modes (spec 45 R5.1).
        const [uploadedOv, uploadedAu] = await Promise.all([
          uploadStockOverlays(uid, project).catch(() => ({})),
          uploadStockAudio(uid, project).catch(() => ({})),
        ]);
        if (Object.keys(uploadedOv).length > 0) stockOverlayPaths = uploadedOv;
        if (Object.keys(uploadedAu).length > 0) stockAudioPaths = uploadedAu;
        // The job reads pictures from the account's media folder; make sure each one is there
        // (both slot assets and reel scene media). A picture that won't upload renders as its fallback.
        const uploadSrcs = new Set(assetsInUse(project).map((a) => a.src ?? ''));
        if (project.reel) {
          const wanted = new Set(
            reelMediaOf(project.reel).flatMap((m) => (m.asset ? [m.asset] : [])),
          );
          for (const a of project.assets ?? []) {
            if (wanted.has(a.id) && a.status === 'ready' && a.src) uploadSrcs.add(a.src);
          }
        }
        await Promise.all([...uploadSrcs].map((src) => ensureUploaded(src).catch(() => false)));
      } catch (e) {
        if (e instanceof VoiceError) {
          return e.code === 'network'
            ? { ok: false, error: 'network' }
            : { ok: false, error: e.code };
        }
        return { ok: false, error: 'network' };
      }
      try {
        const res = await fetch('/api/renders', {
          method: 'POST',
          headers: { ...(await currentHeaders()), 'content-type': 'application/json' },
          body: JSON.stringify({
            requestId,
            options,
            expectedCost,
            project,
            voicePath,
            ...(videoPath ? { videoPath } : {}),
            ...(clipPaths ? { clipPaths } : {}),
            ...(stockOverlayPaths ? { stockOverlayPaths } : {}),
            ...(stockAudioPaths ? { stockAudioPaths } : {}),
          }),
        });
        return await parseStartResponse(res);
      } catch {
        return { ok: false, error: 'network' };
      }
    },
    watch(renderId, onView, onError) {
      let stop: (() => void) | undefined;
      let stopped = false;
      void (async () => {
        try {
          const db = await getDb();
          const { doc, onSnapshot } = await import('firebase/firestore');
          if (stopped) return;
          stop = onSnapshot(
            doc(db, 'renders', renderId),
            (snap) => {
              if (!snap.exists()) return;
              const view = toView(renderId, snap.data());
              if (view) onView(view);
            },
            (e) => onError?.(e),
          );
        } catch (e) {
          onError?.(e);
        }
      })();
      return () => {
        stopped = true;
        stop?.();
      };
    },
    async check(renderId) {
      const res = await fetch(`/api/renders/${renderId}/check`, {
        method: 'POST',
        headers: await currentHeaders(),
      });
      if (!res.ok) return null;
      return toView(renderId, await res.json());
    },
    async downloadUrl(renderId) {
      const res = await fetch(`/api/renders/${renderId}/download`, {
        headers: await currentHeaders(),
      });
      if (!res.ok) throw new Error(`download failed: ${res.status}`);
      const { url } = DownloadResponseSchema.parse(await res.json());
      // Emulator mode answers a route that streams the bytes: it needs the same headers, so
      // fetch it and hand the browser an object URL.
      if (url.startsWith('/')) {
        const file = await fetch(url, { headers: await currentHeaders() });
        if (!file.ok) throw new Error(`download failed: ${file.status}`);
        return URL.createObjectURL(await file.blob());
      }
      return url;
    },
    async share(renderId) {
      const res = await fetch('/api/shares', {
        method: 'POST',
        headers: { ...(await currentHeaders()), 'content-type': 'application/json' },
        body: JSON.stringify({ renderId }),
      });
      if (!res.ok) throw new Error(`share failed: ${res.status}`);
      const { shareId } = CreateShareResponseSchema.parse(await res.json());
      // R5.3: the link is built from this page's origin.
      return `${window.location.origin}/share/${shareId}`;
    },
    async thumbnailUrl(view) {
      if (!view.thumbPath) return null;
      try {
        const storage = await getStorageClient();
        const { ref, getBlob } = await import('firebase/storage');
        return URL.createObjectURL(await getBlob(ref(storage, view.thumbPath)));
      } catch {
        return null;
      }
    },
  };
}

/** The client for this page load: Firebase configured means cloud (or emulator) mode. */
export function renderClientFor(firebaseOn: boolean): RenderClient {
  return firebaseOn ? cloudRenderClient() : offlineRenderClient();
}
