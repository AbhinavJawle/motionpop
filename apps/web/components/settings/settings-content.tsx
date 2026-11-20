'use client';

import { AccountSection } from './account-section';
import { AISection } from './ai-section';
import { CloudProfileSection } from './cloud-profile-section';
import { CreditsSection } from './credits-section';
import type { SettingsVariant } from './section-card';

/** The three sections, shared by `/settings` (page) and the editor's Settings panel (panel). */
export function SettingsContent({ variant }: { variant: SettingsVariant }) {
  return (
    <div className={variant === 'page' ? 'space-y-5' : 'space-y-3'}>
      <AccountSection variant={variant} />
      <AISection variant={variant} />
      <CreditsSection variant={variant} />
      <CloudProfileSection variant={variant} />
    </div>
  );
}
