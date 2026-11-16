import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { toastFn, toastError } = vi.hoisted(() => ({ toastFn: vi.fn(), toastError: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign(toastFn, { error: toastError }) }));

import {
  OFFLINE_SPEND_COPY,
  PAUSED_COPY,
  RATE_LIMIT_COPY,
  REFUND_FAILED_COPY,
  blockIfInsufficient,
  closeOutOfCredits,
  refundFailed,
  reportRefusal,
  useCreditsUi,
} from './credits-ui';
import { LocalCredits } from './local-credits';

beforeEach(() => {
  closeOutOfCredits();
  toastFn.mockClear();
  toastError.mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe('blockIfInsufficient (the pre-check, R5.3)', () => {
  it('opens the modal and stops when the known balance is below the cost', () => {
    expect(blockIfInsufficient({ action: 'generate', cost: 3, balance: 2 })).toBe(true);
    expect(useCreditsUi.getState().outOfCredits).toEqual({
      action: 'generate',
      cost: 3,
      balance: 2,
    });
  });

  it('lets an exact balance and an unknown balance through', () => {
    expect(blockIfInsufficient({ action: 'generate', cost: 3, balance: 3 })).toBe(false);
    expect(blockIfInsufficient({ action: 'generate', cost: 3, balance: null })).toBe(false);
    expect(useCreditsUi.getState().outOfCredits).toBeNull();
  });
});

describe('reportRefusal', () => {
  it('opens the modal for insufficient, with the balance the server reported', () => {
    expect(
      reportRefusal(
        { ok: false, reason: 'insufficient', balance: 1 },
        { action: 'generate', cost: 3 },
      ),
    ).toBe(true);
    expect(useCreditsUi.getState().outOfCredits).toEqual({
      action: 'generate',
      cost: 3,
      balance: 1,
    });
    expect(toastFn).not.toHaveBeenCalled();
  });

  it('shows the toasts for rate-limit, paused and unreachable, and no modal', () => {
    const ctx = { action: 'edit', cost: 1 } as const;
    reportRefusal({ ok: false, reason: 'rate-limit' }, ctx);
    expect(toastFn).toHaveBeenLastCalledWith(RATE_LIMIT_COPY);
    reportRefusal({ ok: false, reason: 'paused' }, ctx);
    expect(toastFn).toHaveBeenLastCalledWith(PAUSED_COPY);
    reportRefusal({ ok: false, reason: 'unavailable' }, ctx);
    expect(toastError).toHaveBeenLastCalledWith(OFFLINE_SPEND_COPY);
    reportRefusal({ ok: false, reason: 'offline' }, ctx);
    expect(toastFn).toHaveBeenLastCalledWith('Needs connection');
    expect(useCreditsUi.getState().outOfCredits).toBeNull();
  });

  it('does nothing for a successful spend', () => {
    expect(
      reportRefusal({ ok: true, txId: 's-x', balance: 1, cost: 1 }, { action: 'edit', cost: 1 }),
    ).toBe(false);
    expect(useCreditsUi.getState().outOfCredits).toBeNull();
  });

  it('refund failure raises the friendly toast and logs the spend id', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    refundFailed('s-abc12345');
    expect(toastError).toHaveBeenCalledWith(REFUND_FAILED_COPY);
    expect(warn).toHaveBeenCalledWith('Refund failed for', 's-abc12345');
  });

  it('property: the modal opens exactly when LocalCredits refuses as insufficient, and nothing is charged', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 8 }),
        fc.constantFrom('generate', 'edit', 'pip-plan', 'custom'),
        async (start, action) => {
          closeOutOfCredits();
          const credits = new LocalCredits(start);
          const r = await credits.spend({ action, key: 'key-aaaaaaaa' });
          const cost = r.ok ? r.cost : 99;
          const refused = reportRefusal(r, { action, cost });
          expect(refused).toBe(!r.ok);
          expect(useCreditsUi.getState().outOfCredits !== null).toBe(
            !r.ok && r.reason === 'insufficient',
          );
          if (!r.ok) expect(credits.balance()).toBe(start);
        },
      ),
      { numRuns: 60 },
    );
  });
});
