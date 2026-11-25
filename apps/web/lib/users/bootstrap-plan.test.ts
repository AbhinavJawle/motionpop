import fc from 'fast-check';
import { APP_CONFIG_DEFAULTS, UserDocSchema, CreditTxSchema } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { decideSpend } from '@motionpop/render/store';
import {
  JUDGE_REFILL_BELOW,
  judgeRefillTxId,
  parseJudgeEmails,
  planBootstrap,
  planReturning,
  type BootstrapProfile,
} from './bootstrap-plan';

const profile = (p: Partial<BootstrapProfile> = {}): BootstrapProfile => ({
  email: 'creator@example.com',
  emailVerified: true,
  displayName: null,
  photoURL: null,
  ...p,
});
const judges = parseJudgeEmails(' Judge@Example.com, nope ,second@example.com,');

describe('parseJudgeEmails', () => {
  it('lowercases, trims and drops junk', () => {
    expect([...judges].sort()).toEqual(['judge@example.com', 'second@example.com']);
    expect(parseJudgeEmails(undefined).size).toBe(0);
  });
});

describe('planBootstrap', () => {
  it('gives a new creator the free plan and 15 credits with a signup entry', () => {
    const plan = planBootstrap(profile(), judges, APP_CONFIG_DEFAULTS);
    expect(plan.user).toMatchObject({ plan: 'free', credits: 15, displayName: 'creator' });
    expect(plan.tx).toEqual({ delta: 15, reason: 'signup', balanceAfter: 15 });
  });

  it('grants the judge plan to a verified allow-listed email, case-insensitively', () => {
    const plan = planBootstrap(
      profile({ email: 'JUDGE@example.com' }),
      judges,
      APP_CONFIG_DEFAULTS,
    );
    expect(plan.user).toMatchObject({ plan: 'judge', credits: 500 });
    expect(plan.tx.reason).toBe('judge-grant');
  });

  it('never grants the judge plan to an unverified email', () => {
    const plan = planBootstrap(
      profile({ email: 'judge@example.com', emailVerified: false }),
      judges,
      APP_CONFIG_DEFAULTS,
    );
    expect(plan.user.plan).toBe('free');
  });

  it('uses Remote Config amounts', () => {
    const plan = planBootstrap(profile(), judges, { freeCredits: 7, judgeCredits: 900 });
    expect(plan.user.credits).toBe(7);
  });

  it('keeps the display name and photo when present', () => {
    const plan = planBootstrap(
      profile({ displayName: '  Ada  ', photoURL: 'https://img.example/a.png' }),
      judges,
      APP_CONFIG_DEFAULTS,
    );
    expect(plan.user.displayName).toBe('Ada');
    expect(plan.user.photoURL).toBe('https://img.example/a.png');
  });

  it('falls back to "Creator" when the email has no local part (property regression)', () => {
    // fast-check found { email: "@" } giving an empty displayName (seed -1429429465).
    for (const email of ['@', '@example.com', '  @x.io']) {
      expect(
        planBootstrap(profile({ email, displayName: null }), judges, APP_CONFIG_DEFAULTS).user,
      ).toMatchObject({ displayName: 'Creator' });
    }
  });

  it('always yields docs that pass the schemas, with the ledger matching the balance', () => {
    fc.assert(
      fc.property(
        fc.record({
          // Cheap emails (fc.emailAddress() costs ~1 s to build), including judge addresses.
          email: fc.option(
            fc.oneof(
              fc.constantFrom('judge@example.com', 'JUDGE@example.com', 'second@example.com'),
              fc
                .tuple(fc.stringMatching(/^[a-z0-9]{1,8}$/), fc.constantFrom('example.com', 'x.io'))
                .map(([local, domain]) => `${local}@${domain}`),
              fc.string(),
            ),
            { nil: null },
          ),
          emailVerified: fc.boolean(),
          displayName: fc.option(fc.string(), { nil: null }),
          photoURL: fc.option(fc.constantFrom('https://img.example/a.png', ''), { nil: null }),
        }),
        fc.nat(10_000),
        fc.nat(10_000),
        (p, freeCredits, judgeCredits) => {
          const { user, tx } = planBootstrap(p, judges, { freeCredits, judgeCredits });
          const at = new Date(0);
          expect(UserDocSchema.safeParse({ ...user, createdAt: at, lastSeenAt: at }).success).toBe(
            true,
          );
          expect(CreditTxSchema.safeParse({ ...tx, at }).success).toBe(true);
          expect(tx.balanceAfter).toBe(user.credits);
          expect(tx.delta).toBe(user.credits);
          expect(user.displayName.length).toBeGreaterThan(0);
        },
      ),
    );
  });
});

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 10, 20, 10, 0, 0);
const returning = (o: Partial<Parameters<typeof planReturning>[0]> = {}) =>
  planReturning({
    user: { plan: 'free', credits: 12 },
    profile: profile({ email: 'judge@example.com' }),
    judgeEmails: judges,
    judgeCredits: 500,
    nowMs: T0,
    upgradeDone: false,
    refilledToday: false,
    ...o,
  });

