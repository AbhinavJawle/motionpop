import type { FilmBuildInput, FilmDirectInput, PipPlanInput } from '@motionpop/ai';
import { filmBuildAnswer, filmDirectAnswer } from './fake-film';
import type { PipModelOutput } from '@motionpop/schemas';
import {
  PREFILL_MAX,
  RouterError,
  type PromptPrefillInput,
  type Router,
  type RouterConfig,
  type RunResult,
  type TaskDef,
  type UsageEvent,
} from '@motionpop/ai';
import { componentFor, customExample, sceneFor } from '@motionpop/motion';
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
  /** `?fakeLatency=1500`: how long each fake call takes, so a spec can look at the "working" state. */
  latencyMs: number | null;
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
    latencyMs: q.has('fakeLatency') ? Math.min(10_000, Math.max(0, num('fakeLatency', 300))) : null,
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

/**
 * `custom.compose` (spec 15): the library's example graphic, titled from the brief and stepped
 * through the spoken words, so the whole tier-2 path runs with no model.
 */
export function customAnswer(input: { brief: string; words: string }) {
  const words = input.words
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .map((w) => w.replace(/[.,!?;:]+$/, ''));
  const steps =
    words.length >= 3 ? [words[0], words[Math.floor(words.length / 2)], words.at(-1)] : undefined;
  const headline = input.brief
    .split(/\s+/)
    .slice(0, 5)
    .join(' ')
    .replace(/[.,!?;:]+$/, '');
  const ex = customExample(headline || 'Custom graphic', steps as string[] | undefined);
  return {
    title: ex.title,
    html: ex.html,
    css: ex.css,
    script: ex.script,
    keyMomentMs: ex.keyMomentMs ?? 500,
  };
}

/**
 * `prompt.prefill`: one sentence about the graphic, the spoken words and the look. Deliberately
 * not the same text as `templatePrompt`, so a spec can tell "the device wrote it" from "the
 * template wrote it".
 */
export function prefillAnswer(input: PromptPrefillInput): { prompt: string } {
  const name = input.slot.componentName.toLowerCase();
  const article = /^[aeiou]/.test(name) ? 'An' : 'A';
  const words = (input.slot.said ?? '').split(/\s+/).filter(Boolean).slice(0, 6);
  const styleArticle = /^[aeiou]/i.test(input.style.name) ? 'an' : 'a';
  const tail = ` in ${styleArticle} ${input.style.name} look.`;
  for (let n = words.length; n > 0; n--) {
    const text = `${article} ${name} that follows “${words.slice(0, n).join(' ')}”${tail}`;
    if (text.length <= PREFILL_MAX) return { prompt: text };
  }
  return { prompt: `${article} ${name}${tail}`.slice(0, PREFILL_MAX) };
}

// ---- the router ------------------------------------------------------------------------------

