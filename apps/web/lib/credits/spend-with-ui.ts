import { APP_CONFIG_DEFAULTS, costOf, type CostConfig } from '@motionpop/schemas';
import type { CreditsClient, SpendRequestInput, SpendResult } from './client';
import { blockIfInsufficient, reportRefusal } from './credits-ui';

/**
 * The one way a cloud call site spends (spec 13 R5.3): pre-check the known balance (below the
 * cost opens the out-of-credits modal and nothing is sent), spend, and show what a refusal means
 * (modal or toast). Returns `null` when the pre-check stopped it, else the spend result; the
 * caller runs its AI call only when `result?.ok` is true.
 */
export async function spendWithUi(
  client: CreditsClient,
  req: SpendRequestInput,
  cfg: CostConfig = APP_CONFIG_DEFAULTS,
): Promise<SpendResult | null> {
  if (client.isByok) return client.spend(req);
  const cost = costOf(req.action, req.units ?? 1, cfg);
  if (blockIfInsufficient({ action: req.action, cost, balance: client.balance() })) return null;
  const result = await client.spend(req);
  reportRefusal(result, { action: req.action, cost });
  return result;
}
