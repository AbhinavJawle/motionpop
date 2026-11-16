'use client';

import { useEffect } from 'react';
import { closeSettingsPanel, useSettingsPanel } from '@/lib/editor/settings-panel';
import { closeRailPanel, useRailPanel } from '@/lib/editor/rail-panel';
import { usePip } from '@/lib/pip/use-pip';
import { LeftPanel } from './left-panel';
import { ProjectsPanelBody } from './projects-panel';
import { VoicePanelBody } from './voice-panel';

const LABELS = { voice: 'Voice', projects: 'Projects' } as const;

/**
 * The Voice and Projects rail panels (spec 11 §12) in the shared left panel. Pip, Settings and
 * these panels close each other, so only one holds the 340 px slot.
 */
export function RailPanels() {
  const open = useRailPanel((s) => s.open);
  const settingsOpen = useSettingsPanel((s) => s.open);
  const pipOpen = usePip((s) => s.open);

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
    </LeftPanel>
  );
}
