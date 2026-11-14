import { APP_CONFIG_DEFAULTS, parseRemoteConfig, type AppConfig } from '@motionpop/schemas';
import { firebaseEnabled, getRemoteConfigClient } from './client';

/**
 * Typed app config from Remote Config (spec 01 R3.4). Falls back to the typed defaults when
 * Firebase is not configured or the fetch fails, so the app always has a valid config.
 */
export async function loadAppConfig(): Promise<{
  config: AppConfig;
  source: 'remote' | 'defaults';
}> {
  if (!firebaseEnabled()) return { config: APP_CONFIG_DEFAULTS, source: 'defaults' };
  try {
    const rc = await getRemoteConfigClient();
    const { fetchAndActivate, getAll } = await import('firebase/remote-config');
    await fetchAndActivate(rc);
    const raw: Record<string, string> = {};
    for (const [key, value] of Object.entries(getAll(rc))) {
      if (value.getSource() === 'remote') raw[key] = value.asString();
    }
    return { config: parseRemoteConfig(raw), source: 'remote' };
  } catch {
    return { config: APP_CONFIG_DEFAULTS, source: 'defaults' };
  }
}
