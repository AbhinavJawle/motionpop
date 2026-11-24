import {
  StockAudioClipSchema,
  StockOverlayClipSchema,
  type StockAudioClip,
  type StockOverlayClip,
} from '@motionpop/schemas';
import { produce } from 'immer';
import { CommandRejected, type Command } from './command';

const MAX_STOCK_OVERLAYS = 32;
const MAX_STOCK_AUDIO = 48;

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
  patch: Partial<Pick<StockOverlayClip, 'startMs' | 'endMs' | 'layout'>>,
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
  patch: Partial<Pick<StockAudioClip, 'startMs' | 'endMs' | 'volume'>>,
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
