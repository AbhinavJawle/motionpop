'use client';

import { sanitizeFilename, type EditorProject, type Format } from '@motionpop/schemas';
import {
  Captions,
  Download,
  Image as ImageIcon,
  Link as LinkIcon,
  Play,
  RefreshCw,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Pip } from '@/components/pip/pip';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { spring } from '@/lib/motion/presets';
import { useStill } from '@/lib/motion/use-still';
import { FORMAT_CHOICES, secondsText } from '@/lib/renders/export-flow';
import type { RenderClient, RenderView } from '@/lib/renders/render-client';
import { buildSrt, buildVtt, formatFileSize, hasSubtitleWords } from '@/lib/renders/subtitles';
import { READY_CONFETTI, READY_GLOW_TOP } from './confetti';
import { VideoStill } from './video-still';

/** Starts a browser download of `url` under `filename` (the server's attachment header also names it). */
export function startDownload(
  url: string,
  filename: string,
  opts: { keepBlob?: boolean } = {},
): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // A blob URL (emulator mode) is only needed until the browser has taken it.
  if (url.startsWith('blob:') && !opts.keepBlob) {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

/** Copies `text`; false when the browser refuses (no permission, insecure page). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function downloadBlobText(content: string, filename: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  startDownload(url, filename);
}

/**
 * The ready dialog (design/screens/export-ready.png + spec 46 R1–R2): Pip celebrating, file card
 * with file size and inline Watch MP4 toggle, Download + Share, Publish Kit (.srt, .vtt, cover
 * .jpg), and quick Export Another Format pills.
 */
export function ReadyView({
  view,
  project,
  client,
  isReel = false,
  onExportAnother,
}: {
  view: RenderView;
  project: EditorProject;
  client: RenderClient;
  isReel?: boolean;
  onExportAnother?: (format: Format) => void;
}) {
  const still = useStill();
  const [thumbEntry, setThumbEntry] = useState<{ renderId: string; url: string } | null>(null);
  const [busy, setBusy] = useState<'download' | 'share' | 'watch' | null>(null);
  const [player, setPlayer] = useState<{
    renderId: string;
    url: string;
    open: boolean;
    error: boolean;
  } | null>(null);
  const ownedPlayerBlobRef = useRef<string | null>(null);
  const activeRenderIdRef = useRef(view.renderId);
  const viewRef = useRef(view);
  const thumb = thumbEntry?.renderId === view.renderId ? thumbEntry.url : null;
  const playerUrl = player?.renderId === view.renderId ? player.url : null;
  const playerOpen = player?.renderId === view.renderId ? player.open : false;
  const playerError = player?.renderId === view.renderId ? player.error : false;
  const isTransparent = Boolean(view.transparent);
  const filename = sanitizeFilename(view.title, isTransparent ? 'webm' : 'mp4');
  const sizeLabel = formatFileSize(view.sizeBytes);
  const words = project.transcript.words;
  const hasCaptions = hasSubtitleWords(words);

  useEffect(() => {
    viewRef.current = view;
  });

  useEffect(() => {
    let cancelled = false;
    let made: string | null = null;
    const renderId = view.renderId;
    void client
      .thumbnailUrl(viewRef.current, renderId)
      .then((url) => {
        if (cancelled) {
          if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
          return;
        }
        made = url;
        setThumbEntry(url ? { renderId, url } : null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (made?.startsWith('blob:')) URL.revokeObjectURL(made);
    };
  }, [client, view.renderId, view.thumbPath]);

  useEffect(() => {
    activeRenderIdRef.current = view.renderId;
    return () => {
      activeRenderIdRef.current = '';
      if (ownedPlayerBlobRef.current?.startsWith('blob:')) {
        URL.revokeObjectURL(ownedPlayerBlobRef.current);
        ownedPlayerBlobRef.current = null;
      }
    };
  }, [view.renderId]);

  const download = async () => {
    // Reuse an already-fetched blob URL from the inline player to avoid downloading twice.
    if (playerUrl?.startsWith('blob:')) {
      startDownload(playerUrl, filename, { keepBlob: true });
      return;
    }
    setBusy('download');
    try {
      startDownload(await client.downloadUrl(view.renderId), filename);
    } catch {
      toast.error("Couldn't start the download. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const loadPreviewUrl = async () => {
    const targetRenderId = view.renderId;
    setBusy('watch');
    try {
      const url = await client.downloadUrl(targetRenderId);
      if (activeRenderIdRef.current !== targetRenderId) {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
        return;
      }
      if (ownedPlayerBlobRef.current && ownedPlayerBlobRef.current !== url) {
        URL.revokeObjectURL(ownedPlayerBlobRef.current);
      }
      ownedPlayerBlobRef.current = url.startsWith('blob:') ? url : null;
      setPlayer({ renderId: targetRenderId, url, open: true, error: false });
    } catch {
      toast.error("Couldn't load the exported video preview.");
    } finally {
      setBusy(null);
    }
  };

  const toggleWatch = async () => {
    if (playerOpen) {
      setPlayer((prev) => (prev ? { ...prev, open: false } : null));
      return;
    }
    if (playerUrl && !playerError) {
      setPlayer((prev) => (prev ? { ...prev, open: true } : null));
      return;
    }
    await loadPreviewUrl();
  };

  const share = async () => {
    setBusy('share');
    try {
      const url = await client.share(view.renderId);
      if (url === null) {
        toast('Share links need an account. Download the video instead.');
      } else if (await copyText(url)) {
        toast.success('Link copied');
      } else {
        toast(`Copy this link: ${url}`);
      }
    } catch {
      toast.error("Couldn't make the link. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const ratio = view.format;
  const otherFormats = FORMAT_CHOICES.filter((f) => f !== view.format);

  return (
    <div>
      {/* The oval, Pip and the confetti, positioned as in the frame (dialog pixels, 560 wide). */}
      <div className="relative -mx-8 h-[166px]" style={{ width: 560 }}>
        <div
          aria-hidden
          className="absolute top-0 left-[145px] h-[166px] w-[270px] rounded-[50%] bg-ember-oval"
          style={{
            backgroundImage:
              'radial-gradient(100% 100% at 50% 50%, rgb(255 122 61 / 0.16) 0%, rgb(255 122 61 / 0) 100%)',
          }}
        />
        <motion.div
          className="absolute top-[11px] left-[195px]"
          style={{ rotate: 9 }}
          animate={still ? undefined : { y: [0, -12, 0, -6, 0] }}
          transition={{ duration: 1.1, ease: 'easeOut', delay: 0.1 }}
        >
          <Pip state="idle" size={142.68} decorative look={{ x: 0, y: 0 }} />
        </motion.div>
        {!still &&
          READY_CONFETTI.map(([x, y, w, h, color, angle], i) => (
            <motion.span
              key={i}
              aria-hidden
              data-confetti
              className="absolute rounded-[1px]"
              style={{
                left: x,
                top: y - READY_GLOW_TOP,
                width: w,
                height: h,
                background: color,
                rotate: angle,
              }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ ...spring, delay: 0.15 + i * 0.03 }}
            />
          ))}
      </div>

      <h3 className="mt-[23px] text-center text-[28px] leading-9 font-semibold">
        Your video is ready
      </h3>
      <p className="mt-[5px] text-center text-sm leading-[18px] text-text-2">
        From your voice to something worth sharing.
      </p>

      <div className="mt-6 flex min-h-[110px] items-center gap-4 rounded-card border border-dialog-line bg-ready-card p-[13px]">
        <button
          type="button"
          aria-label="Watch exported video"
          data-testid="ready-watch-btn"
          disabled={busy === 'watch'}
          onClick={() => void toggleWatch()}
          className="group relative h-[81px] w-[144px] shrink-0 overflow-hidden rounded-[4px] bg-frame text-left"
          title={playerOpen ? 'Hide inline video player' : 'Watch exported MP4 right here'}
        >
          <VideoStill
            project={project}
            format={ratio}
            boxW={144}
            boxH={81}
            radius={2.4}
            className="absolute inset-0"
          />
          {thumb && (
            // eslint-disable-next-line @next/next/no-img-element -- a blob or local route, not an optimisable asset
            <img
              src={thumb}
              alt="Thumbnail of your video"
              className="absolute inset-0 size-full object-contain"
              onError={() => setThumbEntry(null)}
            />
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/35 transition-colors group-hover:bg-black/50">
            <span className="flex items-center gap-1 rounded-full bg-black/75 px-2.5 py-1 text-[10.5px] font-semibold text-white backdrop-blur-xs">
              {playerOpen ? (
                <>
                  <X className="size-3" strokeWidth={2.2} aria-hidden />
                  Hide
                </>
              ) : (
                <>
                  <Play className="size-3 fill-current" strokeWidth={2} aria-hidden />
                  Watch
                </>
              )}
            </span>
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm leading-[18px] font-medium text-text">{filename}</div>
          <div className="tabular mt-[7px] font-mono text-[11px] leading-[14px] text-text">
            {view.resolution} · {view.format} · {secondsText(view.durationMs)}
            {sizeLabel ? ` · ${sizeLabel}` : ''}
          </div>
          <div className="mt-[7px] flex items-center gap-2 text-[11px] leading-[14px] text-ready-ink">
            <span>Ready to download</span>
            <span className="text-text-3">·</span>
            <span className="text-text-3">-14 LUFS</span>
            {isTransparent && (
              <>
                <span className="text-text-3">·</span>
                <span className="font-mono text-[10.5px] text-violet-icon">Alpha WebM</span>
              </>
            )}
          </div>
        </div>
      </div>

      {playerOpen && playerUrl && (
        <div
          data-testid="ready-video-panel"
          className="mt-3 overflow-hidden rounded-[12px] border border-dialog-line bg-black p-1.5"
        >
          {playerError ? (
            <div
              role="alert"
              className="flex flex-col items-center gap-2 px-3 py-5 text-center text-xs text-text-2"
            >
              <span>
                Couldn&apos;t play this video inline. You can retry or download the{' '}
                {isTransparent ? 'WebM' : 'MP4'}.
              </span>
              <button
                type="button"
                disabled={busy === 'watch'}
                onClick={() => void loadPreviewUrl()}
                className="rounded-md border border-dialog-line bg-white/[0.06] px-2.5 py-1 font-mono text-[11px] font-medium text-text transition-colors hover:bg-white/[0.12] disabled:opacity-50"
              >
                Retry preview
              </button>
            </div>
          ) : (
            <>
              <div
                data-checkerboard={isTransparent ? 'true' : undefined}
                className="overflow-hidden rounded-[8px]"
                style={
                  isTransparent
                    ? {
                        backgroundColor: '#161521',
                        backgroundImage:
                          'repeating-conic-gradient(rgb(255 255 255 / 0.11) 0% 25%, transparent 0% 50%)',
                        backgroundSize: '16px 16px',
                      }
                    : undefined
                }
              >
                <video
                  data-testid="ready-video-player"
                  src={playerUrl}
                  controls
                  autoPlay
                  playsInline
                  onError={() =>
                    setPlayer((prev) =>
                      prev && prev.renderId === view.renderId ? { ...prev, error: true } : prev,
                    )
                  }
                  className={cn(
                    'mx-auto max-h-[260px] w-full rounded-[8px]',
                    !isTransparent && 'bg-black',
                  )}
                />
              </div>
              <p className="mt-1.5 text-center font-mono text-[10px] text-text-3">
                {isTransparent
                  ? 'Playing your final transparent WebM · alpha channel verified'
                  : 'Playing your final rendered MP4 · audio & tracks verified'}
              </p>
            </>
          )}
        </div>
      )}

      <Button
        variant="primary"
        disabled={busy === 'download'}
        onClick={() => void download()}
        className="mt-5 h-12 w-full justify-start gap-2.5 rounded-chip px-4 pb-3 text-xs leading-4"
      >
        <Download className="size-4" strokeWidth={1.6} aria-hidden />
        Download video
      </Button>
      <Button
        variant="secondary"
        disabled={busy === 'share'}
        onClick={() => void share()}
        className={cn(
          'mt-3 h-11 w-full gap-2.5 rounded-chip border border-secondary-btn-line bg-secondary-btn text-[13px] leading-[17px] font-medium shadow-none hover:bg-secondary-btn',
        )}
      >
        <LinkIcon className="size-5 text-violet-icon" strokeWidth={1.5} aria-hidden />
        Copy share link
      </Button>

      {/* Publish Kit (spec 46 R2.2): instant client-side subtitles + rendered cover thumbnail */}
      <div
        data-testid="publish-kit"
        className="mt-4 rounded-[12px] border border-dialog-line bg-white/[0.025] p-3"
      >
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] leading-4 font-semibold text-text-2">Publish kit</span>
          <span className="text-[10.5px] leading-4 text-text-3">Extra files ready for upload</span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <button
            type="button"
            disabled={!hasCaptions}
            onClick={() => {
              downloadBlobText(
                buildSrt(words),
                sanitizeFilename(view.title, 'srt'),
                'application/x-subrip;charset=utf-8',
              );
              toast.success('Downloaded .srt captions');
            }}
            className="flex flex-col items-start gap-0.5 rounded-[8px] border border-dialog-line bg-white/[0.03] px-2.5 py-2 text-left transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-text">
              <Captions className="size-3.5 text-violet-icon" strokeWidth={1.75} aria-hidden />
              .srt captions
            </span>
            <span className="text-[10px] leading-3.5 text-text-3">YouTube &amp; editors</span>
          </button>

          <button
            type="button"
            disabled={!hasCaptions}
            onClick={() => {
              downloadBlobText(
                buildVtt(words),
                sanitizeFilename(view.title, 'vtt'),
                'text/vtt;charset=utf-8',
              );
              toast.success('Downloaded .vtt captions');
            }}
            className="flex flex-col items-start gap-0.5 rounded-[8px] border border-dialog-line bg-white/[0.03] px-2.5 py-2 text-left transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-text">
              <Captions className="size-3.5 text-mint" strokeWidth={1.75} aria-hidden />
              .vtt captions
            </span>
            <span className="text-[10px] leading-3.5 text-text-3">Web players</span>
          </button>

          <button
            type="button"
            disabled={!thumb}
            onClick={() => {
              if (!thumb) return;
              startDownload(thumb, sanitizeFilename(view.title, 'jpg'), { keepBlob: true });
              toast.success('Downloaded cover image');
            }}
            className="flex flex-col items-start gap-0.5 rounded-[8px] border border-dialog-line bg-white/[0.03] px-2.5 py-2 text-left transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-text">
              <ImageIcon className="size-3.5 text-ember-ink" strokeWidth={1.75} aria-hidden />
              Cover .jpg
            </span>
            <span className="text-[10px] leading-3.5 text-text-3">Video thumbnail</span>
          </button>
        </div>
      </div>

      {onExportAnother && (
        <div
          data-testid="export-another-strip"
          className="mt-3 flex items-center justify-between gap-2 rounded-[10px] border border-dialog-line bg-white/[0.02] px-3 py-2"
        >
          <div className="min-w-0">
            <div className="text-[11px] leading-4 font-medium text-text-2">
              {isReel ? 'Export again' : 'Export another format'}
            </div>
            <div className="text-[10px] leading-3.5 text-text-3">
              {isReel ? 'Change resolution or captions' : 'Reuse your timeline in a new ratio'}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {isReel ? (
              <button
                type="button"
                onClick={() => onExportAnother('9:16')}
                className="inline-flex items-center gap-1 rounded-md border border-dialog-line bg-white/[0.04] px-2.5 py-1 font-mono text-[10.5px] font-medium text-text-2 transition-colors hover:bg-white/[0.09] hover:text-text"
              >
                <RefreshCw className="size-3" strokeWidth={1.8} aria-hidden />
                New export
              </button>
            ) : (
              otherFormats.map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => onExportAnother(fmt)}
                  className="rounded-md border border-dialog-line bg-white/[0.04] px-2.5 py-1 font-mono text-[10.5px] font-medium text-text-2 transition-colors hover:bg-white/[0.09] hover:text-text"
                >
                  {fmt}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      <p className="mt-5 text-center text-[11px] leading-[14px] text-text-2">
        Made with your voice. Finished with motionpop.
      </p>
    </div>
  );
}
