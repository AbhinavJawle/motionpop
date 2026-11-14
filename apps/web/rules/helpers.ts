import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';

export const PROJECT_ID = 'demo-motionpop';
const ROOT = resolve(import.meta.dirname, '../../..');

function hostPort(envName: string, fallback: number): { host: string; port: number } {
  const raw = process.env[envName];
  if (!raw) return { host: '127.0.0.1', port: fallback };
  const idx = raw.lastIndexOf(':');
  return { host: raw.slice(0, idx), port: Number(raw.slice(idx + 1)) };
}

/** Test environment wired to the emulators started by `emulators:exec`, loading the real rules files. */
export async function createEnv(services: {
  firestore?: boolean;
  storage?: boolean;
}): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    ...(services.firestore && {
      firestore: {
        rules: readFileSync(resolve(ROOT, 'firestore.rules'), 'utf8'),
        ...hostPort('FIRESTORE_EMULATOR_HOST', 8080),
      },
    }),
    ...(services.storage && {
      storage: {
        rules: readFileSync(resolve(ROOT, 'storage.rules'), 'utf8'),
        ...hostPort('FIREBASE_STORAGE_EMULATOR_HOST', 9199),
      },
    }),
  });
}
