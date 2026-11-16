'use client';

import { useEffect } from 'react';
import { closeSettingsPanel, useSettingsPanel } from '@/lib/editor/settings-panel';
import { closeRailPanel, useRailPanel } from '@/lib/editor/rail-panel';
import { usePip } from '@/lib/pip/use-pip';
import { useEditor } from '@/lib/stores/editor';
import { LeftPanel } from './left-panel';
import { ProjectsPanelBody } from './projects-panel';
import { VoicePanelBody } from './voice-panel';
import { AudioPanelBody } from './audio-panel';
import { StylesPanelBody } from './styles-panel';
import { BrandPanelBody } from './brand-panel';
import { MediaPanelBody } from './media-panel';

const LABELS = {
  voice: 'Voice',
  projects: 'Projects',
  audio: 'Audio',
  styles: 'Styles',
  brand: 'Brand',
  media: 'Media',
} as const;

/**
 * The Voice, Projects, Audio, Styles and Brand rail panels (spec 11 §12, spec 12 §8) in the shared left panel. Pip, Settings and
 * these panels close each other, so only one holds the 340 px slot.
 */
export function RailPanels() {
  const open = useRailPanel((s) => s.open);
  const settingsOpen = useSettingsPanel((s) => s.open);
  const pipOpen = usePip((s) => s.open);
  const projectId = useEditor((s) => s.project?.id ?? null);

  useEffect(() => {
    if (settingsOpen || pipOpen) closeRailPanel();
  }, [settingsOpen, pipOpen]);
  useEffect(() => {
    if (!open) return;
    usePip.getState().setOpen(false);
    closeSettingsPanel();
  }, [open]);

  return (
    <LeftPanel open={open !== null} label={open ? LABELS[open] : 'Panel'} onClose={closeRailPanel}>
      {open === 'projects' && <ProjectsPanelBody />}
      {open === 'voice' && <VoicePanelBody />}
      {open === 'audio' && <AudioPanelBody />}
      {open === 'styles' && <StylesPanelBody />}
      {open === 'media' && <MediaPanelBody />}
      {/* Keyed by project: the draft colours start from that project's brand. */}
      {open === 'brand' && <BrandPanelBody key={projectId ?? 'none'} />}
    </LeftPanel>
  );
}
