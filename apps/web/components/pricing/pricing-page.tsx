'use client';

import {
  APP_CONFIG_DEFAULTS,
  CREDIT_PACKS,
  costOf,
  exportCost,
  formatPackPriceUsd,
  type BillingPacksResponse,
  type BillingStatusResponse,
  type CreditPackId,
} from '@motionpop/schemas';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Cloud,
  Coins,
  KeyRound,
  Loader2,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AppBar } from '@/components/paper/app-bar';
import { btn, paper, PaperPage, poster, Sprockets } from '@/components/paper/kit';
import { useAuth } from '@/lib/auth/auth-provider';
import {
  fetchBillingPacks,
  fetchPaymentStatus,
  startPackCheckout,
} from '@/lib/billing/client';
import { cn } from '@/lib/cn';
import { userStore } from '@/lib/credits/firestore-listen';
import { planLine } from '@/lib/credits/ledger-text';
import { useCredits } from '@/lib/credits/use-credits';
import { useCreditsBalance } from '@/lib/credits/use-credits-client';
import { useAppConfig } from '@/lib/renders/hooks';

const STATUS_POLL_MS = 2000;
const STATUS_MAX_POLLS = 15;

export interface PricingPageProps {
  /** Injected in tests to avoid navigating `window.location.href`. */
  onRedirect?: (url: string) => void;
}

