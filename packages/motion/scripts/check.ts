// motion:check (spec 03 R5): renders a component in headless Chrome for every supported format,
// with default, random (fast-check) and edge-case params at min/ideal/max durations and early,
// default and late key moments, then asserts layout, contrast, sync, hold, fonts and errors.
// Usage: pnpm motion:check <component-id> [--samples 20] [--seed 1]
// Bundled and run by scripts/run-check.ts (so it can import src/ with extensionless imports).
import {
  contrastRatio,
  FORMATS,
  frameToMs,
  msToFrame,
  type Format,
  type StylePack,
} from '@motionpop/schemas';
import fc from 'fast-check';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import puppeteer, { type Page } from 'puppeteer';
import { components } from '../src/components';
import { compileProject, type CompileSlot } from '../src/compiler';
import type { MotionComponent } from '../src/contract';
import { contains, safeArea, type Box } from '../src/core/safe-area';
import { editorialExplainer, testInverted } from '../src/styles';

interface Samples<P> {
  arbitrary: fc.Arbitrary<P>;
  edgeCases: Record<string, P>;
}

interface Case {
  name: string;
  params: unknown;
  durationMs: number;
  /** Explicit slot key moment; undefined = component default. */
  keyMomentMs?: number;
  keyLabel: 'default' | 'early' | 'late';
  style: StylePack;
  /** Save every still, not only failing ones. */
  keepStills: boolean;
}

interface TextProbe {
  rect: Box;
  opacity: number;
  visible: boolean;
  color: string;
  on: string | null;
  nested: boolean;
  text: string;
}

interface Probe {
  texts: TextProbe[];
  focal: { text: string; opacity: number; rect: Box } | null;
  rootBgAlpha: number;
}

interface Failure {
  case: string;
  format: Format;
  atMs?: number;
  check: string;
  detail: string;
}

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith('--'));
const flag = (name: string, dflt: number) => {
  const i = args.indexOf(`--${name}`);
  const v = i >= 0 ? Number(args[i + 1]) : NaN;
  return Number.isFinite(v) ? v : dflt;
};
const SAMPLES = flag('samples', 20);
const SEED = flag('seed', 1);
const GAP_MS = 300;
const STEP_MS = 20;
const HOLD_MS = 800;
const SYNC_MS = 80;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- registry of heterogeneous components; params are validated by each schema
const registry = components as Record<string, MotionComponent<any>>;
if (!id || !registry[id]) {
  console.error(`usage: pnpm motion:check <id>   (known: ${Object.keys(registry).join(', ')})`);
  process.exit(2);
}
const component = registry[id];

const pkgDir = process.env.MOTION_PKG_DIR ?? process.cwd();
const outDir = join(pkgDir, '.check', id);
const dist = join(pkgDir, 'dist');
const [runtimeJs, hyperframesRuntimeJs, fontsJson, texturesJson] = await Promise.all([
  readFile(join(dist, 'runtime.js'), 'utf8'),
  readFile(join(dist, 'hyperframe.runtime.iife.js'), 'utf8'),
  readFile(join(dist, 'fonts.json'), 'utf8'),
  readFile(join(dist, 'textures.json'), 'utf8'),
]);
const assets = {
  runtimeJs,
  hyperframesRuntimeJs,
  fonts: JSON.parse(fontsJson) as Record<string, string>,
  textures: JSON.parse(texturesJson) as { grain: string; paper: string },
};

const samplesMod = (await import(`../src/components/${id}/samples.ts`)) as Samples<unknown>;

