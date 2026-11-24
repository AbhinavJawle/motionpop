'use client';

import type { StockAudioClip } from '@motionpop/schemas';
import { useEffect, useRef } from 'react';
import { appAudioStore } from '@/lib/audio/app-audio-store';
import type { PlaybackClock } from '@/lib/editor/playback';
import { editorStore, useEditor } from '@/lib/stores/editor';

let sharedCtx: AudioContext | null = null;
const bufferCache = new Map<string, AudioBuffer>();
const inflightDecode = new Map<string, Promise<AudioBuffer | null>>();

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!sharedCtx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    sharedCtx = new Ctor();
  }
  return sharedCtx;
}

async function decodeClipBuffer(src: string): Promise<AudioBuffer | null> {
  const cached = bufferCache.get(src);
  if (cached) return cached;
  const pending = inflightDecode.get(src);
  if (pending) return pending;

  const task = (async () => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return null;
      const blob = await appAudioStore().get(src);
      if (!blob) return null;
      const raw = await blob.arrayBuffer();
      const decoded = await ctx.decodeAudioData(raw.slice(0));
      bufferCache.set(src, decoded);
      return decoded;
    } catch {
      return null;
    } finally {
      inflightDecode.delete(src);
    }
  })();

  inflightDecode.set(src, task);
  return task;
}

let activeAudition: AudioBufferSourceNode | null = null;

/** Plays a single stock audio clip immediately (e.g. clicking play on the timeline or right after placing an SFX). */
export async function auditionStockAudio(src: string, volume = 0.9): Promise<void> {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    await ctx.resume().catch(() => undefined);
  }
  try {
    activeAudition?.stop();
  } catch {
    // Already stopped.
  }
  activeAudition = null;
  const buf = await decodeClipBuffer(src);
  if (!buf) return;
  const source = ctx.createBufferSource();
  source.buffer = buf;
  const gain = ctx.createGain();
  gain.gain.value = Math.max(0, Math.min(1.5, volume));
  source.connect(gain);
  gain.connect(ctx.destination);
  activeAudition = source;
  source.onended = () => {
    if (activeAudition === source) activeAudition = null;
  };
  source.start(0, 0, Math.min(buf.duration, 12));
}

/**
 * Sample-accurate Web Audio API playback engine for the `Stock Audio` timeline layer.
 * Works identically for BOTH talking-head Reel projects and Voiceover/Motion projects:
 * - Pre-decodes placed clips into cached AudioBuffers for 0 ms latency.
 * - Schedules every active & upcoming clip on the Web Audio hardware clock when playing.
 * - Re-syncs cleanly on seek/scrub, and stops immediately on pause or unmount.
 */
export function useStockAudio(clock: PlaybackClock): void {
  const clips = useEditor((s) => s.project?.stockAudio);
  const playing = useEditor((s) => s.playing);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const lastFrameRef = useRef<{ wall: number; ms: number } | null>(null);
  const scheduleEpochRef = useRef(0);

  const stopAll = () => {
    for (const s of sourcesRef.current) {
      try {
        s.stop();
        s.disconnect();
      } catch {
        // Ignore already stopped sources.
      }
    }
    sourcesRef.current = [];
  };

  // Unlock AudioContext on first user interaction so hitting Space/Play always has audio.
  useEffect(() => {
    const unlock = () => {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        void ctx.resume().catch(() => undefined);
      }
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // Pre-decode placed clips as soon as they appear on the timeline.
  useEffect(() => {
    if (!clips || clips.length === 0) return;
    for (const c of clips) {
      void decodeClipBuffer(c.src);
    }
  }, [clips]);

  // Schedule all placed stock audio clips from `fromMs`.
  const scheduleFrom = (fromMs: number, list: readonly StockAudioClip[] | undefined) => {
    stopAll();
    if (!list || list.length === 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const epoch = ++scheduleEpochRef.current;

    void (async () => {
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => undefined);
      }
      if (epoch !== scheduleEpochRef.current || !editorStore.getState().playing) return;

      const anchorWall = performance.now();
      const anchorCtx = ctx.currentTime;

      const decoded = await Promise.all(
        list.map(async (clip) => ({ clip, buffer: await decodeClipBuffer(clip.src) })),
      );
      if (epoch !== scheduleEpochRef.current || !editorStore.getState().playing) return;

      const elapsedSec = (performance.now() - anchorWall) / 1000;
      const nowMs = fromMs + elapsedSec * 1000;
      const baseCtxTime = anchorCtx + elapsedSec;

      for (const { clip, buffer } of decoded) {
        if (!buffer) continue;
        if (clip.endMs <= nowMs) continue;

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const clipLenSec = (clip.endMs - clip.startMs) / 1000;
        if (clip.kind === 'music' && clipLenSec > buffer.duration) {
          source.loop = true;
        }

        const gain = ctx.createGain();
        gain.gain.value = Math.max(0, Math.min(1.5, clip.volume));
        source.connect(gain);
        gain.connect(ctx.destination);

        if (clip.startMs <= nowMs) {
          const offsetSec = (nowMs - clip.startMs) / 1000;
          const remainingSec = Math.max(0.02, (clip.endMs - nowMs) / 1000);
          const safeOffset = source.loop ? offsetSec % Math.max(0.05, buffer.duration) : offsetSec;
          if (!source.loop && safeOffset >= buffer.duration) continue;
          const playDur = source.loop
            ? remainingSec
            : Math.min(remainingSec, buffer.duration - safeOffset);
          if (playDur <= 0.01) continue;
          source.start(baseCtxTime, safeOffset, playDur);
        } else {
          const delaySec = (clip.startMs - nowMs) / 1000;
          const playDur = source.loop ? clipLenSec : Math.min(clipLenSec, buffer.duration);
          if (playDur <= 0.01) continue;
          source.start(baseCtxTime + delaySec, 0, playDur);
        }

        sourcesRef.current.push(source);
      }
    })();
  };

  // Start/stop when `playing` or `clips` changes.
  useEffect(() => {
    const epochRef = scheduleEpochRef;
    if (!playing) {
      epochRef.current++;
      lastFrameRef.current = null;
      stopAll();
      return;
    }
    const startMs = clock.currentMs;
    lastFrameRef.current = { wall: performance.now(), ms: startMs };
    scheduleFrom(startMs, clips);
    return () => {
      epochRef.current++;
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scheduleFrom uses refs and stable helpers
  }, [playing, clips, clock]);

  // Re-schedule immediately if the user seeks/scrubs while playing.
  useEffect(() => {
    return clock.subscribe((ms) => {
      if (!editorStore.getState().playing) {
        lastFrameRef.current = null;
        return;
      }
      const now = performance.now();
      const prev = lastFrameRef.current;
      lastFrameRef.current = { wall: now, ms };
      if (!prev) return;
      const expected = prev.ms + (now - prev.wall);
      if (Math.abs(ms - expected) > 220) {
        scheduleFrom(ms, editorStore.getState().project?.stockAudio);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scheduleFrom uses refs and stable helpers
  }, [clock]);
}
