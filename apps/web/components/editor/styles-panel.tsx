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
    <div className="flex h-full flex-col px-5 pt-4 pb-4">
      <header className="flex h-10 shrink-0 items-center border-b border-white/6 pb-3">
        <h2 className="text-[17px] leading-[22px] font-semibold text-text">Styles</h2>
      </header>
      <p className="pt-3 text-[11px] leading-[14px] text-text-3">
        A look restyles every graphic: colours, type, textures and how things move.
      </p>
      <div
        role="radiogroup"
        aria-label="Look"
        className="-mx-1 min-h-0 flex-1 space-y-3 overflow-y-auto px-1 pt-3 pb-6"
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
              onClick={() => {
                if (!selected) exec(setStyle(o.id));
              }}
              className={cn(
                'block w-full overflow-hidden rounded-card border bg-card text-left shadow-quiet transition-colors',
                selected ? 'border-violet' : 'border-line hover:border-white/14',
              )}
            >
              {still ? (
                // eslint-disable-next-line @next/next/no-img-element -- small static stills
                <img src={still} alt="" className="block aspect-video w-full" loading="lazy" />
              ) : (
                <div
                  aria-hidden
                  className="flex aspect-video w-full items-center justify-center gap-1.5"
                  style={{ background: o.colors.bg }}
                >
                  {[o.colors.ink, o.colors.accent, o.colors.accent2, o.colors.highlight].map(
                    (c) => (
                      <span key={c} className="size-5 rounded-full" style={{ background: c }} />
                    ),
                  )}
                </div>
              )}
              <div className="flex items-start justify-between gap-2 px-3 py-2.5">
                <span>
                  <span className="block text-[13px] leading-[17px] font-medium text-text">
                    {o.name}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-[15px] text-text-3">
                    {o.description}
                  </span>
                </span>
                {selected && (
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-violet"
                    strokeWidth={2}
                    aria-hidden
                  />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
