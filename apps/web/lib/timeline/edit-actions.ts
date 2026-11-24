import {
  audibleStockAudio,
  cleanedDurationFromSegments,
  cleanedToSourceMs,
  keptSourceSegments,
  videoDisplaySegments,
  visibleStockOverlays,
  type VideoCut,
} from '@motionpop/schemas';
import { toast } from 'sonner';
import {
  MIN_STOCK_SPLIT_MS,
  addVideoCut,
  applyResplicedAudio,
  composite,
  splitStockAudio,
  splitStockOverlay,
  splitVideoAt,
} from '@/lib/commands';
import type { PlaybackClock } from '@/lib/editor/playback';
import { seekPreview } from '@/lib/editor/preview-bridge';
import { editorStore } from '@/lib/stores/editor';
import { respliceProjectAudio } from '@/lib/video/resplice-audio';

const canSplitClip = (clip: { startMs: number; endMs: number }, atMs: number): boolean =>
  atMs >= clip.startMs + MIN_STOCK_SPLIT_MS && atMs <= clip.endMs - MIN_STOCK_SPLIT_MS;

/**
 * Splits the active clip at `atMs` (spec 45 R3.3):
 * 1. Selected stock overlay (if playhead is inside it)
 * 2. Selected stock audio (if playhead is inside it)
 * 3. Top-most visible stock overlay under the playhead
 * 4. Top-most audible stock audio under the playhead
 * 5. Main video track segment under the playhead (non-destructive source split)
 */
export function splitAtPlayhead(atMs: number): 'overlay' | 'audio' | 'video' | null {
  const st = editorStore.getState();
  const project = st.project;
  if (!project) return null;
  const at = Math.round(atMs);

  // 1. Selected stock overlay
  if (st.selectedItem?.kind === 'stockOverlay') {
    const selId = st.selectedItem.id;
    const sel = (project.stockOverlays ?? []).find((c) => c.id === selId);
    if (sel && canSplitClip(sel, at)) {
      const rightId = `ov-${crypto.randomUUID().slice(0, 8)}`;
      if (st.exec(splitStockOverlay(sel.id, at, rightId))) {
        st.selectItem({ kind: 'stockOverlay', id: rightId });
        seekPreview(at);
        return 'overlay';
      }
    }
  }

  // 2. Selected stock audio
  if (st.selectedItem?.kind === 'stockAudio') {
    const selId = st.selectedItem.id;
    const sel = (project.stockAudio ?? []).find((c) => c.id === selId);
    if (sel && canSplitClip(sel, at)) {
      const rightId = `sa-${crypto.randomUUID().slice(0, 8)}`;
      if (st.exec(splitStockAudio(sel.id, at, rightId))) {
        st.selectItem({ kind: 'stockAudio', id: rightId });
        return 'audio';
      }
    }
  }

  // 3. Top-most visible stock overlay spanning playhead (highest lane first)
  const overlays = visibleStockOverlays(project);
  for (let i = overlays.length - 1; i >= 0; i--) {
    const clip = overlays[i]!;
    if (canSplitClip(clip, at)) {
      const rightId = `ov-${crypto.randomUUID().slice(0, 8)}`;
      if (st.exec(splitStockOverlay(clip.id, at, rightId))) {
        st.selectItem({ kind: 'stockOverlay', id: rightId });
        seekPreview(at);
        return 'overlay';
      }
    }
  }

  // 4. Top-most audible stock audio spanning playhead (highest lane first)
  const audioClips = [...audibleStockAudio(project)].sort(
    (a, b) => (a.track ?? 0) - (b.track ?? 0),
  );
  for (let i = audioClips.length - 1; i >= 0; i--) {
    const clip = audioClips[i]!;
    if (canSplitClip(clip, at)) {
      const rightId = `sa-${crypto.randomUUID().slice(0, 8)}`;
      if (st.exec(splitStockAudio(clip.id, at, rightId))) {
        st.selectItem({ kind: 'stockAudio', id: rightId });
        return 'audio';
      }
    }
  }

  // 5. Main video track segment under playhead
  if (project.video) {
    const kept = keptSourceSegments(project.video.originalDurationMs, project.video.cuts);
    const sourceMs = Math.round(cleanedToSourceMs(at, kept));
    const displaySegs = videoDisplaySegments(
      project.video.originalDurationMs,
      project.video.cuts,
      project.video.splits,
    );
    const hit = displaySegs.find(
      (s) => sourceMs >= s.startMs + MIN_STOCK_SPLIT_MS && sourceMs <= s.endMs - MIN_STOCK_SPLIT_MS,
    );
    if (hit && st.exec(splitVideoAt(sourceMs))) {
      st.selectItem({ kind: 'videoSegment', startMs: sourceMs, endMs: hit.endMs });
      return 'video';
    }
  }

  st.reject('Split', 'Move the playhead inside a video, media, or audio clip to split.');
  return null;
}

let cuttingVideo = false;

/**
 * Non-destructively cuts a source-clock video segment `[startMs, endMs]` (spec 45 R2.5),
 * re-splicing cleaned audio/transcript/duration atomically in a single undoable step.
 */
export async function cutVideoSegment(
  seg: { startMs: number; endMs: number },
  clock?: PlaybackClock,
): Promise<boolean> {
  if (cuttingVideo) return false;
  const st = editorStore.getState();
  const project = st.project;
  if (!project?.video) return false;

  const cut: VideoCut = {
    id: `manual-${crypto.randomUUID().slice(0, 8)}`,
    startMs: Math.round(seg.startMs),
    endMs: Math.round(seg.endMs),
    kind: 'manual',
    reason: 'Manual cut',
    enabled: true,
  };
  const nextCuts = [...project.video.cuts, cut].sort((a, b) => a.startMs - b.startMs);
  const remaining = keptSourceSegments(project.video.originalDurationMs, nextCuts);
  const remainingDur = cleanedDurationFromSegments(remaining);
  if (remaining.length === 0 || remainingDur < 250) {
    st.reject('Cut video segment', 'Keep at least one segment of the video.');
    return false;
  }

  clock?.pause();
  cuttingVideo = true;
  try {
    const draft = {
      ...project,
      video: { ...project.video, cuts: nextCuts },
    };
    const spliced = await respliceProjectAudio(draft).catch(() => null);
    const cmd = spliced
      ? composite('Cut video segment', [addVideoCut(cut), applyResplicedAudio(spliced)])
      : addVideoCut(cut);
    const ok = editorStore.getState().exec(cmd);
    if (ok) {
      editorStore.getState().selectItem(null);
      const latest = editorStore.getState().project;
      const curMs = clock ? clock.currentMs : editorStore.getState().playheadMs;
      const clampedPlayhead = Math.min(
        curMs,
        Math.max(0, (latest?.durationMs ?? remainingDur) - 100),
      );
      if (clock) {
        clock.seek(clampedPlayhead);
      } else {
        editorStore.getState().setPlayhead(clampedPlayhead);
        seekPreview(clampedPlayhead);
      }
      toast.success(`Cut ${((cut.endMs - cut.startMs) / 1000).toFixed(1)}s from video`);
    }
    return ok;
  } finally {
    cuttingVideo = false;
  }
}
