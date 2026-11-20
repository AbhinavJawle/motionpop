import {
  type EditorProject,
  type OverlayAnchor,
  type SlotPlacement,
  type VideoCut,
  type VideoPunchIn,
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
