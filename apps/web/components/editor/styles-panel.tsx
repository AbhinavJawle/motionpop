'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { setStyle } from '@/lib/commands';
import { styleOptions } from '@/lib/inspector/timing-view';
import { LOOK_STILLS } from '@/lib/editor/look-stills';
import { useEditor } from '@/lib/stores/editor';

const STILLS = LOOK_STILLS;

/**
 * The Styles rail panel: every look a creator can pick, with a still, its name and what it feels
 * like. Picking one restyles the whole video in one command (one undo), like the inspector's
 * Style row.
 */
export function StylesPanelBody() {
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