export function PricingPage({ onRedirect }: PricingPageProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const auth = useAuth();
  const balance = useCreditsBalance();
  const { plan } = useCredits();
  const config = useAppConfig();
  const cfg = { ...APP_CONFIG_DEFAULTS, ...config };

  const [packsInfo, setPacksInfo] = useState<BillingPacksResponse | null>(null);
  const [packsError, setPacksError] = useState(false);
  const [busyPack, setBusyPack] = useState<CreditPackId | null>(null);
  const [returnStatus, setReturnStatus] = useState<BillingStatusResponse | null>(null);
  const [polling, setPolling] = useState(false);

  const returnPaymentId = searchParams.get('payment_id')?.trim() ?? '';
  const returnQueryStatus = searchParams.get('status')?.trim().toLowerCase() ?? '';
  const isReturn =
    Boolean(returnPaymentId) ||
    Boolean(returnQueryStatus) ||
    searchParams.get('checkout') === 'return';
  const isFailedReturn =
    returnQueryStatus === 'failed' ||
    returnQueryStatus === 'cancelled' ||
    returnQueryStatus === 'expired';

  // Reset spinner if the user navigates back from hosted checkout via browser BFCache.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setBusyPack(null);
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  useEffect(() => {
    let active = true;
    fetchBillingPacks()
      .then((info) => {
        if (active) setPacksInfo(info);
      })
      .catch(() => {
        if (active) setPacksError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  // Poll read-only payment settlement status after returning from Dodo checkout.
  // Credits are granted strictly by the verified webhook, never from URL query params.
  useEffect(() => {
    if (!isReturn || !returnPaymentId || auth.status !== 'signed-in') return;
    if (isFailedReturn) return;

    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const { uid, getIdToken } = auth.user;

    const poll = async () => {
      if (cancelled) return;
      setPolling(true);
      try {
        const res = await fetchPaymentStatus(returnPaymentId, getIdToken);
        if (cancelled) return;
        setReturnStatus(res);
        if (res.status === 'settled' || res.status === 'reversed') {
          if (res.balance !== null) userStore.setBalance(uid, res.balance);
          setPolling(false);
          return;
        }
      } catch {
        // Ignore transient poll errors; keep retrying until cap.
      }
      attempts += 1;
      if (!cancelled && attempts < STATUS_MAX_POLLS) {
        timer = setTimeout(() => {
          void poll();
        }, STATUS_POLL_MS);
      } else if (!cancelled) {
        setPolling(false);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [isReturn, isFailedReturn, returnPaymentId, auth]);

  const packsLoading = packsInfo === null && !packsError;
  const packAvailable = (id: CreditPackId): boolean => {
    if (!packsInfo) return false;
    return packsInfo.packs.find((p) => p.id === id)?.available ?? false;
  };

  const handleBuy = async (packId: CreditPackId) => {
    if (auth.status === 'signed-out') {
      router.push('/sign-in?next=/pricing');
      return;
    }
    if (auth.status !== 'signed-in') {
      toast.info('Sign in with a cloud account to purchase credits.');
      return;
    }
    setBusyPack(packId);
    try {
      const session = await startPackCheckout(packId, auth.user.getIdToken, 1);
      if (onRedirect) {
        onRedirect(session.checkoutUrl);
      } else {
        window.location.assign(session.checkoutUrl);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't start checkout.");
      setBusyPack(null);
    }
  };

  const exportCredits = exportCost('1080p', 60_000, cfg.exportCredits);
  const actionRows: readonly { label: string; route: 'device' | 'cloud'; cost: string }[] = [
    {
      label: 'On-device Gemini Nano quick edits, frame notes, Pip quick commands & Whisper',
      route: 'device',
      cost: 'Free',
    },
    {
      label: '1080p MP4 & transparent WebM overlay exports (with captions & audio)',
      route: 'device',
      cost: exportCredits === 0 ? 'Free' : `${exportCredits} credits`,
    },
    {
      label: 'Cloud quick edit or frame note escalation',
      route: 'cloud',
      cost: `${costOf('edit', 1, cfg)} cr`,
    },
    {
      label: 'Generate one motion graphic or custom sandboxed scene',
      route: 'cloud',
      cost: `${costOf('generate', 1, cfg)} cr`,
    },
    {
      label: 'Direct a full talking-head reel (21 templates + auto-edit + media)',
      route: 'cloud',
      cost: `${costOf('reel', 1, cfg)} cr`,
    },
    {
      label: 'Direct an AI motion film (per started 30 seconds)',
      route: 'cloud',
      cost: `${costOf('film', 1, cfg)} cr`,
    },
    {
      label: 'Gemini TTS voiceover (per started minute)',
      route: 'cloud',
      cost: `${costOf('tts', 1, cfg)} cr`,
    },
    {
      label: 'Custom 1K illustration or chroma-key cutout (Nano Banana 2.1)',
      route: 'cloud',
      cost: `${costOf('image', 1, cfg)} cr`,
    },
  ];

  return (
    <PaperPage>
      <AppBar active="pricing" />
      <main className="mx-auto max-w-[1160px] px-4 pt-10 pb-24 sm:px-6 lg:px-10">
        {/* Post-checkout confirmation banner */}
        {isReturn && (
          <section
            aria-live="polite"
            data-testid="checkout-return-banner"
            className={cn(
              'mb-8 rounded-2xl border-2 border-ink p-5 shadow-[4px_4px_0_#000]',
              isFailedReturn || returnStatus?.status === 'reversed'
                ? 'bg-[#fee2e2]'
                : returnStatus?.status === 'settled'
                  ? 'bg-[#d1fae5]'
                  : 'bg-[#fef3c7]',
            )}
          >
            {isFailedReturn ? (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-ink">Checkout wasn&apos;t completed</p>
                  <p className="mt-1 text-[13px] text-black/75">
                    No credits were added and you were not charged. Pick any pack below to try
                    again.
                  </p>
                </div>
                <Link href="/pricing" className={btn('paper', 'sm')}>
                  Dismiss
                </Link>
              </div>
            ) : returnStatus?.status === 'reversed' ? (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-ink">Payment was refunded or reversed</p>
                  <p className="mt-1 text-[13px] text-black/75">
                    Unspent credits from this payment were removed from your ledger.
                  </p>
                </div>
                <Link href="/settings#credits" className={btn('paper', 'sm')}>
                  View ledger
                </Link>
              </div>
            ) : returnStatus?.status === 'settled' ? (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#047857]" aria-hidden />
                  <div>
                    <p className="font-semibold text-ink">
                      Payment confirmed!{' '}
                      {returnStatus.credits ? `+${returnStatus.credits} credits added` : 'Credits added'}
                    </p>
                    <p className="mt-1 text-[13px] text-black/75">
                      Verified via Dodo Payments webhook.
                      {returnStatus.balance !== null && (
                        <>
                          {' '}
                          Current balance:{' '}
                          <strong className="font-mono">{returnStatus.balance} credits</strong>.
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <Link href="/start" className={btn('flame', 'sm', true)}>
                  Create a video <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Loader2
                    className={cn('mt-0.5 size-5 shrink-0 text-ink', polling && 'animate-spin')}
                    aria-hidden
                  />
                  <div>
                    <p className="font-semibold text-ink">
                      Thanks! Confirming your payment with Dodo Payments…
                    </p>
                    <p className="mt-1 text-[13px] text-black/75">
                      Credits are added automatically as soon as the verified webhook arrives
                      (usually a few seconds). You can also check your ledger in{' '}
                      <Link href="/settings#credits" className="font-medium underline">
                        Settings → Credits
                      </Link>
                      .
                    </p>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Header */}
        <header className="flex flex-col gap-6 border-b-2 border-ink pb-8 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-[#fef08a] px-3 py-0.5 text-[11px] font-semibold uppercase">
                <Coins className="size-3.5" strokeWidth={2} aria-hidden />
                One-time credit packs · Never expire
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-white px-3 py-0.5 text-[11px] font-semibold">
                <ShieldCheck className="size-3.5 text-[#047857]" strokeWidth={2} aria-hidden />
                Secured by Dodo Payments
              </span>
              {packsInfo?.environment === 'test_mode' && (
                <span
                  data-testid="test-mode-badge"
                  className="inline-flex items-center rounded-full border-2 border-ink bg-[#ffedd5] px-2.5 py-0.5 font-mono text-[10px] font-semibold text-[#9a3412] uppercase"
                >
                  Test checkout mode
                </span>
              )}
            </div>
            <h1 className={cn(poster, 'mt-4 text-[clamp(48px,6vw,84px)]')}>
              Simple credits. Zero subscriptions.
            </h1>
            <p className="mt-3 max-w-[640px] text-[15px] leading-[1.6] text-black/75">
              Every new account starts with{' '}
              <strong className="font-semibold text-ink">{cfg.freeCredits} free credits</strong>.
              On-device Chrome Gemini Nano edits and 1080p MP4 exports are free forever—buy a
              one-time pack whenever you want more frontier cloud directing, TTS, or custom scenes.
            </p>
          </div>

          {auth.status === 'signed-in' && (
            <div className={cn(paper, 'shrink-0 px-5 py-4')}>
              <p className="text-[11px] font-semibold tracking-[0.06em] text-black/55 uppercase">
                Your account
              </p>
              <div className="mt-1 flex items-baseline gap-2">
                <span
                  data-testid="pricing-balance"
                  className="font-poster text-[36px] leading-none text-ink tabular-nums"
                >
                  {balance ?? '–'}
                </span>
                <span className="text-[13px] font-medium text-black/70">credits available</span>
              </div>
              <p className="mt-1 text-[12px] text-black/65">
                {planLine(plan, cfg.freeCredits) || 'Loading plan…'}
              </p>
              <Link
                href="/settings#credits"
                className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-ink underline underline-offset-4"
              >
                View credit ledger
              </Link>
            </div>
          )}
        </header>

        {/* Pack Cards */}
        <section aria-labelledby="packs-heading" className="mt-10">
          <h2 id="packs-heading" className="sr-only">
            Credit packs
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            {CREDIT_PACKS.map((pack) => {
              const available = packAvailable(pack.id);
              const perCreditCents = (pack.priceCents / pack.credits).toFixed(1);
              const isBusy = busyPack === pack.id;
              return (
                <article
                  key={pack.id}
                  data-testid={`pack-card-${pack.id}`}
                  className={cn(
                    'relative flex flex-col rounded-2xl border-2 border-ink p-6 transition-transform',
                    pack.popular
                      ? 'bg-[#fffbeb] shadow-[7px_7px_0_#000]'
                      : 'bg-white shadow-[5px_5px_0_#000]',
                  )}
                >
                  {pack.popular && (
                    <span className="absolute -top-3.5 right-5 rounded-full border-2 border-ink bg-flame px-3 py-0.5 text-[11px] font-bold tracking-[0.04em] text-white uppercase">
                      Most popular
                    </span>
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className={cn(poster, 'text-[34px] leading-none')}>{pack.name}</h3>
                      <p className="mt-1.5 text-[13px] text-black/70">{pack.tagline}</p>
                    </div>
                  </div>

                  <div className="mt-6 flex items-baseline gap-2 border-y-2 border-ink/15 py-4">
                    <span className="font-poster text-[54px] leading-none text-ink tabular-nums">
                      {formatPackPriceUsd(pack.priceCents)}
                    </span>
                    <div className="text-[12px] leading-tight text-black/65">
                      <p className="font-semibold text-ink">{pack.credits} credits</p>
                      <p className="font-mono">{perCreditCents}¢ / credit · one-time</p>
                    </div>
                  </div>

                  <ul className="mt-5 flex-1 space-y-2.5 text-[13px] text-black/80">
                    <li className="flex items-start gap-2">
                      <Check
                        className="mt-0.5 size-4 shrink-0 text-[#047857]"
                        strokeWidth={2.5}
                        aria-hidden
                      />
                      <span>{pack.estimate}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check
                        className="mt-0.5 size-4 shrink-0 text-[#047857]"
                        strokeWidth={2.5}
                        aria-hidden
                      />
                      <span>Credits stack on your balance and never expire</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check
                        className="mt-0.5 size-4 shrink-0 text-[#047857]"
                        strokeWidth={2.5}
                        aria-hidden
                      />
                      <span>Automatic refunds on failed cloud jobs</span>
                    </li>
                  </ul>

                  <button
                    type="button"
                    disabled={
                      isBusy ||
                      busyPack !== null ||
                      auth.status === 'loading' ||
                      packsLoading ||
                      !available
                    }
                    onClick={() => void handleBuy(pack.id)}
                    className={cn(
                      btn(pack.popular ? 'flame' : 'ink', 'md', pack.popular),
                      'mt-6 w-full justify-center disabled:cursor-not-allowed disabled:opacity-55',
                    )}
                  >
                    {isBusy ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        Opening checkout…
                      </>
                    ) : packsLoading ? (
                      'Checking checkout…'
                    ) : !available ? (
                      'Coming soon'
                    ) : auth.status === 'signed-out' ? (
                      <>Sign in to buy {pack.credits} credits</>
                    ) : (
                      <>
                        Buy {pack.credits} credits
                        <ArrowRight className="size-4" aria-hidden />
                      </>
                    )}
                  </button>
                </article>
              );
            })}
          </div>

          {packsInfo && !packsInfo.configured && (
            <p className="mt-4 rounded-xl border-2 border-ink/40 bg-white/80 px-4 py-3 text-[12px] text-black/75">
              Paid credit packs are launching soon. Right now you can create with your{' '}
              <strong>{cfg.freeCredits} free welcome credits</strong>, unlimited on-device Chrome
              Gemini Nano edits, or your own Gemini API key in{' '}
              <Link href="/settings#byok" className="font-semibold underline">
                Settings → AI &amp; models
              </Link>
              .
            </p>
          )}
        </section>

        {/* Free Forever + BYOK cards */}
        <section className="mt-12 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border-2 border-ink bg-[#ecfdf5] p-6 shadow-[4px_4px_0_#000]">
            <div className="flex items-center gap-2">
              <span className="inline-flex size-8 items-center justify-center rounded-lg border-2 border-ink bg-[#3ddc97]">
                <Zap className="size-4 text-ink" strokeWidth={2} aria-hidden />
              </span>
              <h2 className={cn(poster, 'text-[28px] leading-none')}>
                Free tier · {cfg.freeCredits} welcome credits
              </h2>
            </div>
            <p className="mt-3 text-[13px] leading-[1.6] text-black/80">
              Every account starts with <strong>{cfg.freeCredits} cloud credits</strong>—enough to
              direct talking-head reels and test cloud graphics—plus{' '}
              <strong>unlimited free on-device Chrome Gemini Nano edits</strong> (11 tasks, works
              offline), local WebGPU Whisper transcription, auto-cuts, and free 1080p MP4 / alpha
              WebM exports.
            </p>
          </div>

          <div className="rounded-2xl border-2 border-ink bg-white p-6 shadow-[4px_4px_0_#000]">
            <div className="flex items-center gap-2">
              <span className="inline-flex size-8 items-center justify-center rounded-lg border-2 border-ink bg-black text-paper">
                <KeyRound className="size-4" strokeWidth={2} aria-hidden />
              </span>
              <h2 className={cn(poster, 'text-[28px] leading-none')}>
                Or bring your own Gemini key (BYOK)
              </h2>
            </div>
            <p className="mt-3 text-[13px] leading-[1.6] text-black/80">
              Power user with your own Google AI Studio key? Paste it in{' '}
              <Link href="/settings#byok" className="font-semibold text-ink underline">
                Settings → AI &amp; models
              </Link>
              . It stays strictly in your browser&apos;s <code>localStorage</code>, calls Google
              directly, keeps on-device Gemini Nano first, and uses{' '}
              <strong>0 Motionpop credits</strong>.
            </p>
          </div>
        </section>

        {/* Transparent Credit Cost Table */}
        <section
          aria-labelledby="credit-costs-heading"
          className="mt-12 overflow-hidden rounded-2xl border-2 border-ink bg-white shadow-[6px_6px_0_#000]"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink bg-black px-6 py-4 text-paper">
            <div className="flex items-center gap-2.5">
              <Sparkles className="size-4 text-flame" aria-hidden />
              <h2 id="credit-costs-heading" className={cn(poster, 'text-[26px] leading-none')}>
                What each action costs
              </h2>
            </div>
            <span className="font-mono text-[11px] text-paper/70">
              Route &amp; exact cost shown before every click
            </span>
          </div>
          <Sprockets className="border-b-2 border-ink bg-black/95" />
          <ul className="divide-y divide-black/10 px-6">
            {actionRows.map((row) => (
              <li
                key={row.label}
                className="flex items-center justify-between gap-4 py-3.5 text-[13px]"
              >
                <span className="text-black/85">{row.label}</span>
                {row.route === 'device' ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border-2 border-ink bg-[#3ddc97] px-2.5 py-0.5 font-mono text-[11px] font-semibold text-ink">
                    <Zap className="size-3" strokeWidth={2} aria-hidden />
                    {row.cost}
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border-2 border-ink bg-[#ede9fe] px-2.5 py-0.5 font-mono text-[11px] font-semibold text-ink">
                    <Cloud className="size-3" strokeWidth={2} aria-hidden />
                    {row.cost}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <div className="border-t-2 border-ink bg-[#fafaf9] px-6 py-3.5 text-[12px] text-black/65">
            Payments, invoices and local sales taxes (VAT/GST) are handled globally by{' '}
            <strong>Dodo Payments</strong> as Merchant of Record. Need details? Read our{' '}
            <Link href="/terms" className="underline">
              Terms
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="underline">
              Privacy Policy
            </Link>
            .
          </div>
        </section>
      </main>
    </PaperPage>
  );
}
