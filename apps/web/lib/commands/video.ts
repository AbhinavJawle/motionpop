import {
  tileReelScenes,
  videoDisplaySegments,
  type EditorProject,
  type MediaClip,
  type OverlayAnchor,
  type SlotPlacement,
  type VideoCut,
  type VideoPunchIn,
  type VideoStageMode,
  type VideoStageSegment,
  type VideoTrack,
  type Word,
} from '@motionpop/schemas';
import { produce } from 'immer';
import { CommandRejected, type Command } from './command';

function requireVideo(p: EditorProject): VideoTrack {
  if (!p.video) throw new CommandRejected('This project has no video track');
  return p.video;
}

/**
 * Replaces `project.video.src` (e.g. when re-attaching a missing local video on another browser or
 * device), updating `voiceover.originalSrc` as well when it pointed to the same source ref.
 */
export function replaceVideoSource(nextSrc: string): Command {
  let prevVideoSrc: string | undefined;
  let prevOriginalSrc: string | undefined;
  return {
    label: 'Re-attach source video',
    do(p) {
      const vid = requireVideo(p);
      const trimmed = nextSrc.trim();
      if (!trimmed) throw new CommandRejected('Video source cannot be empty');
      prevVideoSrc = vid.src;
      prevOriginalSrc = p.voiceover.originalSrc;
      return produce(p, (d) => {
        if (!d.video) return;
        const old = d.video.src;
        d.video.src = trimmed;
        if (d.voiceover.originalSrc === old) {
          d.voiceover.originalSrc = trimmed;
        }
      });
    },
    undo(p) {
      if (prevVideoSrc === undefined) return p;
      const restoreVideo = prevVideoSrc;
      const restoreOriginal = prevOriginalSrc;
      return produce(p, (d) => {
        if (d.video) d.video.src = restoreVideo;
        if (restoreOriginal === undefined) delete d.voiceover.originalSrc;
        else d.voiceover.originalSrc = restoreOriginal;
      });
    },
  };
}

/** Switch a single slot between transparent `overlay` and full-screen `cutaway` (spec 18 R5.4). */
export function setSlotPlacement(
  slotId: string,
  placement: SlotPlacement,
  overlayAnchor?: OverlayAnchor,
): Command {
  let prevPlacement: SlotPlacement | undefined;
  let prevAnchor: OverlayAnchor | undefined;
  return {
    label: placement === 'overlay' ? 'Set overlay graphic' : 'Set full-screen graphic',
    do(p) {
      const slot = p.slots.find((s) => s.id === slotId);
      if (!slot) throw new CommandRejected(`slot "${slotId}" does not exist`);
      prevPlacement = slot.placement;
      prevAnchor = slot.overlayAnchor;
      return produce(p, (d) => {
        const target = d.slots.find((s) => s.id === slotId);
        if (!target) return;
        target.placement = placement;
        if (placement === 'overlay') {
          target.overlayAnchor =
            overlayAnchor ?? target.overlayAnchor ?? p.video?.defaultOverlayAnchor ?? 'top-right';
        } else {
          delete target.overlayAnchor;
        }
      });
    },
    undo(p) {
      return produce(p, (d) => {
        const target = d.slots.find((s) => s.id === slotId);
        if (!target) return;
        if (prevPlacement === undefined) delete target.placement;
        else target.placement = prevPlacement;
        if (prevAnchor === undefined) delete target.overlayAnchor;
        else target.overlayAnchor = prevAnchor;
      });
    },
  };
}

/** Switch every slot in the project between overlay and cutaway in one undoable step. */
export function setAllSlotsPlacement(
  placement: SlotPlacement,
  overlayAnchor?: OverlayAnchor,
): Command {
  let prev: Map<string, { placement?: SlotPlacement; overlayAnchor?: OverlayAnchor }> | undefined;
  return {
    label: placement === 'overlay' ? 'Make all graphics overlays' : 'Make all graphics full-screen',
    do(p) {
      prev = new Map(
        p.slots.map((s) => [s.id, { placement: s.placement, overlayAnchor: s.overlayAnchor }]),
      );
      const anchor = overlayAnchor ?? p.video?.defaultOverlayAnchor ?? 'top-right';
      return produce(p, (d) => {
        for (const s of d.slots) {
          s.placement = placement;
          if (placement === 'overlay') s.overlayAnchor = s.overlayAnchor ?? anchor;
          else delete s.overlayAnchor;
        }
      });
    },
    undo(p) {
      if (!prev) return p;
      const saved = prev;
      return produce(p, (d) => {
        for (const s of d.slots) {
          const old = saved.get(s.id);
          if (!old) continue;
          if (old.placement === undefined) delete s.placement;
          else s.placement = old.placement;
          if (old.overlayAnchor === undefined) delete s.overlayAnchor;
          else s.overlayAnchor = old.overlayAnchor;
        }
      });
    },
  };
}

