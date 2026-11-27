'use client';

import { motion } from 'motion/react';
import Link from 'next/link';
import { Tooltip } from '@/components/ui/tooltip';
import { useAIStatus, type Availability } from '@/lib/ai/ai-status';
import { cn } from '@/lib/cn';
import { useStill } from '@/lib/motion/use-still';
import { usePreferOnDevice } from '@/lib/settings/use-prefer-on-device';

export type NanoLampState = 'on' | 'off' | 'downloading' | 'checking';

export interface NanoLampView {
  state: NanoLampState;
  label: string;
  sublabel: string;
  statusWord: 'Ready' | 'Off' | 'Downloading' | 'Checking';
  tooltip: string;
}

function clampPercent(progress: number | null | undefined): number {
  if (typeof progress !== 'number' || !Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(100, Math.round(progress * 100)));
}

/**
 * Resolves live Gemini Nano availability + user preference into the tally-light state shown on the
 * dashboard and editor. Green (`on`) when Chrome's on-device Gemini Nano is ready and enabled;
 * red (`off`) when unavailable, not yet downloaded, or paused in Settings.
 */
export function resolveNanoLamp(input: {
  availability: Availability;
  preferOnDevice: boolean;
  setupActive: boolean;
  setupProgress: number | null;
}): NanoLampView {
  const { availability, preferOnDevice, setupActive, setupProgress } = input;
  if (setupActive && availability === 'downloading') {
    const pct = clampPercent(setupProgress);
    return {
      state: 'downloading',
      label: `On-Device · ${pct}%`,
      sublabel: 'Gemini Nano',
      statusWord: 'Downloading',
      tooltip: `Downloading Gemini Nano on-device model (${pct}%). Click to view AI settings.`,
    };
  }
  if (availability === 'checking') {
    return {
      state: 'checking',
      label: 'On-Device',
      sublabel: 'Gemini Nano',
      statusWord: 'Checking',
      tooltip: 'Checking Gemini Nano on-device AI availability…',
    };
  }
  if (availability === 'available' && preferOnDevice) {
    return {
      state: 'on',
      label: 'On-Device',
      sublabel: 'Gemini Nano',
      statusWord: 'Ready',
      tooltip:
        'Gemini Nano on-device AI is active (0 credits · private · works offline). Click to open AI settings.',
    };
  }
  if (availability === 'available' && !preferOnDevice) {
    return {
      state: 'off',
      label: 'On-Device',
      sublabel: 'Gemini Nano',
      statusWord: 'Off',
      tooltip:
        'Gemini Nano is ready on this device but turned off in AI settings (using Cloud AI). Click to enable.',
    };
  }
  if (availability === 'downloadable' || availability === 'downloading') {
    return {
      state: 'off',
      label: 'On-Device',
      sublabel: 'Gemini Nano',
      statusWord: 'Off',
      tooltip:
        'Gemini Nano is not downloaded yet (using Cloud AI). Click to set up in AI settings.',
    };
  }
  return {
    state: 'off',
    label: 'On-Device',
    sublabel: 'Gemini Nano',
    statusWord: 'Off',
    tooltip:
      'Gemini Nano is unavailable in this browser (using Cloud AI). Click for Desktop Chrome setup instructions.',
  };
}

const LAMP_DOT: Record<NanoLampState, { core: string; halo: string; glow: string }> = {
  on: {
    core: 'bg-[#22c55e]',
    halo: 'bg-[#3ddc97]',
    glow: 'shadow-[0_0_8px_rgba(34,197,94,0.85)]',
  },
  off: {
    core: 'bg-[#ef4444]',
    halo: 'bg-[#ff5a5f]',
    glow: 'shadow-[0_0_7px_rgba(239,68,68,0.75)]',
  },
  downloading: {
    core: 'bg-[#38bdf8]',
    halo: 'bg-[#8dbceb]',
    glow: 'shadow-[0_0_8px_rgba(56,189,248,0.8)]',
  },
  checking: {
    core: 'bg-[#f59e0b]',
    halo: 'bg-[#ffc24b]',
    glow: 'shadow-[0_0_7px_rgba(245,158,11,0.7)]',
  },
};

