import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

import { closeOutOfCredits, useCreditsUi } from './credits-ui';
import { LocalCredits } from './local-credits';
import { spendWithUi } from './spend-with-ui';

beforeEach(closeOutOfCredits);
afterEach(() => vi.restoreAllMocks());

describe('spendWithUi', () => {
  it('spends and returns the result when the balance covers the price', async () => {
    const c = new LocalCredits(10);
    const r = await spendWithUi(c, { action: 'generate', key: 'key-aaaaaaaa' });
    expect(r).toMatchObject({ ok: true, balance: 7, cost: 3 });
    expect(useCreditsUi.getState().outOfCredits).toBeNull();
  });

  it('opens the modal from the pre-check and sends nothing', async () => {
    const c = new LocalCredits(2);
    const spy = vi.spyOn(c, 'spend');
    expect(await spendWithUi(c, { action: 'generate', key: 'key-aaaaaaaa' })).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    expect(useCreditsUi.getState().outOfCredits).toEqual({
      action: 'generate',
      cost: 3,
      balance: 2,
    });
  });

  it('opens the modal when the server says insufficient although the balance looked fine', async () => {
    const c = new LocalCredits(10);
    vi.spyOn(c, 'spend').mockResolvedValue({ ok: false, reason: 'insufficient', balance: 1 });
    const r = await spendWithUi(c, { action: 'generate', key: 'key-aaaaaaaa' });
    expect(r).toMatchObject({ ok: false, reason: 'insufficient' });
    expect(useCreditsUi.getState().outOfCredits).toEqual({
      action: 'generate',
      cost: 3,
      balance: 1,
    });
  });

  it('prices units like the server', async () => {
    const c = new LocalCredits(5);
    expect(await spendWithUi(c, { action: 'tts', units: 3, key: 'key-bbbbbbbb' })).toBeNull();
    expect(useCreditsUi.getState().outOfCredits).toMatchObject({ cost: 6, balance: 5 });
  });
});
