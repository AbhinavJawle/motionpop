'use client';

import {
  isMediaStageMode,
  pickOpenTrack,
  resolvedMediaLanes,
  type MediaClip,
  type ReelLayout,
  type ReelTemplate,
  type StockOverlayClip,
} from '@motionpop/schemas';
import {
  Film,
  Image as ImageIcon,
  Loader2,
  MonitorPlay,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { getRouter } from '@/lib/ai/router-client';
import { appAudioStore } from '@/lib/audio/app-audio-store';
import { getAuthSnapshot } from '@/lib/auth/auth-store';
import { cn } from '@/lib/cn';
import {
  addMediaClips,
  addStockOverlay,
  composite,
  removeMediaClip,
  setReel,
  setReelSceneClip,
  setSlotMediaClip,
  updateMediaClips,
  updateReelClipScene,
} from '@/lib/commands';
import { useCreditsClient } from '@/lib/credits/use-credits-client';
import { seekPreview } from '@/lib/editor/preview-bridge';
import { addOwnImage, imageRoleOf } from '@/lib/images/generate';
import { sceneFor } from '@/lib/motion/registry';
import { usePipModel } from '@/lib/pip/model-store';
import { directReelPaid } from '@/lib/reel/media';
import { editorStore, useEditor } from '@/lib/stores/editor';
import { apiHeaders } from '@/lib/users/bootstrap-client';
import {
  MAX_MEDIA_BIN_CLIPS,
  MEDIA_BIN_ACCEPT,
  indexUnindexedMediaClips,
  ingestMediaClipBlob,
  isSupportedMediaBinFile,
  type ProbedMediaClip,
} from '@/lib/video/media-bin';

const HitSchema = z.object({
  id: z.string(),
  title: z.string(),
  thumb: z.string(),
  width: z.number(),
  height: z.number(),
  license: z.string(),
  attribution: z.string(),
});
type Hit = z.infer<typeof HitSchema>;

const StockItemSchema = z.object({
  id: z.string(),
  provider: z.enum(['pixabay', 'pexels', 'wikimedia']),
  kind: z.enum(['video', 'photo']),
  url: z.string(),
  previewUrl: z.string(),
  mimeType: z.string(),
  width: z.number(),
  height: z.number(),
  durationMs: z.number().optional(),
  title: z.string(),
  attribution: z.string(),
  pageUrl: z.string().optional(),
});
type StockItem = z.infer<typeof StockItemSchema>;

function makeStockOverlayFromItem(
  item: StockItem,
  src: string,
  blobType: string,
  playheadMs: number,
  projectDurationMs: number,
  defaultLayout: StockOverlayClip['layout'],
): StockOverlayClip {
  const isVideo = item.kind === 'video' || item.mimeType.startsWith('video/');
  const dur = Math.max(1000, projectDurationMs);
  const clipLen = isVideo ? Math.min(item.durationMs ?? 4500, 5000) : 3500;
  const startMs = Math.max(0, Math.min(Math.max(0, dur - 800), Math.round(playheadMs)));
  const endMs = Math.min(dur, Math.max(startMs + 800, startMs + Math.round(clipLen)));
  return {
    id: `ov-${crypto.randomUUID().slice(0, 8)}`,
    name: item.title.slice(0, 80) || 'Stock clip',
    src,
    kind: isVideo ? 'video' : 'photo',
    mimeType: item.mimeType || blobType || (isVideo ? 'video/mp4' : 'image/jpeg'),
    startMs,
    endMs,
    ...(isVideo && item.durationMs ? { clipDurationMs: item.durationMs } : {}),
    layout: defaultLayout,
    provider: item.provider,
    attribution: item.attribution,
  };
}

function makeStockOverlayFromBinClip(
  clip: MediaClip,
  playheadMs: number,
  projectDurationMs: number,
  defaultLayout: StockOverlayClip['layout'],
): StockOverlayClip {
  const isVideo = clip.mimeType.startsWith('video/');
  const dur = Math.max(1000, projectDurationMs);
  const clipLen = isVideo ? Math.min(clip.durationMs ?? 4500, 5000) : 3500;
  const startMs = Math.max(0, Math.min(Math.max(0, dur - 800), Math.round(playheadMs)));
  const endMs = Math.min(dur, Math.max(startMs + 800, startMs + Math.round(clipLen)));
  return {
    id: `ov-${crypto.randomUUID().slice(0, 8)}`,
    name: clip.name.slice(0, 80),
    src: clip.src,
    kind: isVideo ? 'video' : 'photo',
    mimeType: clip.mimeType,
    startMs,
    endMs,
    ...(isVideo && clip.durationMs ? { clipDurationMs: clip.durationMs } : {}),
    layout: defaultLayout,
    provider: 'upload',
    ...(clip.summary ? { attribution: clip.summary.slice(0, 200) } : {}),
  };
}

function pickOpenMediaTrack(
  project: {
    stockMediaLanes?: readonly { index: number; hidden?: boolean }[] | undefined;
    stockOverlays?: readonly Pick<StockOverlayClip, 'startMs' | 'endMs' | 'track'>[] | undefined;
  },
  startMs: number,
  endMs: number,
): number {
  return pickOpenTrack(
    resolvedMediaLanes(project).filter((l) => !l.hidden),
    project.stockOverlays ?? [],
    startMs,
    endMs,
  );
}

function makeStockMediaClip(
  item: StockItem,
  src: string,
  blobType: string,
  query: string,
): MediaClip {
  const isVideo = item.kind === 'video' || item.mimeType.startsWith('video/');
  return {
    id: `stock-${crypto.randomUUID().slice(0, 8)}`,
    name: `${item.title.slice(0, 56)} (${item.provider})`,
    src,
    kind: isVideo ? 'broll' : 'photo',
    mimeType: item.mimeType || blobType || (isVideo ? 'video/mp4' : 'image/jpeg'),
    width: Math.max(1, item.width),
    height: Math.max(1, item.height),
    ...(isVideo && item.durationMs ? { durationMs: item.durationMs } : {}),
    summary: `${item.title} — ${item.attribution}`,
    tags: query.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6),
    indexedAt: Date.now(),
  };
}