/** Toggle a single non-destructive video cut on or off. */
export function toggleVideoCut(cutId: string): Command {
  let prevEnabled: boolean | undefined;
  return {
    label: 'Toggle video cut',
    do(p) {
      const vid = requireVideo(p);
      const cut = vid.cuts.find((c) => c.id === cutId);
      if (!cut) throw new CommandRejected(`cut "${cutId}" does not exist`);
      prevEnabled = cut.enabled;
      return produce(p, (d) => {
        const target = d.video?.cuts.find((c) => c.id === cutId);
        if (target) target.enabled = !target.enabled;
      });
    },
    undo(p) {
      if (prevEnabled === undefined) return p;
      const restore = prevEnabled;
      return produce(p, (d) => {
        const target = d.video?.cuts.find((c) => c.id === cutId);
        if (target) target.enabled = restore;
      });
    },
  };
}

/** Enable or disable every AI cut at once. */
export function setAllVideoCutsEnabled(enabled: boolean): Command {
  let prev: Map<string, boolean> | undefined;
  return {
    label: enabled ? 'Enable all cuts' : 'Restore all cuts',
    do(p) {
      const vid = requireVideo(p);
      prev = new Map(vid.cuts.map((c) => [c.id, c.enabled]));
      return produce(p, (d) => {
        if (!d.video) return;
        for (const c of d.video.cuts) c.enabled = enabled;
      });
    },
    undo(p) {
      if (!prev) return p;
      const saved = prev;
      return produce(p, (d) => {
        if (!d.video) return;
        for (const c of d.video.cuts) {
          const old = saved.get(c.id);
          if (old !== undefined) c.enabled = old;
        }
      });
    },
  };
}

/** Add a manual non-destructive video cut (source-clock integer ms). */
export function addVideoCut(cut: VideoCut): Command {
  return {
    label: 'Cut video range',
    do(p) {
      const vid = requireVideo(p);
      if (cut.endMs <= cut.startMs || cut.endMs > vid.originalDurationMs) {
        throw new CommandRejected('Cut range is outside the video bounds');
      }
      if (vid.cuts.some((c) => c.id === cut.id)) {
        throw new CommandRejected(`cut "${cut.id}" already exists`);
      }
      return produce(p, (d) => {
        d.video?.cuts.push(structuredClone(cut));
        d.video?.cuts.sort((a, b) => a.startMs - b.startMs);
      });
    },
    undo(p) {
      return produce(p, (d) => {
        if (!d.video) return;
        d.video.cuts = d.video.cuts.filter((c) => c.id !== cut.id);
      });
    },
  };
}

const MIN_VIDEO_SPLIT_MARGIN_MS = 250;
const MAX_VIDEO_SPLITS = 64;

/** Add a non-destructive manual razor split point on the source video clock (spec 45 R2.4). */
export function splitVideoAt(sourceMs: number): Command {
  let prevSplits: number[] | undefined;
  return {
    label: 'Split video',
    do(p) {
      const vid = requireVideo(p);
      const at = Math.round(sourceMs);
      if (!Number.isFinite(at)) {
        throw new CommandRejected('Invalid video split timestamp');
      }
      const existing = vid.splits ?? [];
      if (existing.length >= MAX_VIDEO_SPLITS) {
        throw new CommandRejected(`Up to ${MAX_VIDEO_SPLITS} video splits per project`);
      }
      const segs = videoDisplaySegments(vid.originalDurationMs, vid.cuts, existing);
      const hit = segs.find(
        (s) =>
          at >= s.startMs + MIN_VIDEO_SPLIT_MARGIN_MS && at <= s.endMs - MIN_VIDEO_SPLIT_MARGIN_MS,
      );
      if (!hit) {
        throw new CommandRejected(
          'Move the playhead at least 0.25s inside a video segment to split',
        );
      }
      prevSplits = vid.splits;
      return produce(p, (d) => {
        if (!d.video) return;
        d.video.splits = [...(d.video.splits ?? []), at].sort((a, b) => a - b);
      });
    },
    undo(p) {
      return produce(p, (d) => {
        if (!d.video) return;
        if (prevSplits === undefined) delete d.video.splits;
        else d.video.splits = prevSplits;
      });
    },
  };
}

