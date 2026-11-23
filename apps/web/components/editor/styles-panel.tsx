'use client';

import { builtInSkills, type RecipeStyle } from '@motionpop/ai';
import type { ReelCaptionStyle, ReelLook } from '@motionpop/schemas';
import { Check } from 'lucide-react';
import { CaptionArt, StyleArt } from '@/components/configure/art';
import { cn } from '@/lib/cn';
import { setReelCaptionStyle, setReelStyle, setStyle } from '@/lib/commands';
import { styleOptions } from '@/lib/inspector/timing-view';
import { LOOK_STILLS } from '@/lib/editor/look-stills';
import { useEditor } from '@/lib/stores/editor';

const STILLS = LOOK_STILLS;

/**
 * The Styles rail panel. A reel project (spec 39 R5.6) gets the recipe styles and caption styles;
 * every other project gets the voiceover looks.
 */
export function StylesPanelBody() {
  const isReel = useEditor((s) => Boolean(s.project?.reel));
  return isReel ? <ReelStylesBody /> : <LooksBody />;
}

const CAPTION_STYLES: readonly { value: ReelCaptionStyle; label: string }[] = [
  { value: 'seam', label: 'Seam label' },
  { value: 'pop', label: 'Bold pop' },
  { value: 'editorial', label: 'Editorial' },
  { value: 'boxed', label: 'Highlight box' },
  { value: 'clean', label: 'Clean minimal' },
];

/** The caption style a reel without an explicit one shows: its look's own. */
function ownCaptionStyle(look: ReelLook): ReelCaptionStyle {
  return look === 'cream' ? 'pop' : 'seam';
}

const cardClass = (selected: boolean) =>
  cn(
    'group relative block w-full overflow-hidden rounded-[10px] bg-card text-left transition-shadow',
    selected
      ? 'shadow-[inset_0_0_0_2px_var(--color-edge),3px_3px_0_var(--color-hard)]'
      : 'shadow-quiet hover:shadow-[inset_0_0_0_1px_rgb(0_0_0/0.3)]',
  );

