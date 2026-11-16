import {
  RouterError,
  type Router,
  type RouterConfig,
  type RunResult,
  type TaskDef,
  type UsageEvent,
} from '@motionpop/ai';
import { componentFor, sceneFor } from '@motionpop/motion';
import type { InferenceMode } from '@motionpop/schemas';
import { fakeAiFlag } from '../credits/pick-client';

/**
 * The fake AI router for development and e2e (spec 09 design, "Fake AI"). Behind
 * `NEXT_PUBLIC_FAKE_AI=1`, never in production builds: it parses each task's input, answers by
 * rule, then runs the task's own output parse and `check`, so a bad fake answer fails the way a
 * real one does. The answers are deterministic, so the specs can assert on them.
 */

export interface FakeSwitches {
  /** `?device=off`: the device is missing, so device-only calls fail and device-first ones go to the cloud. */
  deviceOff: boolean;
  /** `?fakeFail=generate|edit|note|all`. */
  fail: 'generate' | 'edit' | 'note' | 'all' | null;
  /** `?fakeFailRate=0.3`, 0..1: the share of supported calls that fail, drawn from `seed`. */
  failRate: number;
  /** `?fakeSeed=7`. */
  seed: number;
}

export function parseFakeSwitches(search: string): FakeSwitches {
  const q = new URLSearchParams(search);
  const fail = q.get('fakeFail');
  // `Number(null)` is 0, so an absent switch must not be read as a number.
  const num = (key: string, fallback: number): number => {
    const raw = q.get(key);
    const n = raw === null || raw.trim() === '' ? Number.NaN : Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  const rate = num('fakeFailRate', 0);
  const seed = num('fakeSeed', 1);
  return {
    deviceOff: q.get('device') === 'off',
    fail: fail === 'generate' || fail === 'edit' || fail === 'note' || fail === 'all' ? fail : null,
    failRate: Math.min(1, Math.max(0, rate)),
    seed: Math.trunc(seed),
  };
}

/** mulberry32: a small seeded generator (the app's own `Math.random` is never used for tests). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Which router the app builds. `fake` only outside production and only with the flag (P9). */
export type RouterKind = 'fake' | 'firebase' | 'none';
export function routerKind(
  env: { NODE_ENV?: string; NEXT_PUBLIC_FAKE_AI?: string },
  firebase: boolean,
): RouterKind {
  if (fakeAiFlag(env)) return 'fake';
  return firebase ? 'firebase' : 'none';
}

// ---- answers ---------------------------------------------------------------------------------

type Json = Record<string, unknown>;
interface PatchAnswer {
  patch: { op: 'replace' | 'add' | 'remove'; path: string; value?: unknown }[];
  escalate?: boolean;
  message?: string;
}

function valueAt(doc: unknown, path: string): unknown {
  let cur: unknown = doc;
  for (const seg of path.split('/').slice(1)) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

const toNumber = (s: string): number => Number(s.trim().replace(/[,$%€£]/g, ''));
const escalate = (message: string): PatchAnswer => ({ patch: [], escalate: true, message });

/**
 * Quick-edit rules: "slower" 0.8, "faster" 1.25, "cut" (no fade), "change A to B" on the first
 * path holding A, "orange"/"red" on a colour field when there is one; anything else escalates.
 */
export function patchAnswer(text: string, current: Json, paths: readonly string[]): PatchAnswer {
  const t = text.toLowerCase();
  const has = (p: string) => paths.includes(p);
  if (/\bslow(er)?\b/.test(t) && has('/timing/speed')) {
    return { patch: [{ op: 'replace', path: '/timing/speed', value: 0.8 }] };
  }
  if (/\b(fast(er)?|quick(er)?)\b/.test(t) && has('/timing/speed')) {
    return { patch: [{ op: 'replace', path: '/timing/speed', value: 1.25 }] };
  }
  if (/\b(cut|no fade)\b/.test(t) && has('/timing/fade')) {
    return { patch: [{ op: 'replace', path: '/timing/fade', value: false }] };
  }
  const change = /change\s+(.+?)\s+to\s+(.+)/.exec(t);
  const original = /change\s+(.+?)\s+to\s+(.+)/i.exec(text);
  if (change && original) {
    const [from, to] = [change[1] as string, change[2] as string];
    const fromNum = toNumber(from);
    const toNum = toNumber(to);
    for (const path of paths) {
      const v = valueAt(current, path);
      if (
        typeof v === 'number' &&
        Number.isFinite(fromNum) &&
        v === fromNum &&
        Number.isFinite(toNum)
      ) {
        return { patch: [{ op: 'replace', path, value: toNum }] };
      }
      if (typeof v === 'string' && v.toLowerCase() === from.trim()) {
        return { patch: [{ op: 'replace', path, value: (original[2] as string).trim() }] };
      }
    }
    return escalate(`I couldn't find "${from.trim()}" to change.`);
  }
  const colour = /\b(orange|red)\b/.exec(t);
  if (colour) {
    const path = paths.find((p) => /\/(color|colour|accent)$/.test(p));
    if (path) return { patch: [{ op: 'replace', path, value: colour[1] }] };
  }
  return escalate('That needs a new graphic. Try Generate.');
}

/** Generate and auto-fill: the scene's safe content from the words, else the current params, else the defaults. */
export function fillAnswer(input: {
  componentId: string;
  words: string;
  currentParams?: Json | undefined;
}): { params: Json } {
  const scene = sceneFor(input.componentId);
  if (scene) {
    const content = scene.safe?.(input.words.split(/\s+/).filter(Boolean)) ?? null;
    const variant = scene.variants[0]?.id;
    if (content) {
      return { params: { ...(variant ? { variant } : {}), content, beats: [], images: [] } };
    }
  }
  if (input.currentParams && Object.keys(input.currentParams).length > 0) {
    return { params: input.currentParams };
  }
  return { params: (componentFor(input.componentId)?.defaults ?? {}) as Json };
}

// ---- the router ------------------------------------------------------------------------------

const FAKE_CONFIG: RouterConfig = {
  routingOverrides: {},
  routingSlotsDetectDeviceMaxWords: 400,
  modelFast: 'fake-fast',
  modelStrong: 'fake-strong',
  killSwitch: false,
};

export interface FakeRouterOptions {
  /** `window.location.search`. */
  search?: string;
  latencyMs?: number;
  sleep?: (ms: number) => Promise<void>;
  onUsage?: (e: UsageEvent) => void;
}

const isCloud = (m: InferenceMode) => m === 'ONLY_IN_CLOUD' || m === 'PREFER_IN_CLOUD';

function failsBy(sw: FakeSwitches, taskId: string, input: unknown): boolean {
  if (sw.fail === 'all') return true;
  if (sw.fail === 'edit') return taskId === 'edit.patch';
  if (sw.fail === 'note') return taskId === 'note.fix';
  if (sw.fail === 'generate') {
    return taskId === 'component.fill' && (input as { purpose?: string }).purpose === 'generate';
  }
  return false;
}

export function createFakeRouter(opts: FakeRouterOptions = {}): Router {
  const sw = parseFakeSwitches(opts.search ?? '');
  const latency = opts.latencyMs ?? 300;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const draw = seededRandom(sw.seed);
  const clock = () => (typeof performance === 'undefined' ? Date.now() : performance.now());

  return {
    async run<I, O>(
      task: TaskDef<I, O>,
      rawInput: I,
      runOpts: { mode?: InferenceMode; allowCloud?: boolean } = {},
    ): Promise<RunResult<O>> {
      const parsed = task.input.safeParse(rawInput);
      if (!parsed.success) throw new RouterError(task.id, 'invalid-input', parsed.error.message);
      const input = parsed.data;
      const started = clock();
      const mode = runOpts.mode ?? task.mode(input, FAKE_CONFIG);
      const cloudCost = task.cloudCost(input);
      const report = (ranOn: 'device' | 'cloud', ok: boolean) =>
        opts.onUsage?.({
          task: task.id,
          ranOn,
          model: 'fake-fast',
          credits: ok && ranOn === 'cloud' ? cloudCost : 0,
          cloudCost,
          latencyMs: Math.round(clock() - started),
          ok,
          attempts: 1,
        });
      const fail = (
        ranOn: 'device' | 'cloud',
        reason: 'provider' | 'invalid-output',
        msg: string,
      ) => {
        report(ranOn, false);
        return new RouterError(task.id, reason, msg);
      };

      // Where it would run: the device unless `?device=off` (then device-first tasks may go to the cloud).
      let ranOn: 'device' | 'cloud' = isCloud(mode) ? 'cloud' : 'device';
      if (ranOn === 'device' && sw.deviceOff) {
        if (mode === 'PREFER_ON_DEVICE' && task.cloudFallback && runOpts.allowCloud !== false) {
          ranOn = 'cloud';
        } else {
          await sleep(latency);
          throw fail('device', 'provider', 'On-device AI is off (?device=off)');
        }
      }

      let output: unknown;
      if (task.id === 'edit.patch' || task.id === 'note.fix') {
        const i = input as {
          current: Json;
          paths: string[];
          instruction?: string;
          note?: { text: string };
        };
        output = patchAnswer(i.instruction ?? i.note?.text ?? '', i.current, i.paths);
      } else if (task.id === 'component.fill') {
        output = fillAnswer(input as Parameters<typeof fillAnswer>[0]);
      } else {
        throw fail(ranOn, 'provider', `The fake router has no answer for ${task.id}`);
      }

      await sleep(latency);
      if (failsBy(sw, task.id, input) || (sw.failRate > 0 && draw() < sw.failRate)) {
        throw fail(ranOn, 'provider', 'Fake failure (?fakeFail / ?fakeFailRate)');
      }
      const out = task.output.safeParse(output);
      if (!out.success) throw fail(ranOn, 'invalid-output', out.error.message.slice(0, 400));
      const problem = task.check?.(out.data, input) ?? null;
      if (problem !== null) throw fail(ranOn, 'invalid-output', problem);
      report(ranOn, true);
      return {
        output: out.data,
        ranOn,
        model: 'fake-fast',
        costCredits: ranOn === 'cloud' ? cloudCost : 0,
        latencyMs: Math.round(clock() - started),
        attempts: 1,
      };
    },
  };
}
