'use client';

import { audioOf, type AudioSetting, type MusicId } from '@motionpop/schemas';
import { Check, Shuffle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Toggle } from '@/components/ui/toggle';
import { cn } from '@/lib/cn';
import { setAudio } from '@/lib/commands';
import { useAppConfig } from '@/lib/renders/hooks';
import { useBedState } from '@/lib/sound/bed-state';
import { useEditor } from '@/lib/stores/editor';

const MUSIC: { id: MusicId | null; label: string; hint: string; synth?: boolean }[] = [
  { id: null, label: 'No music', hint: 'Just your voice and the effects.' },
  { id: 'calm-pad', label: 'Calm pad', hint: 'Slow, warm chords at 72 BPM.', synth: true },
  { id: 'steady-pulse', label: 'Steady pulse', hint: 'A soft beat at 96 BPM.', synth: true },
];

/** A slider that previews locally and commits one command when the hand stops (one undo). */
function useCommitted(value: number, commit: (v: number) => void) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Follow outside changes (undo, another tab) without an effect: compare during render.
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setLocal(value);
  }
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const onChange = (v: number) => {
    setLocal(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(v), 350);
  };
  return [local, onChange] as const;
}

const db = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} dB`;

function SectionLabel({ children }: { children: string }) {
  return (
    <h3 className="mb-2 text-[11px] leading-[14px] font-semibold tracking-[0.08em] text-text-3 uppercase">
      {children}
    </h3>
  );
}

/**
 * The Audio panel (spec 12 §8): music, its level and ducking, and the automatic effects. Every
 * sound is synthesized in code; the bed re-mixes in a worker after each change.
 */
export function AudioPanelBody() {
  const project = useEditor((s) => s.project);
  const exec = useEditor((s) => s.exec);
  const { musicSynthEnabled } = useAppConfig();
  const placed = useBedState((s) => s.placements.length);
  const status = useBedState((s) => s.status);
  const audio = project ? audioOf(project) : null;
  const apply = (patch: Partial<AudioSetting>) => exec(setAudio(patch));
  const [musicGain, onMusicGain] = useCommitted(audio?.musicGainDb ?? -18, (v) =>
    apply({ musicGainDb: v }),
  );
  const [sfxGain, onSfxGain] = useCommitted(audio?.sfxGainDb ?? 0, (v) => apply({ sfxGainDb: v }));
  if (!project || !audio) return null;

  const rows = MUSIC.filter((m) => !m.synth || musicSynthEnabled);
  const current = audio.musicId ?? null;

  return (
    <div className="flex h-full flex-col px-5 pt-4 pb-4">
      <header className="flex h-10 shrink-0 items-center border-b border-white/6 pb-3">
        <h2 className="text-[17px] leading-[22px] font-semibold text-text">Audio</h2>
      </header>

      <div className="-mx-1 min-h-0 flex-1 space-y-6 overflow-y-auto px-1 pt-4 pb-6">
        <section>
          <SectionLabel>Music</SectionLabel>
          <div role="radiogroup" aria-label="Music" className="space-y-2">
            {rows.map((m) => {
              const selected = current === m.id;
              return (
                <button
                  key={m.id ?? 'none'}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    if (selected) return;
                    const patch: Partial<AudioSetting> = { musicId: m.id ?? undefined };
                    apply(patch);
                  }}
                  className={cn(
                    'flex h-14 w-full items-center justify-between rounded-card border bg-card px-3 text-left shadow-quiet transition-colors',
                    selected ? 'border-violet' : 'border-line hover:border-white/14',
                  )}
                >
                  <span>
                    <span className="block text-[13px] leading-[17px] font-medium text-text">
                      {m.label}
                    </span>
                    <span className="block text-[11px] leading-[14px] text-text-3">{m.hint}</span>
                  </span>
                  {selected && <Check className="size-4 text-violet" strokeWidth={2} aria-hidden />}
                </button>
              );
            })}
          </div>
          {!musicSynthEnabled && (
            <p className="mt-2 text-[11px] leading-[14px] text-text-3">
              Music beds are being tuned. Effects are on.
            </p>
          )}

          {current && (
            <div className="mt-4 space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between text-[12px] leading-[16px] text-text-2">
                  <span>Music level</span>
                  <span className="font-mono tabular">{db(musicGain)}</span>
                </div>
                <Slider
                  label="Music level"
                  min={-40}
                  max={0}
                  value={musicGain}
                  onChange={onMusicGain}
                  format={db}
                />
              </div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[13px] leading-[17px] text-text">Duck under my voice</p>
                  <p className="text-[11px] leading-[14px] text-text-3">
                    Music dips while you talk.
                  </p>
                </div>
                <Toggle
                  label="Duck under my voice"
                  checked={audio.ducking}
                  onCheckedChange={(ducking) => apply({ ducking })}
                />
              </div>
            </div>
          )}
        </section>

        <section>
          <SectionLabel>Sound effects</SectionLabel>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[13px] leading-[17px] text-text">Pops and whooshes</p>
              <p className="text-[11px] leading-[14px] text-text-3">
                On your graphics&apos; entrances and landings.
              </p>
            </div>
            <Toggle
              label="Pops and whooshes"
              checked={audio.autoSfx}
              onCheckedChange={(autoSfx) => apply({ autoSfx })}
            />
          </div>
          {audio.autoSfx && (
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[12px] leading-[16px] text-text-2">
                  <span className="font-mono tabular">{status === 'mixing' ? '…' : placed}</span>{' '}
                  {placed === 1 ? 'sound' : 'sounds'} placed
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => apply({ sfxSeed: audio.sfxSeed + 1 })}
                >
                  <Shuffle className="size-3.5" strokeWidth={1.5} aria-hidden />
                  Shuffle takes
                </Button>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-[12px] leading-[16px] text-text-2">
                  <span>Effects level</span>
                  <span className="font-mono tabular">{db(sfxGain)}</span>
                </div>
                <Slider
                  label="Effects level"
                  min={-24}
                  max={6}
                  value={sfxGain}
                  onChange={onSfxGain}
                  format={db}
                />
              </div>
            </div>
          )}
        </section>

        <p className="text-[11px] leading-[14px] text-text-3">
          Every sound here is made in code. No stock libraries.
        </p>
      </div>
    </div>
  );
}