const FAKE_CONFIG: RouterConfig = {
  routingOverrides: {},
  routingSlotsDetectDeviceMaxWords: 400,
  modelFast: 'fake-fast',
  modelStrong: 'fake-strong',
  modelFilmBuild: 'fake-strong',
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

/** A keyword planner standing in for `pip.plan` (dev and e2e only). */
/** The quick planner for a video reel (spec 37): colour, sound, music, captions, look, edits. */
function reelAnswer(i: PipPlanInput): PipModelOutput {
  const r = i.project.reel!;
  const m = i.message.toLowerCase();
  const none = { slot: 'none', choice: 'none', atWord: -1, instruction: '' };
  const steps: PipModelOutput['steps'] = [];
  if (/colou?r|gradient|black and white|vibrant|brand|warm/.test(m))
    steps.push({
      ...none,
      action: 'setReelTheme',
      choice: /bold|lots|vivid|vibrant|more/.test(m) ? 'bold' : 'soft',
      instruction: '#FF5A36 #7C5CFF',
      label: 'Ember and violet gradient',
    });
  if (/caption/.test(m))
    steps.push({
      ...none,
      action: 'setCaptions',
      choice: /\boff\b|remove|hide/.test(m) ? 'off' : 'on',
      label: 'Update captions',
    });
  if (/sound|sfx|effect/.test(m)) {
    const wantsToggle = /\boff\b|remove|no |louder|quieter|softer|down|clear/.test(m);
    if (wantsToggle) {
      const choice = /\boff\b|remove|no /.test(m)
        ? 'off'
        : /clear/.test(m)
          ? 'clear'
          : /louder/.test(m)
            ? 'louder'
            : 'quieter';
      steps.push({ ...none, action: 'setSound', choice, label: `Sound effects ${choice}` });
    } else {
      // Story-matched sound design across transcript words instead of a bare on/off toggle.
      const words = i.project.words;
      const picks: { atWord: number; choice: string; label: string }[] = [];
      let lastIdx = -10;
      for (const [idx, raw] of words) {
        if (idx - lastIdx < 5 || picks.length >= 6) continue;
        const w = raw.toLowerCase();
        if (/\$|\d+k\b|\d+m\b|\d+b\b|dollar|price|check|revenue|sold|cost|paid/.test(w)) {
          picks.push({ atWord: idx, choice: 'cash', label: `Cash on '${raw}'` });
          lastIdx = idx;
        } else if (/billion|million|debt|massive|huge|100%/.test(w)) {
          picks.push({ atWord: idx, choice: 'boom', label: `Boom on '${raw}'` });
          lastIdx = idx;
        } else if (/reject|quit|fail|wrong|never|stop|broke|denied/.test(w)) {
          picks.push({ atWord: idx, choice: 'slam', label: `Slam on '${raw}'` });
          lastIdx = idx;
        } else if (/200\d|201\d|19\d\d|back|ago|before/.test(w)) {
          picks.push({ atWord: idx, choice: 'rewind', label: `Rewind on '${raw}'` });
          lastIdx = idx;
        } else if (/crazy|pivot|twist|weird|unexpected|wait/.test(w)) {
          picks.push({ atWord: idx, choice: 'scratch', label: `Scratch on '${raw}'` });
          lastIdx = idx;
        } else if (/photo|screen|proof|camera|shot|look/.test(w)) {
          picks.push({ atWord: idx, choice: 'shutter', label: `Shutter on '${raw}'` });
          lastIdx = idx;
        } else if (/code|typed|wrote|script|terminal|prompt/.test(w)) {
          picks.push({ atWord: idx, choice: 'type', label: `Type on '${raw}'` });
          lastIdx = idx;
        } else if (/launch|growth|win|built|idea|magic|ai\b/.test(w)) {
          picks.push({ atWord: idx, choice: 'sparkle', label: `Sparkle on '${raw}'` });
          lastIdx = idx;
        }
      }
      if (picks.length === 0 && words.length > 0) {
        const defaults = ['whip', 'chime', 'boom', 'ding', 'sparkle'] as const;
        const stride = Math.max(1, Math.floor(words.length / Math.min(4, words.length)));
        for (let k = 0; k < Math.min(4, words.length); k++) {
          const entry = words[Math.min(words.length - 1, k * stride)];
          if (!entry) continue;
          const kind = defaults[k % defaults.length]!;
          picks.push({
            atWord: entry[0],
            choice: kind,
            label: `${kind[0]!.toUpperCase()}${kind.slice(1)} on '${entry[1]}'`,
          });
        }
      }
      if (picks.length > 0) {
        for (const p of picks) {
          steps.push({ ...none, action: 'addSound', choice: p.choice, atWord: p.atWord, label: p.label });
        }
      } else {
        steps.push({ ...none, action: 'setSound', choice: 'on', label: 'Sound effects on' });
      }
    }
  }
  if (/music/.test(m))
    steps.push({
      ...none,
      action: 'setMusic',
      choice: /\boff\b|remove|no /.test(m)
        ? 'none'
        : /upbeat|energ|pulse/.test(m)
          ? 'steady-pulse'
          : 'calm-pad',
      label: 'Change the music',
    });
  if (/cream|editorial/.test(m))
    steps.push({ ...none, action: 'setReelLook', choice: 'cream', label: 'Switch to cream' });
  if (/\bmono\b|minimal/.test(m))
    steps.push({ ...none, action: 'setReelLook', choice: 'mono', label: 'Switch to mono' });
  if (/animation|graphic|better|redesign|improve/.test(m)) {
    const targets =
      i.scope !== 'video'
        ? r.scenes.filter((s) => s.ref === i.scope)
        : r.scenes.filter((s) => s.template !== 'none');
    for (const s of targets.slice(0, 12 - steps.length))
      steps.push({
        ...none,
        action: 'editScene',
        slot: s.ref,
        instruction: i.message.slice(0, 200),
        label: `Improve ${s.template} scene`,
      });
  }
  return {
    reply: steps.length ? 'Here’s the plan' : 'Ask me for colours, sound, music or a scene change',
    steps: steps.slice(0, 12),
  };
}

export function pipAnswer(i: PipPlanInput): PipModelOutput {
  if (i.project.reel && i.project.slots.length === 0) return reelAnswer(i);
  const m = i.message.toLowerCase();
  const none = { slot: 'none', choice: 'none', atWord: -1, instruction: '' };
  const steps: PipModelOutput['steps'] = [];
  if (/caption/.test(m)) {
    const choice = /\boff\b|remove|hide/.test(m)
      ? 'off'
      : (['pop', 'clean', 'boxed'].find((p) => m.includes(p)) ?? 'on');
    steps.push({ ...none, action: 'setCaptions', choice, label: 'Update captions style' });
  }
  if (/vertical|9:16|shorts|reel/.test(m))
    steps.push({ ...none, action: 'setFormat', choice: '9:16', label: 'Switch to 9:16' });
  if (/square|1:1/.test(m))
    steps.push({ ...none, action: 'setFormat', choice: '1:1', label: 'Switch to 1:1' });
  if (/title/.test(m) && i.project.words[0]) {
    steps.push({
      ...none,
      action: 'addSlot',
      atWord: i.project.words[0][0],
      choice: i.project.components[0]?.id ?? 'none',
      instruction: 'An opening title',
      label: 'Add opening title',
    });
  }
  if (/brand|colou?r|style|look/.test(m)) {
    const other = i.project.styles.find((s) => s.id !== i.project.styleId);
    if (other)
      steps.push({ ...none, action: 'setStyle', choice: other.id, label: `Apply ${other.name}` });
  }
  if (/slower|faster|bigger|smaller|change|make/.test(m) && !steps.length) {
    const targets =
      i.scope !== 'video'
        ? i.project.slots.filter((s) => s.ref === i.scope)
        : i.project.slots.filter((s) => s.status === 'ready');
    for (const s of targets.slice(0, 4))
      steps.push({
        ...none,
        action: 'updateSlot',
        slot: s.ref,
        instruction: i.message.slice(0, 200),
        label: `Update ${s.name}`,
      });
  }
  return {
    reply: steps.length ? 'Here’s the plan' : 'I can’t do that one yet',
    steps: steps.slice(0, 8),
  };
}

export function createFakeRouter(opts: FakeRouterOptions = {}): Router {
  const sw = parseFakeSwitches(opts.search ?? '');
  const latency = opts.latencyMs ?? sw.latencyMs ?? 300;
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
      } else if (task.id === 'prompt.prefill') {
        output = prefillAnswer(input as PromptPrefillInput);
      } else if (task.id === 'pip.plan') {
        output = pipAnswer(input as PipPlanInput);
      } else if (task.id === 'pip.quick') {
        const q = input as {
          message: string;
          hasReel: boolean;
          reelLook?: 'mono' | 'cream';
          sceneRefs?: string[];
          slotRefs?: string[];
        };
        const m = q.message.toLowerCase();
        const steps: Array<{
          action: string;
          label: string;
          choice?: string;
          slot?: string;
          instruction?: string;
        }> = [];
        if (q.hasReel && /cream|editorial/.test(m))
          steps.push({ action: 'setReelLook', label: 'Switch to cream', choice: 'cream' });
        if (q.hasReel && /\bmono\b|minimal/.test(m))
          steps.push({ action: 'setReelLook', label: 'Switch to mono', choice: 'mono' });
        if (/caption/.test(m))
          steps.push({
            action: 'setCaptions',
            label: 'Update captions',
            choice: /\boff\b|remove|hide/.test(m) ? 'off' : 'on',
          });
        if (/sound|sfx|effect/.test(m))
          steps.push({
            action: 'setSound',
            label: 'Update sound effects',
            choice: /\boff\b|remove/.test(m)
              ? 'off'
              : /louder|more/.test(m)
                ? 'louder'
                : /quieter|softer/.test(m)
                  ? 'quieter'
                  : 'on',
          });
        if (/music/.test(m))
          steps.push({
            action: 'setMusic',
            label: 'Change music',
            choice: /\boff\b|remove/.test(m)
              ? 'none'
              : /upbeat|pulse/.test(m)
                ? 'steady-pulse'
                : 'calm-pad',
          });
        if (q.hasReel && /colou?r|gradient|vibrant|warm/.test(m))
          steps.push({
            action: 'setReelTheme',
            label: 'Warm accent gradient',
            choice: /bold|vivid|vibrant/.test(m) ? 'bold' : 'soft',
            instruction: '#FF5A36 #7C5CFF',
          });
        if (/vertical|9:16/.test(m))
          steps.push({ action: 'setFormat', label: 'Switch to 9:16', choice: '9:16' });
        if (/square|1:1/.test(m))
          steps.push({ action: 'setFormat', label: 'Switch to 1:1', choice: '1:1' });
        output =
          steps.length > 0 && !/animation|custom|redesign|chart|graphic/.test(m)
            ? { escalate: false, reply: 'Done on-device!', steps: steps.slice(0, 4) }
            : { escalate: true, reply: 'Needs cloud Pip.', steps: [] };
      } else if (task.id === 'reel.note.local') {
        const n = input as { noteText: string; sceneTemplate: string };
        const m = n.noteText.toLowerCase();
        if (/custom|chart|animation|illustrat|rocket|redesign|new graphic/.test(m)) {
          output = { action: 'escalate', message: 'Needs cloud AI for a new graphic.' };
        } else if (/\bdark\b/.test(m)) {
          output = { action: 'edit', message: 'Switched to dark background.', bg: 'dark' };
        } else if (/\bcream\b/.test(m)) {
          output = { action: 'edit', message: 'Switched to cream background.', bg: 'cream' };
        } else if (/\bcard\b/.test(m)) {
          output = { action: 'edit', message: 'Switched to card layout.', layout: 'card' };
        } else if (n.sceneTemplate === 'counter' && /\d/.test(m)) {
          const num = /\d+(?:\.\d+)?/.exec(m)?.[0] ?? '98';
          output = { action: 'edit', message: `Updated counter to ${num}.`, field: 'value', to: num };
        } else {
          const say = /(?:say|change to|title)\s+["“]?([^"”]{2,60})["”]?/i.exec(n.noteText)?.[1];
          output = {
            action: 'edit',
            message: 'Updated text on-device.',
            field: 'title',
            to: (say ?? n.noteText).trim().slice(0, 60),
          };
        }
      } else if (task.id === 'reel.draft') {
        const d = input as { words: [number, string][] };
        const total = d.words.length;
        const mid = Math.max(1, Math.floor(total / 2));
        const end = Math.max(mid + 1, total - 2);
        const firstPhrase = d.words
          .slice(0, 4)
          .map(([, w]) => w)
          .join(' ')
          .slice(0, 40);
        output = {
          hook: firstPhrase || 'Quick Takeaway',
          beats: [
            { fromWord: 0, template: 'headline', title: firstPhrase || 'Key Point', kicker: 'INTRO' },
            { fromWord: Math.min(mid, total - 1), template: 'punch', title: 'Big Shift', kicker: 'WHY' },
            ...(end < total
              ? [{ fromWord: end, template: 'cta', title: 'NOW', kicker: 'Try' }]
              : []),
          ],
        };
      } else if (task.id === 'custom.compose') {
        output = customAnswer(input as { brief: string; words: string });
      } else if (task.id === 'film.direct' || task.id === 'reel.storyboard') {
        output = filmDirectAnswer(input as FilmDirectInput);
      } else if (task.id === 'film.build' || task.id === 'reel.build') {
        output = filmBuildAnswer(input as FilmBuildInput);
      } else if (task.id === 'film.props') {
        output = { props: [] };
      } else if (task.id === 'film.vision-critic') {
        output = { pass: true, summary: 'All beats crisp and legible', flagged: [] };
      } else {
        throw fail(ranOn, 'provider', `The fake router has no answer for ${task.id}`);
      }

      await sleep(latency);
      if (failsBy(sw, task.id, input) || (sw.failRate > 0 && draw() < sw.failRate)) {
        throw fail(ranOn, 'provider', 'Fake failure (?fakeFail / ?fakeFailRate)');
      }
      let out = task.output.safeParse(output);
      if (!out.success) throw fail(ranOn, 'invalid-output', out.error.message.slice(0, 400));
      let problem = task.check?.(out.data, input) ?? null;
      let attempts = 1;
      // The real router repairs once; the fake's repair keeps the slot's current params, which
      // the slot's own gate accepted when they were drafted (the safe line has no beats).
      if (problem !== null && task.id === 'component.fill') {
        const current = (input as { currentParams?: Json }).currentParams;
        if (current && Object.keys(current).length > 0) {
          const again = task.output.safeParse({ params: current });
          if (again.success) {
            attempts = 2;
            out = again;
            problem = task.check?.(again.data, input) ?? null;
          }
        }
      }
      if (problem !== null) throw fail(ranOn, 'invalid-output', problem);
      report(ranOn, true);
      return {
        output: out.data,
        ranOn,
        model: 'fake-fast',
        costCredits: ranOn === 'cloud' ? cloudCost : 0,
        latencyMs: Math.round(clock() - started),
        attempts,
        cached: false,
      };
    },
  };
}
