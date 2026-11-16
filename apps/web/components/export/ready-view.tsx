'use client';

import { sanitizeFilename, type EditorProject } from '@motionpop/schemas';
import { Download, Link as LinkIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Pip } from '@/components/pip/pip';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { spring } from '@/lib/motion/presets';
import { useStill } from '@/lib/motion/use-still';
import { secondsText } from '@/lib/renders/export-flow';
import type { RenderClient, RenderView } from '@/lib/renders/render-client';
import { READY_CONFETTI, READY_GLOW_TOP } from './confetti';
import { VideoStill } from './video-still';

/** Starts a browser download of `url` under `filename` (the server's attachment header also names it). */
export function startDownload(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // A blob URL (emulator mode) is only needed until the browser has taken it.
  if (url.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(url), 60_000);
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

/**
 * The ready dialog (design/screens/export-ready.png, design §13.3): Pip celebrating in the dark
 * ember oval with confetti, the file card, "Download video" and "Copy share link". Reduced motion
 * gives a still pose and no confetti. "Download video" uses a download icon, not the PNG's upload
 * icon (a deliberate deviation recorded in screens.md).
 */
export function ReadyView({
  view,
  project,
  client,
}: {
  view: RenderView;
  project: EditorProject;
  client: RenderClient;
}) {
  const still = useStill();
  const [thumb, setThumb] = useState<string | null>(null);
  const [busy, setBusy] = useState<'download' | 'share' | null>(null);
  const filename = sanitizeFilename(view.title, 'mp4');

  useEffect(() => {
    let cancelled = false;
    let made: string | null = null;
    void client
      .thumbnailUrl(view, view.renderId)
      .then((url) => {
        if (cancelled) {
          if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
          return;
        }
        made = url;
        setThumb(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (made?.startsWith('blob:')) URL.revokeObjectURL(made);
    };
  }, [client, view]);

  const download = async () => {
    setBusy('download');
    try {
      startDownload(await client.downloadUrl(view.renderId), filename);
    } catch {
      toast.error("Couldn't start the download. Try again.");
    } finally {
      setBusy(null);
    }
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

      <div className="mt-6 flex h-[110px] items-start gap-4 rounded-card border border-dialog-line bg-ready-card p-[13px]">
        <div className="relative h-[81px] w-[144px] shrink-0 overflow-hidden rounded-[2.4px] bg-frame">
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
              onError={() => setThumb(null)}
            />
          )}
        </div>
        <div className="mt-3 min-w-0">
          <div className="truncate text-sm leading-[18px] text-text">{filename}</div>
          <div className="tabular mt-[9px] font-mono text-[11px] leading-[14px] text-text">
            {view.resolution} · {view.format} · {secondsText(view.durationMs)}
          </div>
          <div className="mt-[9px] text-[11px] leading-[14px] text-ready-ink">
            Ready to download
          </div>
        </div>
      </div>

      <Button
        variant="primary"
        disabled={busy === 'download'}
        onClick={() => void download()}
        className="mt-6 h-12 w-full justify-start gap-2.5 rounded-chip px-4 pb-3 text-xs leading-4"
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

      <p className="mt-[25px] text-center text-[11px] leading-[14px] text-text-2">
        Made with your voice. Finished with motionpop.
      </p>
    </div>
  );
}
