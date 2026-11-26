'use client';

import { reelSfxPlacements } from '@motionpop/motion/reel';
import { SFX_CATALOG, SFX_LABEL, sfxSpec, type SfxCategory, type SfxKind } from '@motionpop/motion/sfx';
import {
  audioOf,
  pickOpenTrack,
  resolvedAudioLanes,
  type AudioSetting,
  type MusicId,
  type StockAudioClip,
} from '@motionpop/schemas';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  Music2,
  Pause,
  Play,
  Plus,
  Search,
  Shuffle,
  Sparkles,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Toggle } from '@/components/ui/toggle';
import { appAudioStore } from '@/lib/audio/app-audio-store';
import { getAuthSnapshot } from '@/lib/auth/auth-store';
import { cn } from '@/lib/cn';
import {
  addReelSound,
  addStockAudio,
  composite,
  setAudio,
  setReelMusicBrief,
} from '@/lib/commands';
import { useAppConfig } from '@/lib/renders/hooks';
import { auditionSynthSfx, synthSfxWavBlob } from '@/lib/sound/audition-sfx';
import { useBedState } from '@/lib/sound/bed-state';
import { auditionStockAudio } from '@/lib/sound/use-stock-audio';
import { editorStore, useEditor } from '@/lib/stores/editor';
import { apiHeaders } from '@/lib/users/bootstrap-client';

const MUSIC: { id: MusicId | null; label: string; hint: string; synth?: boolean }[] = [
  { id: null, label: 'No music', hint: 'Just your voice and the effects.' },
  { id: 'calm-pad', label: 'Calm pad', hint: 'Slow, warm chords at 72 BPM.', synth: true },
  { id: 'steady-pulse', label: 'Steady pulse', hint: 'A soft beat at 96 BPM.', synth: true },
];

const MUSIC_FILTERS = [
  { id: '', label: 'All' },
  { id: 'upbeat', label: 'Upbeat' },
  { id: 'calm', label: 'Calm' },
  { id: 'cinematic', label: 'Cinematic' },
  { id: 'electronic', label: 'Electronic' },
  { id: 'ambient', label: 'Ambient' },
  { id: 'epic', label: 'Epic' },
] as const;

const SFX_FILTERS = [
  { id: '', label: 'All' },
  { id: 'whoosh', label: 'Whoosh' },
  { id: 'impact', label: 'Impact' },
  { id: 'ui', label: 'UI' },
  { id: 'foley', label: 'Foley' },
  { id: 'ambience', label: 'Ambience' },
  { id: 'nature', label: 'Nature' },
  { id: 'magic-scifi', label: 'Sci-Fi' },
] as const;

const TrackSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  kind: z.enum(['music', 'sfx']),
  durationS: z.number(),
  bpm: z.number().nullable(),
  tags: z.array(z.string()),
  licenseId: z.string(),
  licenseName: z.string(),
  commercial: z.boolean(),
  attribution: z.enum(['optional', 'requested', 'required']),
  creditLine: z.string(),
  previewUrl: z.string().nullable(),
  hasOriginal: z.boolean(),
  pageUrl: z.string().nullable(),
});

const SearchResponseSchema = z.object({
  configured: z.boolean(),
  tracks: z.array(TrackSchema),
  total: z.number(),
  cursor: z.string().nullable(),
  otherKind: z.enum(['music', 'sfx']).nullable().optional(),
  otherKindTotal: z.number().nullable().optional(),
});

