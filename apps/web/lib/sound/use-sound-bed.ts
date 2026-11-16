'use client';

import { audioOf, type EditorProject } from '@motionpop/schemas';
import { useEffect, useRef } from 'react';
import type { PlaybackClock } from '@/lib/editor/playback';
import { useAppConfig } from '@/lib/renders/hooks';
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
  musicSynthEnabled: boolean,
): Omit<BedRequest, 'type' | 'id'> {
  const audio = audioOf(project);
  const synth = audio.musicId === 'calm-pad' || audio.musicId === 'steady-pulse';
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
    },
    voiceSrc: project.voiceover.src,
    voiceLevelDb,
    music: synth && musicSynthEnabled && audio.musicId ? { id: audio.musicId } : null,
  };
}

/**
 * Keeps the open project's sound bed mixed and playing in sync with the editor's clock. The
 * mix runs in a worker, debounced; only the latest answer is used. Effects-only beds play from
 * the first edit; synthesized music waits for `musicSynthEnabled` (the founder's listening check).
 */
export function useSoundBed(clock: PlaybackClock, voiceLevelDb: number | null): void {
  const project = useEditor((s) => s.project);
  const { musicSynthEnabled } = useAppConfig();
  const elRef = useRef<HTMLAudioElement | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    if (typeof Audio === 'undefined') return;
    const el = new Audio();
    el.preload = 'auto';
    elRef.current = el;
    return () => {
      elRef.current = null;
      clock.attachFollower(null);
      el.removeAttribute('src');
      const url = useBedState.getState().url;
      if (url) URL.revokeObjectURL(url);
      useBedState.setState({ status: 'idle', key: null, url: null, wav: null, placements: [] });
    };
  }, [clock]);

  useEffect(() => {
    useBedState.setState({ voiceLevelDb });
  }, [voiceLevelDb]);

  useEffect(() => {
    if (!project || voiceLevelDb === null) return;
    const req = bedRequestFor(project, voiceLevelDb, musicSynthEnabled);
    const n = ++latest.current;
    const timer = setTimeout(() => {
      useBedState.setState({ status: 'mixing' });
      void mixInWorker(req).then((res) => {
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
      });
    }, BED_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [project, voiceLevelDb, musicSynthEnabled, clock]);
}