function buildCases(): Case[] {
  const { min, ideal, max } = component.durationMs;
  const cases: Case[] = [];
  const fixed: [string, unknown][] = [
    ['defaults', component.defaults],
    ...Object.entries(samplesMod.edgeCases),
  ];
  for (const [name, params] of fixed) {
    for (const [durLabel, durationMs] of [
      ['min', min],
      ['ideal', ideal],
      ['max', max],
    ] as const) {
      for (const keyLabel of ['default', 'early', 'late'] as const) {
        const keyMomentMs =
          keyLabel === 'default'
            ? undefined
            : Math.round(durationMs * (keyLabel === 'early' ? 0.1 : 0.9));
        cases.push({
          name: `${name}-${durLabel}-${keyLabel}`,
          params,
          durationMs,
          keyMomentMs,
          keyLabel,
          style: editorialExplainer,
          keepStills: name === 'defaults' && durLabel === 'ideal' && keyLabel === 'default',
        });
      }
    }
  }
  cases.push({
    name: 'defaults-ideal-default-inverted',
    params: component.defaults,
    durationMs: ideal,
    keyLabel: 'default',
    style: testInverted,
    keepStills: true,
  });
  fc.sample(samplesMod.arbitrary, { seed: SEED, numRuns: SAMPLES }).forEach((params, i) => {
    cases.push({
      name: `random${i}`,
      params,
      durationMs: ideal,
      keyLabel: 'default',
      style: editorialExplainer,
      keepStills: false,
    });
  });
  return cases;
}

const hexOf = (rgb: string): string => {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb);
  if (!m) return '#000000';
  return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
};

const overlap = (a: Box, b: Box): boolean => {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 2 && h > 2;
};

/** Runs in the page: seeks through HyperFrames' clock (exercises the hf-seek contract) and probes a slot. */
async function probeAt(page: Page, slotId: string, rawMs: number, direct = false): Promise<Probe> {
  // Frame-aligned, like the producer (30 fps). HyperFrames floors its clock to frames, so the clock
  // gets exactly frame / 30 s and the direct seek gets the same frame's integer ms.
  const frame = msToFrame(rawMs);
  const tMs = frameToMs(frame);
  const tSec = frame / 30;
  return page.evaluate(
    async ({ slotId, tMs, tSec, direct }) => {
      const w = window as unknown as {
        __player?: { seek?: (s: number) => unknown };
        __hf?: { seek?: (s: number) => unknown };
        __motionpop: { seek: (ms: number) => void };
      };
      // Drive HyperFrames' own clock (it also controls which clip is visible). `__player` in a
      // plain page, `__hf` in the producer's render mode.
      const clock = w.__player?.seek ? w.__player : w.__hf;
      if (direct) w.__motionpop.seek(tMs);
      else if (clock?.seek) await clock.seek(tSec);
      else throw new Error('no HyperFrames seek API on the page');
      const host = document.getElementById(slotId);
      const root = host?.querySelector<HTMLElement>('.mp-slot-root');
      const rootEl = document.getElementById('mp-root');
      const effOpacity = (el: Element) => {
        let o = 1;
        for (let n: Element | null = el; n && n !== rootEl; n = n.parentElement)
          o *= Number(getComputedStyle(n).opacity);
        return o;
      };
      const visible = (el: Element) => {
        for (let n: Element | null = el; n && n !== rootEl; n = n.parentElement) {
          const cs = getComputedStyle(n);
          if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        }
        return true;
      };
      const rectOf = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      const texts = [...(host?.querySelectorAll<HTMLElement>('[data-text]') ?? [])].map((el) => ({
        rect: rectOf(el),
        opacity: effOpacity(el),
        visible: visible(el),
        color: getComputedStyle(el).color,
        on: el.dataset.on ?? null,
        nested: el.parentElement?.closest('[data-text]') !== null,
        text: el.textContent ?? '',
      }));
      const f = host?.querySelector<HTMLElement>('[data-focal]');
      // Focal state is compared in slot space: switch the camera push-in off while measuring.
      const cam = host?.querySelector<HTMLElement>('.mp-cam');
      const camTransform = cam?.style.transform ?? '';
      if (cam) cam.style.transform = 'none';
      const focal = f
        ? { text: f.textContent ?? '', opacity: effOpacity(f), rect: rectOf(f) }
        : null;
      if (cam) cam.style.transform = camTransform;
      const bg = root ? getComputedStyle(root).backgroundColor : 'rgba(0, 0, 0, 0)';
      const m = /rgba?\(([^)]+)\)/.exec(bg);
      const parts = m?.[1]?.split(',').map((s) => Number(s.trim())) ?? [0, 0, 0, 0];
      const rootBgAlpha = parts.length === 4 ? (parts[3] ?? 0) : bg === 'transparent' ? 0 : 1;
      return { texts, focal, rootBgAlpha };
    },
    { slotId, tMs, tSec, direct },
  );
}

