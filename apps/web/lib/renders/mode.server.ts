import 'server-only';
import { assertModeAllowed, decideRenderMode, isOfflineMode, type RenderMode } from './mode';

type Env = Readonly<Record<string, string | undefined>>;

/** The render mode of this server process (spec 08 design §2). */
export function renderMode(env: Env = process.env): RenderMode {
  return assertModeAllowed(decideRenderMode(env), env);
}

/**
 * For the development-only routes (`/api/local-renders/**`): a 404 response unless the server is
 * in `offline` mode, `null` when the route may go on. Production is always `cloud`, so it is
 * always 404 there (R7.4).
 */
export function offlineOnly(env: Env = process.env): Response | null {
  return isOfflineMode(renderMode(env)) ? null : new Response('Not found', { status: 404 });
}
