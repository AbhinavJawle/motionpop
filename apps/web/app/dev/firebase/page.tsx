'use client';

import { detectSlots, tagSpans } from '@motionpop/ai';
import { useState } from 'react';
import { CloudProfileSection } from '@/components/settings/cloud-profile-section';
import { Button } from '@/components/ui/button';
import {
  firebaseEnabled,
  getAILogic,
  getAppCheckClient,
  getAuthClient,
  getDb,
  getFirebaseApp,
} from '@/lib/firebase/client';
import { getRouter } from '@/lib/ai/router-client';
import { loadAppConfig } from '@/lib/firebase/remote-config';
import { demoWords } from '@/lib/projects/fixture';

type Status = 'idle' | 'running' | 'ok' | 'fail';
interface Check {
  name: string;
  status: Status;
  detail: string;
}

const CHECKS = [
  'config',
  'app-check',
  'remote-config',
  'auth',
  'firestore',
  'ai-cloud',
  'ai-router',
] as const;
type CheckName = (typeof CHECKS)[number];

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/**
 * Dev-only Firebase smoke test (spec 01 task 3): proves the env config, App Check debug token,
 * Remote Config, Auth, Firestore connectivity and one tiny AI Logic cloud call. Runs only on click,
 * so loading the page costs nothing.
 */
export default function FirebaseCheckPage() {
  const [checks, setChecks] = useState<Record<CheckName, Check>>(
    () =>
      Object.fromEntries(CHECKS.map((n) => [n, { name: n, status: 'idle', detail: '' }])) as Record<
        CheckName,
        Check
      >,
  );
  const set = (name: CheckName, status: Status, detail = '') =>
    setChecks((c) => ({ ...c, [name]: { name, status, detail } }));

  async function step(name: CheckName, fn: () => Promise<string>): Promise<boolean> {
    set(name, 'running');
    try {
      set(name, 'ok', await fn());
      return true;
    } catch (err) {
      set(name, 'fail', message(err));
      return false;
    }
  }

  async function run() {
    const configured = await step('config', async () => {
      if (!firebaseEnabled()) throw new Error('NEXT_PUBLIC_FIREBASE_* missing');
      const app = await getFirebaseApp();
      return `project ${app.options.projectId ?? '?'}`;
    });
    if (!configured) return;

    await step('app-check', async () => {
      const appCheck = await getAppCheckClient();
      if (!appCheck) throw new Error('NEXT_PUBLIC_RECAPTCHA_SITE_KEY missing');
      const { getToken } = await import('firebase/app-check');
      const token = await getToken(appCheck, false);
      return `token ok (${token.token.length} chars)`;
    });

    await step('remote-config', async () => {
      const { config, source } = await loadAppConfig();
      return `${source}: modelFast=${config.modelFast}, freeCredits=${config.freeCredits}`;
    });

    await step('auth', async () => {
      const auth = await getAuthClient();
      return auth.currentUser ? `signed in` : 'ready (signed out)';
    });

    await step('firestore', async () => {
      const db = await getDb();
      const { doc, getDoc } = await import('firebase/firestore');
      try {
        await getDoc(doc(db, 'health', 'ping'));
        return 'read allowed (rules are open?)';
      } catch (err) {
        // Placeholder rules deny everything, so permission-denied proves we reached the backend.
        if (message(err).includes('permission'))
          return 'reachable (permission-denied, as expected)';
        throw err;
      }
    });

    await step('ai-cloud', async () => {
      const ai = await getAILogic();
      const { getGenerativeModel } = await import('firebase/ai');
      const { config } = await loadAppConfig();
      const model = getGenerativeModel(ai, {
        model: config.modelFast,
        generationConfig: { maxOutputTokens: 64, temperature: 0 },
      });
      const started = performance.now();
      const result = await model.generateContent('Reply with the single word: ready');
      const ms = Math.round(performance.now() - started);
      return `${config.modelFast} said "${result.response.text().trim()}" in ${ms} ms`;
    });

    // Spec 00 R2: slots.detect on the demo transcript through the router (structured output).
    await step('ai-router', async () => {
      const router = await getRouter();
      if (!router) throw new Error('router unavailable');
      const res = await detectSlots(router, demoWords, tagSpans(demoWords));
      if (res.source !== 'ai') throw new Error(`fell back to local: ${res.error ?? '?'}`);
      const s = res.slots[0];
      const { ranOn, model, latencyMs, attempts } = res.run;
      return `${res.slots.length} slots on ${ranOn} (${model}) in ${latencyMs} ms, attempt ${attempts}; first: ${s?.componentId} ${JSON.stringify(s?.params)}`;
    });
  }

  const running = Object.values(checks).some((c) => c.status === 'running');

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Firebase check</h1>
      <CloudProfileSection variant="page" forceShow />
      <p className="text-sm text-text-muted">
        Runs one tiny AI Logic call (free tier) and reads Firestore once. Nothing runs until you
        click.
      </p>
      <Button onClick={() => void run()} disabled={running} data-testid="run-checks">
        {running ? 'Checking…' : 'Run checks'}
      </Button>
      <ul className="space-y-2 font-mono text-sm">
        {CHECKS.map((n) => {
          const c = checks[n];
          return (
            <li key={n} data-testid={`check-${n}`} data-status={c.status}>
              <span className="inline-block w-36">{n}</span>
              <span className="inline-block w-20">{c.status}</span>
              <span className="text-text-muted">{c.detail}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
