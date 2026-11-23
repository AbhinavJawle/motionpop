'use client';

import { useEffect, useRef } from 'react';
import { SettingsContent } from '@/components/settings/settings-content';
import { closeSettingsPanel, useSettingsPanel } from '@/lib/editor/settings-panel';
import { LeftPanel } from './left-panel';

/**
 * The editor's Settings panel (spec 13 R6.1): the same three sections as `/settings`, compact,
 * in the 340 px left panel. Opened from the account menu, or from the credits chip, which scrolls
 * it to Credits.
 */
export function SettingsPanel() {
  const open = useSettingsPanel((s) => s.open);
  const section = useSettingsPanel((s) => s.section);
  const nonce = useSettingsPanel((s) => s.nonce);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const body = bodyRef.current;
    if (!body) return;
    if (!section) {
      body.scrollTo({ top: 0 });
      return;
    }
    // After the panel has mounted its sections.
    const t = setTimeout(
      () =>
        body.querySelector(`#${section}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }),
      60,
    );
    return () => clearTimeout(t);
  }, [open, section, nonce]);

  return (
    <LeftPanel open={open} label="Settings" onClose={closeSettingsPanel}>
      <div className="flex h-full flex-col">
        <header className="flex h-12 shrink-0 items-center border-b border-line px-4">
          <h2 className="text-[14px] leading-5 font-semibold">Settings</h2>
        </header>
        <div
          ref={bodyRef}
          data-testid="settings-panel-body"
          className="min-h-0 flex-1 overflow-y-auto p-3 pb-24"
        >
          <SettingsContent variant="panel" />
        </div>
      </div>
    </LeftPanel>
  );
}
