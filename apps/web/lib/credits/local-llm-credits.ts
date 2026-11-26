import type { ClientCreditAction } from '@motionpop/schemas';
import type { CreditsClient, SpendRequestInput, SpendResult } from './client';

/**
 * Cloud media endpoints that Ollama / LM Studio do NOT provide (Gemini TTS, Gemini Imagen,
 * Vertex Lyria). These MUST keep using the underlying credits client (or Gemini BYOK when also
 * configured) so a local LLM never bypasses server credit checks for cloud media.
 */
const CLOUD_MEDIA_ACTIONS: ReadonlySet<ClientCreditAction> = new Set(['tts', 'image', 'music']);

const LOCAL_LLM_TX_PREFIX = 'local-llm-';

/**
 * CreditsClient wrapper active when the user enables a local LLM (Ollama / LM Studio / custom
 * OpenAI-compatible server). All routed text/JSON/vision LLM tasks resolve locally at 0 credits
 * without touching `/api/credits/spend`, while dedicated cloud media actions (`tts`, `image`,
 * `music`) delegate to the underlying client (which may itself be `ByokCredits`, `ServerCredits`,
 * `LocalCredits`, or `null` when signed out).
 */
export class LocalLlmCredits implements CreditsClient {
  private readonly inner: CreditsClient | null;

  constructor(inner: CreditsClient | null) {
    this.inner = inner;
  }

  get isByok(): boolean {
    return Boolean(this.inner?.isByok);
  }

  isZeroCostFor(action: ClientCreditAction): boolean {
    if (!CLOUD_MEDIA_ACTIONS.has(action)) return true;
    return this.inner?.isZeroCostFor?.(action) ?? Boolean(this.inner?.isByok);
  }

  canSpend(action: ClientCreditAction): boolean {
    if (!CLOUD_MEDIA_ACTIONS.has(action)) return true;
    return this.inner !== null && (this.inner.canSpend?.(action) ?? true);
  }

  balance(): number | null {
    return this.inner?.balance() ?? null;
  }

  subscribe(fn: (balance: number | null) => void): () => void {
    return this.inner ? this.inner.subscribe(fn) : () => {};
  }

  async spend(req: SpendRequestInput): Promise<SpendResult> {
    if (!CLOUD_MEDIA_ACTIONS.has(req.action)) {
      return {
        ok: true,
        txId: `${LOCAL_LLM_TX_PREFIX}${req.key}`,
        balance: this.inner?.balance() ?? 0,
        cost: 0,
      };
    }
    if (!this.inner) {
      return { ok: false, reason: 'unavailable' };
    }
    return this.inner.spend(req);
  }

  async refund(txId: string): Promise<void> {
    if (txId.startsWith(LOCAL_LLM_TX_PREFIX)) return;
    await this.inner?.refund(txId);
  }
}
