import { create } from 'zustand';

/**
 * Which rail panel (spec 11 §12: Voice, Projects) holds the left panel, or null. UI state only,
 * never saved or undone. Pip and Settings keep their own stores; the panels close each other.
 */
export type RailPanelId = 'voice' | 'projects' | 'audio' | 'styles' | 'brand' | 'media';

export const useRailPanel = create<{ open: RailPanelId | null }>(() => ({ open: null }));

export function toggleRailPanel(id: RailPanelId): void {
  useRailPanel.setState((s) => ({ open: s.open === id ? null : id }));
}

export function openRailPanel(id: RailPanelId): void {
  useRailPanel.setState({ open: id });
}

export function closeRailPanel(): void {
  useRailPanel.setState({ open: null });
}
