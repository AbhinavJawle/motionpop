'use client';

import { RefreshCw, Upload, VideoOff } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { appAudioStore } from '@/lib/audio/app-audio-store';
import { MAX_VIDEO_BYTES, videoExtFor } from '@/lib/audio/audio-path';
import { replaceVideoSource } from '@/lib/commands';
import { editorStore } from '@/lib/stores/editor';

export type MissingVideoReason = 'local-only' | 'unavailable';

const VIDEO_ACCEPT = 'video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm';

/**
 * Shown in place of an infinite "Loading video…" spinner when a project's source video lives on
 * another browser/device (`idb:` ref) or could not be downloaded from Storage yet. Lets the user
 * retry cloud fetch or re-attach the local video file (which then syncs to Storage if signed in).
 */
export function MissingVideoOverlay({
  reason,
  onRetry,
}: {
  reason: MissingVideoReason;
  onRetry?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFileSelected = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    const ext = videoExtFor(file.type, file.name);
    if (!ext) {
      setError('Pick an MP4, MOV, or WebM video file.');
      return;
    }
    if (file.size <= 0 || file.size > MAX_VIDEO_BYTES) {
      setError('Video must be non-empty and under 500 MB.');
      return;
    }
    const project = editorStore.getState().project;
    if (!project) return;
    setAttaching(true);
    try {
      const ref = await appAudioStore().put(file, { projectId: project.id, kind: 'source' });
      editorStore.getState().exec(replaceVideoSource(ref));
    } catch {
      setError("Couldn't attach that video file. Try again.");
    } finally {
      setAttaching(false);
    }
  };

  return (
    <div
      data-testid="missing-video-overlay"
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
    >
      <div className="flex max-w-[260px] flex-col items-center gap-2.5 rounded-xl border border-white/12 bg-card/95 p-4 text-center shadow-lg">
        <span className="flex size-9 items-center justify-center rounded-full bg-white/8 text-text-2">
          <VideoOff className="size-4" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="space-y-1">
          <p className="text-xs font-semibold text-text">
            Video file is on another browser or device
          </p>
          <p className="text-[11px] leading-[15px] text-text-2">
            {reason === 'local-only'
              ? 'This video was saved locally on another browser/device. Open the project there once while signed in to sync it, or re-attach the video file here.'
              : "Couldn't download this video from cloud storage yet (it may still be uploading on the original device, or you're offline)."}
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={VIDEO_ACCEPT}
          aria-label="Re-attach source video file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            void onFileSelected(file);
          }}
        />

        <div className="flex flex-wrap items-center justify-center gap-2 pt-0.5">
          <Button
            type="button"
            variant="ai"
            size="sm"
            disabled={attaching}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="size-3.5" strokeWidth={2} aria-hidden />
            {attaching ? 'Attaching…' : 'Re-attach video'}
          </Button>
          {reason === 'unavailable' && onRetry && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={attaching}
              onClick={onRetry}
            >
              <RefreshCw className="size-3.5" strokeWidth={2} aria-hidden />
              Retry
            </Button>
          )}
        </div>

        {error && (
          <p role="alert" className="text-[11px] leading-[15px] text-error">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