function TallyLight({ state }: { state: NanoLampState }) {
  const reduce = useStill();
  const style = LAMP_DOT[state];
  const shouldPulse = state === 'on' || state === 'downloading' || state === 'checking';
  return (
    <span
      aria-hidden
      data-nano-light={state}
      className="relative inline-flex size-2.5 shrink-0 items-center justify-center"
    >
      {shouldPulse && (
        <motion.span
          className={cn('absolute inset-0 rounded-full opacity-0', style.halo)}
          animate={reduce ? { opacity: 0 } : { scale: [1, 2], opacity: [0.45, 0] }}
          transition={
            reduce ? { duration: 0 } : { duration: 2.2, repeat: Infinity, ease: 'easeOut' }
          }
        />
      )}
      <span
        className={cn(
          'relative size-2.5 rounded-full border border-[#000000]/15',
          style.core,
          style.glow,
        )}
      />
    </span>
  );
}

/**
 * Always-visible Gemini Nano on-device status indicator (studio tally-light pill).
 * Green light when Gemini Nano is active on-device; red light when unavailable/off.
 *
 * Uses explicit hex colours on the paper dashboard rather than `text-white`/`bg-white` because
 * `[data-paper]` inverts `--color-white` to `#000000` in `globals.css`.
 */
export function GeminiNanoStatus({
  variant,
  onOpenSettings,
  className,
}: {
  variant: 'dashboard' | 'editor';
  /** Editor opens the inline Settings panel scrolled to `#ai`; dashboard links to `/settings#ai`. */
  onOpenSettings?: () => void;
  className?: string;
}) {
  const { availability, setupActive, setupProgress } = useAIStatus();
  const { preferOnDevice } = usePreferOnDevice();
  const lamp = resolveNanoLamp({ availability, preferOnDevice, setupActive, setupProgress });
  const ariaLabel = `Gemini Nano on-device AI: ${lamp.statusWord}`;

  if (variant === 'dashboard') {
    const sublabelColor =
      lamp.state === 'on'
        ? 'text-[#0b6e47]'
        : lamp.state === 'downloading'
          ? 'text-[#0369a1]'
          : lamp.state === 'checking'
            ? 'text-[#a16207]'
            : 'text-[#c81e1e]';
    const surfaceBg =
      lamp.state === 'on'
        ? 'bg-[#ecfdf5]'
        : lamp.state === 'downloading'
          ? 'bg-[#f0f9ff]'
          : lamp.state === 'checking'
            ? 'bg-[#fffbeb]'
            : 'bg-[#ffffff]';
    return (
      <Link
        href="/settings#ai"
        role="status"
        aria-live="polite"
        aria-label={ariaLabel}
        title={lamp.tooltip}
        data-testid="gemini-nano-status"
        data-nano-state={lamp.state}
        className={cn(
          'inline-flex h-7 shrink-0 items-center gap-2 rounded-full border-[1.5px] border-[#000000] px-2.5 text-[#111116] shadow-[2px_2px_0_#000000] transition-transform hover:-translate-y-px',
          surfaceBg,
          className,
        )}
      >
        <TallyLight state={lamp.state} />
        <span className="text-[12px] leading-none font-bold tracking-[0.01em] whitespace-nowrap text-[#111116]">
          {lamp.label}
        </span>
        <span aria-hidden className="h-3 w-px bg-[#000000]/20" />
        <span
          className={cn(
            'font-mono text-[10px] leading-none font-semibold tracking-wide whitespace-nowrap uppercase',
            sublabelColor,
          )}
        >
          {lamp.sublabel}
        </span>
      </Link>
    );
  }

  const editorBorder =
    lamp.state === 'on'
      ? 'border-[#22c55e]/60 hover:border-[#22c55e]/90'
      : lamp.state === 'downloading'
        ? 'border-[#38bdf8]/60 hover:border-[#38bdf8]/90'
        : lamp.state === 'checking'
          ? 'border-line-strong'
          : 'border-[#ef4444]/60 hover:border-[#ef4444]/90';

  return (
    <Tooltip content={lamp.tooltip} side="bottom">
      <button
        type="button"
        role="status"
        aria-live="polite"
        aria-label={ariaLabel}
        data-testid="gemini-nano-status"
        data-nano-state={lamp.state}
        onClick={onOpenSettings}
        className={cn(
          'inline-flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-full border-[1.5px] bg-glass px-2.5 text-text shadow-pop backdrop-blur-[16px] transition-colors',
          editorBorder,
          className,
        )}
      >
        <TallyLight state={lamp.state} />
        <span className="text-[12px] leading-none font-semibold tracking-[0.01em] whitespace-nowrap">
          {lamp.label}
        </span>
        <span aria-hidden className="h-3 w-px bg-current opacity-20" />
        <span className="font-mono text-[10px] leading-none font-medium tracking-wide whitespace-nowrap text-text-2 uppercase">
          {lamp.sublabel}
        </span>
      </button>
    </Tooltip>
  );
}
