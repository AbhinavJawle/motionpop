import {
  MAX_TIMELINE_LANES,
  StockAudioClipSchema,
  StockOverlayClipSchema,
  resolvedAudioLanes,
  resolvedMediaLanes,
  type StockAudioClip,
  type StockOverlayClip,
  type TimelineLane,
} from '@motionpop/schemas';
import { produce } from 'immer';
import { CommandRejected, type Command } from './command';

const MAX_STOCK_OVERLAYS = 64;
const MAX_STOCK_AUDIO = 96;
export const MIN_STOCK_SPLIT_MS = 250;

export function addStockOverlay(raw: StockOverlayClip): Command {
  const parsed = StockOverlayClipSchema.safeParse(raw);
  let prev: StockOverlayClip[] | undefined;
  return {
    label: `Place ${raw.kind === 'video' ? 'stock video' : 'stock photo'}`,
    do(p) {
      if (!parsed.success) throw new CommandRejected('Invalid stock visual clip');
      const existing = p.stockOverlays ?? [];
      if (existing.length >= MAX_STOCK_OVERLAYS) {
        throw new CommandRejected(`Up to ${MAX_STOCK_OVERLAYS} stock visual clips per project`);
      }
      prev = existing;
      return produce(p, (d) => {
        d.stockOverlays = [...(d.stockOverlays ?? []), parsed.data];
      });
    },
    undo(p) {
      return produce(p, (d) => {
        if (!prev || prev.length === 0) delete d.stockOverlays;
        else d.stockOverlays = prev;
      });
    },
  };
}

export function updateStockOverlay(
  id: string,
  patch: Partial<
    Pick<StockOverlayClip, 'startMs' | 'endMs' | 'layout' | 'sourceOffsetMs' | 'track'>
  >,
): Command {
  let prev: StockOverlayClip | undefined;
  return {
    label: 'Update stock visual',
    do(p) {
      const current = (p.stockOverlays ?? []).find((c) => c.id === id);
      if (!current) throw new CommandRejected(`Stock visual "${id}" not found`);
      const next = StockOverlayClipSchema.safeParse({ ...current, ...patch });
      if (!next.success) throw new CommandRejected('Invalid stock visual timing');
      prev = current;
      return produce(p, (d) => {
        const idx = (d.stockOverlays ?? []).findIndex((c) => c.id === id);
        if (idx >= 0 && d.stockOverlays) d.stockOverlays[idx] = next.data;
      });
    },
    undo(p) {
      if (!prev) return p;
      const saved = prev;
      return produce(p, (d) => {
        const idx = (d.stockOverlays ?? []).findIndex((c) => c.id === id);
        if (idx >= 0 && d.stockOverlays) d.stockOverlays[idx] = saved;
      });
    },
  };
}

export function splitStockOverlay(id: string, splitMs: number, rightId: string): Command {
  let prev: StockOverlayClip[] | undefined;
  return {
    label: 'Split stock visual',
    do(p) {
      const existing = p.stockOverlays ?? [];
      const idx = existing.findIndex((c) => c.id === id);
      if (idx < 0) throw new CommandRejected(`Stock visual "${id}" not found`);
      if (existing.length >= MAX_STOCK_OVERLAYS) {
        throw new CommandRejected(`Up to ${MAX_STOCK_OVERLAYS} stock visual clips per project`);
      }
      if (!rightId || existing.some((c) => c.id === rightId)) {
        throw new CommandRejected('Duplicate clip id for split');
      }
      const clip = existing[idx]!;
      const at = Math.round(splitMs);
      if (
        !Number.isFinite(at) ||
        at < clip.startMs + MIN_STOCK_SPLIT_MS ||
        at > clip.endMs - MIN_STOCK_SPLIT_MS
      ) {
        throw new CommandRejected('Move the playhead inside the clip to split it');
      }
      const leftParsed = StockOverlayClipSchema.safeParse({ ...clip, endMs: at });
      const rightParsed = StockOverlayClipSchema.safeParse({
        ...clip,
        id: rightId,
        startMs: at,
        sourceOffsetMs: (clip.sourceOffsetMs ?? 0) + (at - clip.startMs),
      });
      if (!leftParsed.success || !rightParsed.success) {
        throw new CommandRejected('Invalid split range');
      }
      prev = existing;
      return produce(p, (d) => {
        const list = d.stockOverlays ?? [];
        list.splice(idx, 1, leftParsed.data, rightParsed.data);
        d.stockOverlays = list;
      });
    },
    undo(p) {
      if (!prev) return p;
      const saved = prev;
      return produce(p, (d) => {
        d.stockOverlays = saved;
      });
    },
  };
}

