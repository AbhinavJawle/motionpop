import {
  EditConfigSchema,
  REEL_ADDED_SFX_MAX,
  ReelPlanSchema,
  restyleReelPlan,
  type EditorProject,
  type ImageAsset,
  type ReelAddedSfx,
  type ReelCaptionStyle,
  type ReelLook,
  type ReelPlan,
  type ReelTheme,
} from '@motionpop/schemas';
import { produce } from 'immer';
import { CommandRejected, type Command } from './command';

/**
 * Replaces the project's reel plan (spec 25): a new direction, an edit, a look. Pictures the new
 * plan brought (spec 26) join `project.assets`. One undo step.
 */
export function setReel(
  next: ReelPlan,
  label = 'Update the reel',
  assets: ImageAsset[] = [],
): Command {
  const parsed = ReelPlanSchema.safeParse(next);
  let prev: ReelPlan | undefined;
  let prevAssets: ImageAsset[] | undefined;
  return {
    label,
    do(p) {
      if (!p.reel) throw new CommandRejected('This project has no reel');
      if (!parsed.success) throw new CommandRejected('That reel plan is not valid');
      prev = p.reel;
      prevAssets = p.assets;
      return produce(p, (d) => {
        d.reel = parsed.data;
        if (assets.length) {
          const have = new Set((d.assets ?? []).map((a) => a.id));
          const merged = [...(d.assets ?? []), ...assets.filter((a) => !have.has(a.id))];
          // The schema keeps at most 60: the newest win.
          d.assets = merged.slice(-60);
        }
      });
    },
    undo(p) {
      return produce(p, (d) => {
        if (prev) d.reel = prev;
        if (prevAssets === undefined) delete d.assets;
        else d.assets = prevAssets;
      });
    },
  };
}

/** Switches the reel between its looks; layouts follow the look (split ↔ card). */
export function setReelLook(look: ReelLook): Command {
  let prev: ReelPlan | undefined;
  return {
    label: look === 'mono' ? 'Switch to the mono look' : 'Switch to the cream look',
    do(p) {
      if (!p.reel) throw new CommandRejected('This project has no reel');
      prev = p.reel;
      return produce(p, (d) => {
        d.reel = restyleReelPlan(p.reel!, look);
      });
    },
    undo(p) {
      return produce(p, (d) => {
        if (prev) d.reel = prev;
      });
    },
  };
}

/** Reel captions on or off. */
export function setReelCaptions(on: boolean): Command {
  let prev: boolean | undefined;
  return {
    label: on ? 'Show captions' : 'Hide captions',
    do(p) {
      if (!p.reel) throw new CommandRejected('This project has no reel');
      prev = p.reel.captions;
      return produce(p, (d) => {
        d.reel!.captions = on;
      });
    },
    undo(p) {
      return produce(p, (d) => {
        if (d.reel && prev !== undefined) d.reel.captions = prev;
      });
    },
  };
}

/**
 * One change to the reel plan as a function of it (spec 37): validated whole, one undo step. The
 * function may throw `CommandRejected` to say why it can't apply.
 */
function changeReel(label: string, change: (r: ReelPlan) => ReelPlan): Command {
  let prev: ReelPlan | undefined;
  return {
    label,
    do(p) {
      if (!p.reel) throw new CommandRejected('This project has no reel');
      const parsed = ReelPlanSchema.safeParse(change(p.reel));
      if (!parsed.success) throw new CommandRejected('That reel change is not valid');
      prev = p.reel;
      return produce(p, (d) => {
        d.reel = parsed.data;
      });
    },
    undo(p) {
      return produce(p, (d) => {
        if (prev) d.reel = prev;
      });
    },
  };
}

/** A copy of `o` without `keys` (optional fields go absent, not undefined). */
function omit<T extends object, K extends keyof T>(o: T, ...keys: K[]): Omit<T, K> {
  const out = { ...o };
  for (const k of keys) delete out[k];
  return out;
}

/** Colours and a gradient over the reel's look (spec 37 R2.2); null goes back to the look's own. */
export function setReelTheme(theme: ReelTheme | null): Command {
  return changeReel(theme ? 'Colour the reel' : 'Use the look’s own colours', (r) => {
    const rest = omit(r, 'theme');
    return theme ? { ...rest, theme } : rest;
  });
}

