'use client';

import { PIP_MODEL_CHOICES, isPipModelId, type PipModelId } from '@motionpop/schemas';
import { create } from 'zustand';

const STORAGE_KEY = 'motionpop:pip-model';
export const DEFAULT_PIP_MODEL: PipModelId = 'gemini-4-neon';

function readStoredModel(): PipModelId {
  if (typeof window === 'undefined') return DEFAULT_PIP_MODEL;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isPipModelId(raw) ? raw : DEFAULT_PIP_MODEL;
  } catch {
    return DEFAULT_PIP_MODEL;
  }
}

interface PipModelState {
  model: PipModelId;
  setModel(model: PipModelId): void;
}

/** Browser-persisted cloud model preference for Pip & video direction (spec 18 R3.3). */
export const usePipModel = create<PipModelState>((set) => ({
  model: readStoredModel(),
  setModel(model) {
    set({ model });
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, model);
      } catch {
        // Ignore private-browsing storage errors.
      }
    }
  },
}));

/** Friendly display name for a model id (falls back to the raw id). */
export function pipModelLabel(id: string | undefined): string | null {
  if (!id) return null;
  return PIP_MODEL_CHOICES.find((m) => m.id === id)?.label ?? id;
}