export function removeStockOverlay(id: string): Command {
  let prev: StockOverlayClip[] | undefined;
  return {
    label: 'Remove stock visual',
    do(p) {
      const existing = p.stockOverlays ?? [];
      if (!existing.some((c) => c.id === id)) {
        throw new CommandRejected(`Stock visual "${id}" not found`);
      }
      prev = existing;
      return produce(p, (d) => {
        const next = (d.stockOverlays ?? []).filter((c) => c.id !== id);
        if (next.length === 0) delete d.stockOverlays;
        else d.stockOverlays = next;
      });
    },
    undo(p) {
      if (!prev) return p;
      const saved = prev;
      return produce(p, (d) => {
        d.stockOverlays = saved;
      });
    },
  };
}

export function addStockAudio(raw: StockAudioClip): Command {
  const parsed = StockAudioClipSchema.safeParse(raw);
  let prev: StockAudioClip[] | undefined;
  return {
    label: `Place ${raw.kind === 'sfx' ? 'sound effect' : 'music track'}`,
    do(p) {
      if (!parsed.success) throw new CommandRejected('Invalid stock audio clip');
      const existing = p.stockAudio ?? [];
      if (existing.length >= MAX_STOCK_AUDIO) {
        throw new CommandRejected(`Up to ${MAX_STOCK_AUDIO} stock audio clips per project`);
      }
      prev = existing;
      return produce(p, (d) => {
        d.stockAudio = [...(d.stockAudio ?? []), parsed.data];
      });
    },
    undo(p) {
      return produce(p, (d) => {
        if (!prev || prev.length === 0) delete d.stockAudio;
        else d.stockAudio = prev;
      });
    },
  };
}

export function updateStockAudio(
  id: string,
  patch: Partial<Pick<StockAudioClip, 'startMs' | 'endMs' | 'volume' | 'sourceOffsetMs' | 'track'>>,
): Command {
  let prev: StockAudioClip | undefined;
  return {
    label: 'Update stock audio',
    do(p) {
      const current = (p.stockAudio ?? []).find((c) => c.id === id);
      if (!current) throw new CommandRejected(`Stock audio "${id}" not found`);
      const next = StockAudioClipSchema.safeParse({ ...current, ...patch });
      if (!next.success) throw new CommandRejected('Invalid stock audio timing');
      prev = current;
      return produce(p, (d) => {
        const idx = (d.stockAudio ?? []).findIndex((c) => c.id === id);
        if (idx >= 0 && d.stockAudio) d.stockAudio[idx] = next.data;
      });
    },
    undo(p) {
      if (!prev) return p;
      const saved = prev;
      return produce(p, (d) => {
        const idx = (d.stockAudio ?? []).findIndex((c) => c.id === id);
        if (idx >= 0 && d.stockAudio) d.stockAudio[idx] = saved;
      });
    },
  };
}

export function splitStockAudio(id: string, splitMs: number, rightId: string): Command {
  let prev: StockAudioClip[] | undefined;
  return {
    label: 'Split stock audio',
    do(p) {
      const existing = p.stockAudio ?? [];
      const idx = existing.findIndex((c) => c.id === id);
      if (idx < 0) throw new CommandRejected(`Stock audio "${id}" not found`);
      if (existing.length >= MAX_STOCK_AUDIO) {
        throw new CommandRejected(`Up to ${MAX_STOCK_AUDIO} stock audio clips per project`);
      }
      if (!rightId || existing.some((c) => c.id === rightId)) {
        throw new CommandRejected('Duplicate clip id for split');
      }
      const clip = existing[idx]!;
      const at = Math.round(splitMs);
      if (
        !Number.isFinite(at) ||
        at < clip.startMs + MIN_STOCK_SPLIT_MS ||
        at > clip.endMs - MIN_STOCK_SPLIT_MS
      ) {
        throw new CommandRejected('Move the playhead inside the audio clip to split it');
      }
      const leftParsed = StockAudioClipSchema.safeParse({ ...clip, endMs: at });
      const rightParsed = StockAudioClipSchema.safeParse({
        ...clip,
        id: rightId,
        startMs: at,
        sourceOffsetMs: (clip.sourceOffsetMs ?? 0) + (at - clip.startMs),
      });
      if (!leftParsed.success || !rightParsed.success) {
        throw new CommandRejected('Invalid split range');
      }
      prev = existing;
      return produce(p, (d) => {
        const list = d.stockAudio ?? [];
        list.splice(idx, 1, leftParsed.data, rightParsed.data);
        d.stockAudio = list;
      });
    },
    undo(p) {
      if (!prev) return p;
      const saved = prev;
      return produce(p, (d) => {
        d.stockAudio = saved;
      });
    },
  };
}

