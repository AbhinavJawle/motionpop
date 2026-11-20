import {
  type EditorProject,
  type OverlayAnchor,
  type SlotPlacement,
  type VideoCut,
  type VideoPunchIn,
  type VideoStageMode,
  type VideoStageSegment,
  type VideoTrack,
} from '@motionpop/schemas';
import { produce } from 'immer';
import { CommandRejected, type Command } from './command';

function requireVideo(p: EditorProject): VideoTrack {
  if (!p.video) throw new CommandRejected('This project has no video track');
  return p.video;
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
  let prevSlotStates: Map<string, { stage?: VideoStageMode; placement?: SlotPlacement }> | undefined;
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
