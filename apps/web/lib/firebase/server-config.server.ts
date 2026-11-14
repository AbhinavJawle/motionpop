import 'server-only';
import { APP_CONFIG_DEFAULTS, parseRemoteConfig, type AppConfig } from '@motionpop/schemas';
import { adminRemoteConfig, usingEmulators } from './admin.server';

const TTL_MS = 5 * 60_000;
let cached: { at: number; config: AppConfig } | undefined;

/**
 * Server-side app config from the Remote Config *server* template, cached for 5 minutes.
 * Falls back to the typed defaults (emulators, no template yet, or a fetch error), so credit
 * grants always have valid numbers.
 */
export async function serverConfig(): Promise<AppConfig> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.config;
  let config = APP_CONFIG_DEFAULTS;
  if (!usingEmulators()) {
    try {
      const template = await adminRemoteConfig().getServerTemplate();
      const evaluated = template.evaluate();
      const raw: Record<string, string> = {};
      for (const [key, value] of Object.entries(evaluated.getAll())) {
        if (value.getSource() === 'remote') raw[key] = value.asString();
      }
      config = parseRemoteConfig(raw);
    } catch (err) {
      console.warn('Remote Config server template unavailable, using defaults', err);
    }
  }
  cached = { at: Date.now(), config };
  return config;
}
