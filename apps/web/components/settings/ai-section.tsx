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
import { ByokCard } from './byok-card';

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

/** AI & models (R6.3): the on-device Gemini Nano switch, details, status and usage chart. */
export function AISection({ variant }: { variant: SettingsVariant }) {
  const { preferOnDevice, loaded, save } = usePreferOnDevice();
  const { availability, setupProgress, setupError } = useAIStatus();
  const { balance } = useCredits();
  const usage = useUsageSummary(balance);
  const status = statusView(availability, setupProgress);
  const [confirmMode, setConfirmMode] = useState<'toggle' | 'setup' | null>(null);

  const handleToggleChange = (next: boolean) => {
    if (next && availability !== 'available' && availability !== 'downloading') {
      setConfirmMode('toggle');
      return;
    }
    void save(next);
  };

  const handleConfirmDownload = () => {
    if (confirmMode === 'toggle' || !preferOnDevice) {
      void save(true);
    }
    if (availability === 'downloadable') {
      void setUpOnDevice();
    }
  };

  const confirmLabel =
    confirmMode === 'toggle'
      ? availability === 'downloadable'
        ? 'Enable & download model'
        : 'Enable on-device AI'
      : 'Download model';

  return (
    <SectionCard
      id="ai"
      title="AI & models"
      subtitle="Run edits free on your device with Gemini Nano, or bring your own Gemini API key."
      variant={variant}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p id="prefer-on-device-label" className="text-[13px] font-medium leading-[17px]">
            Use on-device AI (Gemini Nano)
          </p>
          <p id="prefer-on-device-hint" className="mt-0.5 text-xs leading-4 text-text-2">
            Runs quick edits, frame notes, slot detection &amp; auto-fill locally at 0 credits —
            even offline.
          </p>
        </div>
        <Toggle
          size="lg"
          checked={preferOnDevice}
          disabled={!loaded}
          label="Use on-device AI (Gemini Nano)"
          describedBy="prefer-on-device-hint"
          onCheckedChange={handleToggleChange}
        />
      </div>

      <div className="mt-3 rounded-chip bg-card-2/70 px-3 py-2.5 text-xs leading-4 text-text-2">
        <ul className="flex flex-col gap-1.5">
          <li className="flex gap-2">
            <span aria-hidden className="mt-[6px] size-1 shrink-0 rounded-full bg-text-3" />
            <span>
              <strong className="font-medium text-text-1">Desktop Chrome only:</strong> Uses
              Chrome&apos;s built-in Gemini Nano (Chrome 138+). Other browsers automatically fall
              back to cloud Gemini.
            </span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="mt-[6px] size-1 shrink-0 rounded-full bg-text-3" />
            <span>
              <strong className="font-medium text-text-1">Model size &amp; hardware:</strong>{' '}
              One-time ~4 GB download managed by Chrome. Requires ~22 GB of free disk space and
              either &gt;4 GB GPU VRAM or 16 GB+ RAM.
            </span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="mt-[6px] size-1 shrink-0 rounded-full bg-text-3" />
            <span>
              <strong className="font-medium text-text-1">Optional &amp; private:</strong> Your
              edits stay on your machine. Turn this off anytime to route everything to the cloud.
            </span>
          </li>
        </ul>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-chip bg-card-2 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2" data-testid="on-device-status">
          <StatusDot tone={status.tone} pulse={availability === 'downloading'} />
          <span className="text-xs leading-4" role="status">
            {status.label}
          </span>
        </div>
        {availability === 'downloadable' && (
          <Button variant="ai" size="sm" onClick={() => setConfirmMode('setup')}>
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
        open={confirmMode !== null}
        onClose={() => setConfirmMode(null)}
        onConfirm={handleConfirmDownload}
        confirmLabel={confirmLabel}
      />

      <div className="mt-5">
        <ByokCard variant={variant} />
      </div>

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
