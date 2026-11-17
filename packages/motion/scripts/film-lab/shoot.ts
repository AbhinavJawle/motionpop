// Film lab: compiles a list of generated beats into one composition, opens it in a headless
// browser, and brings back stills, the critic's report per beat and (optionally) a video.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer';
import { compileProject, type CompileSlot } from '../../src/compiler';
import { looks as craftLooks, editorialExplainer } from '../../src/styles';
import type { CriticSummary } from '../../src/film/critic';
import type { Format } from '../../src/contract';

const pkgDir = process.env['MOTION_PKG_DIR'] ?? process.cwd();
const looks: Record<string, unknown> = {
  [editorialExplainer.id]: editorialExplainer,
  ...craftLooks,
};

export interface ShootInput {
  outDir: string;
  format: Format;
  lookId: string;
  durationMs: number;
  slots: CompileSlot[];
  /** Film mode: beats own their seams, the backdrop is off, grain goes over everything. */
  film?: boolean;
  /** Path of the voiceover, for the video. */
  voice?: string;
  video?: boolean;
  /** Stills per beat, as shares of the beat (the key moment is always added). */
  shares?: number[];
  wantsPicture?: Record<string, boolean>;
  label?: string;
}
export interface ShootResult {
  errors: { slotId: string; phase: string; message: string }[];
  warnings: { slotId: string; message: string }[];
  critic: Record<string, CriticSummary | null>;
  sheet: string;
  video?: string;
}

const dims = (f: Format): [number, number] =>
  f === '16:9' ? [1920, 1080] : f === '9:16' ? [1080, 1920] : [1080, 1080];

export async function shoot(i: ShootInput): Promise<ShootResult> {
  const dist = join(pkgDir, 'dist');
  const assets = {
    runtimeJs: readFileSync(join(dist, 'runtime.js'), 'utf8'),
    hyperframesRuntimeJs: readFileSync(join(dist, 'hyperframe.runtime.iife.js'), 'utf8'),
    fonts: JSON.parse(readFileSync(join(dist, 'fonts.json'), 'utf8')) as Record<string, string>,
    textures: JSON.parse(readFileSync(join(dist, 'textures.json'), 'utf8')) as {
      grain: string;
      paper: string;
    },
  };
  const look = looks[i.lookId];
  if (!look) throw new Error(`no look ${i.lookId}`);
  const html = compileProject(
    {
      format: i.format,
      durationMs: i.durationMs,
      style: look as never,
      slots: i.slots,
      mode: 'preview',
      ...(i.film ? { film: true } : {}),
    },
    assets,
  );
  mkdirSync(i.outDir, { recursive: true });
  writeFileSync(join(i.outDir, 'index.html'), html);
  const [w, h] = dims(i.format);
  const browser = await puppeteer.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 0.5 });
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)));
    await page.setContent(html, { waitUntil: 'load' });
    // `!!`: the value itself is a promise, which the wait would await and read as undefined.
    await page.waitForFunction('!!window.__motionpop', { timeout: 30_000 });
    await page.evaluate('window.__motionpop.ready');
    const seek = async (ms: number) => {
      const frame = Math.round((ms * 30) / 1000);
      await page.evaluate(
        async (sec: number, tMs: number) => {
          const win = window as unknown as {
            __player?: { seek?: (s: number) => unknown };
            __motionpop: { seek: (ms: number) => void };
          };
          if (win.__player?.seek) await win.__player.seek(sec);
          else win.__motionpop.seek(tMs);
        },
        frame / 30,
        Math.round((frame * 1000) / 30),
      );
    };

    // The critic first (it leaves each slot at its key moment and restores the clock).
    const critic: Record<string, CriticSummary | null> = {};
    for (const s of i.slots) {
      critic[s.id] = (await page.evaluate(
        (id: string, wants: boolean) =>
          (
            window as unknown as { __motionpop: { inspect: (id: string, o: object) => unknown } }
          ).__motionpop.inspect(id, { wantsPicture: wants }),
        s.id,
        i.wantsPicture?.[s.id] ?? true,
      )) as CriticSummary | null;
    }

    const stills = join(i.outDir, 'stills');
    rmSync(stills, { recursive: true, force: true });
    mkdirSync(stills, { recursive: true });
    const shares = i.shares ?? [0.12, 0.38, 0.62, 0.9];
    let n = 0;
    for (const s of i.slots) {
      const dur = s.endMs - s.startMs;
      for (const share of shares) {
        await seek(s.startMs + Math.round(dur * share));
        await page.screenshot({
          path: join(stills, `f${String(n++).padStart(3, '0')}.jpg`) as `${string}.jpg`,
          quality: 82,
        });
      }
    }
    const sheet = join(i.outDir, 'sheet.jpg');
    const rows = Math.max(1, i.slots.length);
    execFileSync('ffmpeg', [
      '-loglevel',
      'error',
      '-y',
      '-framerate',
      '1',
      '-i',
      join(stills, 'f%03d.jpg'),
      '-vf',
      `scale=480:-1,tile=${shares.length}x${rows}:padding=4:color=0x222222`,
      '-frames:v',
      '1',
      '-q:v',
      '3',
      sheet,
    ]);

    let video: string | undefined;
    if (i.video) {
      const frames = join(i.outDir, 'frames');
      rmSync(frames, { recursive: true, force: true });
      mkdirSync(frames, { recursive: true });
      const total = Math.floor((i.durationMs * 30) / 1000);
      for (let f = 0; f < total; f++) {
        await seek(Math.round((f * 1000) / 30));
        await page.screenshot({
          path: join(frames, `f${String(f).padStart(5, '0')}.jpg`) as `${string}.jpg`,
          quality: 88,
        });
      }
      video = join(i.outDir, `${i.label ?? 'film'}.mp4`);
      execFileSync('ffmpeg', [
        '-loglevel',
        'error',
        '-y',
        '-framerate',
        '30',
        '-i',
        join(frames, 'f%05d.jpg'),
        ...(i.voice ? ['-i', i.voice] : []),
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-crf',
        '20',
        ...(i.voice ? ['-c:a', 'aac', '-b:a', '128k', '-shortest'] : []),
        video,
      ]);
      rmSync(frames, { recursive: true, force: true });
    }

    const state = (await page.evaluate(() => {
      const m = (window as unknown as { __motionpop: { errors: unknown[]; warnings: unknown[] } })
        .__motionpop;
      return { errors: m.errors, warnings: m.warnings };
    })) as { errors: ShootResult['errors']; warnings: ShootResult['warnings'] };
    for (const e of pageErrors) state.errors.push({ slotId: '*', phase: 'page', message: e });
    return { ...state, critic, sheet, ...(video ? { video } : {}) };
  } finally {
    await browser.close();
  }
}
