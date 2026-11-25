import {
  DEFAULT_USER_SETTINGS,
  type AppConfig,
  type CreditReason,
  type Plan,
  type UserDoc,
  type UserSettings,
} from '@motionpop/schemas';

/** What the server knows about a freshly verified caller. */
export interface BootstrapProfile {
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  photoURL: string | null;
}

/** The new user doc and its first ledger entry, minus timestamps (added by the writer). */
export interface BootstrapPlan {
  user: {
    displayName: string;
    email: string;
    photoURL?: string;
    credits: number;
    plan: Plan;
    settings: UserSettings;
    schemaVersion: 1;
  };
  tx: { delta: number; reason: CreditReason; balanceAfter: number };
}

/** Parse the comma-separated `JUDGE_EMAILS` secret into a lowercase set. */
export function parseJudgeEmails(raw: string | undefined): ReadonlySet<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes('@')),
  );
}

/**
 * Decide the first-time user doc (spec 01 R4.3–R4.4). Pure. The judge plan needs a *verified*
 * email on the allow-list: anyone can type a judge's address into email/password sign-up, but
 * only the real owner can verify it (Google accounts arrive verified).
 */
export function planBootstrap(
  profile: BootstrapProfile,
  judgeEmails: ReadonlySet<string>,
  config: Pick<AppConfig, 'freeCredits' | 'judgeCredits'>,
): BootstrapPlan {
  const email = (profile.email ?? '').trim();
  const isJudge = profile.emailVerified && email !== '' && judgeEmails.has(email.toLowerCase());
  const credits = isJudge ? config.judgeCredits : config.freeCredits;
  // "@example.com" (or a bare "@") has no local part: still fall back to "Creator".
  const fallbackName = email.split('@')[0]?.trim() || 'Creator';
  return {
    user: {
      displayName: profile.displayName?.trim() || fallbackName,
      email,
      ...(profile.photoURL ? { photoURL: profile.photoURL } : {}),
      credits,
      plan: isJudge ? 'judge' : 'free',
      settings: { ...DEFAULT_USER_SETTINGS },
      schemaVersion: 1,
    },
    tx: { delta: credits, reason: isJudge ? 'judge-grant' : 'signup', balanceAfter: credits },
  };
}

/** A judge below this share of `judgeCredits` is topped up at sign-in (spec 13 R4.3). */
export const JUDGE_REFILL_BELOW = 0.2;

/** Ledger id of the one-time upgrade grant. */
export const JUDGE_UPGRADE_TX_ID = 'judge-upgrade';

/** Ledger id of a UTC day's refill; shared with the spend-time refill (`store/ledger.ts`). */
export const judgeRefillTxId = (day: string): string => `judge-refill-${day}`;

export interface ReturningPlan {
  plan: 'judge';
  /** Credits to add; 0 when the upgrade needs no top-up (then no ledger entry is written). */
  grant: number;
  /** The ledger id: `judge-upgrade` or `judge-refill-{yyyy-mm-dd}`. */
  txId: string;
  /** `upgrade` or `refill-{yyyy-mm-dd}`. */
  refId: string;
}

/**
 * What an EXISTING account gets at sign-in (spec 13 R4.2–R4.4). Pure.
 * - A free account whose verified email is now on the allow-list becomes a judge, once, and is
 *   topped up to `judgeCredits` (the sign-in method does not matter: Google and email/password
 *   share this path).
 * - A judge below 20 % of `judgeCredits` is topped up to `judgeCredits`, at most once per UTC day.
 * Grants never take credits away. Anything else returns null.
 */
export function planReturning(i: {
  user: Pick<UserDoc, 'plan' | 'credits'>;
  profile: BootstrapProfile;
  judgeEmails: ReadonlySet<string>;
  judgeCredits: number;
  nowMs: number;
  upgradeDone: boolean;
  refilledToday: boolean;
}): ReturningPlan | null {
  const day = new Date(i.nowMs).toISOString().slice(0, 10);
  const email = (i.profile.email ?? '').trim().toLowerCase();
  if (i.user.plan === 'free') {
    const listed = i.profile.emailVerified && email !== '' && i.judgeEmails.has(email);
    if (!listed || i.upgradeDone) return null;
    return {
      plan: 'judge',
      grant: Math.max(0, i.judgeCredits - i.user.credits),
      txId: JUDGE_UPGRADE_TX_ID,
      refId: 'upgrade',
    };
  }
  if (i.user.plan === 'judge') {
    const listed = i.profile.emailVerified && email !== '' && i.judgeEmails.has(email);
    if (!listed || i.refilledToday || i.user.credits >= i.judgeCredits * JUDGE_REFILL_BELOW) {
      return null;
    }
    return {
      plan: 'judge',
      grant: i.judgeCredits - i.user.credits,
      txId: judgeRefillTxId(day),
      refId: `refill-${day}`,
    };
  }
  return null;
}
