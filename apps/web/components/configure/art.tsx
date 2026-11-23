'use client';

import type { BuiltInRecipeId, RecipeStyle } from '@motionpop/ai';
import type { MusicMood, ReelCaptionStyle, ReelHookStyle } from '@motionpop/schemas';
import {
  ChartNoAxesCombined,
  Code2,
  Flame,
  Gamepad2,
  Mic,
  PenLine,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Illustrated CSS thumbnails for the configure screen's option cards (spec 39 design §7). Pure
 * drawings, no photos: each card says what the choice does at a glance.
 */

const RECIPE_ICON: Record<BuiltInRecipeId | 'custom', LucideIcon> = {
  'tech-explainer': Code2,
  'finance-business': ChartNoAxesCombined,
  gaming: Gamepad2,
  'podcast-story': Mic,
  'hot-take': Flame,
  custom: PenLine,
};

const RECIPE_TINT: Record<BuiltInRecipeId | 'custom', string> = {
  'tech-explainer': '#8dbceb',
  'finance-business': '#a7f3d0',
  gaming: '#f0abfc',
  'podcast-story': '#fde68a',
  'hot-take': '#ff8a5c',
  custom: '#ffffff',
};

/** A recipe: its icon on a tinted tile with a strip of its first style's colours. */
export function RecipeArt({
  recipe,
  swatch,
}: {
  recipe: BuiltInRecipeId | 'custom';
  swatch?: readonly [string, string, string];
}) {
  const Icon = RECIPE_ICON[recipe];
  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
      style={{ background: RECIPE_TINT[recipe] }}
    >
      {recipe === 'custom' && (
        <div
          aria-hidden
          className="absolute inset-2 rounded-[6px] border-2 border-dashed border-black/35"
        />
      )}
      <span className="relative grid size-11 place-items-center rounded-full border-2 border-black bg-paper shadow-[2px_2px_0_#000]">
        <Icon className="size-5" strokeWidth={2} aria-hidden />
      </span>
      {swatch && (
        <div aria-hidden className="absolute right-0 bottom-0 left-0 flex h-[7px]">
          {swatch.map((c, i) => (
            <span key={i} className="flex-1" style={{ background: c }} />
          ))}
        </div>
      )}
    </div>
  );
}

/** A tiny 9:16 frame: a graphic panel over the speaker, in the style's colours. */
export function StyleArt({ style }: { style: Pick<RecipeStyle, 'swatch' | 'look' | 'theme'> }) {
  const [ground, ink, accent] = style.swatch;
  const bold = style.theme?.background === 'bold';
  const second = style.theme?.accent2;
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#e9edf3]">
      <div className="relative h-[92%] aspect-[9/16] overflow-hidden rounded-[4px] border-[1.5px] border-black bg-[#2a2a2e]">
        <div
          className="absolute inset-x-0 top-0 h-1/2"
          style={{
            background: bold
              ? `linear-gradient(140deg, ${ground} 30%, ${accent}55 75%, ${second ?? accent}66)`
              : ground,
          }}
        >
          <span
            className={cn(
              'absolute top-[30%] left-[16%] h-[9%] w-[68%] rounded-[1px]',
              style.look === 'cream' && 'rounded-full',
            )}
            style={{ background: ink }}
          />
          <span
            className="absolute top-[48%] left-[28%] h-[7%] w-[44%] rounded-[1px]"
            style={{ background: accent }}
          />
        </div>
        {/* the speaker */}
        <span className="absolute bottom-[18%] left-1/2 size-[24%] -translate-x-1/2 rounded-full bg-[#9a9aa2]" />
        <span className="absolute -bottom-[6%] left-1/2 h-[22%] w-[62%] -translate-x-1/2 rounded-t-full bg-[#9a9aa2]" />
      </div>
    </div>
  );
}

/** A voiceover look: its real still (from the editor preview). */
export function LookArt({ src }: { src: string | undefined }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- small static still
    <img src={src} alt="" className="h-full w-full object-cover" />
  ) : (
    <div className="h-full w-full bg-mist" />
  );
}

