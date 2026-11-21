import type { CriticVerdict, FilmBeatParams } from '@motionpop/ai';
import { captionSafeBandForStage, criticText, type CriticSummary, type ImageRef } from '@motionpop/motion';
import { compileProject, type CompileAssets, type CompileInput } from '@motionpop/motion/compiler';
import { FORMATS, type FilmWord, type Format, type TimedBeat } from '@motionpop/schemas';

/**
 * The film critic's sandbox in the app (spec 07b R4.1, R6.2). A built beat is generated code, so
 * it is never run in the app's own origin: it goes alone into a composition inside a hidden
 * iframe with `sandbox="allow-scripts"` (an opaque origin, no network of ours, no storage). A few
 * lines appended to the composition wait for the runtime, ask it to inspect the beat and post the
 * report to the parent. The parent accepts one message, from that frame, with that token.
 */
export interface SandboxCriticInput {
  params: FilmBeatParams;
  beat: TimedBeat;
  /** The beat's own words, times from the beat's start. */
  words: FilmWord[];
  format: Format;
  style: CompileInput['style'];
  assets: CompileAssets;
  /** Figures the beat may show, as plain digits. */
  allowNumbers: readonly string[];
  /** True when the beat plays over live speaker video (spec 19 R3.4). */
  hasVideo?: boolean;
  /** True when the beat is transparent over live video (`videoStage !== 'cutaway'`). */
  transparent?: boolean;
  /** Pre-inlined AI cutout / photo assets referenced via `mp.image(assetId)`. */
  images?: Record<string, ImageRef>;
  /** Optional sink that receives the real executed beat HTML snapshot at `keyMomentMs` (spec 23 R8). */
  onSnapshot?: (beatId: string, executedHtml: string) => void;
  doc?: Document;
  timeoutMs?: number;
}

interface CriticMessage {
  mpCritic: string;
  summary: CriticSummary | null;
  sounds: { kind: string; atMs: number }[];
  warnings: string[];
  snapshotHtml?: string | null;
  failed?: string;
}

const SFX = new Set(['whoosh', 'pop', 'tick', 'rise', 'impact']);

/** The verdict `makeFilm` acts on, from the critic's report and the kit's own warnings. */
export function verdictOf(
  summary: CriticSummary | null,
  warnings: readonly string[],
  sounds: readonly { kind: string; atMs: number }[],
): CriticVerdict {
  const reports = summary?.reports ?? [];
  const text = criticText(reports);
  const cues = sounds
    .filter((c) => SFX.has(c.kind) && Number.isFinite(c.atMs))
    .slice(0, 16)
    .map((c) => ({
      kind: c.kind as NonNullable<FilmBeatParams['cues']>[number]['kind'],
      atMs: Math.max(0, Math.round(c.atMs)),
    }));
  return {
    // Kit warnings (a word that isn't spoken, a place the map doesn't know) ride along as notes.
    fixes: text === null ? null : [text, ...warnings.slice(0, 6).map((w) => `- ${w}`)].join('\n'),
    blocking: reports.filter((r) => r.level === 'fix').length,
    broken: summary === null || reports.some((r) => r.rule === 'error'),
    ...(cues.length ? { cues } : {}),
  };
}

/** The lines appended to the one-beat composition: inspect, then report to the parent. */
function bootstrap(token: string, slotId: string, opts: object): string {
  const send = `parent.postMessage(m, '*')`;
  return `<script>(function(){
  var token=${JSON.stringify(token)};
  function fail(e){var m={mpCritic:token,summary:null,sounds:[],warnings:[],failed:String(e&&e.message||e)};${send};}
  try{
    var mp=window.__motionpop;
    if(!mp){fail('the composition did not start');return;}
    mp.ready.then(function(){
      try{
        var summary=mp.inspect(${JSON.stringify(slotId)},${JSON.stringify(opts)});
        var snap=typeof mp.snapshot==='function'?mp.snapshot(${JSON.stringify(slotId)}):null;
        var m={mpCritic:token,summary:summary,snapshotHtml:snap,sounds:(mp.sounds()[${JSON.stringify(slotId)}]||[]),warnings:mp.warnings.map(function(w){return w.message;})};
        ${send};
      }catch(e){fail(e);}
    },fail);
  }catch(e){fail(e);}
})();</script>`;
}

export async function inspectInSandbox(i: SandboxCriticInput): Promise<CriticVerdict> {
  const doc = i.doc ?? document;
  const view = doc.defaultView;
  if (!view) throw new Error('no window for the critic sandbox');
  const dur = i.beat.endMs - i.beat.startMs;
  const html = compileProject(
    {
      format: i.format,
      // A little past the tail, so the beat's last moment is inside the composition.
      durationMs: dur + i.beat.tailMs + 100,
      style: i.style,
      mode: 'preview',
      film: true,
      ...(i.hasVideo ? { hasVideo: true, background: 'transparent' as const } : {}),
      ...(i.images && Object.keys(i.images).length ? { images: i.images } : {}),
      slots: [
        {
          id: i.beat.id,
          componentId: 'custom',
          startMs: 0,
          endMs: dur,
          params: i.params,
          words: i.words,
          ...(i.beat.videoStage ? { videoStage: i.beat.videoStage } : {}),
          ...(i.beat.tailMs ? { tailMs: i.beat.tailMs, over: i.beat.over } : {}),
        },
      ],
    },
    i.assets,
  );
  const token = crypto.randomUUID();
  const { width, height } = FORMATS[i.format];
  const captionBand = i.hasVideo
    ? captionSafeBandForStage(i.format, width, height, i.beat.videoStage ?? 'full')
    : undefined;
  const opts = {
    wantsPicture: i.beat.lead !== 'type',
    headMs: i.beat.headMs,
    lead: i.beat.lead,
    allowNumbers: [...i.allowNumbers],
    ...(i.hasVideo ? { reelMode: true } : {}),
    ...(i.transparent ? { transparent: true } : {}),
    ...(captionBand ? { captionBand } : {}),
    ...(i.beat.videoStage ? { videoStage: i.beat.videoStage } : {}),
  };
  const frame = doc.createElement('iframe');
  // Scripts only: no same-origin, so the generated code can't reach the app, its storage or its
  // cookies. Never add `allow-same-origin` here.
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;height:${height}px;border:0;visibility:hidden;pointer-events:none;`;
  frame.srcdoc = html.replace('</body>', `${bootstrap(token, i.beat.id, opts)}</body>`);

  return new Promise<CriticVerdict>((resolve, reject) => {
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      view.removeEventListener('message', onMessage);
      view.clearTimeout(timer);
      frame.remove();
      fn();
    };
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.contentWindow) return;
      const m = e.data as Partial<CriticMessage> | null;
      if (!m || m.mpCritic !== token) return;
      finish(() => {
        if (m.failed) reject(new Error(m.failed));
        else {
          if (m.snapshotHtml && i.onSnapshot) i.onSnapshot(i.beat.id, m.snapshotHtml);
          resolve(verdictOf(m.summary ?? null, m.warnings ?? [], m.sounds ?? []));
        }
      });
    };
    const timer = view.setTimeout(
      () => finish(() => reject(new Error('the critic sandbox timed out'))),
      i.timeoutMs ?? 20_000,
    );
    view.addEventListener('message', onMessage);
    doc.body.append(frame);
  });
}
