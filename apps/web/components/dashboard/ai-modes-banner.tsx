'use client';

import { ArrowRight, CheckCircle2, KeyRound, Server } from 'lucide-react';
import Link from 'next/link';
import { GeminiNanoStatus } from '@/components/ui/gemini-nano-status';
import { cancelSetUp, useAIStatus } from '@/lib/ai/ai-status';
import { useByok } from '@/lib/ai/byok';
import { useLocalLlm } from '@/lib/ai/local-llm';
import { cn } from '@/lib/cn';
import { usePreferOnDevice } from '@/lib/settings/use-prefer-on-device';

/**
 * Sticky top AI status bar sitting directly below the navbar on `/dashboard` (Spec 42).
 * Always shows the prominent Gemini Nano on-device tally light (green when active, red when
 * unavailable/off) without showing passive download prompts automatically.
 */
export function AiModesBanner() {
  const { availability, setupActive } = useAIStatus();
  const { preferOnDevice } = usePreferOnDevice();
  const { active: byokActive, maskedKey } = useByok();
  const { active: localLlmActive, model: localLlmModel } = useLocalLlm();

  const nanoReady = availability === 'available' && preferOnDevice;
  const nanoDownloading = setupActive && availability === 'downloading';

  return (
    <div
      role="region"
      aria-label="AI options: local on-device AI and bring your own key"
      data-testid="dashboard-ai-modes"
      className="sticky top-16 z-20 border-b-2 border-ink bg-paper/95 backdrop-blur-sm"
    >
      <div className="mx-auto flex w-full max-w-[1240px] flex-wrap items-center justify-between gap-x-5 gap-y-2 px-6 py-2 text-[12px] lg:px-10">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <GeminiNanoStatus variant="dashboard" />
          {nanoReady && (
            <span className="hidden font-mono text-[11px] font-medium text-black/70 xl:inline">
              Ready · 0 cr · private &amp; offline
            </span>
          )}
          {nanoDownloading && (
            <button
              type="button"
              onClick={cancelSetUp}
              className="inline-flex h-7 items-center rounded-md border border-ink bg-paper px-2.5 text-[11px] font-medium hover:bg-mist"
            >
              Cancel
            </button>
          )}
        </div>

        {/* Local LLM (Ollama / LM Studio) or Cloud AI / Bring Your Own Gemini Key (BYOK) */}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {localLlmActive ? (
            <>
              <span
                className="inline-flex items-center gap-1 rounded-md border border-ink px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase"
                style={{ background: '#3ddc97' }}
              >
                <Server className="size-3" strokeWidth={2} aria-hidden />
                Local LLM · {localLlmModel}
              </span>
              <span className="text-black/75">
                Running locally via Ollama / LM Studio (0 credits)
              </span>
              <Link
                href="/settings#local-llm"
                className="inline-flex h-6 items-center gap-1 rounded-md border border-ink bg-paper px-2 text-[11px] font-semibold text-ink transition-colors hover:bg-mist"
              >
                Manage local LLM
                <ArrowRight className="size-3" strokeWidth={2} aria-hidden />
              </Link>
            </>
          ) : (
            <>
              <span
                className="inline-flex items-center gap-1 rounded-md border border-ink px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase"
                style={{ background: byokActive ? '#3ddc97' : '#ddd6fe' }}
              >
                {byokActive ? (
                  <CheckCircle2 className="size-3" strokeWidth={2} aria-hidden />
                ) : (
                  <KeyRound className="size-3" strokeWidth={2} aria-hidden />
                )}
                {byokActive ? `BYOK active · ${maskedKey}` : 'Cloud AI · BYOK'}
              </span>
              <span className="text-black/75">
                {byokActive
                  ? 'Using your Gemini API key (0 Motionpop credits)'
                  : 'Bring your own Gemini API key · 0 credits · browser-only'}
              </span>
              <Link
                href="/settings#byok"
                className={cn(
                  'inline-flex h-6 items-center gap-1 rounded-md border border-ink px-2 text-[11px] font-semibold transition-colors',
                  byokActive
                    ? 'bg-paper text-ink hover:bg-mist'
                    : 'bg-ink text-paper hover:bg-flame hover:text-ink',
                )}
              >
                {byokActive ? 'Manage API key' : 'Add Gemini API key'}
                <ArrowRight className="size-3" strokeWidth={2} aria-hidden />
              </Link>
            </>
          )}
          <Link
            href="/settings#ai"
            className="text-[11px] font-medium underline decoration-[1.5px] underline-offset-3 hover:decoration-flame"
          >
            AI settings
          </Link>
        </div>
      </div>
    </div>
  );
}