/** Sweeps the slot and returns the readable window: all visible text at ≥ 0.9 opacity. */
async function readableWindow(page: Page, slotId: string, startMs: number, durationMs: number) {
  const opacities = await page.evaluate(
    ({ slotId, startMs, durationMs, step }) => {
      const w = window as unknown as { __motionpop: { seek: (ms: number) => void } };
      const host = document.getElementById(slotId);
      const rootEl = document.getElementById('mp-root');
      const els = [...(host?.querySelectorAll<HTMLElement>('[data-text]') ?? [])].filter(
        (el) => (el.textContent ?? '').length > 0,
      );
      const out: number[] = [];
      for (let t = 0; t <= durationMs; t += step) {
        w.__motionpop.seek(startMs + t);
        let min = 1;
        for (const el of els) {
          let o = 1;
          for (let n: Element | null = el; n && n !== rootEl; n = n.parentElement)
            o *= Number(getComputedStyle(n).opacity);
          min = Math.min(min, o);
        }
        out.push(min);
      }
      return out;
    },
    { slotId, startMs, durationMs, step: STEP_MS },
  );
  const first = opacities.findIndex((o) => o >= 0.9);
  if (first < 0) return null;
  let last = first;
  while (last + 1 < opacities.length && (opacities[last + 1] ?? 0) >= 0.9) last++;
  return { fromMs: first * STEP_MS, toMs: last * STEP_MS };
}

const sameState = (a: Probe['focal'], b: Probe['focal']) =>
  !!a &&
  !!b &&
  a.text === b.text &&
  Math.abs(a.opacity - b.opacity) < 0.01 &&
  Math.abs(a.rect.x - b.rect.x) <= 1 &&
  Math.abs(a.rect.y - b.rect.y) <= 1 &&
  Math.abs(a.rect.width - b.rect.width) <= 1 &&
  Math.abs(a.rect.height - b.rect.height) <= 1;

