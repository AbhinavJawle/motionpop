'use client';

import { decodeWav16 } from '@motionpop/motion/sfx';
import { audioOf, type EditorProject } from '@motionpop/schemas';
import { useEffect, useRef } from 'react';
import { appAudioStore } from '@/lib/audio/app-audio-store';
import type { PlaybackClock } from '@/lib/editor/playback';
import { useEditor } from '@/lib/stores/editor';
import { mixInWorker } from './bed-client';
import type { BedRequest } from './bed-messages';
import { useBedState } from './bed-state';

/** Re-mix this long after the last edit (spec 12 task B6). */
export const BED_DEBOUNCE_MS = 300;

/** The worker request for a project, or null when there is nothing to mix against yet. */
export function bedRequestFor(
  project: EditorProject,
  voiceLevelDb: number,
  ownMusicSamples?: Float32Array<ArrayBuffer>,
): Omit<BedRequest, 'type' | 'id'> {
  const audio = audioOf(project);
  const synth = audio.musicId === 'calm-pad' || audio.musicId === 'steady-pulse';
  const own = audio.musicId === 'own' && audio.musicSrc && ownMusicSamples;
  return {
    project: {
      durationMs: project.durationMs,
      slots: project.slots.map((s) => ({
        id: s.id,
        startMs: s.startMs,
        endMs: s.endMs,
        wordStart: s.wordStart,
        wordEnd: s.wordEnd,
        componentId: s.componentId,
        status: s.status,
        ...(s.energy ? { energy: s.energy } : {}),
        params: s.params,
      })),
      transcript: {
        words: project.transcript.words.map((w) => ({
          startMs: w.startMs,
          endMs: w.endMs,
          ...(w.filler ? { filler: true } : {}),
        })),
      },
      audio,
      ...(project.video?.stages?.length
        ? {
            video: {
              stages: project.video.stages.map((st) => ({
                id: st.id,
                startMs: st.startMs,
                endMs: st.endMs,
                mode: st.mode,
              })),
            },
          }
        : {}),
    },
    voiceSrc: project.voiceover.src,
    voiceLevelDb,
    music:
      synth && audio.musicId
        ? { id: audio.musicId }
        : own
          ? { id: 'own', src: audio.musicSrc, samples: ownMusicSamples }
          : null,
  };
}

/**
 * Keeps the open project's sound bed mixed and playing in sync with the editor's clock. The
 * mix runs in a worker, debounced; only the latest answer is used. Effects-only beds play from
 * the first edit. `musicSynthEnabled` only hides the music picker; a project that has synthesized
 * music plays it here exactly as the render job mixes it (services/render/src/bed.ts).
 *
 * Spec 39 R7.1: a reel project does nothing here. The reel preview builds and plays its own bed
 * (`reelBedSound`, reel-preview.tsx), so a second synth bed would double the music and effects.
 * Opening a reel after a voiceover project detaches and pauses the bed of the earlier one.
 */
export function useSoundBed(clock: PlaybackClock, voiceLevelDb: number | null): void {
  const project = useEditor((s) => s.project);
  const isReel = !!project?.reel;
  const elRef = useRef<HTMLAudioElement | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    if (isReel || typeof Audio === 'undefined') return;
    const el = new Audio();
    el.preload = 'auto';
    elRef.current = el;
    return () => {
      elRef.current = null;
      clock.attachFollower(null);
      el.pause();
      el.removeAttribute('src');
      const url = useBedState.getState().url;
      if (url) URL.revokeObjectURL(url);
      useBedState.setState({ status: 'idle', key: null, url: null, wav: null, placements: [] });
    };
  }, [clock, isReel]);

  useEffect(() => {
    useBedState.setState({ voiceLevelDb });
  }, [voiceLevelDb]);

  useEffect(() => {
    if (!project || project.reel || voiceLevelDb === null) return;
    const n = ++latest.current;
    const timer = setTimeout(() => {
      useBedState.setState({ status: 'mixing' });
      void (async () => {
        let ownSamples: Float32Array<ArrayBuffer> | undefined;
        const audio = audioOf(project);
        if (audio.musicId === 'own' && audio.musicSrc) {
          try {
            const blob = await appAudioStore().get(audio.musicSrc);
            if (blob) {
              const pcm = decodeWav16(new Uint8Array(await blob.arrayBuffer()));
              if (pcm) ownSamples = new Float32Array(pcm.samples);
            }
          } catch {
            // Fall through without custom samples if storage read fails.
          }
        }
        const req = bedRequestFor(project, voiceLevelDb, ownSamples);
        const res = await mixInWorker(req);
        const el = elRef.current;
        if (n !== latest.current || !el) return;
        const prev = useBedState.getState().url;
        if (res.type === 'bed') {
          if (res.key === useBedState.getState().key) {
            useBedState.setState({ status: 'ready', placements: res.placements });
            return;
          }
          const bytes = res.wav.slice();
          const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
          el.src = url;
          el.addEventListener('canplay', () => clock.attachFollower(el), { once: true });
          useBedState.setState({
            status: 'ready',
            key: res.key,
            url,
            wav: bytes,
            placements: res.placements,
          });
        } else {
          clock.attachFollower(null);
          el.removeAttribute('src');
          useBedState.setState({
            status: res.type === 'none' ? 'none' : 'error',
            key: null,
            url: null,
            wav: null,
            placements: [],
          });
        }
        if (prev && prev !== useBedState.getState().url) URL.revokeObjectURL(prev);
      })();
    }, BED_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [project, voiceLevelDb, clock]);
}