type SearchTrack = z.infer<typeof TrackSchema>;

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00';
  if (sec < 10) return `${sec.toFixed(1)}s`;
  const total = Math.round(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function makeStockAudioClip(
  track: SearchTrack,
  src: string,
  mimeType: string,
  playheadMs: number,
  projectDurationMs: number,
): StockAudioClip {
  const dur = Math.max(1000, projectDurationMs);
  if (track.kind === 'sfx') {
    const startMs = Math.max(0, Math.min(Math.max(0, dur - 500), Math.round(playheadMs)));
    const rawDurMs = Math.max(800, Math.round((track.durationS || 2) * 1000));
    const endMs = Math.min(dur, Math.max(startMs + 500, startMs + Math.min(rawDurMs, 8000)));
    return {
      id: `sa-${crypto.randomUUID().slice(0, 8)}`,
      name: track.title.slice(0, 80),
      src,
      kind: 'sfx',
      mimeType: mimeType || 'audio/mpeg',
      startMs,
      endMs,
      clipDurationMs: rawDurMs,
      volume: 0.9,
      ...(track.creditLine ? { attribution: track.creditLine.slice(0, 220) } : {}),
    };
  }
  return {
    id: `sa-${crypto.randomUUID().slice(0, 8)}`,
    name: track.title.slice(0, 80),
    src,
    kind: 'music',
    mimeType: mimeType || 'audio/mpeg',
    startMs: 0,
    endMs: dur,
    ...(track.durationS > 0 ? { clipDurationMs: Math.round(track.durationS * 1000) } : {}),
    volume: 0.28,
    ...(track.creditLine ? { attribution: track.creditLine.slice(0, 220) } : {}),
  };
}

function pickOpenAudioTrack(
  project: {
    stockAudioLanes?: readonly { index: number; muted?: boolean }[] | undefined;
    stockAudio?: readonly Pick<StockAudioClip, 'startMs' | 'endMs' | 'track'>[] | undefined;
  },
  startMs: number,
  endMs: number,
): number {
  return pickOpenTrack(
    resolvedAudioLanes(project).filter((l) => !l.muted),
    project.stockAudio ?? [],
    startMs,
    endMs,
  );
}

/** A slider that previews locally and commits one command when the hand stops (one undo). */
function useCommitted(value: number, commit: (v: number) => void) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Follow outside changes (undo, another tab) without an effect: compare during render.
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setLocal(value);
  }
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const onChange = (v: number) => {
    setLocal(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(v), 350);
  };
  return [local, onChange] as const;
}

