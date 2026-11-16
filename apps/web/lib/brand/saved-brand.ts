import { BrandSchema, type Brand } from '@motionpop/schemas';
import { create } from 'zustand';

/**
 * "Save as my brand" (Brand panel): the creator's brand kit in this browser under `mp:brand`, so
 * new projects and Pip's "Use brand colours everywhere" can reach it. A per-viewer convenience:
 * zod-parsed on read, every access guarded.
 */
const KEY = 'mp:brand';

function read(): Brand | null {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = BrandSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const useSavedBrand = create<{ brand: Brand | null }>(() => ({ brand: read() }));

export function saveBrand(brand: Brand | null): void {
  useSavedBrand.setState({ brand });
  try {
    if (brand) localStorage.setItem(KEY, JSON.stringify(brand));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked or full: the brand still applies to this project, just isn't remembered.
  }
}

export const sameBrand = (a: Brand | null | undefined, b: Brand | null | undefined): boolean =>
  (a?.accent ?? null)?.toLowerCase() === (b?.accent ?? null)?.toLowerCase() &&
  (a?.accent2 ?? null)?.toLowerCase() === (b?.accent2 ?? null)?.toLowerCase();