/** Merge two adjacent video segments by removing a manual split seam (spec 45 R2.4). */
export function removeVideoSplit(sourceMs: number): Command {
  let prevSplits: number[] | undefined;
  return {
    label: 'Merge video split',
    do(p) {
      const vid = requireVideo(p);
      const existing = vid.splits ?? [];
      if (!existing.includes(sourceMs)) {
        throw new CommandRejected('Video split point not found');
      }
      prevSplits = vid.splits;
      const next = existing.filter((s) => s !== sourceMs);
      return produce(p, (d) => {
        if (!d.video) return;
        if (next.length === 0) delete d.video.splits;
        else d.video.splits = next;
      });
    },
    undo(p) {
      return produce(p, (d) => {
        if (!d.video) return;
        if (prevSplits === undefined) delete d.video.splits;
        else d.video.splits = prevSplits;
      });
    },
  };
}

/** Delete a video cut cleanly (undoable). */
export function removeVideoCut(cutId: string): Command {
  let prevCuts: VideoCut[] | undefined;
  return {
    label: 'Remove video cut',
    do(p) {
      const vid = requireVideo(p);
      if (!vid.cuts.some((c) => c.id === cutId)) {
        throw new CommandRejected(`cut "${cutId}" does not exist`);
      }
      prevCuts = vid.cuts;
      return produce(p, (d) => {
        if (!d.video) return;
        d.video.cuts = d.video.cuts.filter((c) => c.id !== cutId);
      });
    },
    undo(p) {
      if (!prevCuts) return p;
      const restore = prevCuts;
      return produce(p, (d) => {
        if (!d.video) return;
        d.video.cuts = restore;
      });
    },
  };
}

/** Add a camera punch-in zoom on the cleaned timeline. */
export function addVideoPunchIn(punchIn: VideoPunchIn): Command {
  return {
    label: 'Add punch-in zoom',
    do(p) {
      const vid = requireVideo(p);
      if (punchIn.endMs <= punchIn.startMs || punchIn.endMs > p.durationMs) {
        throw new CommandRejected('Punch-in range is outside the timeline');
      }
      if (vid.punchIns.some((x) => x.id === punchIn.id)) {
        throw new CommandRejected(`punch-in "${punchIn.id}" already exists`);
      }
      return produce(p, (d) => {
        d.video?.punchIns.push(structuredClone(punchIn));
        d.video?.punchIns.sort((a, b) => a.startMs - b.startMs);
      });
    },
    undo(p) {
      return produce(p, (d) => {
        if (!d.video) return;
        d.video.punchIns = d.video.punchIns.filter((x) => x.id !== punchIn.id);
      });
    },
  };
}

/** Remove a camera punch-in zoom. */
export function removeVideoPunchIn(punchInId: string): Command {
  let removed: VideoPunchIn | undefined;
  return {
    label: 'Remove punch-in zoom',
    do(p) {
      const vid = requireVideo(p);
      removed = vid.punchIns.find((x) => x.id === punchInId);
      if (!removed) throw new CommandRejected(`punch-in "${punchInId}" does not exist`);
      return produce(p, (d) => {
        if (!d.video) return;
        d.video.punchIns = d.video.punchIns.filter((x) => x.id !== punchInId);
      });
    },
    undo(p) {
      if (!removed) return p;
      const restore = removed;
      return produce(p, (d) => {
        d.video?.punchIns.push(restore);
        d.video?.punchIns.sort((a, b) => a.startMs - b.startMs);
      });
    },
  };
}

