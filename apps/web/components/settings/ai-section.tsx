'use client';

import { useState } from 'react';
import { Toggle } from '@/components/ui/toggle';
import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/ui/status-dot';
import { cancelSetUp, setUpOnDevice, useAIStatus, type Availability } from '@/lib/ai/ai-status';
import { usePreferOnDevice } from '@/lib/settings/use-prefer-on-device';
import { useCredits } from '@/lib/credits/use-credits';
import { useUsageSummary } from '@/lib/usage/use-usage-summary';
import { SectionCard, type SettingsVariant } from './section-card';
import { UsageChart } from './usage-chart';
import { OnDeviceDownloadModal } from './on-device-download-modal';

/** Where the Chrome flag instructions live (the README's "On-device AI in Chrome" section). */
export const ON_DEVICE_HELP_URL =
  'https://github.com/AbhinavJawle/motionpop#on-device-ai-in-chrome';

export interface StatusView {
  tone: 'mint' | 'violet' | 'warn' | 'muted';
  label: string;
}

/** The status row of the on-device model (R6.3). */
export function statusView(availability: Availability, progress: number | null): StatusView {
  switch (availability) {
    case 'available':
      return { tone: 'mint', label: 'Ready' };
    case 'downloading':
      return {
        tone: 'violet',
        label: `Setting up · ${Math.round((progress ?? 0) * 100)} %`,
      };
    case 'downloadable':
      return { tone: 'warn', label: 'Can be set up' };
    case 'unavailable':
      return { tone: 'muted', label: 'Not available in this browser' };
    case 'checking':
      return { tone: 'muted', label: 'Checking…' };
  }
}

/** AI & models (R6.3): the prefer-on-device switch, the on-device status and the usage chart. */
export function AISection({ variant }: { variant: SettingsVariant }) {
  const { preferOnDevice, loaded, save } = usePreferOnDevice();
  const { availability, setupProgress, setupError } = useAIStatus();
  const { balance } = useCredits();
  const usage = useUsageSummary(balance);
  const status = statusView(availability, setupProgress);
  const [confirming, setConfirming] = useState(false);

  return (
    <SectionCard
      id="ai"
      title="AI & models"
      subtitle="Small edits can run on your device, free and private."
      variant={variant}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p id="prefer-on-device-label" className="text-[13px] leading-[17px]">
            Prefer on-device AI
          </p>
          <p id="prefer-on-device-hint" className="mt-0.5 text-xs leading-4 text-text-2">
            Small edits run free on your device when they can.
          </p>
        </div>
        <Toggle
          size="lg"
          checked={preferOnDevice}
          disabled={!loaded}
          label="Prefer on-device AI"
          describedBy="prefer-on-device-hint"
          onCheckedChange={(next) => void save(next)}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-chip bg-card-2 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2" data-testid="on-device-status">
          <StatusDot tone={status.tone} pulse={availability === 'downloading'} />
          <span className="text-xs leading-4" role="status">
            {status.label}
          </span>
        </div>
        {availability === 'downloadable' && (
          <Button variant="ai" size="sm" onClick={() => setConfirming(true)}>
            Set up on-device AI
          </Button>
        )}
        {availability === 'downloading' && (
          <Button variant="ghost" size="sm" onClick={cancelSetUp}>
            Cancel
          </Button>
        )}
        {availability === 'unavailable' && (
          <a
            href={ON_DEVICE_HELP_URL}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-[11px] leading-[14px] text-violet hover:underline"
          >
            How to turn it on
          </a>
        )}
      </div>

      {setupError && availability === 'downloadable' && (
        <p className="mt-2 text-xs leading-4 text-text-2" role="alert">
          {setupError}
        </p>
      )}

      <OnDeviceDownloadModal
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => void setUpOnDevice()}
      />

      <hr className="my-5 border-white/6" />
      <UsageChart
        summary={usage.summary}
        scope={usage.scope}
        variant={variant}
        loading={usage.status === 'loading'}
        failed={usage.status === 'error'}
      />
    </SectionCard>
  );
}
