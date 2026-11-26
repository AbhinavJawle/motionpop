'use client';

import { Check, Cloud, KeyRound, Server, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { useByok } from '@/lib/ai/byok';
import { useLocalLlm } from '@/lib/ai/local-llm';
import { cn } from '@/lib/cn';
import { popIn } from '@/lib/motion/presets';

/**
 * Chips, measured from design/figma-export.css:
 * - "Free on-device chip" (l.3470): h19, r10, #16251F, inset highlight, Geist 9px #78DDB0.
 * - "Cloud cost on Generate" (l.3388): h18, r6, white/10, inset highlight, Geist Mono 9px #BFAFFF.
 * - "Synced status" (l.3680): h22, r11, mint tint, glass shadow, Geist 10px mint ink.
 * Chips pop in with a small overshoot.
 */

const tones = {
  neutral: 'bg-card-2 text-text-2',
  mint: 'bg-mint-tint text-mint-ink',
  violet: 'bg-violet-sel text-violet-ink',
  ember: 'bg-ember/15 text-ember-soft',
  glass: 'bg-white/10 text-violet-ink-2',
} as const;

export type ChipTone = keyof typeof tones;

export function Chip({
  tone = 'neutral',
  icon,
  children,
  className,
  pill = true,
}: {
  tone?: ChipTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Full pill (default) or 6px corners for chips inside buttons. */
  pill?: boolean;
}) {
  return (
    <motion.span
      {...popIn}
      className={cn(
        'inline-flex h-[19px] items-center gap-1 px-2 text-[9px] leading-3 whitespace-nowrap shadow-quiet [&_svg]:size-2.5',
        pill ? 'rounded-full' : 'rounded-md',
        tones[tone],
        className,
      )}
    >
      {icon}
      {children}
    </motion.span>
  );
}

/** Route chip shown before every AI action (hybrid-ai.md): mint `⚡ free · on-device`, `Local · 0`, `BYOK · 0`, or violet `☁ N`. */
export function CostChip({
  route,
  credits = 0,
  byok,
  localLlm,
  label,
  hint,
  className,
}: {
  route: 'device' | 'cloud';
  credits?: number;
  /** True when user-supplied Gemini BYOK is active (0 Motionpop credits). Defaults to live store. */
  byok?: boolean;
  /** True when a local LLM server (Ollama / LM Studio) is active (0 Motionpop credits). */
  localLlm?: boolean;
  /** Shown instead of the number when the cost is a range ("1–4"). */
  label?: string;
  /** What the range means (tooltip and screen readers). */
  hint?: string;
  className?: string;
}) {
  const { active: byokStoreActive } = useByok();
  const { active: localStoreActive, model: localModel } = useLocalLlm();
  const usingLocalLlm = localLlm ?? localStoreActive;
  const usingByok = byok ?? byokStoreActive;
  if (route === 'device') {
    return (
      // The design's bolt is a filled amber ⚡ (editor.png, "Free on-device chip"), with a faint mint ring.
      <Chip
        tone="mint"
        icon={<Zap strokeWidth={0} className="fill-bolt" aria-hidden />}
        className={cn('shadow-[inset_0_0_0_1px_rgb(61_220_151/0.14)]', className)}
      >
        free · on-device
      </Chip>
    );
  }
  if (usingLocalLlm) {
    return (
      <Chip
        tone="mint"
        pill={false}
        icon={<Server strokeWidth={1.75} aria-hidden />}
        className={cn('h-[18px] px-1.5 font-mono', className)}
      >
        <span
          title={
            hint ??
            `Using your local LLM${localModel ? ` (${localModel})` : ''} (0 Motionpop credits)`
          }
          aria-label={hint ?? '0 credits, using your local LLM'}
        >
          Local · 0
        </span>
      </Chip>
    );
  }
  if (usingByok) {
    return (
      <Chip
        tone="mint"
        pill={false}
        icon={<KeyRound strokeWidth={1.75} aria-hidden />}
        className={cn('h-[18px] px-1.5 font-mono', className)}
      >
        <span
          title={hint ?? 'Using your Gemini API key (0 Motionpop credits)'}
          aria-label={hint ?? '0 credits, using your Gemini API key'}
        >
          BYOK · 0
        </span>
      </Chip>
    );
  }
  return (
    <Chip
      tone="glass"
      pill={false}
      icon={<Cloud strokeWidth={1.5} aria-hidden />}
      className={cn('h-[18px] px-1.5 font-mono', className)}
    >
      <span title={hint} aria-label={hint ?? `${credits} credits, runs in the cloud`}>
        {label ?? credits}
      </span>
    </Chip>
  );
}

/** "✓ Synced" status pill (transcript header). */
export function SyncedChip({ label = 'Synced' }: { label?: string }) {
  return (
    <Chip
      tone="mint"
      icon={<Check strokeWidth={2} aria-hidden />}
      className="h-[22px] px-2.5 text-[10px] leading-[13px] shadow-glass"
    >
      {label}
    </Chip>
  );
}
