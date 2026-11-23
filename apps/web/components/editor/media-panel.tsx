'use client';

import { isMediaStageMode, type MediaClip } from '@motionpop/schemas';
import {
  Film,
  Image as ImageIcon,
  MonitorPlay,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { getRouter } from '@/lib/ai/router-client';
import { appAudioStore } from '@/lib/audio/app-audio-store';
import { getAuthSnapshot } from '@/lib/auth/auth-store';
import { cn } from '@/lib/cn';
import { addMediaClips, removeMediaClip, setSlotMediaClip, updateMediaClips } from '@/lib/commands';
import { addOwnImage, imageRoleOf } from '@/lib/images/generate';
import { sceneFor } from '@/lib/motion/registry';
import { usePipModel } from '@/lib/pip/model-store';
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
  const exec = useEditor((s) => s.exec);
  const [tab, setTab] = useState<'clips' | 'photos'>(() =>
    editorStore.getState().project?.video ? 'clips' : 'photos',
  );
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [state, setState] = useState<'idle' | 'searching' | 'failed'>('idle');
  const [adding, setAdding] = useState<string | null>(null);
  const [uploadingClips, setUploadingClips] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const photoFile = useRef<HTMLInputElement>(null);
  const clipFile = useRef<HTMLInputElement>(null);

  if (!project) return null;

  const mediaBin = project.mediaBin ?? [];
  const slot = project.slots.find((s) => s.id === selected) ?? null;
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
            {unindexedCount > 0 && (
              <Button
                variant="secondary"
                size="sm"
                disabled={indexing}
                onClick={() => void runIndex(mediaBin)}
                className="shrink-0"
              >
                <Sparkles className="size-3" strokeWidth={1.5} aria-hidden />
                {indexing ? 'Analyzing…' : 'Analyze'}
              </Button>
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
                const activeStage = slot?.videoStage;
                return (
                  <li
                    key={clip.id}
                    data-testid={`media-clip-${clip.id}`}
                    className={cn(
                      'overflow-hidden rounded-xl border bg-card-2 transition-colors',
                      isUsedOnSelected ? 'border-violet/60' : 'border-white/8',
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
                      <button
                        type="button"
                        disabled={!slot}
                        onClick={() => {
                          if (!slot) return toast('Select a beat on the timeline first.');
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
                          'rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-40',
                          isUsedOnSelected
                            ? 'bg-violet-sel text-text'
                            : 'bg-white/8 text-text-2 hover:bg-white/14 hover:text-text',
                        )}
                      >
                        {isUsedOnSelected ? 'On this beat ✓' : 'Use on beat'}
                      </button>
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
