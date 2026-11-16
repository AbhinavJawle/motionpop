import { produce } from 'immer';
import {
  AudioSettingSchema,
  BrandSchema,
  DEFAULT_CAPTIONS,
  audioOf,
  type AudioSetting,
  type Brand,
  type CaptionsSetting,
  type EditorProject,
} from '@motionpop/schemas';
import { CommandRejected, type Command } from './command';

type Format = EditorProject['format'];

export function setFormat(format: Format): Command {
  let before: Format | undefined;
  return {
    label: 'Change format',
    do(p) {
      before = p.format;
      return produce(p, (d) => {
        d.format = format;
      });
    },
    undo(p) {
      const prev = before;
      if (prev === undefined) return p;
      return produce(p, (d) => {
        d.format = prev;
      });
    },
  };
}

export function setStyle(styleId: string): Command {
  let before: string | undefined;
  return {
    label: 'Change style',
    do(p) {
      if (styleId.length === 0) throw new CommandRejected('styleId must not be empty');
      before = p.styleId;
      return produce(p, (d) => {
        d.styleId = styleId;
      });
    },
    undo(p) {
      const prev = before;
      if (prev === undefined) return p;
      return produce(p, (d) => {
        d.styleId = prev;
      });
    },
  };
}

/**
 * Brand colours over the look's accents (Brand panel), or none with `null`. One command, one
 * undo. The colours were checked against the look in the panel; the compiler guards again.
 */
export function setBrand(brand: Brand | null): Command {
  let before: Brand | undefined;
  return {
    label: brand ? 'Use brand colours' : 'Remove brand colours',
    do(p) {
      const parsed = brand ? BrandSchema.safeParse(brand) : null;
      if (parsed && !parsed.success) throw new CommandRejected('invalid brand colours');
      before = p.brand;
      return produce(p, (d) => {
        if (parsed?.success) d.brand = parsed.data;
        else delete d.brand;
      });
    },
    undo(p) {
      const prev = before;
      return produce(p, (d) => {
        if (prev) d.brand = prev;
        else delete d.brand;
      });
    },
  };
}

export function renameProject(title: string): Command {
  let before: string | undefined;
  return {
    label: 'Rename project',
    do(p) {
      const next = title.trim();
      if (next.length < 1 || next.length > 80) {
        throw new CommandRejected('title must be 1-80 characters after trimming');
      }
      before = p.title;
      return produce(p, (d) => {
        d.title = next;
      });
    },
    undo(p) {
      const prev = before;
      if (prev === undefined) return p;
      return produce(p, (d) => {
        d.title = prev;
      });
    },
  };
}

/** Captions on/off and the preset (spec 12 R3): a project field, so export and Pip see it. */
export function setCaptions(patch: Partial<CaptionsSetting>): Command {
  let before: CaptionsSetting | undefined;
  let had = false;
  return {
    label: patch.presetId ? 'Change caption style' : 'Toggle captions',
    do(p) {
      had = p.captions !== undefined;
      before = p.captions;
      return produce(p, (d) => {
        d.captions = { ...(d.captions ?? DEFAULT_CAPTIONS), ...patch };
      });
    },
    undo(p) {
      return produce(p, (d) => {
        if (had && before) d.captions = before;
        else delete d.captions;
      });
    },
  };
}

/**
 * Music, ducking and effects settings (spec 12 R10.2): one command per committed change. A key
 * set to `undefined` in the patch clears it (e.g. `{ musicId: undefined }` = no music). The merged
 * result must pass `AudioSettingSchema`.
 */
export function setAudio(patch: Partial<AudioSetting>): Command {
  let before: AudioSetting | undefined;
  let had = false;
  return {
    label: 'Change sound',
    do(p) {
      const merged: Record<string, unknown> = { ...audioOf(p), ...patch };
      for (const k of Object.keys(merged)) if (merged[k] === undefined) delete merged[k];
      const parsed = AudioSettingSchema.safeParse(merged);
      if (!parsed.success) {
        throw new CommandRejected(`invalid audio settings: ${parsed.error.issues[0]?.message}`);
      }
      had = p.audio !== undefined;
      before = p.audio;
      return produce(p, (d) => {
        d.audio = parsed.data;
      });
    },
    undo(p) {
      return produce(p, (d) => {
        if (had && before) d.audio = before;
        else delete d.audio;
      });
    },
  };
}
