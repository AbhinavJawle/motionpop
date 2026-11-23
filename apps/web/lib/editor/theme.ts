'use client';

import { create } from 'zustand';

/** The editor's light (paper) or dark (night desk) theme (spec 38 R5). */
export type EditorTheme = 'light' | 'dark';

const KEY = 'motionpop.editor-theme';

function stored(): EditorTheme {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'dark';
  } catch {
    return 'dark';
  }
}

interface ThemeState {
  theme: EditorTheme;
  /** Read the saved choice once the editor mounts (the server always renders dark). */
  hydrate(): void;
  toggle(): void;
}

export const useEditorTheme = create<ThemeState>((set, get) => ({
  theme: 'dark',
  hydrate: () => set({ theme: stored() }),
  toggle: () => {
    const next: EditorTheme = get().theme === 'dark' ? 'light' : 'dark';
    // Colours ease across for a moment instead of snapping (removed after the switch).
    const root = document.documentElement;
    root.classList.add('theme-easing');
    window.setTimeout(() => root.classList.remove('theme-easing'), 420);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // Private windows: the choice lasts for this visit.
    }
    set({ theme: next });
  },
}));