export function removeStockAudio(id: string): Command {
  let prev: StockAudioClip[] | undefined;
  return {
    label: 'Remove stock audio',
    do(p) {
      const existing = p.stockAudio ?? [];
      if (!existing.some((c) => c.id === id)) {
        throw new CommandRejected(`Stock audio "${id}" not found`);
      }
      prev = existing;
      return produce(p, (d) => {
        const next = (d.stockAudio ?? []).filter((c) => c.id !== id);
        if (next.length === 0) delete d.stockAudio;
        else d.stockAudio = next;
      });
    },
    undo(p) {
      if (!prev) return p;
      const saved = prev;
      return produce(p, (d) => {
        d.stockAudio = saved;
      });
    },
  };
}

function isTrivialDefaultLanes(lanes: readonly TimelineLane[]): boolean {
  return (
    lanes.length === 1 &&
    lanes[0]?.index === 0 &&
    !lanes[0].hidden &&
    !lanes[0].muted &&
    !lanes[0].name
  );
}

/** Add an additional Stock Media or Stock Audio lane (up to `MAX_TIMELINE_LANES = 4`, spec 45). */
export function addTimelineLane(kind: 'media' | 'audio', name?: string): Command {
  let prevLanes: TimelineLane[] | undefined;
  return {
    label: kind === 'media' ? 'Add media track' : 'Add audio track',
    do(p) {
      const current = kind === 'media' ? resolvedMediaLanes(p) : resolvedAudioLanes(p);
      if (current.length >= MAX_TIMELINE_LANES) {
        throw new CommandRejected(
          `Up to ${MAX_TIMELINE_LANES} ${kind === 'media' ? 'media' : 'audio'} tracks per project`,
        );
      }
      const used = new Set(current.map((l) => l.index));
      let nextIdx = -1;
      for (let i = 0; i < MAX_TIMELINE_LANES; i++) {
        if (!used.has(i)) {
          nextIdx = i;
          break;
        }
      }
      if (nextIdx < 0) {
        throw new CommandRejected('No track slots remaining');
      }
      prevLanes = kind === 'media' ? p.stockMediaLanes : p.stockAudioLanes;
      const next: TimelineLane[] = [
        ...current,
        { index: nextIdx, ...(name?.trim() ? { name: name.trim().slice(0, 32) } : {}) },
      ].sort((a, b) => a.index - b.index);
      return produce(p, (d) => {
        if (kind === 'media') d.stockMediaLanes = next;
        else d.stockAudioLanes = next;
      });
    },
    undo(p) {
      return produce(p, (d) => {
        if (kind === 'media') {
          if (prevLanes === undefined) delete d.stockMediaLanes;
          else d.stockMediaLanes = prevLanes;
        } else {
          if (prevLanes === undefined) delete d.stockAudioLanes;
          else d.stockAudioLanes = prevLanes;
        }
      });
    },
  };
}

/**
 * Remove an extra Stock Media or Stock Audio lane (`laneIndex >= 1`), dropping clips on that lane
 * and compacting higher lane indices so numbering stays contiguous. Base lane 0 cannot be removed.
 */
