'use client';

import { Cloud, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { springSoft } from '@/lib/motion/presets';
import { useStill } from '@/lib/motion/use-still';
import { medianLabel, medianValue, type UsageSummary } from '@/lib/usage/aggregate';
import type { SettingsVariant } from './section-card';

const CHART_HEIGHT = 88;
const MIN_SEGMENT = 3;

/**
 * Bars fill the card's width (flex), with a gap per variant. Changed from the design text's fixed
 * 8 px and 24 px bars: fixed bars left a third of the card empty at 1440 (design check, task 14).
 */
const BAR = { panel: { gap: 6 }, page: { gap: 12 } } as const;

/** Segment heights in px for one day, scaled to `max` (a non-empty segment is never thinner than 3 px). */
export function segmentHeights(
  device: number,
  cloud: number,
  max: number,
  height: number = CHART_HEIGHT,
): { device: number; cloud: number } {
  if (max <= 0) return { device: 0, cloud: 0 };
  const px = (n: number) => (n === 0 ? 0 : Math.max(MIN_SEGMENT, Math.round((n / max) * height)));
  return { device: px(device), cloud: px(cloud) };
}

export function usageChartLabel(summary: UsageSummary): string {
  const f = summary.figures;
  const cloud = summary.days.reduce((n, d) => n + d.cloud, 0);
  return `AI calls in the last ${summary.days.length} days: ${f.deviceCalls} on your device, ${cloud} in the cloud. Median ${medianLabel(f.medianDeviceMs)} on device, ${medianLabel(f.medianCloudMs)} in the cloud`;
}

/**
 * Usage (R7.3): 14 stacked bars, on-device (mint) under cloud (violet), UTC day ticks, a legend in
 * the cost-chip colours, and three figures. Bars grow from zero with a spring; still under
 * reduced motion. `scope: 'session'` is the local-mode "This session" view (R7.4).
 */
export function UsageChart({
  summary,
  scope,
  variant,
  loading,
  failed,
}: {
  summary: UsageSummary;
  scope: 'account' | 'session';
  variant: SettingsVariant;
  loading?: boolean;
  failed?: boolean;
}) {
  const still = useStill();
  const { gap } = BAR[variant];
  const days = summary.days;
  const max = Math.max(1, ...days.map((d) => d.device + d.cloud));
  const total = days.reduce((n, d) => n + d.device + d.cloud, 0);
  const f = summary.figures;

  return (
    <div data-testid="usage-chart">
      <div className="flex items-center justify-between">
        <p className="label-caps text-[10px]">
          {scope === 'session' ? 'This session' : 'Last 14 days'}
        </p>
        <div className="flex items-center gap-1.5">
          <span className="inline-flex h-[19px] items-center gap-1 rounded-full bg-mint-tint px-2 text-[9px] text-mint-ink">
            <Zap className="size-2.5" strokeWidth={1.5} aria-hidden />
            On-device · free
          </span>
          <span className="inline-flex h-[18px] items-center gap-1 rounded-md bg-white/10 px-1.5 text-[9px] text-violet-ink-2">
            <Cloud className="size-2.5" strokeWidth={1.5} aria-hidden />
            Cloud
          </span>
        </div>
      </div>

      <div
        role="img"
        aria-label={usageChartLabel(summary)}
        className="relative mt-3"
        style={{ height: CHART_HEIGHT + 18 }}
      >
        <div className="relative w-full">
          <div className="flex items-end" style={{ height: CHART_HEIGHT, gap }}>
            {days.map((d, i) => {
              const h = segmentHeights(d.device, d.cloud, max);
              return (
                <div
                  key={d.day}
                  data-testid="usage-bar"
                  data-day={d.day}
                  data-device={d.device}
                  data-cloud={d.cloud}
                  className="flex min-w-0 flex-1 flex-col justify-end"
                  style={{ height: CHART_HEIGHT }}
                >
                  {h.cloud > 0 && (
                    <motion.span
                      data-segment="cloud"
                      className="block w-full rounded-t-[3px] bg-violet"
                      initial={still ? false : { height: 0 }}
                      animate={{ height: h.cloud }}
                      transition={{ ...springSoft, delay: still ? 0 : i * 0.02 }}
                    />
                  )}
                  {h.device > 0 && (
                    <motion.span
                      data-segment="device"
                      className={cn('block w-full bg-mint', h.cloud === 0 && 'rounded-t-[3px]')}
                      initial={still ? false : { height: 0 }}
                      animate={{ height: h.device }}
                      transition={{ ...springSoft, delay: still ? 0 : i * 0.02 }}
                    />
                  )}
                  {h.device === 0 && h.cloud === 0 && (
                    <span className="block h-px w-full bg-white/10" aria-hidden />
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-1.5 flex" style={{ gap }} aria-hidden>
            {days.map((d, i) => (
              <span
                key={d.day}
                className="min-w-0 flex-1 text-center font-mono text-[9px] leading-3 text-text-4"
              >
                {variant === 'panel' && i % 2 === 1 ? '' : Number(d.day.slice(8, 10))}
              </span>
            ))}
          </div>
        </div>
        {!loading && total === 0 && !failed && (
          <p className="absolute inset-x-0 top-8 text-center text-xs leading-4 text-text-3">
            No AI calls yet. Try a quick edit.
          </p>
        )}
        {failed && (
          <p className="absolute inset-x-0 top-8 text-center text-xs leading-4 text-text-3">
            Couldn&apos;t load your usage.
          </p>
        )}
      </div>

      <dl className="mt-3 space-y-1.5 text-xs leading-4">
        <Figure
          value={String(f.deviceCalls)}
          tone="mint"
          label={f.deviceCalls === 1 ? 'call ran on your device' : 'calls ran on your device'}
        />
        <div className="flex flex-wrap items-baseline gap-x-2" data-testid="median-figure">
          <dt className="tabular font-mono text-mint-ink">{medianValue(f.medianDeviceMs)}</dt>
          <dd className="text-text-2">
            median on device ·{' '}
            <span className="tabular font-mono text-violet-ink-2">
              {medianValue(f.medianCloudMs)}
            </span>{' '}
            in the cloud
          </dd>
        </div>
        <Figure value={`~${f.creditsSaved}`} tone="ember" label="credits saved" />
      </dl>
      <p className="mt-3 text-[10px] leading-[13px] text-text-3">
        Usage is reported by your browser.
      </p>
    </div>
  );
}

function Figure({ value, label, tone }: { value: string; label: string; tone: 'mint' | 'ember' }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt
        className={cn('tabular font-mono', tone === 'mint' ? 'text-mint-ink' : 'text-ember-soft')}
      >
        {value}
      </dt>
      <dd className="text-text-2">{label}</dd>
    </div>
  );
}
