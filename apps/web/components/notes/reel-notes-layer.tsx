'use client';

import { stageSizeForFormat } from '@motionpop/motion/reel';
import { isVideoReel, type FrameNote, type ReelScene } from '@motionpop/schemas';
import { useCallback, useMemo } from 'react';
import { addReelNote, deleteReelNote, setReelNoteStatus } from '@/lib/commands';
import type { Region } from '@/lib/notes/geometry';
import { reelStage } from '@/lib/reel/note-look';
import { useReelNoteFix } from '@/lib/reel/use-reel-note-fix';
import { useAIActivity } from '@/lib/stores/ai-activity';
import { editorStore, useEditor } from '@/lib/stores/editor';
import { NotesOverlay } from './notes-overlay';

/** The scene on screen at `ms` (scenes tile the reel). */
export function reelSceneAt(scenes: readonly ReelScene[], ms: number): ReelScene | null {
  let found: ReelScene | null = null;
  for (const s of scenes) if (s.startMs <= ms) found = s;
  return found;
}

/** The scene's main graphic as a region of the stage, for the keyboard path (Enter). */
function graphicRegion(sceneId: string): Region | null {
  const stage = reelStage();
  if (!stage) return null;
  const host = stage.querySelector<HTMLElement>(`[data-reel-scene="${CSS.escape(sceneId)}"]`);
  const cam = host?.querySelector<HTMLElement>('[data-reel-part="graphic"]');
  const el = (cam?.firstElementChild as HTMLElement | null) ?? null;
  const sr = stage.getBoundingClientRect();
  const r = el?.getBoundingClientRect();
  if (!r || r.width <= 0 || r.height <= 0 || sr.width <= 0) return null;
  const x0 = Math.max(0, (r.left - sr.left) / sr.width - 0.03);
  const y0 = Math.max(0, (r.top - sr.top) / sr.height - 0.02);
  const x1 = Math.min(1, (r.right - sr.left) / sr.width + 0.03);
  const y1 = Math.min(1, (r.bottom - sr.top) / sr.height + 0.02);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Frame notes on a talking-head reel (spec 29 R1): the shared overlay over the reel preview, for
 * the scene under the playhead. A note can land on the graphic, the speaker, the caption, the
 * scene tag or the hook band; the fix runs `reel.note` on that scene.
 */
export function ReelNotesLayer() {
  const scenes = useEditor((s) => s.project?.reel?.scenes);
  const format = useEditor((s) =>
    isVideoReel(s.project) ? '9:16' : (s.project?.format ?? '16:9'),
  );
  const stage = stageSizeForFormat(format);
  const playheadMs = useEditor((s) => s.playheadMs);
  const {
    route,
    cloudRoute,
    nanoRoute,
    localLlmRoute,
    bothLocalConnected,
    localModel,
    cost,
    run,
  } = useReelNoteFix();
  const working = useAIActivity((s) => (s.busy?.kind === 'note' ? s.busy.slotId : null));
  const scene = useMemo(
    () => (scenes ? reelSceneAt(scenes, playheadMs) : null),
    [scenes, playheadMs],
  );
  const sceneId = scene?.id ?? null;
  const focal = useCallback(() => (sceneId ? graphicRegion(sceneId) : null), [sceneId]);
  if (!scene) return null;
  return (
    <NotesOverlay
      targetId={scene.id}
      notes={(scene.notes ?? []) as FrameNote[]}
      aspect={stage.w / stage.h}
      route={route}
      cloudRoute={cloudRoute}
      nanoRoute={nanoRoute}
      localLlmRoute={localLlmRoute}
      bothLocalConnected={bothLocalConnected}
      localModel={localModel}
      cost={cost}
      noteTime={(ms) => Math.max(0, Math.min(scene.endMs - scene.startMs, ms - scene.startMs))}
      add={(note) => editorStore.getState().exec(addReelNote(scene.id, note))}
      remove={(id) => editorStore.getState().exec(deleteReelNote(scene.id, id))}
      reopen={(id) => editorStore.getState().exec(setReelNoteStatus(scene.id, id, 'open'))}
      run={(id, r) => run(scene.id, id, r)}
      focal={focal}
      working={working}
    />
  );
}