/** Adds one sound hit on the reel timeline (spec 37 R3.3). */
export function addReelSound(hit: ReelAddedSfx): Command {
  return changeReel('Add a sound', (r) => {
    const have = r.sfx ?? [];
    if (have.length >= REEL_ADDED_SFX_MAX)
      throw new CommandRejected('This reel already has the most added sounds');
    return { ...r, sfx: [...have, hit].sort((a, b) => a.atMs - b.atMs) };
  });
}

/** Removes every added sound (the scenes' own hits stay, under the effects switch). */
export function clearReelSounds(): Command {
  return changeReel('Remove added sounds', (r) => {
    if (!r.sfx?.length) throw new CommandRejected('There are no added sounds');
    return omit(r, 'sfx');
  });
}

/** One scene back to the speaker with no graphic (spec 37 R2.4). */
export function clearReelScene(sceneId: string): Command {
  return changeReel('Remove a graphic', (r) => {
    if (!r.scenes.some((s) => s.id === sceneId))
      throw new CommandRejected(`scene "${sceneId}" does not exist`);
    return {
      ...r,
      scenes: r.scenes.map((s) => {
        if (s.id !== sceneId) return s;
        const rest = omit(s, 'tag', 'carry', 'bg');
        return { ...rest, layout: 'speaker' as const, content: { template: 'none' as const } };
      }),
    };
  });
}

/**
 * The reel's music source (spec 37 R3.2): `null` drops the generated track (the synthesised bed
 * or silence plays); a brief replaces it and waits for new music to be generated.
 */
export function setReelMusicBrief(brief: string | null, src?: string): Command {
  return changeReel(brief ? 'New music' : 'Remove the generated music', (r) => {
    const rest = omit(r, 'music');
    return brief ? { ...rest, music: { brief, ...(src ? { src } : {}) } } : rest;
  });
}

/** What a reel style pick changes (spec 39 R5.6): a recipe style, or only the caption style. */
export interface ReelStyleChange {
  look: ReelLook;
  /** `undefined` (a style with no theme of its own) removes the reel's theme. */
  theme?: ReelTheme | undefined;
  captionStyle: ReelCaptionStyle;
  /** The picked recipe style id; stored on `project.edit` when the project has one. */
  styleId: string;
}

/**
 * Changes the reel's look, theme and caption style together, and keeps `project.edit` (the
 * configure choices) in step: validated whole, one undo step. The project is replaced as a unit
 * because `edit` lives next to `reel`, not inside it (spec 39 design §10 #17).
 */
function changeReelStyle(
  label: string,
  change: (r: ReelPlan) => ReelPlan,
  editOf: (e: NonNullable<EditorProject['edit']>) => NonNullable<EditorProject['edit']>,
): Command {
  let prev: { reel: ReelPlan; edit: EditorProject['edit'] } | undefined;
  return {
    label,
    do(p) {
      if (!p.reel) throw new CommandRejected('This project has no reel');
      const reel = ReelPlanSchema.safeParse(change(p.reel));
      if (!reel.success) throw new CommandRejected('That reel style is not valid');
      let edit: EditorProject['edit'];
      if (p.edit) {
        const parsed = EditConfigSchema.safeParse(editOf(p.edit));
        if (!parsed.success) throw new CommandRejected('That reel style is not valid');
        edit = parsed.data;
      }
      prev = { reel: p.reel, edit: p.edit };
      return produce(p, (d) => {
        d.reel = reel.data;
        if (edit) d.edit = edit;
      });
    },
    undo(p) {
      return produce(p, (d) => {
        if (!prev) return;
        d.reel = prev.reel;
        if (prev.edit) d.edit = prev.edit;
        else delete d.edit;
      });
    },
  };
}

/** A recipe style: its look (layouts follow), colours and caption style, in one undo step. */
export function setReelStyle(c: ReelStyleChange): Command {
  return changeReelStyle(
    'Change the reel style',
    (r) => {
      const rest = omit(restyleReelPlan(r, c.look), 'theme');
      return { ...rest, ...(c.theme ? { theme: c.theme } : {}), captionStyle: c.captionStyle };
    },
    (e) => ({ ...e, styleId: c.styleId, captions: { ...e.captions, style: c.captionStyle } }),
  );
}

/** Only the caption style (the look, colours and picked recipe style stay). One undo step. */
export function setReelCaptionStyle(captionStyle: ReelCaptionStyle): Command {
  return changeReelStyle(
    'Change the caption style',
    (r) => ({ ...r, captionStyle }),
    (e) => ({ ...e, captions: { ...e.captions, style: captionStyle } }),
  );
}
