import fc from 'fast-check';
import { APP_CONFIG_DEFAULTS, UserDocSchema, CreditTxSchema } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { parseJudgeEmails, planBootstrap, type BootstrapProfile } from './bootstrap-plan';

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
  it('gives a new creator the free plan and 20 credits with a signup entry', () => {
    const plan = planBootstrap(profile(), judges, APP_CONFIG_DEFAULTS);
    expect(plan.user).toMatchObject({ plan: 'free', credits: 20, displayName: 'creator' });
    expect(plan.tx).toEqual({ delta: 20, reason: 'signup', balanceAfter: 20 });
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