const db = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} dB`;

function SectionLabel({ children }: { children: string }) {
  return <h3 className="mb-2 text-[12px] leading-4 font-semibold text-text-2">{children}</h3>;
}

/**
 * The Audio panel (spec 12 §8 + Uncommon Ear audio & SFX search):
 * - Mix tab: music beds (synthesized or selected track), level, ducking, and auto SFX.
 * - Search tab: search & audition royalty-free Creative Commons music and sound effects via
 *   Uncommon Ear API (`/api/audio/search`), apply as project music, or download SFX directly.
 */
export function AudioPanelBody() {
  const project = useEditor((s) => s.project);
  const exec = useEditor((s) => s.exec);
  const { musicSynthEnabled } = useAppConfig();
  const bedPlaced = useBedState((s) => s.placements.length);
  const status = useBedState((s) => s.status);
  const audio = project ? audioOf(project) : null;
  const placed =
    project?.reel && audio?.autoSfx !== false
      ? reelSfxPlacements(project.reel, project.durationMs).length
      : bedPlaced;
  const [sfxCat, setSfxCat] = useState<'all' | SfxCategory>('all');
  const apply = (patch: Partial<AudioSetting>) => exec(setAudio(patch));
  const [musicGain, onMusicGain] = useCommitted(audio?.musicGainDb ?? -18, (v) =>
    apply({ musicGainDb: v }),
  );
  const [sfxGain, onSfxGain] = useCommitted(audio?.sfxGainDb ?? 0, (v) => apply({ sfxGainDb: v }));

  const [tab, setTab] = useState<'mix' | 'search'>('mix');
  const [kind, setKind] = useState<'music' | 'sfx'>('music');
  const [tag, setTag] = useState('');
  const [query, setQuery] = useState('');
  const [tracks, setTracks] = useState<SearchTrack[] | null>(null);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [otherKindHint, setOtherKindHint] = useState<{
    kind: 'music' | 'sfx';
    total: number;
  } | null>(null);
  const [configured, setConfigured] = useState(true);
  const [searchState, setSearchState] = useState<'idle' | 'loading' | 'loadingMore' | 'error'>(
    'idle',
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  const stopPreview = useCallback(() => {
    const el = previewRef.current;
    if (el) {
      el.pause();
      el.removeAttribute('src');
    }
    setPlayingId(null);
  }, []);

  useEffect(
    () => () => {
      stopPreview();
      searchAbortRef.current?.abort();
    },
    [stopPreview],
  );

  const runSearch = useCallback(
    async (opts: {
      nextKind: 'music' | 'sfx';
      nextTag: string;
      nextQ: string;
      nextCursor?: string | null;
      append?: boolean;
    }) => {
      searchAbortRef.current?.abort();
      const ac = new AbortController();
      searchAbortRef.current = ac;
      setSearchState(opts.append ? 'loadingMore' : 'loading');
      setErrorMsg(null);
      try {
        const params = new URLSearchParams({ kind: opts.nextKind, limit: '12' });
        if (opts.nextQ.trim()) params.set('q', opts.nextQ.trim());
        if (opts.nextTag) params.set('tag', opts.nextTag);
        if (opts.nextCursor) params.set('cursor', opts.nextCursor);
        const auth = getAuthSnapshot();
        const headers =
          auth.status === 'signed-in' ? await apiHeaders(() => auth.user.getIdToken()) : undefined;
        const res = await fetch(`/api/audio/search?${params.toString()}`, {
          signal: ac.signal,
          ...(headers ? { headers } : {}),
        });
        if (ac.signal.aborted) return;
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error || `Search failed (${res.status})`);
        }
        const data = SearchResponseSchema.parse(await res.json());
        if (ac.signal.aborted) return;
        setConfigured(data.configured);
        setTracks((prev) => (opts.append && prev ? [...prev, ...data.tracks] : data.tracks));
        setTotal(data.total);
        setCursor(data.cursor);
        setOtherKindHint(
          data.otherKind && data.otherKindTotal && data.otherKindTotal > 0
            ? { kind: data.otherKind, total: data.otherKindTotal }
            : null,
        );
        setSearchState('idle');
      } catch (err) {
        if (ac.signal.aborted) return;
        setErrorMsg(err instanceof Error ? err.message : 'Audio search failed');
        setSearchState('error');
      }
    },
    [],
  );

  const openSearchTab = () => {
    setTab('search');
    if (tracks === null && searchState === 'idle') {
      void runSearch({ nextKind: kind, nextTag: tag, nextQ: query });
    }
  };

  const togglePreview = (track: SearchTrack) => {
    if (playingId === track.id) {
      stopPreview();
      return;
    }
    const proxyUrl = `/api/audio/download?id=${encodeURIComponent(track.id)}`;
    const primaryUrl = track.previewUrl ?? proxyUrl;
    stopPreview();
    let triedProxy = primaryUrl === proxyUrl;
    const el = new Audio(primaryUrl);
    el.onended = () => setPlayingId(null);
    el.onerror = () => {
      if (!triedProxy) {
        triedProxy = true;
        el.src = proxyUrl;
        void el.play().catch(() => setPlayingId(null));
        return;
      }
      setPlayingId(null);
      toast('Couldn’t preview that track right now.');
    };
    previewRef.current = el;
    setPlayingId(track.id);
    void el.play().catch(() => {
      if (!triedProxy) {
        triedProxy = true;
        el.src = proxyUrl;
        void el.play().catch(() => setPlayingId(null));
      } else {
        setPlayingId(null);
      }
    });
  };

  const placeTrackOnTimeline = async (track: SearchTrack) => {
    const cur = editorStore.getState().project;
    if (!cur) return;
    stopPreview();
    setApplyingId(track.id);
    try {
      const auth = getAuthSnapshot();
      const headers =
        auth.status === 'signed-in' ? await apiHeaders(() => auth.user.getIdToken()) : undefined;
      const res = await fetch(
        `/api/audio/download?id=${encodeURIComponent(track.id)}`,
        headers ? { headers } : undefined,
      );
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      if (blob.size < 256) throw new Error('empty');
      const src = await appAudioStore().put(blob);
      const clip = makeStockAudioClip(
        track,
        src,
        blob.type || 'audio/mpeg',
        editorStore.getState().playheadMs,
        cur.durationMs,
      );
      const openTrack = pickOpenAudioTrack(cur, clip.startMs, clip.endMs);
      if (openTrack > 0) clip.track = openTrack;
      exec(addStockAudio(clip));
      void auditionStockAudio(src, clip.volume);
      toast.success(
        clip.kind === 'sfx'
          ? `Placed “${track.title}” on Stock Audio at ${(clip.startMs / 1000).toFixed(1)}s`
          : `Added “${track.title}” to Stock Audio timeline`,
      );
    } catch {
      toast('Couldn’t load that audio clip. Try another.');
    } finally {
      setApplyingId(null);
    }
  };

  const downloadTrack = async (track: SearchTrack) => {
    setDownloadingId(track.id);
    try {
      const auth = getAuthSnapshot();
      const headers =
        auth.status === 'signed-in' ? await apiHeaders(() => auth.user.getIdToken()) : undefined;
      const res = await fetch(
        `/api/audio/download?id=${encodeURIComponent(track.id)}&quality=original`,
        headers ? { headers } : undefined,
      );
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const slug = track.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 48);
      a.download = `${slug || track.id}.${blob.type.includes('wav') ? 'wav' : 'mp3'}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`Downloaded “${track.title}”`);
    } catch {
      toast('Couldn’t download that sound.');
    } finally {
      setDownloadingId(null);
    }
  };

  const copyCredit = async (track: SearchTrack) => {
    if (!track.creditLine) return;
    try {
      await navigator.clipboard.writeText(track.creditLine);
      toast.success('Credit line copied');
    } catch {
      toast('Couldn’t copy credit line');
    }
  };

  if (!project || !audio) return null;

  const rows = MUSIC.filter((m) => !m.synth || musicSynthEnabled);
  const current = audio.musicId ?? null;
  const activeCustomName =
    audio.musicId === 'own'
      ? (audio.musicName ?? 'Custom track')
      : project.reel?.music?.src
        ? project.reel.music.brief
        : null;
  const filters = kind === 'sfx' ? SFX_FILTERS : MUSIC_FILTERS;

  return (
    <div className="flex h-full flex-col px-4 pb-4" data-testid="audio-panel">
      <header className="-mx-4 flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
        <h2 className="text-[14px] leading-5 font-semibold text-text">Audio</h2>
        {tab === 'mix' && (
          <Button variant="secondary" size="sm" onClick={openSearchTab}>
            <Search className="size-3.5" strokeWidth={1.5} aria-hidden />
            Browse audio
          </Button>
        )}
      </header>

      <div className="mt-3 grid grid-cols-2 gap-1 rounded-chip bg-card-2 p-1" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'mix'}
          data-testid="audio-tab-mix"
          onClick={() => setTab('mix')}
          className={cn(
            'h-7 rounded-md text-[12px] font-medium transition-colors',
            tab === 'mix' ? 'bg-violet-sel text-text' : 'text-text-2 hover:text-text',
          )}
        >
          Mix &amp; Levels
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'search'}
          data-testid="audio-tab-search"
          onClick={openSearchTab}
          className={cn(
            'h-7 rounded-md text-[12px] font-medium transition-colors',
            tab === 'search' ? 'bg-violet-sel text-text' : 'text-text-2 hover:text-text',
          )}
        >
          Search Audio &amp; SFX
        </button>
      </div>

      {tab === 'mix' ? (
        <div className="-mx-1 mt-1 min-h-0 flex-1 space-y-6 overflow-y-auto px-1 pt-3 pb-6">
          <section>
            <SectionLabel>Music</SectionLabel>
            {activeCustomName && (
              <div className="mb-2 flex items-center justify-between gap-2 rounded-card border border-violet bg-card px-3 py-2.5 shadow-quiet">
                <div className="min-w-0">
                  <span className="flex items-center gap-1.5 text-[13px] leading-[17px] font-medium text-text">
                    <Music2 className="size-3.5 shrink-0 text-violet" strokeWidth={2} aria-hidden />
                    <span className="truncate">{activeCustomName}</span>
                  </span>
                  <span className="block text-[11px] leading-[14px] text-text-3">
                    Active project music · click No music below to remove
                  </span>
                </div>
                <Check className="size-4 shrink-0 text-violet" strokeWidth={2} aria-hidden />
              </div>
            )}
            <div role="radiogroup" aria-label="Music" className="space-y-2">
              {rows.map((m) => {
                const selected = !activeCustomName && current === m.id;
                return (
                  <button
                    key={m.id ?? 'none'}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      if (selected) return;
                      if (project.reel?.music) {
                        exec(
                          composite(m.id ? 'Change music' : 'Remove music', [
                            setReelMusicBrief(null),
                            setAudio({
                              musicId: m.id ?? undefined,
                              musicSrc: undefined,
                              musicName: undefined,
                            }),
                          ]),
                        );
                      } else {
                        apply({
                          musicId: m.id ?? undefined,
                          musicSrc: undefined,
                          musicName: undefined,
                        });
                      }
                    }}
                    className={cn(
                      'flex h-14 w-full items-center justify-between rounded-card border bg-card px-3 text-left shadow-quiet transition-colors',
                      selected ? 'border-violet' : 'border-line hover:border-white/14',
                    )}
                  >
                    <span>
                      <span className="block text-[13px] leading-[17px] font-medium text-text">
                        {m.label}
                      </span>
                      <span className="block text-[11px] leading-[14px] text-text-3">{m.hint}</span>
                    </span>
                    {selected && (
                      <Check className="size-4 text-violet" strokeWidth={2} aria-hidden />
                    )}
                  </button>
                );
              })}
            </div>
            {!musicSynthEnabled && !activeCustomName && (
              <p className="mt-2 text-[11px] leading-[14px] text-text-3">
                Search free CC0 music &amp; SFX in the Search tab.
              </p>
            )}

            {(current || activeCustomName) && (
              <div className="mt-4 space-y-4">
                <div>
                  <div className="mb-2 flex items-center justify-between text-[12px] leading-[16px] text-text-2">
                    <span>Music level</span>
                    <span className="font-mono tabular">{db(musicGain)}</span>
                  </div>
                  <Slider
                    label="Music level"
                    min={-40}
                    max={0}
                    value={musicGain}
                    onChange={onMusicGain}
                    format={db}
                  />
                </div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[13px] leading-[17px] text-text">Duck under my voice</p>
                    <p className="text-[11px] leading-[14px] text-text-3">
                      Music dips while you talk.
                    </p>
                  </div>
                  <Toggle
                    label="Duck under my voice"
                    checked={audio.ducking}
                    onCheckedChange={(ducking) => apply({ ducking })}
                  />
                </div>
              </div>
            )}
          </section>

          <section>
            <SectionLabel>Sound effects</SectionLabel>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[13px] leading-[17px] text-text">Motion sound effects</p>
                <p className="text-[11px] leading-[14px] text-text-3">
                  Transitions, impacts, foley &amp; story accents synced to your timeline.
                </p>
              </div>
              <Toggle
                label="Motion sound effects"
                checked={audio.autoSfx}
                onCheckedChange={(autoSfx) => apply({ autoSfx })}
              />
            </div>
            {audio.autoSfx && (
              <div className="mt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] leading-[16px] text-text-2">
                    <span className="font-mono tabular">
                      {!project.reel && status === 'mixing' ? '…' : placed}
                    </span>{' '}
                    {placed === 1 ? 'sound' : 'sounds'} placed
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => apply({ sfxSeed: audio.sfxSeed + 1 })}
                  >
                    <Shuffle className="size-3.5" strokeWidth={1.5} aria-hidden />
                    Shuffle takes
                  </Button>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between text-[12px] leading-[16px] text-text-2">
                    <span>Effects level</span>
                    <span className="font-mono tabular">{db(sfxGain)}</span>
                  </div>
                  <Slider
                    label="Effects level"
                    min={-24}
                    max={6}
                    value={sfxGain}
                    onChange={onSfxGain}
                    format={db}
                  />
                </div>
              </div>
            )}

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11.5px] font-semibold text-text-2">
                  Built-in SFX library ({SFX_CATALOG.length})
                </span>
                <span className="text-[10.5px] text-text-3">Click to preview · + to place</span>
              </div>
              <div className="mb-2 flex flex-wrap gap-1">
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'impact', label: 'Impacts' },
                    { id: 'reward', label: 'Money & Wins' },
                    { id: 'transition', label: 'Transitions' },
                    { id: 'foley', label: 'Foley' },
                  ] as const
                ).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSfxCat(c.id)}
                    className={cn(
                      'rounded-md px-2 py-0.5 text-[10.5px] font-medium transition-colors',
                      sfxCat === c.id
                        ? 'bg-violet-sel text-text'
                        : 'bg-card-2 text-text-2 hover:bg-white/10 hover:text-text',
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {SFX_CATALOG.filter((e) => sfxCat === 'all' || e.category === sfxCat).map(
                  (entry) => {
                    const placeAtPlayhead = async (kind: SfxKind) => {
                      const cur = editorStore.getState().project;
                      if (!cur) return;
                      const atMs = Math.max(
                        0,
                        Math.min(Math.max(0, cur.durationMs - 50), Math.round(editorStore.getState().playheadMs)),
                      );
                      void auditionSynthSfx(kind, 0, -2);
                      if (cur.reel) {
                        const addCmd = addReelSound({
                          kind,
                          atMs,
                          gainDb: -2,
                          label: SFX_LABEL[kind],
                        });
                        const cmd = !audioOf(cur).autoSfx
                          ? composite('Add sound effect', [setAudio({ autoSfx: true }), addCmd])
                          : addCmd;
                        if (exec(cmd)) {
                          toast.success(`Placed ${entry.name} on Sound at ${(atMs / 1000).toFixed(1)}s`);
                        }
                        return;
                      }
                      const spec = sfxSpec(kind, 0);
                      const src = await appAudioStore().put(synthSfxWavBlob(kind, 0));
                      const endMs = Math.min(cur.durationMs, Math.max(atMs + 250, atMs + spec.lengthMs));
                      const openTrack = pickOpenAudioTrack(cur, atMs, endMs);
                      exec(
                        addStockAudio({
                          id: `sa-${crypto.randomUUID().slice(0, 8)}`,
                          name: entry.name,
                          src,
                          kind: 'sfx',
                          mimeType: 'audio/wav',
                          startMs: atMs,
                          endMs,
                          clipDurationMs: spec.lengthMs,
                          volume: 0.9,
                          ...(openTrack > 0 ? { track: openTrack } : {}),
                        }),
                      );
                      toast.success(`Placed ${entry.name} on Stock Audio at ${(atMs / 1000).toFixed(1)}s`);
                    };
                    return (
                      <div
                        key={entry.id}
                        title={entry.hint}
                        className="flex items-center justify-between gap-1 rounded-lg border border-line bg-card px-2 py-1.5 transition-colors hover:border-white/16"
                      >
                        <button
                          type="button"
                          onClick={() => void auditionSynthSfx(entry.id, 0, -2)}
                          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                        >
                          <Play
                            className="size-2.5 shrink-0 text-flame"
                            strokeWidth={2.2}
                            aria-hidden
                          />
                          <span className="truncate text-[11.5px] font-medium text-text">
                            {entry.name}
                          </span>
                        </button>
                        <button
                          type="button"
                          aria-label={`Add ${entry.name} at playhead`}
                          title={`Place ${entry.name} at playhead`}
                          onClick={() => void placeAtPlayhead(entry.id)}
                          className="flex size-5 shrink-0 items-center justify-center rounded bg-flame/15 text-flame transition-colors hover:bg-flame hover:text-black"
                        >
                          <Plus className="size-3" strokeWidth={2.2} aria-hidden />
                        </button>
                      </div>
                    );
                  },
                )}
              </div>
            </div>
          </section>

          <p className="text-[11px] leading-[14px] text-text-3">
            Built-in studio SFX play identically in preview and export. Browse additional CC0 music
            &amp; foley in the Search tab.
          </p>
        </div>
      ) : (
        <div className="mt-3 flex min-h-0 flex-1 flex-col">
          {/* Kind switch: Music vs Sound effects */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                if (kind === 'music') return;
                stopPreview();
                setKind('music');
                setTag('');
                void runSearch({ nextKind: 'music', nextTag: '', nextQ: query });
              }}
              className={cn(
                'inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md border text-[11.5px] font-medium transition-colors',
                kind === 'music'
                  ? 'border-violet bg-violet-sel text-text'
                  : 'border-line bg-card text-text-2 hover:text-text',
              )}
            >
              <Music2 className="size-3.5" strokeWidth={1.75} aria-hidden />
              Music
            </button>
            <button
              type="button"
              onClick={() => {
                if (kind === 'sfx') return;
                stopPreview();
                setKind('sfx');
                setTag('');
                void runSearch({ nextKind: 'sfx', nextTag: '', nextQ: query });
              }}
              className={cn(
                'inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md border text-[11.5px] font-medium transition-colors',
                kind === 'sfx'
                  ? 'border-violet bg-violet-sel text-text'
                  : 'border-line bg-card text-text-2 hover:text-text',
              )}
            >
              <Sparkles className="size-3.5" strokeWidth={1.75} aria-hidden />
              Sound effects
            </button>
          </div>

          {/* Search box */}
          <form
            className="mt-2.5 flex items-center gap-2 rounded-chip bg-card-2 px-3 shadow-glass focus-within:shadow-violet-glow"
            onSubmit={(e) => {
              e.preventDefault();
              stopPreview();
              void runSearch({ nextKind: kind, nextTag: tag, nextQ: query });
            }}
          >
            <Search className="size-4 shrink-0 text-text-3" strokeWidth={1.5} aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value.slice(0, 100))}
              placeholder={
                kind === 'sfx'
                  ? 'Search SFX, e.g. whoosh, click, rain'
                  : 'Search music, e.g. calm piano, synth'
              }
              aria-label="Search Uncommon Ear audio"
              className="h-9 w-full bg-transparent text-[13px] text-text outline-none placeholder:text-text-3"
            />
            {searchState === 'loading' && (
              <Loader2 className="size-3.5 shrink-0 animate-spin text-text-3" aria-hidden />
            )}
          </form>

          {/* Filter chips */}
          <div className="mt-2 flex flex-wrap gap-1">
            {filters.map((f) => {
              const active = tag === f.id;
              return (
                <button
                  key={f.id || 'all'}
                  type="button"
                  onClick={() => {
                    stopPreview();
                    setTag(f.id);
                    void runSearch({ nextKind: kind, nextTag: f.id, nextQ: query });
                  }}
                  className={cn(
                    'rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors',
                    active
                      ? 'bg-violet-sel text-text'
                      : 'bg-card-2 text-text-2 hover:bg-white/10 hover:text-text',
                  )}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* Results */}
          <div className="-mx-1 mt-3 min-h-0 flex-1 overflow-y-auto px-1 pb-6">
            {!configured && (
              <div className="rounded-xl border border-line bg-card p-3.5 text-[12px] leading-[1.55] text-text-2">
                {process.env.NODE_ENV === 'development' ? (
                  <>
                    <p className="font-semibold text-text">Connect your Uncommon Ear API key</p>
                    <p className="mt-1">
                      Add{' '}
                      <code className="rounded bg-white/8 px-1 py-0.5 text-[11px]">
                        UNCOMMON_EAR_API_KEY
                      </code>{' '}
                      to{' '}
                      <code className="rounded bg-white/8 px-1 py-0.5 text-[11px]">
                        apps/web/.env.local
                      </code>{' '}
                      and restart the dev server to search free Creative Commons music &amp; sound
                      effects.
                    </p>
                    <a
                      href="https://uncommonear.com/docs/api"
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-medium text-violet-ink underline underline-offset-2"
                    >
                      Get a free Uncommon Ear key
                      <ExternalLink className="size-3" aria-hidden />
                    </a>
                  </>
                ) : (
                  <>
                    <p className="font-semibold text-text">Audio library temporarily unavailable</p>
                    <p className="mt-1">
                      Search is offline right now. You can still upload your own music or sound
                      effects.
                    </p>
                  </>
                )}
              </div>
            )}

            {configured && searchState === 'error' && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-[12px] text-warn">
                <span>{errorMsg ?? 'Couldn’t reach Uncommon Ear. Try again.'}</span>
                <button
                  type="button"
                  onClick={() => void runSearch({ nextKind: kind, nextTag: tag, nextQ: query })}
                  className="shrink-0 rounded bg-warn/20 px-2 py-0.5 text-[11px] font-medium hover:bg-warn/30"
                >
                  Retry
                </button>
              </div>
            )}

            {configured && searchState === 'idle' && tracks && tracks.length === 0 && (
              <div className="space-y-2 py-4 text-center text-[12px] text-text-3">
                <p>No matching {kind === 'sfx' ? 'sound effects' : 'music tracks'} found.</p>
                {otherKindHint && (
                  <button
                    type="button"
                    onClick={() => {
                      stopPreview();
                      setKind(otherKindHint.kind);
                      setTag('');
                      void runSearch({
                        nextKind: otherKindHint.kind,
                        nextTag: '',
                        nextQ: query,
                      });
                    }}
                    className="text-violet-ink underline underline-offset-2"
                  >
                    See {otherKindHint.total} matches in{' '}
                    {otherKindHint.kind === 'sfx' ? 'Sound effects' : 'Music'}
                  </button>
                )}
              </div>
            )}

            {configured && tracks && tracks.length > 0 && (
              <>
                <p className="mb-2 text-[10.5px] text-text-3 tabular-nums">
                  {total.toLocaleString()} commercial-safe {kind === 'sfx' ? 'SFX' : 'tracks'} via
                  Uncommon Ear
                </p>
                <ul className="space-y-2">
                  {tracks.map((track) => {
                    const isPlaying = playingId === track.id;
                    const isApplying = applyingId === track.id;
                    const isDownloading = downloadingId === track.id;
                    return (
                      <li
                        key={track.id}
                        className={cn(
                          'rounded-xl border bg-card p-2.5 transition-colors',
                          isPlaying ? 'border-violet' : 'border-line',
                        )}
                      >
                        <div className="flex items-start gap-2.5">
                          <button
                            type="button"
                            aria-label={isPlaying ? `Stop ${track.title}` : `Play ${track.title}`}
                            onClick={() => togglePreview(track)}
                            className={cn(
                              'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border transition-colors',
                              isPlaying
                                ? 'border-violet bg-violet text-white'
                                : 'border-line bg-card-2 text-text hover:border-violet',
                            )}
                          >
                            {isPlaying ? (
                              <Pause className="size-3.5" strokeWidth={2} aria-hidden />
                            ) : (
                              <Play
                                className="size-3.5 translate-x-[0.5px]"
                                strokeWidth={2}
                                aria-hidden
                              />
                            )}
                          </button>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-1.5">
                              <p
                                className="truncate text-[12.5px] font-medium text-text"
                                title={track.title}
                              >
                                {track.title}
                              </p>
                              <span className="shrink-0 font-mono text-[10px] text-text-3 tabular-nums">
                                {formatDuration(track.durationS)}
                              </span>
                            </div>
                            <p className="mt-0.5 truncate text-[11px] text-text-3">
                              {track.artist || 'Uncommon Ear'}
                              {track.bpm ? ` · ${Math.round(track.bpm)} BPM` : ''} ·{' '}
                              <span className="uppercase">{track.licenseName}</span>
                            </p>
                            {track.tags.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {track.tags.slice(0, 3).map((t) => (
                                  <span
                                    key={t}
                                    className="rounded bg-white/6 px-1.5 py-0.5 font-mono text-[9.5px] text-text-3"
                                  >
                                    {t}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="mt-2 flex items-center justify-between gap-1.5 border-t border-white/6 pt-2">
                          <div className="flex items-center gap-1">
                            {track.creditLine && (
                              <button
                                type="button"
                                onClick={() => void copyCredit(track)}
                                title={track.creditLine}
                                className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10.5px] text-text-3 transition-colors hover:bg-white/8 hover:text-text"
                              >
                                <Copy className="size-3" strokeWidth={1.5} aria-hidden />
                                Credit
                              </button>
                            )}
                            {track.pageUrl && (
                              <a
                                href={track.pageUrl}
                                target="_blank"
                                rel="noreferrer"
                                title="Open on Uncommon Ear"
                                className="inline-flex items-center rounded p-1 text-text-3 transition-colors hover:bg-white/8 hover:text-text"
                              >
                                <ExternalLink className="size-3" strokeWidth={1.5} aria-hidden />
                              </a>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isDownloading}
                              onClick={() => void downloadTrack(track)}
                              className="inline-flex items-center gap-1 rounded-md bg-white/8 px-2 py-1 text-[11px] font-medium text-text-2 transition-colors hover:bg-white/14 hover:text-text disabled:opacity-50"
                            >
                              {isDownloading ? (
                                <Loader2 className="size-3 animate-spin" aria-hidden />
                              ) : (
                                <Download className="size-3" strokeWidth={1.75} aria-hidden />
                              )}
                              Save
                            </button>
                            <button
                              type="button"
                              disabled={applyingId !== null}
                              onClick={() => void placeTrackOnTimeline(track)}
                              className="inline-flex items-center gap-1 rounded-md bg-violet-sel px-2 py-1 text-[11px] font-medium text-text transition-colors hover:brightness-110 disabled:opacity-50"
                            >
                              {isApplying ? (
                                <Loader2 className="size-3 animate-spin" aria-hidden />
                              ) : (
                                <Plus className="size-3" strokeWidth={2} aria-hidden />
                              )}
                              {isApplying
                                ? 'Placing…'
                                : track.kind === 'sfx'
                                  ? 'Place at playhead'
                                  : 'Add to timeline'}
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {cursor && (
                  <button
                    type="button"
                    disabled={searchState === 'loadingMore'}
                    onClick={() =>
                      void runSearch({
                        nextKind: kind,
                        nextTag: tag,
                        nextQ: query,
                        nextCursor: cursor,
                        append: true,
                      })
                    }
                    className="mt-3 flex h-8 w-full items-center justify-center rounded-lg border border-line bg-card text-[11.5px] font-medium text-text-2 hover:text-text disabled:opacity-50"
                  >
                    {searchState === 'loadingMore' ? 'Loading more…' : 'Load more'}
                  </button>
                )}

                <p className="mt-4 text-[10.5px] leading-[14px] text-text-3">
                  Catalog by{' '}
                  <a
                    href="https://uncommonear.com"
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2"
                  >
                    Uncommon Ear
                  </a>{' '}
                  (CC0 / CC BY). Check each track&apos;s license &amp; credit line.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
