import {
  ImageAssetSchema,
  type EditorProject,
  type ImageAsset,
  type Slot,
} from '@motionpop/schemas';
import { produce } from 'immer';
import { CommandRejected, type Command } from './command';
import { findSlot } from './slot-helpers';

export interface SlotImageInput {
  role: string;
  subject: string;
  /** A ready asset; it joins `project.assets` (once per id). */
  asset: ImageAsset;
}

/**
 * Put a picture in a scene slot (spec 07 R4), or take it out (`null`): the score's `images`
 * names the asset, and the asset joins the project. One undo step; undo restores the slot's
 * params and the asset list exactly.
 */
export function setSlotImage(slotId: string, input: SlotImageInput | null): Command {
  let before: { params: Slot['params']; assets: EditorProject['assets'] } | undefined;
  return {
    label: input ? 'Add picture' : 'Remove picture',
    do(p) {
      const s = findSlot(p, slotId);
      const asset = input ? ImageAssetSchema.safeParse(input.asset) : null;
      if (asset && !asset.success) throw new CommandRejected('invalid image asset');
      if (asset?.success && asset.data.status !== 'ready')
        throw new CommandRejected('the picture is not ready');
      before = { params: s.params, assets: p.assets };
      return produce(p, (d) => {
        const t = d.slots.find((x) => x.id === slotId);
        if (!t) return;
        t.params = {
          ...t.params,
          images:
            input && asset?.success
              ? [{ role: input.role, subject: input.subject, assetId: asset.data.id }]
              : [],
        };
        if (asset?.success) {
          const list = d.assets ?? [];
          if (!list.some((a) => a.id === asset.data.id)) list.push(asset.data);
          d.assets = list;
        }
      });
    },
    undo(p) {
      const prev = before;
      if (!prev) return p;
      return produce(p, (d) => {
        const t = d.slots.find((x) => x.id === slotId);
        if (t) t.params = prev.params;
        if (prev.assets) d.assets = prev.assets;
        else delete d.assets;
      });
    },
  };
}

/** Assets no slot points at any more (kept in storage, dropped from the project on save). */
export function usedAssetIds(p: Pick<EditorProject, 'slots'>): Set<string> {
  const ids = new Set<string>();
  for (const s of p.slots) {
    const imgs = (s.params as { images?: unknown }).images;
    if (Array.isArray(imgs))
      for (const i of imgs)
        if (i && typeof i === 'object' && typeof (i as { assetId?: unknown }).assetId === 'string')
          ids.add((i as { assetId: string }).assetId);
  }
  return ids;
}