describe('planReturning (spec 13 R4.2–R4.4)', () => {
  it('upgrades a free account whose verified email is now listed, up to judgeCredits, once', () => {
    expect(returning()).toEqual({
      plan: 'judge',
      grant: 488,
      txId: 'judge-upgrade',
      refId: 'upgrade',
    });
    expect(returning({ upgradeDone: true })).toBeNull();
  });

  it('does not upgrade an unverified, unlisted or email-less account', () => {
    expect(
      returning({ profile: profile({ email: 'judge@example.com', emailVerified: false }) }),
    ).toBeNull();
    expect(returning({ profile: profile({ email: 'someone@example.com' }) })).toBeNull();
    expect(returning({ profile: profile({ email: null }) })).toBeNull();
  });

  it('gives a verified Google profile the same upgrade as an email/password profile (review F15)', () => {
    // The server sees only the verified email, never the sign-in method, so both are one path.
    const google = returning({
      profile: profile({
        email: 'Judge@Example.com',
        displayName: 'G',
        photoURL: 'https://x/y.png',
      }),
    });
    const password = returning({ profile: profile({ email: 'judge@example.com' }) });
    expect(google).toEqual(password);
    expect(google?.plan).toBe('judge');
  });

  it('writes a zero grant for an upgrade that needs no top-up, and never takes credits away', () => {
    expect(returning({ user: { plan: 'free', credits: 900 } })?.grant).toBe(0);
    expect(returning({ user: { plan: 'free', credits: 500 } })?.grant).toBe(0);
  });

  it('tops a judge below 20 % up to judgeCredits, once per UTC day', () => {
    const day = '2026-11-20';
    const low = { plan: 'judge', credits: 99 } as const;
    expect(returning({ user: low })).toEqual({
      plan: 'judge',
      grant: 401,
      txId: judgeRefillTxId(day),
      refId: `refill-${day}`,
    });
    expect(returning({ user: low, refilledToday: true })).toBeNull();
    expect(returning({ user: { plan: 'judge', credits: 100 } })).toBeNull();
    expect(returning({ user: low, nowMs: T0 + DAY })?.txId).toBe('judge-refill-2026-11-21');
    expect(
      returning({ user: low, profile: profile({ email: 'removed@example.com' }) }),
    ).toBeNull();
  });

  it('leaves free, creator and pro accounts that are not listed alone', () => {
    for (const plan of ['free', 'creator', 'pro'] as const) {
      expect(returning({ user: { plan, credits: 0 }, profile: profile() })).toBeNull();
    }
  });

  // C6 on random sign-in and spend sequences over random days: a pure account simulation that
  // uses the real `decideSpend` for the spend-time refill, so both triggers share one daily id.
  it('C6: refills at most once a UTC day, only up to judgeCredits, never for the unlisted', () => {
    const JC = 500;
    type Op =
      | { kind: 'in'; dayStep: number; listed: boolean; verified: boolean }
      | { kind: 'spend'; dayStep: number; cost: number };
    const op: fc.Arbitrary<Op> = fc.oneof(
      fc.record({
        kind: fc.constant('in' as const),
        dayStep: fc.integer({ min: 0, max: 2 }),
        listed: fc.boolean(),
        verified: fc.boolean(),
      }),
      fc.record({
        kind: fc.constant('spend' as const),
        dayStep: fc.integer({ min: 0, max: 2 }),
        cost: fc.integer({ min: 1, max: 5 }),
      }),
    );
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 600 }),
        fc.constantFrom<'free' | 'judge'>('free', 'judge'),
        fc.array(op, { maxLength: 60 }),
        (start, startPlan, ops) => {
          let plan: 'free' | 'judge' = startPlan;
          let credits = start;
          let now = T0;
          let upgradeDone = false;
          const refillDays = new Set<string>();
          let everListedAndVerified = false;
          const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
          for (const o of ops) {
            now += o.dayStep * DAY + 1000;
            const day = dayOf(now);
            const before = credits;
            if (o.kind === 'in') {
              everListedAndVerified ||= o.listed && o.verified;
              const next = planReturning({
                user: { plan, credits },
                profile: profile({
                  email: o.listed ? 'judge@example.com' : 'x@example.com',
                  emailVerified: o.verified,
                }),
                judgeEmails: judges,
                judgeCredits: JC,
                nowMs: now,
                upgradeDone,
                refilledToday: refillDays.has(day),
              });
              if (next) {
                if (next.txId === 'judge-upgrade') upgradeDone = true;
                else refillDays.add(day);
                plan = next.plan;
                credits += next.grant;
                expect(credits).toBeGreaterThanOrEqual(before);
              }
            } else {
              const d = decideSpend({
                kind: 'ai',
                balance: credits,
                cost: o.cost,
                existing: null,
                refunded: false,
                killSwitch: false,
                hourCount: 0,
                hourLimit: 1000,
                judge:
                  plan === 'judge' ? { eligible: !refillDays.has(day), judgeCredits: JC } : null,
              });
              if (d.kind === 'charge') {
                if (d.refill) {
                  expect(refillDays.has(day)).toBe(false);
                  refillDays.add(day);
                  expect(d.refill.balanceAfterGrant).toBe(JC);
                }
                credits = d.balanceAfter;
              } else if (plan === 'judge' && !refillDays.has(day)) {
                // A judge is never refused as insufficient on a day without a refill.
                expect(d.kind === 'refuse' && d.reason === 'insufficient').toBe(false);
              }
            }
            expect(credits).toBeGreaterThanOrEqual(0);
            if (startPlan === 'free' && !everListedAndVerified) expect(plan).toBe('free');
            if (plan === 'judge' && startPlan === 'judge' && credits > start) {
              // Credits above the start can only come from a grant that tops up to JC.
              expect(credits).toBeLessThanOrEqual(Math.max(start, JC));
            }
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('uses 0.2 as the refill threshold', () => {
    expect(JUDGE_REFILL_BELOW).toBe(0.2);
  });
});