function syncStagesFromSlots(
  slots: EditorProject['slots'],
  existing: VideoStageSegment[] | undefined,
): VideoStageSegment[] {
  const byStart = new Map((existing ?? []).map((s) => [s.startMs, s]));
  return [...slots]
    .sort((a, b) => a.startMs - b.startMs)
    .map((slot, i) => {
      const prev = byStart.get(slot.startMs);
      const mode: VideoStageMode =
        slot.videoStage ?? prev?.mode ?? (slot.placement === 'cutaway' ? 'cutaway' : 'full');
      const clipId = slot.clipId ?? prev?.clipId;
      const clipStartMs = slot.clipStartMs ?? prev?.clipStartMs;
      const clipEndMs = slot.clipEndMs ?? prev?.clipEndMs;
      const clipFocusX = slot.clipFocusX ?? prev?.clipFocusX;
      const clipFocusY = slot.clipFocusY ?? prev?.clipFocusY;
      const clipZoom = slot.clipZoom ?? prev?.clipZoom;
      return {
        id: prev?.id ?? `stage-${slot.id}`,
        startMs: slot.startMs,
        endMs: slot.endMs,
        mode,
        focusX: prev?.focusX ?? 0.5,
        focusY: prev?.focusY ?? 0.35,
        scaleFrom: prev?.scaleFrom ?? (i % 2 === 0 ? 1 : 1.05),
        scaleTo: prev?.scaleTo ?? (i % 2 === 0 ? 1.05 : 1.01),
        ...(prev?.pipCorner ? { pipCorner: prev.pipCorner } : {}),
        ...(clipId ? { clipId } : {}),
        ...(clipStartMs !== undefined ? { clipStartMs } : {}),
        ...(clipEndMs !== undefined ? { clipEndMs } : {}),
        ...(clipFocusX !== undefined ? { clipFocusX } : {}),
        ...(clipFocusY !== undefined ? { clipFocusY } : {}),
        ...(clipZoom !== undefined ? { clipZoom } : {}),
      };
    });
}

/** Switch one beat's coupled video choreography stage (spec 19 R4.3), syncing `video.stages`. */
export function setSlotVideoStage(slotId: string, mode: VideoStageMode): Command {
  let prevSlotStage: VideoStageMode | undefined;
  let prevPlacement: SlotPlacement | undefined;
  let prevStages: VideoStageSegment[] | undefined;
  return {
    label: `Set video stage (${mode})`,
    do(p) {
      const vid = requireVideo(p);
      const slot = p.slots.find((s) => s.id === slotId);
      if (!slot) throw new CommandRejected(`slot "${slotId}" does not exist`);
      prevSlotStage = slot.videoStage;
      prevPlacement = slot.placement;
      prevStages = vid.stages;
      return produce(p, (d) => {
        const target = d.slots.find((s) => s.id === slotId);
        if (!target || !d.video) return;
        target.videoStage = mode;
        target.placement = mode === 'cutaway' ? 'cutaway' : 'overlay';
        d.video.stages = syncStagesFromSlots(d.slots, d.video.stages);
      });
    },
    undo(p) {
      return produce(p, (d) => {
        const target = d.slots.find((s) => s.id === slotId);
        if (target) {
          if (prevSlotStage === undefined) delete target.videoStage;
          else target.videoStage = prevSlotStage;
          if (prevPlacement === undefined) delete target.placement;
          else target.placement = prevPlacement;
        }
        if (d.video) {
          if (prevStages === undefined) delete d.video.stages;
          else d.video.stages = prevStages as typeof d.video.stages;
        }
      });
    },
  };
}

/** Switch every beat's coupled video choreography stage in one undoable step. */
export function setAllSlotsVideoStage(mode: VideoStageMode): Command {
  let prevSlotStates:
    Map<string, { stage?: VideoStageMode; placement?: SlotPlacement }> | undefined;
  let prevStages: VideoStageSegment[] | undefined;
  return {
    label: `Set all beats to ${mode}`,
    do(p) {
      const vid = requireVideo(p);
      prevSlotStates = new Map(
        p.slots.map((s) => [s.id, { stage: s.videoStage, placement: s.placement }]),
      );
      prevStages = vid.stages;
      return produce(p, (d) => {
        if (!d.video) return;
        for (const s of d.slots) {
          s.videoStage = mode;
          s.placement = mode === 'cutaway' ? 'cutaway' : 'overlay';
        }
        d.video.stages = syncStagesFromSlots(d.slots, d.video.stages);
      });
    },
    undo(p) {
      if (!prevSlotStates) return p;
      const saved = prevSlotStates;
      return produce(p, (d) => {
        for (const s of d.slots) {
          const old = saved.get(s.id);
          if (!old) continue;
          if (old.stage === undefined) delete s.videoStage;
          else s.videoStage = old.stage;
          if (old.placement === undefined) delete s.placement;
          else s.placement = old.placement;
        }
        if (d.video) {
          if (prevStages === undefined) delete d.video.stages;
          else d.video.stages = prevStages as typeof d.video.stages;
        }
      });
    },
  };
}