/** How the first second opens. */
export function HookArt({ hook }: { hook: ReelHookStyle }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#e9edf3]">
      <div className="relative h-[92%] aspect-[9/16] overflow-hidden rounded-[4px] border-[1.5px] border-black bg-paper">
        {hook === 'headline' && (
          <>
            <span className="absolute top-[24%] left-[12%] h-[11%] w-[76%] bg-black" />
            <span className="absolute top-[38%] left-[22%] h-[11%] w-[56%] bg-black" />
            <span className="absolute top-[56%] left-[30%] h-[5%] w-[40%] bg-black/30" />
          </>
        )}
        {hook === 'stat' && (
          <span className="font-poster absolute inset-x-0 top-[22%] text-center text-[30px] leading-none">
            40%
          </span>
        )}
        {hook === 'visual' && (
          <div className="absolute inset-[10%] top-[14%] bottom-[34%] overflow-hidden rounded-[3px] bg-[#8dbceb]">
            <span className="absolute top-[18%] right-[18%] size-[22%] rounded-full bg-[#fde68a]" />
            <span className="absolute -bottom-[30%] -left-[10%] h-[80%] w-[70%] rotate-45 bg-[#3f7c5a]" />
            <span className="absolute -right-[20%] -bottom-[40%] h-[80%] w-[70%] rotate-45 bg-[#2f5d44]" />
          </div>
        )}
        {hook === 'cold-open' ? (
          <>
            <div className="absolute inset-0 bg-[#2a2a2e]" />
            <span className="absolute top-[30%] left-1/2 size-[34%] -translate-x-1/2 rounded-full bg-[#9a9aa2]" />
            <span className="absolute -bottom-[4%] left-1/2 h-[34%] w-[80%] -translate-x-1/2 rounded-t-full bg-[#9a9aa2]" />
          </>
        ) : (
          <div className="absolute inset-x-0 bottom-0 h-[30%] bg-[#2a2a2e]">
            <span className="absolute top-[18%] left-1/2 size-[34%] -translate-x-1/2 rounded-full bg-[#9a9aa2]" />
          </div>
        )}
      </div>
    </div>
  );
}

/** The caption, drawn in its style over a dark speaker frame. */
export function CaptionArt({ style, label }: { style: ReelCaptionStyle; label: string }) {
  const text = style === 'seam' || style === 'boxed' ? label.toUpperCase() : label.toLowerCase();
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#34343a] px-2">
      {style === 'seam' && (
        <span className="bg-black px-1.5 py-[1px] text-[11px] font-bold tracking-[0.02em] text-[#fff]">
          {text}
        </span>
      )}
      {style === 'pop' && (
        <span className="text-[20px] leading-none font-bold tracking-[-0.05em] text-[#fff] [text-shadow:0_2px_8px_rgba(0,0,0,.5)]">
          {text}
        </span>
      )}
      {style === 'editorial' && (
        <span className="border-b-2 border-[#fff] bg-black/55 px-1.5 pb-[2px] font-serif text-[16px] italic text-[#fff]">
          {label}
        </span>
      )}
      {style === 'boxed' && (
        <span className="rounded-[4px] bg-flame px-2 py-[2px] text-[13px] font-extrabold text-black">
          {text}
        </span>
      )}
      {style === 'clean' && (
        <span className="rounded-full bg-black/60 px-2.5 py-[2px] text-[12px] font-semibold text-[#fff]">
          {label}
        </span>
      )}
    </div>
  );
}

const MOOD_TINT: Record<MusicMood, string> = {
  auto: '#8b7cff',
  'minimal-tech': '#22d3ee',
  upbeat: '#ff8a5c',
  lofi: '#fbbf24',
  dramatic: '#64748b',
  none: '#d4d4d8',
};

/** A little waveform in the mood's colour, shaped by its energy. */
export function MoodArt({ mood }: { mood: MusicMood }) {
  const energy =
    { auto: 0.7, 'minimal-tech': 0.6, upbeat: 0.95, lofi: 0.45, dramatic: 0.8, none: 0 }[mood] ??
    0.6;
  return (
    <div className="flex h-full w-full items-center justify-center gap-[3px] bg-[#f4f6fa]">
      {mood === 'none' ? (
        <span className="h-[2px] w-3/4 bg-black/25" />
      ) : (
        Array.from({ length: 16 }, (_, i) => {
          const v = Math.abs(Math.sin(i * 1.3 + energy * 4) * 0.6 + Math.sin(i * 0.5) * 0.4);
          return (
            <span
              key={i}
              className="w-[4px] rounded-full"
              style={{
                height: `${Math.round(10 + v * energy * 44)}px`,
                background: MOOD_TINT[mood],
                outline: '1px solid rgba(0,0,0,.25)',
              }}
            />
          );
        })
      )}
    </div>
  );
}
