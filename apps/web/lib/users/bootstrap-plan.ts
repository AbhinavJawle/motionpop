import {
  DEFAULT_USER_SETTINGS,
  type AppConfig,
  type CreditReason,
  type Plan,
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
  const fallbackName = email.includes('@') ? email.slice(0, email.indexOf('@')) : 'Creator';
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
