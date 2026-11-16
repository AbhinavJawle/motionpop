import 'server-only';
import {
  LedgerError,
  aiSpec,
  refundCredits,
  spendCredits,
  type LedgerConfig,
} from '@motionpop/render/store';
import {
  REASON_FOR,
  costOf,
  type AppConfig,
  type RefundResponse,
  type SpendRequest,
  type SpendResponse,
} from '@motionpop/schemas';
import { adminDb } from '@/lib/firebase/admin.server';
import { serverConfig } from '@/lib/firebase/server-config.server';
import { HttpError } from '@/lib/firebase/verify.server';

/** Wires the shared ledger helper (`@motionpop/render/store`) to the Admin SDK and server config. */

const ledgerConfig = (c: AppConfig): LedgerConfig => ({
  killSwitch: c.killSwitch,
  rateLimitCloudPerHour: c.rateLimitCloudPerHour,
  refundsPerDay: c.refundsPerDay,
  judgeCredits: c.judgeCredits,
});

/** A missing user doc is a 409: the client re-runs bootstrap and tries once more. */
async function bootstrapped<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof LedgerError) {
      throw new HttpError(409, 'Not bootstrapped');
    }
    throw err;
  }
}

/** The price is computed here from the action and units, never taken from the client. */
export async function spendForCaller(
  uid: string,
  req: SpendRequest,
  nowMs: number = Date.now(),
): Promise<SpendResponse> {
  const config = await serverConfig();
  const cost = costOf(req.action, req.units, config);
  return bootstrapped(() =>
    spendCredits(
      adminDb(),
      {
        ...aiSpec(uid, req.key),
        reason: REASON_FOR[req.action],
        ...(req.refId === undefined ? {} : { refId: req.refId }),
        cost,
      },
      ledgerConfig(config),
      nowMs,
    ),
  );
}

export async function refundForCaller(
  uid: string,
  txId: string,
  nowMs: number = Date.now(),
): Promise<RefundResponse> {
  const config = await serverConfig();
  return bootstrapped(() => refundCredits(adminDb(), uid, txId, ledgerConfig(config), nowMs));
}