function ReelStylesBody() {
  const reel = useEditor((s) => s.project?.reel);
  const styleId = useEditor((s) => s.project?.edit?.styleId);
  const exec = useEditor((s) => s.exec);
  if (!reel) return null;
  const captionStyle = reel.captionStyle ?? ownCaptionStyle(reel.look);
  const pick = (st: RecipeStyle) => {
    if (st.id === styleId) return;
    exec(
      setReelStyle({
        look: st.look,
        theme: st.theme,
        captionStyle: st.captionStyle,
        styleId: st.id,
      }),
    );
  };
  return (
    <div className="flex h-full flex-col px-4 pb-4">
      <header className="-mx-4 flex h-12 shrink-0 items-center border-b border-line px-4">
        <h2 className="text-[14px] leading-5 font-semibold text-text">Styles</h2>
      </header>
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pt-3 pb-6">
        <p className="text-[12px] leading-[17px] text-text-3">
          A style sets the reel’s look, colours and captions. Pick one to restyle the whole reel.
        </p>
        {builtInSkills.recipes().map((recipe) => (
          <section key={recipe.id} aria-label={recipe.name} className="pt-4">
            <h3 className="pb-2 text-[11px] leading-4 font-semibold tracking-[0.04em] text-text-3 uppercase">
              {recipe.name}
            </h3>
            <div
              role="radiogroup"
              aria-label={`${recipe.name} styles`}
              className="grid grid-cols-2 gap-2.5"
            >
              {recipe.styles.map((st) => {
                const selected = st.id === styleId;
                return (
                  <button
                    key={st.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => pick(st)}
                    className={cardClass(selected)}
                  >
                    <div className="h-[92px] w-full" aria-hidden>
                      <StyleArt style={st} />
                    </div>
                    <span className="flex items-center gap-1.5 px-2.5 py-2">
                      <span className="min-w-0 flex-1 truncate text-[12px] leading-4 font-medium text-text">
                        {st.name}
                      </span>
                      {selected && (
                        <Check
                          className="size-3.5 shrink-0 text-ink"
                          strokeWidth={2.5}
                          aria-hidden
                        />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
        <section aria-label="Captions" className="pt-5">
          <h3 className="pb-2 text-[11px] leading-4 font-semibold tracking-[0.04em] text-text-3 uppercase">
            Captions
          </h3>
          <div role="radiogroup" aria-label="Caption style" className="grid grid-cols-2 gap-2.5">
            {CAPTION_STYLES.map((c) => {
              const selected = c.value === captionStyle;
              return (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    if (!selected) exec(setReelCaptionStyle(c.value));
                  }}
                  className={cardClass(selected)}
                >
                  <div className="h-[56px] w-full" aria-hidden>
                    <CaptionArt style={c.value} label="to get started" />
                  </div>
                  <span className="flex items-center gap-1.5 px-2.5 py-2">
                    <span className="min-w-0 flex-1 truncate text-[12px] leading-4 font-medium text-text">
                      {c.label}
                    </span>
                    {selected && (
                      <Check className="size-3.5 shrink-0 text-ink" strokeWidth={2.5} aria-hidden />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * Every look a creator can pick, with a still, its name and what it feels like. Picking one
 * restyles the whole video in one command (one undo), like the inspector's Style row.
 */
function LooksBody() {
  const styleId = useEditor((s) => s.project?.styleId ?? '');
  const exec = useEditor((s) => s.exec);
  const options = styleOptions();
  return (
    <div className="flex h-full flex-col px-4 pb-4">
      <header className="-mx-4 flex h-12 shrink-0 items-center border-b border-line px-4">
        <h2 className="text-[14px] leading-5 font-semibold text-text">Styles</h2>
      </header>
      <p className="pt-3 text-[12px] leading-[17px] text-text-3">
        A look restyles every graphic: colours, type, textures and how things move.
      </p>
      <div
        role="radiogroup"
        aria-label="Look"
        className="-mx-1 grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-2.5 overflow-y-auto px-1 pt-3 pb-6"
      >
        {options.map((o) => {
          const selected = o.id === styleId;
          const still = STILLS[o.id];
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={selected}
              title={o.description}
              onClick={() => {
                if (!selected) exec(setStyle(o.id));
              }}
              className={cn(
                'group relative block w-full overflow-hidden rounded-[10px] bg-card text-left transition-shadow',
                selected
                  ? 'shadow-[inset_0_0_0_2px_var(--color-edge),3px_3px_0_var(--color-hard)]'
                  : 'shadow-quiet hover:shadow-[inset_0_0_0_1px_rgb(0_0_0/0.3)]',
              )}
            >
              {still ? (
                // eslint-disable-next-line @next/next/no-img-element -- small static stills
                <img src={still} alt="" className="block aspect-video w-full" loading="lazy" />
              ) : (
                // A small sample in the look's own colours (spec 33).
                <div
                  aria-hidden
                  className="relative flex aspect-video w-full flex-col items-center justify-center gap-1"
                  style={{ background: o.colors.bg }}
                >
                  <span
                    className="text-[26px] leading-none font-extrabold tracking-[-0.03em]"
                    style={{ color: o.colors.ink }}
                  >
                    40<span style={{ color: o.colors.accent }}>%</span>
                  </span>
                  <span
                    className="h-1 w-10 rounded-full"
                    style={{ background: o.colors.accent2 ?? o.colors.accent }}
                  />
                </div>
              )}
              <span className="flex items-center gap-1.5 px-2.5 py-2">
                <span className="min-w-0 flex-1 truncate text-[12px] leading-4 font-medium text-text">
                  {o.name}
                </span>
                {selected && (
                  <Check className="size-3.5 shrink-0 text-ink" strokeWidth={2.5} aria-hidden />
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