/** Add one or more B-roll / screen-recording / screenshot clips to `project.mediaBin` (spec 20). */
export function addMediaClips(clips: readonly MediaClip[]): Command {
  let prev: MediaClip[] | undefined;
  return {
    label: clips.length === 1 ? `Add clip ${clips[0]?.name ?? ''}` : `Add ${clips.length} clips`,
    do(p) {
      prev = p.mediaBin;
      return produce(p, (d) => {
        const list = d.mediaBin ?? [];
        const existingIds = new Set(list.map((c) => c.id));
        for (const c of clips) {
          if (!existingIds.has(c.id) && list.length < 24) {
            list.push(structuredClone(c));
            existingIds.add(c.id);
          }
        }
        d.mediaBin = list;
      });
    },
    undo(p) {
      return produce(p, (d) => {
        if (prev === undefined) delete d.mediaBin;
        else d.mediaBin = prev as typeof d.mediaBin;
      });
    },
  };
}

/** Replace `project.mediaBin` metadata after multimodal `media.index` enrichment (spec 20). */
export function updateMediaClips(clips: readonly MediaClip[]): Command {
  let prev: MediaClip[] | undefined;
  return {
    label: 'Analyze project clips',
    do(p) {
      prev = p.mediaBin;
      return produce(p, (d) => {
        d.mediaBin = structuredClone([...clips]).slice(0, 24);
      });
    },
    undo(p) {
      return produce(p, (d) => {
        if (prev === undefined) delete d.mediaBin;
        else d.mediaBin = prev as typeof d.mediaBin;
      });
    },
  };
}

/** Remove a clip from `project.mediaBin` and detach it from any slots/stages that referenced it. */
export function removeMediaClip(clipId: string): Command {
  let prevBin: MediaClip[] | undefined;
  let prevSlots: EditorProject['slots'] | undefined;
  let prevStages: VideoStageSegment[] | undefined;
  let prevReel: EditorProject['reel'] | undefined;
  return {
    label: 'Remove clip',
    do(p) {
      prevBin = p.mediaBin;
      prevSlots = p.slots;
      prevStages = p.video?.stages;
      prevReel = p.reel;
      return produce(p, (d) => {
        if (d.mediaBin) {
          d.mediaBin = d.mediaBin.filter((c) => c.id !== clipId);
        }
        for (const s of d.slots) {
          if (s.clipId === clipId) {
            delete s.clipId;
            delete s.clipStartMs;
            delete s.clipEndMs;
            delete s.clipFocusX;
            delete s.clipFocusY;
            delete s.clipZoom;
            if (
              s.videoStage === 'split-top-broll' ||
              s.videoStage === 'screen-showcase' ||
              s.videoStage === 'broll-full' ||
              s.videoStage === 'media-card-pop'
            ) {
              s.videoStage = 'full';
            }
          }
        }
        if (d.video?.stages) {
          d.video.stages = syncStagesFromSlots(d.slots, d.video.stages).map((st) =>
            st.clipId === clipId
              ? {
                  id: st.id,
                  startMs: st.startMs,
                  endMs: st.endMs,
                  mode: st.mode,
                  focusX: st.focusX,
                  focusY: st.focusY,
                  scaleFrom: st.scaleFrom,
                  scaleTo: st.scaleTo,
                  ...(st.pipCorner ? { pipCorner: st.pipCorner } : {}),
                }
              : st,
          );
        }
        if (d.reel) {
          d.reel.scenes = d.reel.scenes.map((sc) =>
            sc.content.template === 'clip' && sc.content.clipId === clipId
              ? d.video
                ? { ...sc, layout: 'speaker' as const, content: { template: 'none' as const } }
                : {
                    ...sc,
                    layout: 'full' as const,
                    content: { template: 'headline' as const, title: 'Key point' },
                  }
              : sc,
          );
        }
      });
    },
    undo(p) {
      return produce(p, (d) => {
        if (prevBin === undefined) delete d.mediaBin;
        else d.mediaBin = prevBin as typeof d.mediaBin;
        if (prevSlots) d.slots = prevSlots as typeof d.slots;
        if (d.video) {
          if (prevStages === undefined) delete d.video.stages;
          else d.video.stages = prevStages as typeof d.video.stages;
        }
        if (prevReel !== undefined) d.reel = prevReel as typeof d.reel;
      });
    },
  };
}

