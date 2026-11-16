// The render mode (spec 08 design §2, R7.1, R7.4): decided from the server environment, never from
// the request. Pure so it can be tested without Next; `mode.server.ts` reads `process.env`.

export type RenderMode = 'cloud' | 'emulator' | 'offline';

export const RENDER_MODES: readonly RenderMode[] = ['cloud', 'emulator', 'offline'];

/** The environment variables the decision reads. */
export interface ModeEnv {
  NODE_ENV?: string | undefined;
  /** Set by the Firestore emulator wrapper. */
  FIRESTORE_EMULATOR_HOST?: string | undefined;
  FIREBASE_AUTH_EMULATOR_HOST?: string | undefined;
  /** The public web config: both must be present for "Firebase is configured". */
  NEXT_PUBLIC_FIREBASE_API_KEY?: string | undefined;
  NEXT_PUBLIC_FIREBASE_PROJECT_ID?: string | undefined;
  /** A developer's explicit choice outside production: `cloud`, `emulator` or `offline`. */
  MP_RENDER_MODE?: string | undefined;
}

const present = (v: string | undefined): boolean => Boolean(v && v.trim());

/**
 * `cloud` in production, whatever else is set (P11). Outside production: an explicit
 * `MP_RENDER_MODE` wins; otherwise `emulator` when the Firestore emulator variable is set,
 * `offline` when Firebase is not configured, and `cloud` when it is (a developer working against
 * the real project).
 */
export function decideRenderMode(env: ModeEnv): RenderMode {
  if (env.NODE_ENV === 'production') return 'cloud';
  const forced = env.MP_RENDER_MODE?.trim();
  if (forced && (RENDER_MODES as readonly string[]).includes(forced)) return forced as RenderMode;
  if (present(env.FIRESTORE_EMULATOR_HOST)) return 'emulator';
  const configured =
    present(env.NEXT_PUBLIC_FIREBASE_API_KEY) && present(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  return configured ? 'cloud' : 'offline';
}

/**
 * The startup assertion of R7.4: production never runs a development mode. `decideRenderMode`
 * makes this impossible by construction; the check stays so a later edit that breaks it fails loudly.
 */
export function assertModeAllowed(mode: RenderMode, env: Pick<ModeEnv, 'NODE_ENV'>): RenderMode {
  if (env.NODE_ENV === 'production' && mode !== 'cloud') {
    throw new Error(`render mode "${mode}" is not allowed in production`);
  }
  return mode;
}

/** The development-only routes answer 404 everywhere except `offline` (R7.4). */
export const isOfflineMode = (mode: RenderMode): boolean => mode === 'offline';