async function main() {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const cases = buildCases();
  const failures: Failure[] = [];
  const warnings: string[] = [];
  let stills = 0;
  const t0 = performance.now();
  const browser = await puppeteer.launch({ headless: true });
  try {
    for (const format of component.formats) {
      const { width: w, height: h } = FORMATS[format];
      const safe = safeArea(format, w, h);
      // Group cases by style (one composition per format and style).
      for (const style of [editorialExplainer, testInverted]) {
        const group = cases.filter((c) => c.style === style);
        if (group.length === 0) continue;
        let at = 0;
        const slots: (CompileSlot & { case: Case; keyAbs: number })[] = group.map((c, i) => {
          const startMs = at;
          at += c.durationMs + GAP_MS;
          const parsed = component.params.parse(c.params);
          const key = c.keyMomentMs ?? component.keyMomentMs(parsed, c.durationMs);
          return {
            id: `c${i}`,
            startMs,
            endMs: startMs + c.durationMs,
            componentId: id!,
            params: c.params,
            keyMomentMs: c.keyMomentMs,
            case: c,
            keyAbs: key,
          };
        });
        const html = compileProject(
          {
            format,
            durationMs: at,
            style,
            slots: slots.map(({ case: _c, keyAbs: _k, ...s }) => s),
          },
          assets,
        );
        const page = await browser.newPage();
        await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
        const pageErrors: string[] = [];
        page.on('pageerror', (e) => pageErrors.push(e instanceof Error ? e.message : String(e)));
        await page.setContent(html, { waitUntil: 'load' });
        await page.evaluate(
          () => (window as unknown as { __motionpop: { ready: Promise<void> } }).__motionpop.ready,
        );
        const runtime = await page.evaluate(() => {
          const mp = (
            window as unknown as {
              __motionpop: { errors: unknown[]; warnings: { slotId: string; message: string }[] };
            }
          ).__motionpop;
          const fams = ['Geist', 'Geist Mono'];
          return {
            errors: mp.errors,
            warnings: mp.warnings,
            fonts: fams.map((f) => [f, document.fonts.check(`400 16px "${f}"`)] as const),
          };
        });
        for (const e of pageErrors)
          failures.push({ case: '*', format, check: 'page error', detail: e });
        for (const e of runtime.errors)
          failures.push({ case: '*', format, check: 'runtime error', detail: JSON.stringify(e) });
        for (const [f, ok] of runtime.fonts)
          if (!ok) failures.push({ case: '*', format, check: 'fonts', detail: `${f} not loaded` });

        for (const s of slots) {
          const c = s.case;
          const fail = (check: string, detail: string, atMs?: number) =>
            failures.push({ case: c.name, format, atMs, check, detail });
          for (const wn of runtime.warnings.filter((x) => x.slotId === s.id)) {
            if (/overflow/i.test(wn.message)) fail('overflow warning', wn.message);
            else if (!/shorter than/.test(wn.message))
              warnings.push(`${format} ${c.name}: ${wn.message}`);
          }
          const dur = c.durationMs;
          const key = s.keyAbs;
          const win = await readableWindow(page, s.id, s.startMs, dur);
          const endHold = win ? Math.max(key, win.toMs - STEP_MS) : key;
          if (c.keyLabel === 'default') {
            // The hold rule only applies where the word leaves room for it (late words can't hold 800 ms).
            if (!win) fail('hold', 'text never fully readable');
            else if (win.toMs - Math.max(win.fromMs, key) < HOLD_MS)
              fail(
                'hold',
                `readable for ${win.toMs - Math.max(win.fromMs, key)} ms after the key moment (needs ${HOLD_MS})`,
              );
          }
          const times: [string, number, boolean][] = [
            ['0', 0, false],
            ['key', key, true],
            ['hold-end', endHold, true],
            ['90', Math.round(dur * 0.9), false],
          ];
          for (const [label, t, strict] of times) {
            const p = await probeAt(page, s.id, s.startMs + t);
            let bad = false;
            const live = p.texts.filter((x) => x.visible && x.opacity >= 0.05 && x.text.length > 0);
            for (const x of live) {
              if (!contains(safe, x.rect)) {
                fail(
                  'safe area',
                  `"${x.text.slice(0, 24)}" at ${JSON.stringify(x.rect)} outside ${JSON.stringify(safe)}`,
                  t,
                );
                bad = true;
              }
            }
            for (let i = 0; i < live.length; i++)
              for (let j = i + 1; j < live.length; j++) {
                const a = live[i]!,
                  b = live[j]!;
                if (!a.nested && !b.nested && overlap(a.rect, b.rect)) {
                  fail('overlap', `"${a.text.slice(0, 16)}" × "${b.text.slice(0, 16)}"`, t);
                  bad = true;
                }
              }
            if (strict) {
              for (const x of live.filter((y) => y.opacity >= 0.9)) {
                const backdrop =
                  x.on && x.on in style.colors
                    ? (style.colors as Record<string, unknown>)[x.on]
                    : style.colors.bg;
                const ratio = contrastRatio(
                  hexOf(x.color),
                  typeof backdrop === 'string' ? backdrop : style.colors.bg,
                );
                if (ratio < 4.5) {
                  fail(
                    'contrast',
                    `"${x.text.slice(0, 16)}" ${ratio.toFixed(2)}:1 on ${x.on ?? 'bg'}`,
                    t,
                  );
                  bad = true;
                }
              }
            }
            if (label === 'key') {
              const fo = p.focal;
              if (
                !fo ||
                fo.opacity < 0.9 ||
                !contains({ x: 0, y: 0, width: w, height: h }, fo.rect)
              ) {
                fail('focal', `focal not visible at the key moment (${JSON.stringify(fo)})`, t);
                bad = true;
              }
            }
            if (p.rootBgAlpha > 0) {
              fail('transparent root', `slot root background alpha ${p.rootBgAlpha}`, t);
              bad = true;
            }
            if (bad || c.keepStills) {
              await page.screenshot({
                path: join(
                  outDir,
                  `${format.replace(':', 'x')}-${c.name}-${label}.png`,
                ) as `${string}.png`,
              });
              stills++;
            }
          }
          // Sync (principle 13): settled within +80 ms of the word; still moving 80 ms before it.
          // "Settled" = unchanged from key + 80 ms until 400 ms after the word, or until the exit
          // starts (late words leave little room), whichever comes first.
          const after = await probeAt(page, s.id, s.startMs + Math.min(dur, key + SYNC_MS));
          let settled = after;
          for (const d of [160, 240, 320, 400]) {
            if (key + d > dur) break;
            const later = await probeAt(page, s.id, s.startMs + key + d);
            if ((later.focal?.opacity ?? 0) < (after.focal?.opacity ?? 0) - 0.01) break; // exiting
            settled = later;
            if (!sameState(after.focal, later.focal)) {
              fail(
                'sync',
                `focal still changing at key + ${d} ms (not settled by key + ${SYNC_MS} ms)`,
                key + SYNC_MS,
              );
              break;
            }
          }
          if (key - SYNC_MS > 0) {
            const before = await probeAt(page, s.id, s.startMs + key - SYNC_MS);
            const canChange =
              before.focal?.text !== settled.focal?.text || (before.focal?.opacity ?? 1) < 0.99;
            if (!canChange && sameState(before.focal, settled.focal)) {
              warnings.push(
                `${format} ${c.name}: focal already settled 80 ms before the key moment`,
              );
            }
          }
          // Event contract: the HyperFrames clock and a direct seek give the same frame.
          const viaHf = await probeAt(page, s.id, s.startMs + key);
          const direct = await probeAt(page, s.id, s.startMs + key, true);
          const textsKey = (p: Probe) =>
            JSON.stringify(p.texts.map((x) => [x.text, x.opacity.toFixed(3), x.visible]));
          if (!sameState(viaHf.focal, direct.focal) || textsKey(viaHf) !== textsKey(direct))
            fail(
              'hf-seek contract',
              `HyperFrames clock and direct seek disagree: ${textsKey(viaHf)} vs ${textsKey(direct)}`,
              key,
            );
        }
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  const report = {
    component: id,
    seed: SEED,
    samples: SAMPLES,
    cases: cases.length,
    stills,
    ms: Math.round(performance.now() - t0),
    failures,
    warnings,
  };
  await writeFile(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(
    `motion:check ${id}: ${cases.length} cases × ${component.formats.length} formats, ${failures.length} failures, ${warnings.length} warnings, ${report.ms} ms (seed ${SEED})`,
  );
  for (const f of failures.slice(0, 40))
    console.log(
      `  ✗ ${f.format} ${f.case}${f.atMs !== undefined ? ` @${f.atMs}ms` : ''} [${f.check}] ${f.detail}`,
    );
  if (failures.length > 40)
    console.log(`  … ${failures.length - 40} more in ${join(outDir, 'report.json')}`);
  process.exit(failures.length ? 1 : 0);
}

await main();