/**
 * Bind (or unbind with `null`) a Media Bin clip to a beat slot (spec 20 R3.4). When binding a
 * clip to a beat that isn't already on a media stage, automatically switches it to the best stage
 * for that clip kind (`screen-showcase`, `media-card-pop`, or `split-top-broll`).
 */
export function setSlotMediaClip(
  slotId: string,
  clipId: string | null,
  opts?: {
    stageMode?: VideoStageMode;
    clipStartMs?: number;
    clipEndMs?: number;
    clipFocusX?: number;
    clipFocusY?: number;
    clipZoom?: number;
  },
): Command {
  let prevSlots: EditorProject['slots'] | undefined;
  let prevStages: VideoStageSegment[] | undefined;
  return {
    label: clipId ? 'Assign clip to beat' : 'Clear beat clip',
    do(p) {
      const slot = p.slots.find((s) => s.id === slotId);
      if (!slot) throw new CommandRejected(`slot "${slotId}" does not exist`);
      const clip = clipId ? p.mediaBin?.find((c) => c.id === clipId) : undefined;
      if (clipId && !clip) throw new CommandRejected(`clip "${clipId}" is not in the Media Bin`);
      prevSlots = p.slots;
      prevStages = p.video?.stages;
      return produce(p, (d) => {
        const target = d.slots.find((s) => s.id === slotId);
        if (!target) return;
        if (!clipId || !clip) {
          delete target.clipId;
          delete target.clipStartMs;
          delete target.clipEndMs;
          delete target.clipFocusX;
          delete target.clipFocusY;
          delete target.clipZoom;
          if (
            target.videoStage === 'split-top-broll' ||
            target.videoStage === 'screen-showcase' ||
            target.videoStage === 'broll-full' ||
            target.videoStage === 'media-card-pop'
          ) {
            target.videoStage = 'full';
          }
        } else {
          const moment = clip.moments?.[0];
          const defaultStage: VideoStageMode =
            clip.kind === 'screen-recording'
              ? 'screen-showcase'
              : clip.kind === 'screenshot' || clip.kind === 'photo'
                ? 'media-card-pop'
                : 'split-top-broll';
          const alreadyMedia =
            target.videoStage === 'split-top-broll' ||
            target.videoStage === 'screen-showcase' ||
            target.videoStage === 'broll-full' ||
            target.videoStage === 'media-card-pop';
          target.videoStage = opts?.stageMode ?? (alreadyMedia ? target.videoStage : defaultStage);
          target.placement = 'overlay';
          target.clipId = clip.id;
          target.clipStartMs = opts?.clipStartMs ?? moment?.startMs ?? 0;
          if (opts?.clipEndMs !== undefined || moment?.endMs !== undefined) {
            target.clipEndMs = opts?.clipEndMs ?? moment?.endMs;
          }
          target.clipFocusX = opts?.clipFocusX ?? moment?.focusX ?? 0.5;
          target.clipFocusY = opts?.clipFocusY ?? moment?.focusY ?? 0.45;
          target.clipZoom =
            opts?.clipZoom ??
            moment?.zoom ??
            (target.videoStage === 'screen-showcase' ? 1.5 : 1.05);
        }
        if (d.video) {
          const nextStages = syncStagesFromSlots(d.slots, d.video.stages);
          if (!clipId) {
            d.video.stages = nextStages.map((st) =>
              st.startMs === target.startMs
                ? {
                    id: st.id,
                    startMs: st.startMs,
                    endMs: st.endMs,
                    mode: target.videoStage ?? 'full',
                    focusX: st.focusX,
                    focusY: st.focusY,
                    scaleFrom: st.scaleFrom,
                    scaleTo: st.scaleTo,
                    ...(st.pipCorner ? { pipCorner: st.pipCorner } : {}),
                  }
                : st,
            );
          } else {
            d.video.stages = nextStages;
          }
        }
      });
    },
    undo(p) {
      return produce(p, (d) => {
        if (prevSlots) d.slots = prevSlots as typeof d.slots;
        if (d.video) {
          if (prevStages === undefined) delete d.video.stages;
          else d.video.stages = prevStages as typeof d.video.stages;
        }
      });
    },
  };
}

