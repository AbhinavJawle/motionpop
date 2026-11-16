import {
  VERSIONS_PER_SLOT,
  type EditorProject,
  type Slot,
  type SlotStatus,
  type SlotTiming,
  type Version,
} from '@motionpop/schemas';
import { produce } from 'immer';
import { CommandRejected, type Command } from './command';
import { cleanTiming, findSlot, parseTiming } from './slot-helpers';

/** The slot and the versions array as they were, so undo restores them exactly. */
interface Snapshot {
  slot: Slot;
  versions: Version[];
}

function snapshotOf(p: EditorProject, slotId: string): Snapshot {
  return { slot: findSlot(p, slotId), versions: p.versions };
}

function restoreSnapshot(p: EditorProject, snap: Snapshot | undefined): EditorProject {
  if (!snap) return p;
  return produce(p, (d) => {
    const i = d.slots.findIndex((s) => s.id === snap.slot.id);
    if (i >= 0) d.slots[i] = snap.slot;
    d.versions = snap.versions;
  });
}

/**
 * Drops the oldest versions of one slot (array order) that are not `keepId` until at most
 * `VERSIONS_PER_SLOT` remain (R5.4). Pure; other slots' versions are untouched.
 */
export function pruneVersions(
  versions: readonly Version[],
  slotId: string,
  keepId: string | undefined,
): Version[] {
  let excess = versions.filter((v) => v.slotId === slotId).length - VERSIONS_PER_SLOT;
  if (excess <= 0) return [...versions];
  return versions.filter((v) => {
    if (excess > 0 && v.slotId === slotId && v.id !== keepId) {
      excess--;
      return false;
    }
    return true;
  });
}

export interface ApplyVersionInput {
  params: Record<string, unknown>;
  /** The slot's timing after the change; omitted or empty means the look's defaults. */
  timing?: SlotTiming | undefined;
  version: Version;
  /** Default `ready`. */
  status?: SlotStatus;
  /** Switches the slot to this component in the same step (a custom graphic, spec 15). */
  componentId?: string;
}

/**
 * One undo step for any new result: params, timing, a new current version (quick edit, frame
 * note, Generate, a content edit, a template), status, and pruning to 20 versions. The version
 * carries the timing too, so a restore brings the feel back (D-038). Rejected when the slot is
 * gone, the version belongs elsewhere, names another component, or reuses an id.
 */
export function applyVersion(slotId: string, input: ApplyVersionInput): Command {
  let before: Snapshot | undefined;
  return {
    label: 'Apply version',
    do(p) {
      const snap = snapshotOf(p, slotId);
      const v = input.version;
      if (v.slotId !== slotId) throw new CommandRejected('the version belongs to another slot');
      const target = input.componentId ?? snap.slot.componentId;
      if (v.componentId !== target) {
        throw new CommandRejected('the version is for another component');
      }
      if (p.versions.some((x) => x.id === v.id)) {
        throw new CommandRejected(`version "${v.id}" already exists`);
      }
      const timing = cleanTiming(parseTiming(input.timing));
      before = snap;
      return produce(p, (d) => {
        const s = d.slots.find((x) => x.id === slotId);
        if (!s) return;
        s.componentId = target;
        s.params = structuredClone(input.params);
        if (timing) s.timing = timing;
        else delete s.timing;
        s.currentVersionId = v.id;
        s.status = input.status ?? 'ready';
        delete s.error;
        // The stored version always holds exactly what the slot now shows, whatever the caller put in it.
        const stored: Version = { ...structuredClone(v), params: structuredClone(input.params) };
        if (timing) stored.timing = { ...timing };
        else delete stored.timing;
        d.versions.push(stored);
        d.versions = pruneVersions(d.versions, slotId, v.id);
      });
    },
    undo: (p) => restoreSnapshot(p, before),
  };
}

/**
 * Makes an earlier version of the slot current again: its params and timing (a version without
 * timing clears the slot's), `currentVersionId`, status `ready`. One undo step. A version of
 * another component (the slot changed since) cannot be restored; neither can the current one.
 */
export function restoreVersion(slotId: string, versionId: string): Command {
  let before: Snapshot | undefined;
  return {
    label: 'Restore version',
    do(p) {
      const snap = snapshotOf(p, slotId);
      const v = p.versions.find((x) => x.id === versionId && x.slotId === slotId);
      if (!v) throw new CommandRejected(`version "${versionId}" does not exist on this slot`);
      if (v.componentId !== snap.slot.componentId) {
        throw new CommandRejected('the version is for another component');
      }
      if (snap.slot.currentVersionId === versionId) {
        throw new CommandRejected('that version is already the current one');
      }
      before = snap;
      return produce(p, (d) => {
        const s = d.slots.find((x) => x.id === slotId);
        if (!s) return;
        s.params = structuredClone(v.params);
        if (v.timing && Object.keys(v.timing).length > 0) s.timing = { ...v.timing };
        else delete s.timing;
        s.currentVersionId = v.id;
        s.status = 'ready';
        delete s.error;
      });
    },
    undo: (p) => restoreSnapshot(p, before),
  };
}
