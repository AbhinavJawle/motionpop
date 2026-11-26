// The render job (spec 08 design §8): one render doc in, one MP4 and one thumbnail out. It only
// talks to the ports, so the cloud, the emulators and offline mode run the same code.
import {
  assetsInUse,
  compileProject,
  MAP_FILES,
  mapStylesInUse,
  projectCompileInput,
  styleFor,
} from '@motionpop/motion/compiler';
import type { ImageRef } from '@motionpop/motion';
import { compileReel } from '@motionpop/motion/reel';
import { mediaHashOf, mediaStoragePath, musicPathFor, reelMediaOf } from '@motionpop/schemas';
import {
  EditorProjectSchema,
  audibleStockAudio,
  isSafeId,
  keptSourceSegments,
  mediaClipPathFor,
  renderContainerFor,
  renderMimeType,
  renderPaths,
  stockAudioPathFor,
  stockOverlayPathFor,
  videoPathFor,
  visibleStockOverlays,
  voicePathFor,
  type EditorProject,
  type RenderDoc,
  type RenderErrorCode,
  type RenderPaths,
} from '@motionpop/schemas';
import { copyFile, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { prepareBed, prepareReelBed, prepareReelMusic } from './bed';
import { loadReelAssets, motionDistDir } from './compile-assets';
import { contentDisposition } from './headers';
import { expectedSize, outputIssues } from './output';
import { preflightSamples } from './preflight-samples';
import {
  RenderAbortedError,
  RenderTimeoutError,
  type JobStage,
  type RenderDeps,
  type RenderOutcome,
} from './ports';
import { ProgressThrottle, mapProgress } from './progress';
import { THUMB_LONG_SIDE, thumbnailTimeMs } from './thumbnail';
import type { ResolvedStockAudio, ResolvedStockOverlay } from './stock-ffmpeg';

export const HEARTBEAT_MS = 10_000;
/** The longest voice we accept, whatever the project says (design §8 step 2). */
export const MAX_VOICE_MS = 10 * 60_000;
/** A voice may run this much past the project before it is refused. */
export const VOICE_SLACK_MS = 5_000;

/** A failure with its error code and a message that is safe to store on the render doc. */
export class RenderStepError extends Error {
  constructor(
    readonly code: RenderErrorCode,
    readonly safeMessage: string,
    override readonly cause?: unknown,
  ) {
    super(safeMessage);
    this.name = 'RenderStepError';
  }
}

export async function runRender(renderId: string, deps: RenderDeps): Promise<RenderOutcome> {
  const { store, blobs, ffmpeg, clock, log } = deps;
  const startedAt = clock.now();

  if (!isSafeId(renderId)) {
    log.error({ event: 'render', outcome: 'skipped', reason: 'bad-render-id' });
    return 'skipped';
  }

  // 1. Load and claim. Anything but a queued render is a duplicate execution or a swept render.
  const doc = await store.get(renderId);
  if (!doc || doc.status !== 'queued' || !(await store.markStarted(renderId))) {
    log.info({ event: 'render', renderId, outcome: 'skipped', status: doc?.status ?? 'missing' });
    return 'skipped';
  }

  const abort = new AbortController();
  const { signal } = abort;
  const stopHeartbeat = clock.every(HEARTBEAT_MS, () => {
    store.heartbeat(renderId).then(
      (r) => {
        if (r === 'inactive') abort.abort();
      },
      (e: unknown) => log.error({ event: 'heartbeat-failed', renderId, error: errorText(e) }),
    );
  });

  const compDir = join(deps.workDir, 'composition');
  let paths: RenderPaths | undefined;
  let failure: { code: RenderErrorCode; message: string } | undefined;
  let recordError: unknown;
  let sizeBytes: number | undefined;
  let producerMs: number | undefined;
  let perfTotalMs: number | undefined;

  /** Runs one step: no work once aborted, and any plain error becomes `code`. */
  async function step<T>(code: RenderErrorCode, label: string, fn: () => Promise<T>): Promise<T> {
    if (signal.aborted) throw new RenderAbortedError();
    try {
      return await fn();
    } catch (e) {
      if (e instanceof RenderStepError || e instanceof RenderAbortedError) throw e;
      throw new RenderStepError(code, `${label} failed`, e);
    }
  }

  try {
    // 2. Inputs. The doc is server-written, but the job's storage grant spans every user, so the
    // paths are re-checked before a single byte is read (R3.9).
    const project = await step('input-missing', 'reading the inputs', async () => {
      paths = expectedPaths(doc, renderId);
      if (doc.inputPath !== paths.input) {
        throw new RenderStepError(
          'input-missing',
          'the project snapshot path is not this render’s',
        );
      }
      if (!voicePathFor(doc.ownerId, doc.projectId).test(doc.voicePath)) {
        throw new RenderStepError('input-missing', 'the voice path is not this project’s');
      }
      await mkdir(join(compDir, 'assets'), { recursive: true });
      const parsed = EditorProjectSchema.safeParse(
        JSON.parse((await blobs.read(doc.inputPath)).toString('utf8')),
      );
      if (!parsed.success)
        throw new RenderStepError('input-missing', 'the project snapshot is invalid');
      if (parsed.data.id !== doc.projectId) {
        throw new RenderStepError('input-missing', 'the snapshot belongs to another project');
      }
      await prepareVoice(parsed.data, doc, deps, compDir);
      return parsed.data;
    });
    if (!paths) throw new RenderStepError('internal', 'no paths');

    // 2b. The sound bed (effects, music). It only adds to the voice, so a failure here logs and
    // the export goes on with the voice alone rather than failing the whole render.
    let bedSrc: string | null = null;
    try {
      if (project.reel && !project.reel.graphicOnly) bedSrc = await prepareReelBed(project, compDir);
      else if (!project.reel && doc.music) bedSrc = await prepareBed(project, compDir);
    } catch (e) {
      log.error({ event: 'bed-failed', renderId, error: errorText(e) });
    }
    // The reel's generated music (spec 27 R3.2), from the owner's project audio folder only.
    let musicSrc: string | null = null;
    const musicRef =
      project.reel && !project.reel.graphicOnly ? project.reel.music?.src : undefined;
    if (musicRef) {
      const path = musicRef.startsWith('storage:') ? musicRef.slice('storage:'.length) : musicRef;
      if (musicPathFor(doc.ownerId, doc.projectId).test(path)) {
        const dest = join(deps.workDir, 'music-source.wav');
        try {
          await blobs.download(path, dest);
          musicSrc = await prepareReelMusic(project, compDir, dest);
        } catch (e) {
          log.error({ event: 'music-failed', renderId, error: errorText(e) });
        } finally {
          await rm(dest, { force: true }).catch(() => undefined);
        }
      } else log.error({ event: 'music-path-refused', renderId });
    }

    // 2c. Pictures (spec 07 R4): each one the slots use, from the owner's media folder only. A
    // missing picture logs and its scene renders the image-free form, like in the editor.
    const images: Record<string, ImageRef> = {};
    for (const a of assetsInUse(project)) {
      const hash = mediaHashOf(a.src ?? '');
      if (!hash) continue;
      try {
        const rel = `assets/img-${hash.slice(0, 16)}.webp`;
        await blobs.download(mediaStoragePath(doc.ownerId, hash), join(compDir, rel));
        images[a.id] = {
          src: rel,
          width: a.width ?? 1024,
          height: a.height ?? 1024,
          keyed: a.keyed,
        };
      } catch (e) {
        log.error({ event: 'image-missing', renderId, asset: a.id, error: errorText(e) });
      }
    }

    // 2c'. Reel pictures (spec 26): logos, illustrations, photos and screenshots the plan uses,
    // from the owner's media folder only. A missing one draws its template's fallback.
    const reelImages: Record<string, { src: string; w: number; h: number }> = {};
    if (project.reel) {
      const wanted = new Set(reelMediaOf(project.reel).flatMap((m) => (m.asset ? [m.asset] : [])));
      for (const a of project.assets ?? []) {
        if (!wanted.has(a.id) || a.status !== 'ready') continue;
        const hash = mediaHashOf(a.src ?? '');
        if (!hash) continue;
        try {
          const rel = `assets/img-${hash.slice(0, 16)}.webp`;
          await blobs.download(mediaStoragePath(doc.ownerId, hash), join(compDir, rel));
          reelImages[a.id] = { src: rel, w: a.width ?? 1024, h: a.height ?? 1024 };
        } catch (e) {
          log.error({ event: 'image-missing', renderId, asset: a.id, error: errorText(e) });
        }
      }
    }

    // 2d. Map imagery for the globe, from the bundled runtime (never the network).
    const styles = mapStylesInUse(project, doc.format);
    let mapsBase: string | undefined;
    if (styles.length) {
      try {
        await mkdir(join(compDir, 'assets', 'maps'), { recursive: true });
        for (const s of styles) {
          const f = MAP_FILES[s];
          await copyFile(join(motionDistDir(), 'maps', f), join(compDir, 'assets', 'maps', f));
        }
        mapsBase = 'assets/maps/';
      } catch (e) {
        // The map scenes draw their flat vector map instead.
        log.error({ event: 'maps-missing', renderId, error: errorText(e) });
      }
    }

    // 2e. Source video for video projects (spec 18 R7.1, spec 19 R5.1), downloaded from owner's folder.
    // Talking-head reels (spec 25) play it inside the composition, so it lands in the composition folder.
    // Graphics-only & voiceover-only reel projects have no speaker video and support transparent WebM.
    // Transparent WebM exports (spec 47) skip source footage so NLE editors get alpha overlays.
    const useReelEngine = Boolean(project.reel);
    const hasSpeakerVideo = Boolean(project.reel && project.video);
    const transparentMode = Boolean(doc.transparent) && !hasSpeakerVideo;
    const outContainer = transparentMode ? 'webm' : 'mp4';
    const finalPaths = renderPaths(doc.ownerId, doc.projectId, renderId, outContainer);
    paths = finalPaths;
    let sourceVideoFile: string | null = null;
    let reelVideoRel: string | null = null;
    if (project.video && !transparentMode && (ffmpeg.compositeVideo || hasSpeakerVideo)) {
      const candidate =
        doc.videoPath ??
        (project.video.src.startsWith('storage:')
          ? project.video.src.slice('storage:'.length)
          : project.video.src);
      const allowed =
        videoPathFor(doc.ownerId, doc.projectId).test(candidate) ||
        voicePathFor(doc.ownerId, doc.projectId).test(candidate);
      if (allowed) {
        const ext = /^\.[a-z0-9]{2,5}$/i.test(extname(candidate)) ? extname(candidate) : '.mp4';
        if (hasSpeakerVideo) reelVideoRel = `assets/speaker${ext.toLowerCase()}`;
        const dest = reelVideoRel
          ? join(compDir, reelVideoRel)
          : join(deps.workDir, `source-video${ext.toLowerCase()}`);
        try {
          await blobs.download(candidate, dest);
          sourceVideoFile = dest;
        } catch (e) {
          log.error({ event: 'source-video-missing', renderId, error: errorText(e) });
        }
        // Raw footage (spec 27 R5.2): reels play an upright H.264 proxy, so 4K, HEVC, VFR and
        // rotated phone clips render like the preview. A failed proxy keeps the original.
        if (hasSpeakerVideo && sourceVideoFile && ffmpeg.proxyVideo) {
          const proxyRel = 'assets/speaker-proxy.mp4';
          try {
            await ffmpeg.proxyVideo({
              src: sourceVideoFile,
              dest: join(compDir, proxyRel),
              longSide: 1920,
            });
            await rm(sourceVideoFile, { force: true });
            sourceVideoFile = join(compDir, proxyRel);
            reelVideoRel = proxyRel;
          } catch (e) {
            log.error({ event: 'video-proxy-failed', renderId, error: errorText(e) });
          }
        }
      }
    }
    if (hasSpeakerVideo && !sourceVideoFile) {
      throw new RenderStepError('input-missing', 'the source video could not be read');
    }
    const videoComposite =
      !useReelEngine &&
      !transparentMode &&
      Boolean(project.video && sourceVideoFile && ffmpeg.compositeVideo);

    // 2f. Secondary Media Bin clips referenced by legacy video stages (spec 21 R5.3) OR Reel
    // Engine `clip` scenes (spec 48 R3.4). For Reel exports, clips land inside `compDir/assets/`
    // and video clips are transcoded into upright CFR H.264 proxies for frame-accurate Chromium seek.
    const downloadedClips: Record<string, { path: string; isVideo: boolean; durationMs?: number }> =
      {};
    const reelClips: Record<
      string,
      { src: string; isVideo: boolean; w: number; h: number; durationMs?: number; name?: string }
    > = {};
    if ((videoComposite || (useReelEngine && !transparentMode)) && doc.clipPaths && project.mediaBin?.length) {
      const clipRe = mediaClipPathFor(doc.ownerId, doc.projectId);
      let idx = 0;
      for (const [clipId, storagePath] of Object.entries(doc.clipPaths)) {
        if (!clipRe.test(storagePath)) continue;
        const meta = project.mediaBin.find((c) => c.id === clipId);
        if (!meta) continue;
        const isVideo = meta.mimeType.startsWith('video/');
        const ext = storagePath.slice(storagePath.lastIndexOf('.')) || (isVideo ? '.mp4' : '.jpg');
        const clipNum = idx++;
        if (useReelEngine) {
          let rel = `assets/mclip-${clipNum}${ext.toLowerCase()}`;
          const dest = join(compDir, rel);
          try {
            await blobs.download(storagePath, dest);
            if (isVideo && ffmpeg.proxyVideo) {
              const proxyRel = `assets/mclip-${clipNum}-proxy.mp4`;
              try {
                await ffmpeg.proxyVideo({
                  src: dest,
                  dest: join(compDir, proxyRel),
                  longSide: 1920,
                });
                await rm(dest, { force: true });
                rel = proxyRel;
              } catch (e) {
                log.error({ event: 'media-clip-proxy-failed', renderId, clipId, error: errorText(e) });
              }
            }
            reelClips[clipId] = {
              src: rel,
              isVideo,
              w: meta.width,
              h: meta.height,
              ...(meta.durationMs !== undefined ? { durationMs: meta.durationMs } : {}),
              name: meta.name,
            };
          } catch (e) {
            log.error({ event: 'media-clip-missing', renderId, clipId, error: errorText(e) });
          }
        } else {
          const dest = join(deps.workDir, `media-clip-${clipNum}${ext}`);
          try {
            await blobs.download(storagePath, dest);
            downloadedClips[clipId] = {
              path: dest,
              isVideo,
              ...(meta.durationMs !== undefined ? { durationMs: meta.durationMs } : {}),
            };
          } catch (e) {
            log.error({ event: 'media-clip-missing', renderId, clipId, error: errorText(e) });
          }
        }
      }
    }

    // 3. Compile. A reel-engine project is one composition: graphics scenes (plus speaker clips for
    // talking-head reels, or voiceover WAV for voice-only reels, or pure alpha for graphics-only).
    const slots = await step('compile-failed', 'compiling', async () => {
      if (useReelEngine && project.reel && (!hasSpeakerVideo || (project.video && reelVideoRel))) {
        const dims = expectedSize(doc.format, doc.resolution);
        const planForRender = {
          ...project.reel,
          captions: project.reel.graphicOnly ? false : doc.captions,
        };
        const html = compileReel(
          {
            plan: planForRender,
            words: project.transcript.words.map((w) => ({
              text: w.text,
              startMs: w.startMs,
              endMs: w.endMs,
            })),
            durationMs: project.durationMs,
            format: doc.format,
            ...(transparentMode ? { transparent: true } : {}),
            ...(hasSpeakerVideo && project.video && reelVideoRel
              ? {
                  videoSrc: reelVideoRel,
                  video: { w: project.video.width, h: project.video.height },
                  segments: keptSourceSegments(
                    project.video.originalDurationMs,
                    project.video.cuts,
                  ).map((k) => ({ srcStartMs: k.startMs, srcEndMs: k.endMs })),
                }
              : !project.reel.graphicOnly
                ? { voiceSrc: 'assets/voice.wav' }
                : {}),
            out: { w: dims.width, h: dims.height },
            images: reelImages,
            ...(Object.keys(reelClips).length ? { clips: reelClips } : {}),
            ...(bedSrc ? { sfxSrc: bedSrc } : {}),
            ...(musicSrc ? { musicSrc } : {}),
          },
          deps.reelAssets ?? (await loadReelAssets()),
        );
        await writeFile(join(compDir, 'index.html'), html);
        return [];
      }
      const input = projectCompileInput(project, {
        mode: 'render',
        format: doc.format,
        background: videoComposite || transparentMode ? 'transparent' : 'style',
        ...(videoComposite ? {} : { voiceSrc: 'assets/voice.wav' }),
        ...(bedSrc && !videoComposite ? { bedSrc } : {}),
        // The job computes the caption groups itself from the snapshot (spec 12 R4.5).
        captions: doc.captions,
        images,
        ...(mapsBase ? { mapsBase } : {}),
      });
      if (input.slots.length === 0 && !videoComposite) {
        throw new RenderStepError('compile-failed', 'nothing in the project can be rendered');
      }
      await writeFile(join(compDir, 'index.html'), compileProject(input, deps.assets));
      return input.slots;
    });

    // 4a. Preflight: a slot that fails to build leaves its clip empty, so catch it before the render.
    const issues = await step('render-failed', 'the preflight', async () =>
      useReelEngine
        ? []
        : deps.preflight.check({
            compDir,
            format: doc.format,
            samplesMs: preflightSamples(slots),
            signal,
          }),
    );
    if (issues.length > 0) {
      log.error({ event: 'slot-errors', renderId, issues: issues.slice(0, 10) });
      throw new RenderStepError(
        'slot-failed',
        `slot ${issues[0]?.slotId ?? '?'} could not be built`,
      );
    }

    // 4b. Produce, with progress through the throttle and the store as the abort switch.
    const out = join(deps.workDir, transparentMode ? 'video.webm' : 'video.mp4');
    const overlayOut = join(deps.workDir, 'overlay.webm');
    const throttle = new ProgressThrottle();
    let writes: Promise<void> = Promise.resolve();
    const onProgress = (p: { stage: JobStage; percent: number }): void => {
      const d = throttle.offer(p.stage, mapProgress(p.stage, p.percent), clock.now());
      if (!d.write) return;
      writes = writes
        .then(async () => {
          if ((await store.progress(renderId, d.stage, d.progress)) === 'inactive') abort.abort();
        })
        .catch((e: unknown) =>
          log.error({ event: 'progress-failed', renderId, error: errorText(e) }),
        );
    };
    const t0 = clock.now();
    const result = await step('render-failed', 'rendering', async () => {
      try {
        return await deps.producer.render({
          compDir,
          outPath: videoComposite ? overlayOut : out,
          format: doc.format,
          resolution: doc.resolution,
          ...(videoComposite || transparentMode ? { container: 'webm' as const } : {}),
          signal,
          onProgress,
        });
      } catch (e) {
        if (e instanceof RenderTimeoutError) {
          throw new RenderStepError('timeout', 'the render took too long', e);
        }
        throw e;
      }
    });
    if (videoComposite && project.video && sourceVideoFile && ffmpeg.compositeVideo) {
      const dims = expectedSize(doc.format, doc.resolution);
      await step('render-failed', 'compositing video', () =>
        ffmpeg.compositeVideo!({
          sourceVideoPath: sourceVideoFile,
          overlayVideoPath: overlayOut,
          voiceWavPath: join(compDir, 'assets/voice.wav'),
          ...(bedSrc ? { bedWavPath: join(compDir, bedSrc) } : {}),
          outMp4Path: out,
          width: dims.width,
          height: dims.height,
          fps: 30,
          durationMs: project.durationMs,
          segments: keptSourceSegments(project.video!.originalDurationMs, project.video!.cuts),
          punchIns: project.video!.punchIns,
          ...(project.video!.stages?.length ? { stages: project.video!.stages } : {}),
          ...(Object.keys(downloadedClips).length ? { mediaClips: downloadedClips } : {}),
          bgColor: styleFor(project).colors.bg,
        }),
      );
      // Free large A-roll, overlay, and Media Bin files from Cloud Run's in-memory /tmp right away.
      await Promise.all([
        rm(sourceVideoFile, { force: true }).catch(() => undefined),
        rm(overlayOut, { force: true }).catch(() => undefined),
        ...Object.values(downloadedClips).map((c) => rm(c.path, { force: true }).catch(() => undefined)),
      ]);
    }
    // 4b'. Multi-lane Stock Media & Stock Audio export parity (spec 45 R5.3): runs across all
    // project modes (motion, video, reel) right before loudness normalization when clips exist.
    if (ffmpeg.compositeStockLayers && (doc.stockOverlayPaths || doc.stockAudioPaths)) {
      const dims = expectedSize(doc.format, doc.resolution);
      const ovRe = stockOverlayPathFor(doc.ownerId, doc.projectId);
      const auRe = stockAudioPathFor(doc.ownerId, doc.projectId);
      const downloadedByPath = new Map<string, string>();
      let dlIdx = 0;

      const downloadOnce = async (storagePath: string, prefix: string): Promise<string | null> => {
        const cached = downloadedByPath.get(storagePath);
        if (cached) return cached;
        const ext = storagePath.slice(storagePath.lastIndexOf('.'));
        const dest = join(deps.workDir, `${prefix}-${dlIdx++}${ext}`);
        try {
          await blobs.download(storagePath, dest);
          downloadedByPath.set(storagePath, dest);
          return dest;
        } catch (e) {
          log.error({ event: `${prefix}-missing`, renderId, error: errorText(e) });
          return null;
        }
      };

      try {
        const resolvedOverlays: ResolvedStockOverlay[] = [];
        if (doc.stockOverlayPaths) {
          for (const clip of visibleStockOverlays(project)) {
            if (clip.endMs <= clip.startMs || clip.startMs >= project.durationMs) continue;
            const storagePath = doc.stockOverlayPaths[clip.id];
            if (!storagePath || !ovRe.test(storagePath)) continue;
            const localPath = await downloadOnce(storagePath, 'stock-ov');
            if (!localPath) continue;
            resolvedOverlays.push({
              id: clip.id,
              path: localPath,
              isVideo: clip.kind === 'video' || clip.mimeType.startsWith('video/'),
              startMs: clip.startMs,
              endMs: clip.endMs,
              sourceOffsetMs: clip.sourceOffsetMs ?? 0,
              ...(clip.clipDurationMs !== undefined ? { clipDurationMs: clip.clipDurationMs } : {}),
              layout: clip.layout,
              track: clip.track ?? 0,
            });
          }
        }

        const audioHasStream = new Map<string, boolean>();
        const resolvedAudio: ResolvedStockAudio[] = [];
        if (doc.stockAudioPaths) {
          for (const clip of audibleStockAudio(project)) {
            if (clip.endMs <= clip.startMs || clip.startMs >= project.durationMs) continue;
            if (clip.volume <= 0) continue;
            const storagePath = doc.stockAudioPaths[clip.id];
            if (!storagePath || !auRe.test(storagePath)) continue;
            const localPath = await downloadOnce(storagePath, 'stock-au');
            if (!localPath) continue;
            if (!audioHasStream.has(localPath)) {
              const p = await ffmpeg.probe(localPath).catch(() => null);
              // Default true when fake/stubbed probe is unavailable; skip confirmed audio-less files.
              audioHasStream.set(localPath, p ? p.audioStreams > 0 : true);
            }
            if (!audioHasStream.get(localPath)) continue;
            resolvedAudio.push({
              id: clip.id,
              path: localPath,
              kind: clip.kind,
              startMs: clip.startMs,
              endMs: clip.endMs,
              sourceOffsetMs: clip.sourceOffsetMs ?? 0,
              volume: clip.volume,
              track: clip.track ?? 0,
            });
          }
        }

        if (resolvedOverlays.length > 0 || resolvedAudio.length > 0) {
          const baseProbe = await ffmpeg.probe(out).catch(() => null);
          const hasBaseAudio = baseProbe ? baseProbe.audioStreams > 0 : true;
          const stockOut = join(
            deps.workDir,
            transparentMode ? 'video-stock.webm' : 'video-stock.mp4',
          );
          await step('render-failed', 'compositing stock layers', async () => {
            try {
              await ffmpeg.compositeStockLayers!({
                baseVideoPath: out,
                outMp4Path: stockOut,
                ...(transparentMode ? { container: 'webm' as const } : {}),
                hasBaseAudio,
                width: dims.width,
                height: dims.height,
                fps: 30,
                durationMs: project.durationMs,
                overlays: resolvedOverlays,
                audioClips: resolvedAudio,
              });
              await rename(stockOut, out);
            } catch (e) {
              await rm(stockOut, { force: true }).catch(() => undefined);
              throw e;
            }
          });
        }
      } finally {
        await Promise.all(
          [...downloadedByPath.values()].map((p) => rm(p, { force: true }).catch(() => undefined)),
        );
      }
    }

    // 4c. Loudness (spec 27 R3.3): social platforms play at about −14 LUFS. Skip audio-less
    // graphics-only renders (unless stock audio was composited); a failure keeps the rendered mix.
    const hasStockAudio = Boolean(doc.stockAudioPaths && Object.keys(doc.stockAudioPaths).length > 0);
    if (ffmpeg.normalizeLoudness && !(project.reel?.graphicOnly && !hasStockAudio)) {
      const levelled = join(
        deps.workDir,
        transparentMode ? 'video-levelled.webm' : 'video-levelled.mp4',
      );
      try {
        await ffmpeg.normalizeLoudness({ src: out, dest: levelled, lufs: -14, truePeakDb: -1 });
        await rename(levelled, out);
      } catch (e) {
        await rm(levelled, { force: true }).catch(() => undefined);
        log.error({ event: 'loudness-failed', renderId, error: errorText(e) });
      }
    }
    producerMs = clock.now() - t0;
    const total = result.perf?.['totalElapsedMs'];
    if (typeof total === 'number') perfTotalMs = total;
    await writes;
    if (signal.aborted) throw new RenderAbortedError();

    // 5. Check the output against what we asked for (R3.6).
    await step('render-failed', 'checking the output', async () => {
      const probe = await ffmpeg.probe(out, { countFrames: true });
      const problems = outputIssues(probe, {
        format: doc.format,
        resolution: doc.resolution,
        durationMs: project.durationMs,
        ...(transparentMode ? { transparent: true } : {}),
      });
      if (problems.length > 0) {
        log.error({ event: 'output-check', renderId, problems });
        throw new RenderStepError('render-failed', 'the rendered file is not what was asked for');
      }
    });

    // 6. Thumbnail.
    const thumb = join(deps.workDir, 'thumb.jpg');
    await step('render-failed', 'the thumbnail', async () => {
      await ffmpeg.frame({
        video: out,
        atMs: thumbnailTimeMs(slots, project.durationMs),
        destJpg: thumb,
        longSide: THUMB_LONG_SIDE,
      });
      await stat(thumb);
    });

    // 7. Upload, then `done`.
    const size = await step(
      'upload-failed',
      'reading the file size',
      async () => (await stat(out)).size,
    );
    await step('upload-failed', 'uploading', async () => {
      if ((await store.progress(renderId, 'encoding', 96)) === 'inactive') abort.abort();
      if (signal.aborted) throw new RenderAbortedError();
      await blobs.upload(finalPaths.output, out, {
        contentType: renderMimeType(outContainer),
        contentDisposition: contentDisposition(doc.title, outContainer),
        cacheControl: 'private, max-age=0',
      });
      await blobs.upload(finalPaths.thumb, thumb, {
        contentType: 'image/jpeg',
        cacheControl: 'private, max-age=0',
      });
    });
    await step('internal', 'finishing', async () => {
      const done = await store.markDone(renderId, {
        outputPath: finalPaths.output,
        thumbPath: finalPaths.thumb,
        sizeBytes: size,
      });
      if (done === 'inactive') throw new RenderAbortedError();
    });
    sizeBytes = size;
  } catch (e) {
    failure = classify(e);
    log.error({ event: 'render-error', renderId, code: failure.code, error: errorText(e) });
    try {
      await store.fail(renderId, failure.code, failure.message);
    } catch (fe) {
      recordError = fe;
      log.error({ event: 'fail-not-recorded', renderId, error: errorText(fe) });
    }
  } finally {
    // 8. Cleanup, always: the heartbeat, the working folder (it holds the voice) and the snapshot.
    stopHeartbeat();
    await quietly(log, 'workdir', () => rm(deps.workDir, { recursive: true, force: true }));
    if (paths) {
      const p = paths;
      await quietly(log, 'input', () => blobs.deletePrefix(p.inputDir));
      if (failure) {
        await quietly(log, 'output', () => blobs.deletePrefix(p.output));
        await quietly(log, 'thumb', () => blobs.deletePrefix(p.thumb));
      }
    }
    // 9. One structured line per render. No transcript text, no URLs (R6.4, R9.3).
    log.info({
      event: 'render',
      renderId,
      outcome: failure ? 'error' : 'done',
      ...(failure ? { code: failure.code } : {}),
      wallMs: clock.now() - startedAt,
      ...(producerMs !== undefined ? { renderMs: producerMs } : {}),
      ...(perfTotalMs !== undefined ? { perfTotalMs } : {}),
      ...(sizeBytes !== undefined ? { sizeBytes } : {}),
      format: doc.format,
      resolution: doc.resolution,
    });
  }
  // The job exits non-zero only when it could not even record the failure (the sweep catches it).
  if (recordError !== undefined) throw recordError;
  return failure ? 'error' : 'done';
}

function expectedPaths(doc: RenderDoc, renderId: string): RenderPaths {
  try {
    return renderPaths(doc.ownerId, doc.projectId, renderId, renderContainerFor(doc));
  } catch {
    throw new RenderStepError('input-missing', 'the render ids are not valid');
  }
}

/**
 * Probes the owner's voice and re-encodes it to a WAV inside the composition (R3.9): the upload
 * is untrusted input for ffmpeg and Chrome, so only the re-encoded first audio stream goes on.
 */
async function prepareVoice(
  project: EditorProject,
  doc: RenderDoc,
  deps: RenderDeps,
  compDir: string,
): Promise<void> {
  const { blobs, ffmpeg } = deps;
  const source = join(deps.workDir, 'input', 'voice-source');
  await mkdir(join(deps.workDir, 'input'), { recursive: true });
  await blobs.download(doc.voicePath, source);
  const inputFormat = demuxerFor(doc.voicePath);
  const probe = await ffmpeg.probe(source, { inputFormat });
  if (probe.audioStreams !== 1) {
    throw new RenderStepError('input-missing', 'the voice must have exactly one audio stream');
  }
  const maxMs = Math.min(project.durationMs + VOICE_SLACK_MS, MAX_VOICE_MS);
  // The container may not know its length (a browser recording often doesn't), so the re-encode
  // is cut one second past the limit and the WAV, whose length is exact, is the real check.
  const wav = join(compDir, 'assets', 'voice.wav');
  await ffmpeg.toWav(source, wav, { maxMs: maxMs + 1000, inputFormat });
  const wavProbe = await ffmpeg.probe(wav);
  if (wavProbe.audioStreams !== 1 || wavProbe.durationMs <= 0) {
    throw new RenderStepError('input-missing', 'the voice could not be decoded');
  }
  if (wavProbe.durationMs > maxMs) {
    throw new RenderStepError('input-missing', 'the voice is much longer than the project');
  }
  await rm(source, { force: true });
}

/**
 * The ffmpeg demuxer for the voice's file extension (the path already matched `voicePathFor`).
 * Forcing it means a playlist or `concat` file renamed to `.wav` is read as a broken WAV, not
 * followed to other files.
 */
export function demuxerFor(voicePath: string): string {
  const ext = voicePath.slice(voicePath.lastIndexOf('.') + 1);
  const map: Record<string, string> = {
    wav: 'wav',
    mp3: 'mp3',
    m4a: 'mov',
    webm: 'matroska',
    ogg: 'ogg',
  };
  return map[ext] ?? 'wav';
}

function classify(e: unknown): { code: RenderErrorCode; message: string } {
  if (e instanceof RenderStepError) return { code: e.code, message: e.safeMessage };
  // Swept or failed elsewhere: the store ignores this for a final render.
  if (e instanceof RenderAbortedError)
    return { code: 'stalled', message: 'the render was stopped' };
  return { code: 'internal', message: 'something went wrong' };
}

const errorText = (e: unknown): string =>
  (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).slice(0, 500);

async function quietly(
  log: RenderDeps['log'],
  what: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  try {
    await fn();
  } catch (e) {
    log.error({ event: 'cleanup-failed', what, error: errorText(e) });
  }
}
