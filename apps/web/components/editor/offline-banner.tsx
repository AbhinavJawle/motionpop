'use client';

import { StatusDot } from '@/components/ui/status-dot';
import { useAIStatus } from '@/lib/ai/ai-status';
import { OFFLINE_BANNER } from '@/lib/ai/availability';

/**
 * Over the preview while the browser is offline (spec 09 R9.4): on-device edits keep working,
 * Generate and the cloud fallbacks are disabled by `chooseRoute` ("Needs connection").
 */
export function OfflineBanner() {
  const { online } = useAIStatus();
  if (online) return null;
  return (
    <p
      role="status"
      className="absolute inset-x-4 top-4 z-20 flex items-center gap-2 rounded-chip bg-glass px-3 py-2 text-[11px] leading-4 text-text-2 shadow-glass backdrop-blur-[16px]"
    >
      <StatusDot tone="warn" className="size-[5px]" />
      {OFFLINE_BANNER}
    </p>
  );
}
