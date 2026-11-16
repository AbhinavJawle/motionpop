import { create } from 'zustand';

/**
 * Whether the editor's Settings left panel is open, and which section to show first (spec 13
 * R6.1, R5.2). Kept apart from the editor store: it is UI state, never saved or undone. Spec 10's
 * panel container can fold it into its `rail` state later.
 */
export type SettingsSection = 'account' | 'ai' | 'credits';

interface SettingsPanelState {
  open: boolean;
  /** The section to scroll to when the panel opens; null = top. */
  section: SettingsSection | null;
  /** Bumped on every open, so asking for the same section twice scrolls again. */
  nonce: number;
}

export const useSettingsPanel = create<SettingsPanelState>(() => ({
  open: false,
  section: null,
  nonce: 0,
}));

export function openSettingsPanel(section: SettingsSection | null = null): void {
  useSettingsPanel.setState((s) => ({ open: true, section, nonce: s.nonce + 1 }));
}
export function closeSettingsPanel(): void {
  useSettingsPanel.setState({ open: false });
}
