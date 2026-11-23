import {
  REEL_ADDED_SFX_MAX,
  ReelPlanSchema,
  restyleReelPlan,
  type ImageAsset,
  type ReelAddedSfx,
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
