import {
  APP_CONFIG_DEFAULTS,
  costOf,
  type CostConfig,
  type CreditReason,
  type Plan,
} from '@motionpop/schemas';

/** A ledger reason in words (R6.4). */
export const REASON_TEXT: Record<CreditReason, string> = {
  signup: 'Welcome credits',
  'judge-grant': 'Judge top-up',
  purchase: 'Purchased credits',
  'purchase-reversal': 'Payment refund / reversal',
  'purchase-restore': 'Dispute resolved · credits restored',
  generate: 'Generated a graphic',
  edit: 'Cloud quick edit',
  'pip-plan': 'Pip plan',
  custom: 'Custom graphic',
  film: 'Made a film',
  reel: 'Directed a reel',
  'slots-detect': 'Found moments',
  tts: 'Generated a voice',
  transcribe: 'Transcribed audio',
  image: 'Generated an image',
  export: 'Exported a video',
  refund: 'Refund',
};

/** "just now", "5 min ago", "3 h ago", "2 d ago", else the date. Pure (takes `nowMs`). */
export function relativeTime(thenMs: number, nowMs: number): string {
  const s = Math.max(0, Math.round((nowMs - thenMs) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 14) return `${d} d ago`;
  return new Date(thenMs).toISOString().slice(0, 10);
}

/** "+3" or "−3" (a real minus sign) for a ledger delta. */
export const signedDelta = (delta: number): string =>
  delta > 0 ? `+${delta}` : delta < 0 ? `\u2212${-delta}` : '0';

export interface CostRow {
  label: string;
  /** Credits shown after the icon. */
  credits: number;
  /** "+ graphics" and the like. */
  suffix?: string;
  route: 'cloud' | 'export';
}

/** The price list of Settings › Credits, all from `costOf` so it never drifts from the chips. */
export function costRows(cfg: CostConfig = APP_CONFIG_DEFAULTS): CostRow[] {
  const exportCredits = costOf('export', 1, cfg, { resolution: '1080p', durationMs: 18_000 });
  return [
    { label: 'Generate a graphic', credits: costOf('generate', 1, cfg), route: 'cloud' },
    { label: 'Cloud quick edit', credits: costOf('edit', 1, cfg), route: 'cloud' },
    {
      label: 'Pip plan',
      credits: costOf('pip-plan', 1, cfg),
      suffix: '+ graphics',
      route: 'cloud',
    },
    // Exports are free by default (spec 13b R1): the row shows only a paid export price.
    ...(exportCredits > 0
      ? [{ label: 'Export 1080p', credits: exportCredits, route: 'export' as const }]
      : []),
  ];
}

export function planLine(plan: Plan | null, signupCredits: number): string {
  if (plan === 'judge') return 'Judge plan · topped up daily';
  if (plan === 'pro') return 'Studio plan · pay-as-you-go credits';
  if (plan === 'creator') return 'Creator plan · pay-as-you-go credits';
  if (plan === null) return '';
  return `Free plan · ${signupCredits} credits on sign-up`;
}
