import {
  ReelPlanSchema,
  restyleReelPlan,
  type ImageAsset,
  type ReelLook,
  type ReelPlan,
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