async function headers(): Promise<HeadersInit> {
  const a = getAuthSnapshot();
  return a.status === 'signed-in' ? apiHeaders(() => a.user.getIdToken()) : {};
}

function ClipThumb({ clip }: { clip: MediaClip }) {
  const [url, setUrl] = useState<string | null>(null);
  const isVideo = clip.mimeType.startsWith('video/');

  useEffect(() => {
    let cancelled = false;
    let objUrl: string | null = null;
    void appAudioStore()
      .get(clip.src)
      .then((blob) => {
        if (cancelled || !blob) return;
        objUrl = URL.createObjectURL(blob);
        setUrl(objUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [clip.src]);

  if (!url) {
    return (
      <div className="flex size-full items-center justify-center bg-black/30 text-text-3">
        {clip.kind === 'screen-recording' ? (
          <MonitorPlay className="size-4" strokeWidth={1.5} />
        ) : isVideo ? (
          <Film className="size-4" strokeWidth={1.5} />
        ) : (
          <ImageIcon className="size-4" strokeWidth={1.5} />
        )}
      </div>
    );
  }
  if (isVideo) {
    return (
      <video src={url} muted playsInline preload="metadata" className="size-full object-cover" />
    );
  }
  // Local blob URL preview of user-uploaded screenshot/photo.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={clip.name} className="size-full object-cover" />;
}

const KIND_LABEL: Record<MediaClip['kind'], string> = {
  broll: 'B-Roll',
  'screen-recording': 'Screen',
  screenshot: 'Screenshot',
  photo: 'Photo',
};

/**
 * The Media panel (extended in spec 20 R3.3):
 * 1. "Clips & B-Roll" — project Media Bin for user-uploaded B-roll videos, screen recordings, and
 *    screenshots, indexed multimodally by Gemini 4 Neon and assignable to any beat.
 * 2. "Photos" — Openverse CC0 / CC BY photo search & single-image upload for graphic scenes.
 */
export function MediaPanelBody() {
  const project = useEditor((s) => s.project);
  const selected = useEditor((s) => s.selectedSlotId);
  const playheadMs = useEditor((s) => s.playheadMs);
  const exec = useEditor((s) => s.exec);
  const { client: credits } = useCreditsClient();
  const [tab, setTab] = useState<'clips' | 'photos'>(() =>
    editorStore.getState().project?.video || editorStore.getState().project?.reel ? 'clips' : 'photos',
  );
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [state, setState] = useState<'idle' | 'searching' | 'failed'>('idle');
  const [adding, setAdding] = useState<string | null>(null);
  const [uploadingClips, setUploadingClips] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [weaving, setWeaving] = useState(false);
  const [stockQ, setStockQ] = useState('');
  const [stockKind, setStockKind] = useState<'video' | 'photo'>('video');
  const [stockItems, setStockItems] = useState<StockItem[] | null>(null);
  const [stockState, setStockState] = useState<'idle' | 'searching' | 'failed'>('idle');
  const [addingStockId, setAddingStockId] = useState<string | null>(null);
  const photoFile = useRef<HTMLInputElement>(null);
  const clipFile = useRef<HTMLInputElement>(null);

  if (!project) return null;

  const mediaBin = project.mediaBin ?? [];
  const slot = project.slots.find((s) => s.id === selected) ?? null;
  const activeReelScene = project.reel
    ? (project.reel.scenes.find((s) => playheadMs >= s.startMs && playheadMs < s.endMs) ??
      project.reel.scenes[0] ??
      null)
    : null;
  const activeClipContent: Extract<ReelTemplate, { template: 'clip' }> | null =
    activeReelScene && activeReelScene.content.template === 'clip'
      ? activeReelScene.content
      : null;
  const role = slot ? imageRoleOf(slot.componentId) : null;
  const target = slot && role ? { slot, role } : null;
  const hint = !slot
    ? 'Select a graphic on the timeline, then pick a picture.'
    : !role
      ? `${sceneFor(slot.componentId)?.name ?? 'This graphic'} doesn’t take a picture. Try a stat, a line, a list, a quote or a photo.`
      : `Pictures go into “${sceneFor(slot.componentId)?.name ?? 'the graphic'}”.`;
  const deps = {
    getProject: () => editorStore.getState().project,
    exec: (c: Parameters<typeof exec>[0]) => exec(c),
  };

  const runIndex = async (
    currentClips: readonly MediaClip[],
    preSampled?: ReadonlyMap<string, ProbedMediaClip['frames']>,
  ) => {
    setIndexing(true);
    try {
      const router = await getRouter().catch(() => null);
      const model = usePipModel.getState().model || undefined;
      const res = await indexUnindexedMediaClips(currentClips, router, {
        ...(preSampled ? { preSampled } : {}),
        ...(model ? { model } : {}),
      });
      if (res.indexedCount > 0) {
        exec(updateMediaClips(res.clips));
        toast.success(
          res.source === 'cloud'
            ? `Analyzed ${res.indexedCount} ${res.indexedCount === 1 ? 'clip' : 'clips'} with AI`
            : `Indexed ${res.indexedCount} ${res.indexedCount === 1 ? 'clip' : 'clips'}`,
        );
      }
    } catch {
      toast('Couldn’t analyze clips right now.');
    } finally {
      setIndexing(false);
    }
  };

  /** Indexes any unindexed clips and weaves all Media Bin clips into matching Reel scenes (spec 48 R4.2). */
  const weaveIntoReel = async () => {
    const cur = editorStore.getState().project;
    if (!cur?.reel || !(cur.mediaBin?.length)) return;
    setWeaving(true);
    try {
      let clips = cur.mediaBin;
      if (clips.some((c) => !c.indexedAt)) {
        const router = await getRouter().catch(() => null);
        const res = await indexUnindexedMediaClips(clips, router);
        if (res.indexedCount > 0) {
          clips = res.clips;
          exec(updateMediaClips(clips));
        }
      }
      const directMediaBin = clips.slice(0, 24).map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
        ...(c.durationMs !== undefined ? { durationMs: c.durationMs } : {}),
        summary: c.summary ?? c.name,
        ...(c.tags?.length ? { tags: c.tags.slice(0, 12) } : {}),
        ...(c.moments?.length ? { moments: c.moments.slice(0, 6) } : {}),
      }));
      const words = cur.transcript.words.map((w) => ({
        text: w.text,
        startMs: w.startMs,
        endMs: w.endMs,
      }));
      const directed = await directReelPaid(
        {
          look: cur.reel.look,
          words,
          durationMs: cur.durationMs,
          refId: cur.id,
          ...(!cur.video ? { noVideo: true } : {}),
          mediaBin: directMediaBin,
        },
        { credits },
      );
      const nextPlan = {
        ...directed.plan,
        captions: cur.reel.captions,
        ...(cur.reel.captionStyle ? { captionStyle: cur.reel.captionStyle } : {}),
        ...(cur.reel.theme ? { theme: cur.reel.theme } : {}),
        ...(cur.reel.footage ? { footage: cur.reel.footage } : {}),
        ...(cur.reel.music ? { music: cur.reel.music } : {}),
        ...(cur.reel.sfx ? { sfx: cur.reel.sfx } : {}),
      };
      exec(setReel(nextPlan, 'Weave clips into reel'));
      const clipScenes = nextPlan.scenes.filter((s) => s.content.template === 'clip').length;
      toast.success(
        clipScenes > 0
          ? `Wove ${clipScenes} clip ${clipScenes === 1 ? 'scene' : 'scenes'} into your reel`
          : 'Updated reel scenes with your clips',
      );
    } catch {
      toast('Couldn’t weave clips right now.');
    } finally {
      setWeaving(false);
    }
  };

  const uploadClips = async (files: FileList | File[]) => {
    const list = Array.from(files).filter(isSupportedMediaBinFile);
    if (list.length === 0) {
      toast('Drop MP4, MOV, WebM videos or PNG/JPG screenshots (up to 120 MB each).');
      return;
    }
    const room = Math.max(0, MAX_MEDIA_BIN_CLIPS - mediaBin.length);
    if (room === 0) {
      toast(`You can attach up to ${MAX_MEDIA_BIN_CLIPS} clips per project.`);
      return;
    }
    setUploadingClips(true);
    try {
      const added: MediaClip[] = [];
      const preSampled = new Map<string, ProbedMediaClip['frames']>();
      for (const f of list.slice(0, room)) {
        const probed = await ingestMediaClipBlob(f, {
          name: f.name,
          mimeType: f.type || undefined,
          projectId: project.id,
        });
        added.push(probed.clip);
        if (probed.frames.length) preSampled.set(probed.clip.id, probed.frames);
      }
      if (added.length) {
        exec(addMediaClips(added));
        toast.success(
          `Added ${added.length} ${added.length === 1 ? 'clip' : 'clips'} to Media Bin`,
        );
        const latest = editorStore.getState().project?.mediaBin ?? [...mediaBin, ...added];
        void runIndex(latest, preSampled);
      }
    } catch {
      toast('Couldn’t store one of those clips. Try again.');
    } finally {
      setUploadingClips(false);
    }
  };

  const searchStock = async (nextKind: 'video' | 'photo' = stockKind) => {
    const words = stockQ.trim();
    if (words.length < 2) return;
    setStockState('searching');
    try {
      const orientation =
        project.format === '9:16' ? 'portrait' : project.format === '16:9' ? 'landscape' : 'square';
      const auth = getAuthSnapshot();
      const headers =
        auth.status === 'signed-in' ? await apiHeaders(() => auth.user.getIdToken()) : undefined;
      const res = await fetch(
        `/api/media/stock?q=${encodeURIComponent(words)}&kind=${nextKind}&orientation=${orientation}&limit=6`,
        headers ? { headers } : undefined,
      );
      if (!res.ok) throw new Error(String(res.status));
      const body = z.object({ items: z.array(StockItemSchema) }).parse(await res.json());
      setStockItems(body.items);
      setStockState('idle');
    } catch {
      setStockState('failed');
    }
  };

  const addStockClip = async (item: StockItem) => {
    const cur = editorStore.getState().project;
    if (!cur) return;
    setAddingStockId(item.id);
    try {
      const auth = getAuthSnapshot();
      const headers =
        auth.status === 'signed-in' ? await apiHeaders(() => auth.user.getIdToken()) : undefined;
      const res = await fetch(
        `/api/media/stock?proxy=${encodeURIComponent(item.url)}`,
        headers ? { headers } : undefined,
      );
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      if (blob.size < 1024) throw new Error('empty');
      const src = await appAudioStore().put(blob);
      const playhead = editorStore.getState().playheadMs;
      const defaultLayout: StockOverlayClip['layout'] =
        cur.reel || cur.format === '9:16' ? 'top' : 'card';
      const overlay = makeStockOverlayFromItem(
        item,
        src,
        blob.type,
        playhead,
        cur.durationMs,
        defaultLayout,
      );
      const openTrack = pickOpenMediaTrack(cur, overlay.startMs, overlay.endMs);
      if (openTrack > 0) overlay.track = openTrack;
      const room = Math.max(0, MAX_MEDIA_BIN_CLIPS - (cur.mediaBin?.length ?? 0));
      if (room > 0) {
        const clip = makeStockMediaClip(item, src, blob.type, stockQ);
        exec(composite('Place stock visual', [addMediaClips([clip]), addStockOverlay(overlay)]));
      } else {
        exec(addStockOverlay(overlay));
      }
      seekPreview(overlay.startMs);
      toast.success(
        `Placed on Stock Media at ${(overlay.startMs / 1000).toFixed(1)}s (${item.attribution})`,
      );
    } catch {
      toast('Couldn’t download that stock clip. Try another.');
    } finally {
      setAddingStockId(null);
    }
  };

  const placeBinClipAtPlayhead = (clip: MediaClip) => {
    const cur = editorStore.getState().project;
    if (!cur) return;
    const playhead = editorStore.getState().playheadMs;
    const defaultLayout: StockOverlayClip['layout'] =
      cur.reel || cur.format === '9:16' ? 'top' : 'card';
    const overlay = makeStockOverlayFromBinClip(clip, playhead, cur.durationMs, defaultLayout);
    const openTrack = pickOpenMediaTrack(cur, overlay.startMs, overlay.endMs);
    if (openTrack > 0) overlay.track = openTrack;
    exec(addStockOverlay(overlay));
    seekPreview(overlay.startMs);
    toast.success(
      `Placed “${clip.name}” on Stock Media at ${(overlay.startMs / 1000).toFixed(1)}s`,
    );
  };

  const search = async () => {
    const words = q.trim();
    if (words.length < 2) return;
    setState('searching');
    try {
      const res = await fetch(`/api/media/search?q=${encodeURIComponent(words)}`, {
        headers: await headers(),
      });
      if (!res.ok) throw new Error(String(res.status));
      const body = z.object({ results: z.array(HitSchema) }).parse(await res.json());
      setHits(body.results);
      setState('idle');
    } catch {
      setState('failed');
    }
  };

  const use = async (hit: Hit) => {
    if (!target) return toast(hint);
    setAdding(hit.id);
    try {
      const res = await fetch(`/api/media/image?id=${hit.id}`, { headers: await headers() });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const r = await addOwnImage(deps, {
        slotId: target.slot.id,
        role: target.role,
        subject: hit.title,
        blob,
        source: 'openverse',
        attribution: hit.attribution,
      });
      toast(r.ok ? 'Picture added' : r.reason);
    } catch {
      toast('Couldn’t fetch that picture. Try another.');
    } finally {
      setAdding(null);
    }
  };

  const uploadPhoto = async (f: File) => {
    if (!target) return toast(hint);
    const r = await addOwnImage(deps, {
      slotId: target.slot.id,
      role: target.role,
      subject: f.name.replace(/\.[^.]+$/, ''),
      blob: f,
      source: 'upload',
    });
    toast(r.ok ? 'Picture added' : r.reason);
  };

  const unindexedCount = mediaBin.filter((c) => !c.indexedAt).length;

  return (
    <div className="flex h-full flex-col px-4 pb-4" data-testid="media-panel">
      <header className="-mx-4 flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
        <h2 className="text-[14px] leading-5 font-semibold text-text">Media</h2>
        <Button
          variant="secondary"
          size="sm"
          disabled={uploadingClips}
          onClick={() => (tab === 'clips' ? clipFile.current?.click() : photoFile.current?.click())}
        >
          <Upload className="size-3.5" strokeWidth={1.5} aria-hidden />
          {tab === 'clips' ? (uploadingClips ? 'Adding…' : 'Add clips') : 'Upload'}
        </Button>
        <input
          ref={clipFile}
          data-testid="media-bin-upload-input"
          type="file"
          multiple
          accept={MEDIA_BIN_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const files = e.target.files;
            if (files && files.length > 0) void uploadClips(files);
            e.target.value = '';
          }}
        />
        <input
          ref={photoFile}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void uploadPhoto(f);
          }}
        />
      </header>

      <div className="mt-3 grid grid-cols-2 gap-1 rounded-chip bg-card-2 p-1" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'clips'}
          data-testid="media-tab-clips"
          onClick={() => setTab('clips')}
          className={cn(
            'h-7 rounded-md text-[12px] font-medium transition-colors',
            tab === 'clips' ? 'bg-violet-sel text-text' : 'text-text-2 hover:text-text',
          )}
        >
          Clips &amp; B-Roll{mediaBin.length > 0 ? ` (${mediaBin.length})` : ''}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'photos'}
          data-testid="media-tab-photos"
          onClick={() => setTab('photos')}
          className={cn(
            'h-7 rounded-md text-[12px] font-medium transition-colors',
            tab === 'photos' ? 'bg-violet-sel text-text' : 'text-text-2 hover:text-text',
          )}
        >
          Free Photos
        </button>
      </div>

      {tab === 'clips' ? (
        <div className="-mx-1 mt-3 min-h-0 flex-1 overflow-y-auto px-1 pb-6">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] leading-[15px] text-text-3">
              Upload B-roll, screen recordings, or screenshots. AI watches them and weaves them into
              your beats.
            </p>
            <div className="flex shrink-0 items-center gap-1.5">
              {unindexedCount > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={indexing}
                  onClick={() => void runIndex(mediaBin)}
                >
                  <Sparkles className="size-3" strokeWidth={1.5} aria-hidden />
                  {indexing ? 'Analyzing…' : 'Analyze'}
                </Button>
              )}
              {project.reel && mediaBin.length > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={weaving || indexing}
                  data-testid="media-bin-weave-reel"
                  onClick={() => void weaveIntoReel()}
                >
                  {weaving ? (
                    <Loader2 className="size-3 animate-spin" strokeWidth={1.6} aria-hidden />
                  ) : (
                    <Wand2 className="size-3" strokeWidth={1.6} aria-hidden />
                  )}
                  {weaving ? 'Weaving…' : 'Weave into reel'}
                </Button>
              )}
            </div>
          </div>

          {activeReelScene && activeClipContent && (
            <div
              data-testid="reel-clip-scene-controls"
              className="mt-3 rounded-xl border border-violet/40 bg-violet/8 p-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-text">
                  Active clip scene ({(activeReelScene.startMs / 1000).toFixed(1)}s–
                  {(activeReelScene.endMs / 1000).toFixed(1)}s)
                </span>
                <button
                  type="button"
                  onClick={() => exec(setReelSceneClip(activeReelScene.id, null))}
                  className="text-[10.5px] font-medium text-text-3 hover:text-text"
                >
                  Clear scene
                </button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {project.video && (
                  <label className="flex flex-col gap-1 text-[10px] text-text-3">
                    Layout
                    <select
                      aria-label="Clip scene layout"
                      value={activeReelScene.layout}
                      onChange={(e) =>
                        exec(
                          updateReelClipScene(activeReelScene.id, {
                            layout: e.target.value as ReelLayout,
                          }),
                        )
                      }
                      className="h-7 rounded-md border border-line bg-card px-2 text-[11px] text-text"
                    >
                      <option value="split">Split (top clip + speaker)</option>
                      <option value="pip">Full clip + speaker PiP</option>
                      <option value="full">Full-screen cutaway</option>
                      <option value="card">Card + bottom speaker</option>
                    </select>
                  </label>
                )}
                <label className="flex flex-col gap-1 text-[10px] text-text-3">
                  Framing
                  <select
                    aria-label="Clip scene framing"
                    value={activeClipContent.fit}
                    onChange={(e) =>
                      exec(
                        updateReelClipScene(activeReelScene.id, {
                          fit: e.target.value as 'cover' | 'screen-window' | 'card',
                        }),
                      )
                    }
                    className="h-7 rounded-md border border-line bg-card px-2 text-[11px] text-text"
                  >
                    <option value="cover">Edge-to-edge B-roll</option>
                    <option value="screen-window">3D Screen window</option>
                    <option value="card">Elevated card</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-[10px] text-text-3">
                  Zoom ({activeClipContent.zoom.toFixed(2)}×)
                  <input
                    type="range"
                    min={1}
                    max={2.2}
                    step={0.05}
                    aria-label="Clip scene zoom"
                    value={activeClipContent.zoom}
                    onChange={(e) =>
                      exec(
                        updateReelClipScene(activeReelScene.id, {
                          zoom: Number(e.target.value),
                        }),
                      )
                    }
                    className="h-7 accent-violet"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[10px] text-text-3">
                  Clip audio
                  <select
                    aria-label="Clip scene audio"
                    value={activeClipContent.audioMode}
                    onChange={(e) =>
                      exec(
                        updateReelClipScene(activeReelScene.id, {
                          audioMode: e.target.value as 'mute' | 'duck' | 'solo',
                        }),
                      )
                    }
                    className="h-7 rounded-md border border-line bg-card px-2 text-[11px] text-text"
                  >
                    <option value="mute">Muted (B-roll)</option>
                    <option value="duck">Ducked under voice</option>
                    <option value="solo">Full volume</option>
                  </select>
                </label>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <label className="flex flex-1 items-center justify-between gap-2 text-[10px] text-text-3">
                  <span>Start offset (sec)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    aria-label="Clip start offset seconds"
                    value={Number((activeClipContent.clipStartMs / 1000).toFixed(1))}
                    onChange={(e) => {
                      const v = Math.max(0, Number(e.target.value) || 0);
                      exec(
                        updateReelClipScene(activeReelScene.id, {
                          clipStartMs: Math.round(v * 1000),
                        }),
                      );
                    }}
                    className="h-6 w-16 rounded-md border border-line bg-card px-1.5 text-right font-mono text-[11px] text-text"
                  />
                </label>
              </div>
            </div>
          )}

          {/* Pixabay / stock B-roll & photos search */}
          <div className="mt-3 rounded-xl border border-line bg-card p-2.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-text-2">
                Stock B-Roll &amp; Photos
              </span>
              <div className="flex items-center gap-1 rounded-md bg-card-2 p-0.5 text-[10.5px]">
                <button
                  type="button"
                  onClick={() => {
                    setStockKind('video');
                    if (stockQ.trim().length >= 2) void searchStock('video');
                  }}
                  className={cn(
                    'rounded px-1.5 py-0.5 font-medium transition-colors',
                    stockKind === 'video'
                      ? 'bg-violet-sel text-text'
                      : 'text-text-3 hover:text-text',
                  )}
                >
                  Videos
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStockKind('photo');
                    if (stockQ.trim().length >= 2) void searchStock('photo');
                  }}
                  className={cn(
                    'rounded px-1.5 py-0.5 font-medium transition-colors',
                    stockKind === 'photo'
                      ? 'bg-violet-sel text-text'
                      : 'text-text-3 hover:text-text',
                  )}
                >
                  Photos
                </button>
              </div>
            </div>
            <form
              className="flex items-center gap-2 rounded-chip bg-card-2 px-2.5 shadow-glass focus-within:shadow-violet-glow"
              onSubmit={(e) => {
                e.preventDefault();
                void searchStock();
              }}
            >
              <Search className="size-3.5 shrink-0 text-text-3" strokeWidth={1.5} aria-hidden />
              <input
                value={stockQ}
                onChange={(e) => setStockQ(e.target.value.slice(0, 100))}
                placeholder={
                  stockKind === 'video'
                    ? 'Search stock videos, e.g. neon city'
                    : 'Search stock photos, e.g. coffee desk'
                }
                aria-label="Search stock media"
                className="h-8 w-full bg-transparent text-[12px] text-text outline-none placeholder:text-text-3"
              />
              {stockState === 'searching' && (
                <Loader2 className="size-3.5 shrink-0 animate-spin text-text-3" aria-hidden />
              )}
            </form>
            {stockState === 'failed' && (
              <p className="mt-2 text-[11px] text-warn">Stock search failed. Try again.</p>
            )}
            {stockItems && stockItems.length === 0 && stockState === 'idle' && (
              <p className="mt-2 text-[11px] text-text-3">No stock results. Try simpler words.</p>
            )}
            {stockItems && stockItems.length > 0 && (
              <>
                <ul className="mt-2.5 grid grid-cols-2 gap-1.5">
                  {stockItems.map((item) => {
                    const busy = addingStockId === item.id;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          disabled={addingStockId !== null}
                          onClick={() => void addStockClip(item)}
                          title={`${item.title} (${item.attribution})`}
                          className="group relative block aspect-[4/3] w-full overflow-hidden rounded-lg border border-line bg-card-2 text-left disabled:opacity-60"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- temporary Pixabay search preview */}
                          <img
                            src={item.previewUrl}
                            alt={item.title}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            className="size-full object-cover transition-transform group-hover:scale-105"
                          />
                          <span className="absolute top-1 right-1 inline-flex items-center gap-0.5 rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-medium text-white">
                            {busy ? (
                              <Loader2 className="size-2.5 animate-spin" aria-hidden />
                            ) : (
                              <Plus className="size-2.5" aria-hidden />
                            )}
                            {busy ? 'Placing…' : 'Place'}
                          </span>
                          <span className="absolute inset-x-0 bottom-0 truncate bg-black/65 px-1.5 py-0.5 text-[9px] text-white/90">
                            {item.kind === 'video' && item.durationMs
                              ? `${Math.round(item.durationMs / 1000)}s · `
                              : ''}
                            {item.attribution}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-1.5 text-[10px] text-text-3">
                  Royalty-free stock via{' '}
                  <a
                    href="https://pixabay.com"
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2"
                  >
                    Pixabay
                  </a>{' '}
                  · downloaded locally when added.
                </p>
              </>
            )}
          </div>

          {mediaBin.length === 0 ? (
            <button
              type="button"
              onClick={() => clipFile.current?.click()}
              data-testid="media-bin-empty-drop"
              className="mt-4 flex w-full flex-col items-center justify-center rounded-xl border border-dashed border-white/14 bg-card-2/60 px-4 py-8 text-center transition-colors hover:border-violet/50 hover:bg-violet/6"
            >
              <Film className="size-6 text-violet-ink" strokeWidth={1.5} aria-hidden />
              <span className="mt-2 text-[13px] font-medium text-text">
                Drop B-roll, screen recordings, or screenshots
              </span>
              <span className="mt-1 text-[11px] text-text-3">
                MP4, MOV, WebM, PNG, JPG · Gemini 4 Neon auto-finds zoom points
              </span>
            </button>
          ) : (
            <ul className="mt-3 space-y-2.5" data-testid="media-bin-list">
              {mediaBin.map((clip) => {
                const isUsedOnSelected = slot?.clipId === clip.id;
                const isUsedOnScene = activeClipContent?.clipId === clip.id;
                const activeStage = slot?.videoStage;
                return (
                  <li
                    key={clip.id}
                    data-testid={`media-clip-${clip.id}`}
                    className={cn(
                      'overflow-hidden rounded-xl border bg-card-2 transition-colors',
                      isUsedOnSelected || isUsedOnScene ? 'border-violet/60' : 'border-white/8',
                    )}
                  >
                    <div className="flex gap-2.5 p-2">
                      <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-black/40">
                        <ClipThumb clip={clip} />
                        <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 py-0.5 font-mono text-[9px] text-[#fff]/90">
                          {KIND_LABEL[clip.kind]}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-1">
                          <p
                            className="truncate text-[12px] font-medium text-text"
                            title={clip.name}
                          >
                            {clip.name}
                          </p>
                          <button
                            type="button"
                            aria-label={`Remove ${clip.name}`}
                            onClick={() => exec(removeMediaClip(clip.id))}
                            className="rounded p-1 text-text-3 hover:bg-white/6 hover:text-text"
                          >
                            <Trash2 className="size-3" strokeWidth={1.5} />
                          </button>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-[14px] text-text-2">
                          {clip.summary ??
                            (indexing ? 'Analyzing with Gemini 4 Neon…' : 'Ready to analyze')}
                        </p>
                        {clip.tags && clip.tags.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {clip.tags.slice(0, 4).map((tag) => (
                              <span
                                key={tag}
                                className="rounded bg-white/6 px-1.5 py-0.5 font-mono text-[9px] text-text-3"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-white/6 bg-black/15 px-2.5 py-1.5">
                      <span className="font-mono text-[10px] text-text-3">
                        {clip.durationMs
                          ? `${(clip.durationMs / 1000).toFixed(1)}s`
                          : `${clip.width}×${clip.height}`}
                        {clip.moments?.length ? ` · ${clip.moments.length} focus` : ''}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => placeBinClipAtPlayhead(clip)}
                          className="rounded-md bg-mint/20 px-2 py-0.5 text-[11px] font-medium text-text transition-colors hover:bg-mint/35"
                        >
                          + Timeline
                        </button>
                        {activeReelScene && (
                          <button
                            type="button"
                            data-testid={`media-clip-on-scene-${clip.id}`}
                            onClick={() => {
                              exec(
                                setReelSceneClip(
                                  activeReelScene.id,
                                  isUsedOnScene ? null : clip.id,
                                ),
                              );
                            }}
                            className={cn(
                              'rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors',
                              isUsedOnScene
                                ? 'bg-violet-sel text-text'
                                : 'bg-white/8 text-text-2 hover:bg-white/14 hover:text-text',
                            )}
                          >
                            {isUsedOnScene ? 'On scene ✓' : 'On scene'}
                          </button>
                        )}
                        {slot && (
                          <button
                            type="button"
                            onClick={() => {
                              if (isUsedOnSelected) {
                                exec(setSlotMediaClip(slot.id, null));
                              } else {
                                exec(
                                  setSlotMediaClip(slot.id, clip.id, {
                                    ...(activeStage && isMediaStageMode(activeStage)
                                      ? { stageMode: activeStage }
                                      : {}),
                                  }),
                                );
                              }
                            }}
                            className={cn(
                              'rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors',
                              isUsedOnSelected
                                ? 'bg-violet-sel text-text'
                                : 'bg-white/8 text-text-2 hover:bg-white/14 hover:text-text',
                            )}
                          >
                            {isUsedOnSelected ? 'On beat ✓' : 'On beat'}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <>
          <form
            className="mt-3 flex items-center gap-2 rounded-chip bg-card-2 px-3 shadow-glass focus-within:shadow-violet-glow"
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
          >
            <Search className="size-4 shrink-0 text-text-3" strokeWidth={1.5} aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value.slice(0, 80))}
              placeholder="Search free photos, e.g. cargo ship"
              aria-label="Search free photos"
              className="h-9 w-full bg-transparent text-[13px] text-text outline-none placeholder:text-text-3"
            />
          </form>
          <p className="mt-2 text-[11px] leading-[14px] text-text-3">{hint}</p>
          <div className="-mx-1 mt-3 min-h-0 flex-1 overflow-y-auto px-1 pb-6">
            {state === 'searching' && <p className="text-[12px] text-text-3">Looking…</p>}
            {state === 'failed' && (
              <p className="text-[12px] text-warn">The photo search didn’t answer. Try again.</p>
            )}
            {hits && hits.length === 0 && state === 'idle' && (
              <p className="text-[12px] text-text-3">Nothing found. Try simpler words.</p>
            )}
            {hits && hits.length > 0 && (
              <ul className="grid grid-cols-2 gap-2">
                {hits.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      disabled={adding !== null}
                      onClick={() => void use(h)}
                      title={h.attribution}
                      className="group relative block aspect-[4/3] w-full overflow-hidden rounded-chip border border-line bg-card-2 disabled:opacity-60"
                    >
                      {/* Openverse thumbnails through our route; next/image can't optimise them. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={h.thumb}
                        alt={h.title}
                        loading="lazy"
                        className="size-full object-cover transition-transform group-hover:scale-105"
                      />
                      <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-0.5 text-left text-[9px] text-[#fff]/85">
                        {adding === h.id ? 'Adding…' : h.license === 'cc0' ? 'CC0' : 'CC BY'} ·{' '}
                        {h.title}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-[11px] leading-[14px] text-text-3">
              Photos come from Openverse under CC0 or CC BY. The credit line is kept with each
              picture.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
