'use client';

import { Cloud, Coins, KeyRound } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { NumberRoll } from '@/components/ui/number-roll';
import { Shimmer } from '@/components/ui/shimmer';
import { useByok } from '@/lib/ai/byok';
import { cn } from '@/lib/cn';
import { useCreditsBalance } from '@/lib/credits/use-credits-client';
import { useCredits } from '@/lib/credits/use-credits';
import {
  REASON_TEXT,
  costRows,
  planLine,
  relativeTime,
  signedDelta,
} from '@/lib/credits/ledger-text';
import { useLedger } from '@/lib/credits/use-ledger';
import { useAppConfig } from '@/lib/renders/hooks';
import { txMillis } from '@/lib/credits/tx-time';
import { SectionCard, type SettingsVariant } from './section-card';

/** Credits (R6.4): the balance, the plan line, what things cost, and the last 20 ledger rows. */
export function CreditsSection({ variant, nowMs }: { variant: SettingsVariant; nowMs?: number }) {
  const balance = useCreditsBalance();
  const { plan } = useCredits();
  const { active: byokActive } = useByok();
  const config = useAppConfig();
  const ledger = useLedger(balance);
  // Fixed when the section opens; the ledger itself is re-read when the balance changes.
  const [now] = useState(() => nowMs ?? Date.now());

  return (
    <SectionCard id="credits" title="Credits" variant={variant}>
      <div className="flex items-end justify-between gap-4">
        <div>
          {balance === null ? (
            <span
              aria-label="Credits loading"
              className="relative block h-9 w-20 overflow-hidden rounded-md bg-white/10"
            >
              <Shimmer tone="neutral" />
            </span>
          ) : (
            <NumberRoll
              value={balance}
              className={cn(
                'leading-none font-medium',
                variant === 'page' ? 'text-[32px]' : 'text-[28px]',
              )}
              aria-label={`${balance} credits`}
            />
          )}
          <p className="mt-1.5 text-xs leading-4 text-text-2" data-testid="plan-line">
            {planLine(plan, config.freeCredits) || 'Credits sync when you sign in.'}
          </p>
        </div>
        <Link
          href="/pricing"
          className={cn(
            'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-chip px-3 text-xs font-medium transition-colors',
            variant === 'page'
              ? 'border-2 border-ink bg-flame text-white shadow-[2px_2px_0_#000] hover:brightness-105'
              : 'bg-ember text-white hover:brightness-110',
          )}
        >
          <Coins className="size-3.5" strokeWidth={2} aria-hidden />
          Buy credits
        </Link>
      </div>

      {byokActive && (
        <div
          className={cn(
            'mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-xs leading-4',
            variant === 'page'
              ? 'border-2 border-ink bg-[#d1fae5] text-ink'
              : 'bg-mint-tint text-mint-ink',
          )}
        >
          <KeyRound className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />
          <span>
            Your Gemini API key (BYOK) is active — cloud Gemini tasks use{' '}
            <strong>0 Motionpop credits</strong>.
          </span>
        </div>
      )}

      <p className="label-caps mt-5 text-[10px]">What things cost</p>
      <ul className="mt-2 divide-y divide-white/6" aria-label="Credit costs">
        {costRows(config).map((r) => (
          <li key={r.label} className="flex items-center justify-between py-2 text-xs leading-4">
            <span className="text-text-2">
              {r.label}
              {r.suffix && <span className="text-text-3"> {r.suffix}</span>}
            </span>
            {r.route === 'cloud' ? (
              <span className="inline-flex h-[18px] items-center gap-1 rounded-md bg-white/10 px-1.5 font-mono text-[9px] text-violet-ink-2">
                <Cloud className="size-2.5" strokeWidth={1.5} aria-hidden />
                <span aria-label={`${r.credits} credits, runs in the cloud`}>{r.credits}</span>
              </span>
            ) : (
              <span className="tabular font-mono text-[11px] text-ember-soft">{r.credits}</span>
            )}
          </li>
        ))}
      </ul>

      <p className="label-caps mt-5 text-[10px]">Recent activity</p>
      <div className="mt-2" data-testid="ledger">
        {ledger.status === 'loading' && (
          <div className="relative h-16 overflow-hidden rounded-chip bg-white/5" aria-busy>
            <Shimmer tone="neutral" />
          </div>
        )}
        {ledger.status === 'error' && (
          <p className="text-xs leading-4 text-text-3">Couldn&apos;t load your activity.</p>
        )}
        {ledger.status === 'none' && (
          <p className="text-xs leading-4 text-text-3">
            Your activity shows up here once you sign in.
          </p>
        )}
        {ledger.status === 'ready' && ledger.rows.length === 0 && (
          <p className="text-xs leading-4 text-text-3">Nothing yet.</p>
        )}
        {ledger.status === 'ready' && ledger.rows.length > 0 && (
          <ul className="divide-y divide-white/6">
            {ledger.rows.map((row) => (
              <li
                key={row.id}
                data-testid="ledger-row"
                className="flex items-center justify-between gap-3 py-2 text-xs leading-4"
              >
                <span className="min-w-0">
                  <span className="block truncate text-text">{REASON_TEXT[row.reason]}</span>
                  <span className="block text-[10px] leading-[13px] text-text-3">
                    {relativeTime(txMillis(row.at), now)}
                  </span>
                </span>
                <span
                  className={cn(
                    'tabular shrink-0 font-mono text-[12px]',
                    row.delta < 0 ? 'text-ember-soft' : 'text-mint-ink',
                  )}
                >
                  {signedDelta(row.delta)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-4 text-[10px] leading-[13px] text-text-3">
        Credits never go below zero. Failed cloud work is refunded.
      </p>
      <p className="mt-1 text-[10px] leading-[13px] text-text-3">
        Prefer 0-credit runs? Turn on free on-device Gemini Nano or add your own Gemini API key
        (BYOK) in{' '}
        <a href="#byok" className="underline hover:text-text">
          AI &amp; models
        </a>
        .
      </p>
    </SectionCard>
  );
}