/**
 * Applies a freshly re-spliced cleaned voiceover WAV, duration, and retimed transcript after
 * toggling video cuts (spec 21 R4.1), clamping slots/stages to stay timeline-valid.
 */
export function applyResplicedAudio(next: {
  voiceSrc: string;
  durationMs: number;
  words: Word[];
  hasCuts: boolean;
}): Command {
  let prevVoice: EditorProject['voiceover'] | undefined;
  let prevDuration = 0;
  let prevTranscript: EditorProject['transcript'] | undefined;
  let prevSlots: EditorProject['slots'] | undefined;
  let prevStages: VideoStageSegment[] | undefined;
  let prevStockOverlays: EditorProject['stockOverlays'] | undefined;
  let prevStockAudio: EditorProject['stockAudio'] | undefined;
  let prevReel: EditorProject['reel'] | undefined;
  return {
    label: 'Re-sync audio to cuts',
    do(p) {
      prevVoice = p.voiceover;
      prevDuration = p.durationMs;
      prevTranscript = p.transcript;
      prevSlots = p.slots;
      prevStages = p.video?.stages;
      prevStockOverlays = p.stockOverlays;
      prevStockAudio = p.stockAudio;
      prevReel = p.reel;
      const wordCount = next.words.length;
      return produce(p, (d) => {
        d.durationMs = Math.max(100, Math.round(next.durationMs));
        d.voiceover.src = next.voiceSrc;
        d.voiceover.durationMs = d.durationMs;
        if (d.voiceover.cleanup) d.voiceover.cleanup.enabled = next.hasCuts;
        d.transcript = {
          ...d.transcript,
          words: structuredClone(next.words),
          cleaned: next.hasCuts,
        };
        delete d.transcript.prosody;
        // Clamp slots, stages, stock clips & reel scenes cleanly to the new cleaned duration.
        const maxWord = Math.max(0, wordCount - 1);
        d.slots = d.slots
          .filter((s) => s.startMs < d.durationMs)
          .map((s) => ({
            ...s,
            endMs: Math.min(d.durationMs, s.endMs),
            wordStart: Math.min(maxWord, s.wordStart),
            wordEnd: Math.min(maxWord, Math.max(s.wordStart, s.wordEnd)),
          }))
          .filter((s) => s.endMs > s.startMs);
        if (d.video?.stages) {
          d.video.stages = d.video.stages
            .filter((st) => st.startMs < d.durationMs)
            .map((st) => ({ ...st, endMs: Math.min(d.durationMs, st.endMs) }))
            .filter((st) => st.endMs > st.startMs);
        }
        if (d.stockOverlays) {
          const clamped = d.stockOverlays
            .filter((c) => c.startMs < d.durationMs)
            .map((c) => ({ ...c, endMs: Math.min(d.durationMs, c.endMs) }))
            .filter((c) => c.endMs > c.startMs);
          if (clamped.length === 0) delete d.stockOverlays;
          else d.stockOverlays = clamped;
        }
        if (d.stockAudio) {
          const clamped = d.stockAudio
            .filter((c) => c.startMs < d.durationMs)
            .map((c) => ({ ...c, endMs: Math.min(d.durationMs, c.endMs) }))
            .filter((c) => c.endMs > c.startMs);
          if (clamped.length === 0) delete d.stockAudio;
          else d.stockAudio = clamped;
        }
        if (d.reel && d.reel.scenes.length > 0) {
          d.reel.scenes = tileReelScenes(d.reel.scenes, d.durationMs);
        }
      });
    },
    undo(p) {
      return produce(p, (d) => {
        if (prevVoice) d.voiceover = prevVoice as typeof d.voiceover;
        if (prevDuration > 0) d.durationMs = prevDuration;
        if (prevTranscript) d.transcript = prevTranscript as typeof d.transcript;
        if (prevSlots) d.slots = prevSlots as typeof d.slots;
        if (d.video) {
          if (prevStages === undefined) delete d.video.stages;
          else d.video.stages = prevStages as typeof d.video.stages;
        }
        if (prevStockOverlays === undefined) delete d.stockOverlays;
        else d.stockOverlays = prevStockOverlays as typeof d.stockOverlays;
        if (prevStockAudio === undefined) delete d.stockAudio;
        else d.stockAudio = prevStockAudio as typeof d.stockAudio;
        if (prevReel === undefined) delete d.reel;
        else d.reel = prevReel as typeof d.reel;
      });
    },
  };
}