export function removeTimelineLane(kind: 'media' | 'audio', laneIndex: number): Command {
  let prevLanes: TimelineLane[] | undefined;
  let prevOverlays: StockOverlayClip[] | undefined;
  let prevAudio: StockAudioClip[] | undefined;
  return {
    label: kind === 'media' ? 'Remove media track' : 'Remove audio track',
    do(p) {
      if (laneIndex <= 0) {
        throw new CommandRejected('The primary track cannot be removed');
      }
      const current = kind === 'media' ? resolvedMediaLanes(p) : resolvedAudioLanes(p);
      if (!current.some((l) => l.index === laneIndex)) {
        throw new CommandRejected(`Track ${laneIndex + 1} does not exist`);
      }
      prevLanes = kind === 'media' ? p.stockMediaLanes : p.stockAudioLanes;
      prevOverlays = p.stockOverlays;
      prevAudio = p.stockAudio;

      const compactedLanes: TimelineLane[] = current
        .filter((l) => l.index !== laneIndex)
        .map((l) => (l.index > laneIndex ? { ...l, index: l.index - 1 } : { ...l }))
        .sort((a, b) => a.index - b.index);

      return produce(p, (d) => {
        if (kind === 'media') {
          if (isTrivialDefaultLanes(compactedLanes)) delete d.stockMediaLanes;
          else d.stockMediaLanes = compactedLanes;
          if (d.stockOverlays) {
            const nextClips = d.stockOverlays
              .filter((c) => (c.track ?? 0) !== laneIndex)
              .map((c) => {
                const t = c.track ?? 0;
                if (t <= laneIndex) return c;
                const nextT = t - 1;
                if (nextT === 0) {
                  const rest = { ...c };
                  delete rest.track;
                  return rest;
                }
                return { ...c, track: nextT };
              });
            if (nextClips.length === 0) delete d.stockOverlays;
            else d.stockOverlays = nextClips;
          }
        } else {
          if (isTrivialDefaultLanes(compactedLanes)) delete d.stockAudioLanes;
          else d.stockAudioLanes = compactedLanes;
          if (d.stockAudio) {
            const nextClips = d.stockAudio
              .filter((c) => (c.track ?? 0) !== laneIndex)
              .map((c) => {
                const t = c.track ?? 0;
                if (t <= laneIndex) return c;
                const nextT = t - 1;
                if (nextT === 0) {
                  const rest = { ...c };
                  delete rest.track;
                  return rest;
                }
                return { ...c, track: nextT };
              });
            if (nextClips.length === 0) delete d.stockAudio;
            else d.stockAudio = nextClips;
          }
        }
      });
    },
    undo(p) {
      return produce(p, (d) => {
        if (kind === 'media') {
          if (prevLanes === undefined) delete d.stockMediaLanes;
          else d.stockMediaLanes = prevLanes;
          if (prevOverlays === undefined) delete d.stockOverlays;
          else d.stockOverlays = prevOverlays;
        } else {
          if (prevLanes === undefined) delete d.stockAudioLanes;
          else d.stockAudioLanes = prevLanes;
          if (prevAudio === undefined) delete d.stockAudio;
          else d.stockAudio = prevAudio;
        }
      });
    },
  };
}

/** Toggle visibility (`hidden`) on a Stock Media lane (affects both preview and MP4 export). */
export function toggleTimelineLaneHidden(laneIndex: number): Command {
  let prevLanes: TimelineLane[] | undefined;
  return {
    label: 'Toggle media track visibility',
    do(p) {
      if (laneIndex < 0 || laneIndex >= MAX_TIMELINE_LANES) {
        throw new CommandRejected('Invalid media track index');
      }
      prevLanes = p.stockMediaLanes;
      const lanes = resolvedMediaLanes(p);
      const existing = lanes.find((l) => l.index === laneIndex);
      if (!existing) throw new CommandRejected(`Media track ${laneIndex + 1} does not exist`);
      const nextHidden = !existing.hidden;
      const nextLanes = lanes.map((l) => {
        if (l.index !== laneIndex) return l;
        const copy: TimelineLane = { ...l };
        if (nextHidden) copy.hidden = true;
        else delete copy.hidden;
        return copy;
      });
      return produce(p, (d) => {
        if (isTrivialDefaultLanes(nextLanes)) delete d.stockMediaLanes;
        else d.stockMediaLanes = nextLanes;
      });
    },
    undo(p) {
      return produce(p, (d) => {
        if (prevLanes === undefined) delete d.stockMediaLanes;
        else d.stockMediaLanes = prevLanes;
      });
    },
  };
}

/** Toggle `muted` on a Stock Audio lane (affects both Web Audio playback and MP4 export). */
export function toggleTimelineLaneMute(laneIndex: number): Command {
  let prevLanes: TimelineLane[] | undefined;
  return {
    label: 'Toggle audio track mute',
    do(p) {
      if (laneIndex < 0 || laneIndex >= MAX_TIMELINE_LANES) {
        throw new CommandRejected('Invalid audio track index');
      }
      prevLanes = p.stockAudioLanes;
      const lanes = resolvedAudioLanes(p);
      const existing = lanes.find((l) => l.index === laneIndex);
      if (!existing) throw new CommandRejected(`Audio track ${laneIndex + 1} does not exist`);
      const nextMuted = !existing.muted;
      const nextLanes = lanes.map((l) => {
        if (l.index !== laneIndex) return l;
        const copy: TimelineLane = { ...l };
        if (nextMuted) copy.muted = true;
        else delete copy.muted;
        return copy;
      });
      return produce(p, (d) => {
        if (isTrivialDefaultLanes(nextLanes)) delete d.stockAudioLanes;
        else d.stockAudioLanes = nextLanes;
      });
    },
    undo(p) {
      return produce(p, (d) => {
        if (prevLanes === undefined) delete d.stockAudioLanes;
        else d.stockAudioLanes = prevLanes;
      });
    },
  };
}
