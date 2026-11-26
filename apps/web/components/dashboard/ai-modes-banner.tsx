'use client';

import { ArrowRight, CheckCircle2, Cpu, Download, KeyRound, Server, Zap } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { OnDeviceDownloadModal } from '@/components/settings/on-device-download-modal';
import { cancelSetUp, setUpOnDevice, useAIStatus } from '@/lib/ai/ai-status';
import { useByok } from '@/lib/ai/byok';
import { useLocalLlm } from '@/lib/ai/local-llm';
import { cn } from '@/lib/cn';

/**
 * Slim top Hybrid AI status bar sitting directly below the navbar on `/dashboard` (Spec 42).
 * Surfaces both zero-credit AI modes — Local On-Device AI (Chrome Gemini Nano) and Bring Your Own
 * Gemini API Key (BYOK) — in a tight ~44px strip so Recent Projects stay visible above the fold.
 */
export function AiModesBanner() {
  const { availability, setupProgress } = useAIStatus();
  const { active: byokActive, maskedKey } = useByok();
  const { active: localLlmActive, model: localLlmModel } = useLocalLlm();
  const [confirming, setConfirming] = useState(false);

  const nanoBadge =
    availability === 'available'
      ? { bg: '#3ddc97', text: 'Ready · 0 cr' }
      : availability === 'downloadable'
        ? { bg: '#fde68a', text: 'Downloadable · 0 cr' }
        : availability === 'downloading'
          ? { bg: '#8dbceb', text: `Downloading · ${Math.round((setupProgress ?? 0) * 100)}%` }
          : availability === 'checking'
            ? { bg: '#e5e7eb', text: 'Checking…' }
            : { bg: '#a7f3d0', text: 'Chrome 139+ · 0 cr' };

  return (
    <div
      role="region"
      aria-label="AI options: local on-device AI and bring your own key"
      data-testid="dashboard-ai-modes"
      className="border-b-2 border-ink bg-paper/95"
    >
      <div className="mx-auto flex w-full max-w-[1240px] flex-wrap items-center justify-between gap-x-5 gap-y-2 px-6 py-2 text-[12px] lg:px-10">
        {/* Segment 1: Local On-Device AI (Gemini Nano) */}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1 rounded-md border border-ink px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase"
            style={{ background: nanoBadge.bg }}
          >
            {availability === 'available' ? (
              <Zap className="size-3" strokeWidth={2.2} aria-hidden />
            ) : (
              <Cpu className="size-3" strokeWidth={2} aria-hidden />
            )}
            Local on-device AI
          </span>
          <span className="font-mono text-[11px] font-medium text-ink">{nanoBadge.text}</span>
          <span className="hidden text-black/65 xl:inline">
            Gemini Nano runs edits privately &amp; offline
          </span>
          {availability === 'downloadable' && (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="inline-flex h-6 items-center gap-1 rounded-md border border-ink bg-flame px-2 text-[11px] font-semibold text-ink transition-transform hover:-translate-y-px"
            >
              <Download className="size-3" strokeWidth={2} aria-hidden />
              Set up Gemini Nano
            </button>
          )}
          {availability === 'downloading' && (
            <button
              type="button"
              onClick={cancelSetUp}
              className="inline-flex h-6 items-center rounded-md border border-ink bg-paper px-2 text-[11px] font-medium hover:bg-mist"
            >
              Cancel
            </button>
          )}
          <Link
            href="/settings#ai"
            className="text-[11px] font-medium underline decoration-[1.5px] underline-offset-3 hover:decoration-flame"
          >
            AI settings
          </Link>
        </div>

        <span aria-hidden className="hidden h-4 w-[1.5px] bg-black/20 lg:block" />

        {/* Segment 2: Local LLM (Ollama / LM Studio) or Cloud AI / Bring Your Own Gemini Key (BYOK) */}
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
        </div>
      </div>

      <OnDeviceDownloadModal
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => void setUpOnDevice()}
      />
    </div>
  );
}
