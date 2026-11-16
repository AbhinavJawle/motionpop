'use client';

import { FONT_CHOICES, type FontChoice } from '@motionpop/schemas';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { setFonts } from '@/lib/commands';
import { lookFor } from '@/lib/motion/registry';
import { useEditor } from '@/lib/stores/editor';

/** Sample files for the panel's previews (the composition embeds its own copies). */
const FILES: Partial<Record<FontChoice, string>> = {
  Fraunces: '/fonts/Fraunces-Variable.woff2',
  'Space Grotesk': '/fonts/SpaceGrotesk-Variable.woff2',
  'Bricolage Grotesque': '/fonts/BricolageGrotesque-Variable.woff2',
  'Playfair Display': '/fonts/PlayfairDisplay-Variable.woff2',
};
const ABOUT: Record<FontChoice, string> = {
  Geist: 'Clean and modern. The default.',
  Fraunces: 'A soft, warm serif with character.',
  'Space Grotesk': 'Techy and geometric.',
  'Bricolage Grotesque': 'Bold and expressive.',
  'Playfair Display': 'Classic, high-contrast editorial.',
};
const FACE_CSS = Object.entries(FILES)
  .map(
    ([family, src]) =>
      `@font-face{font-family:'${family}';src:url(${src}) format('woff2');font-weight:100 900;font-display:swap;}`,
  )
  .join('\n');
/** First family of a CSS stack, unquoted. */
const primaryFamily = (stack: string) =>
  (stack.split(',')[0] ?? '').trim().replace(/^['"]|['"]$/g, '');
const stack = (f: FontChoice) =>
  f === 'Geist' ? 'var(--font-geist-sans), Geist, sans-serif' : `'${f}', serif`;

/**
 * The Fonts panel: the headline type of every graphic (numbers, titles, quotes), over the look's
 * own. Open-licence families bundled with the app, so preview and export match exactly.
 */
export function FontsPanelBody() {
  const project = useEditor((s) => s.project);
  const exec = useEditor((s) => s.exec);
  if (!project) return null;
  const look = lookFor(project.styleId);
  const lookFamily = primaryFamily(look.fonts.display);
  const current = (project.fonts?.display ?? lookFamily) as FontChoice;

  return (
    <div className="flex h-full flex-col px-5 pt-4 pb-4">
      <style>{FACE_CSS}</style>
      <header className="flex h-10 shrink-0 items-center border-b border-white/6 pb-3">
        <h2 className="text-[17px] leading-[22px] font-semibold text-text">Fonts</h2>
      </header>
      <div className="-mx-1 min-h-0 flex-1 space-y-2 overflow-y-auto px-1 pt-4 pb-6">
        <p className="pb-2 text-[12px] leading-[17px] text-text-2">
          Headline type for every graphic: numbers, titles and quotes.
        </p>
        <div role="radiogroup" aria-label="Headline font" className="space-y-2">
          {FONT_CHOICES.map((f) => {
            const selected = current === f;
            return (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  if (selected) return;
                  exec(setFonts(f === lookFamily && !project.fonts?.body ? null : { display: f }));
                }}
                className={cn(
                  'flex w-full items-center justify-between rounded-card border bg-card px-3 py-3 text-left shadow-quiet transition-colors',
                  selected ? 'border-violet' : 'border-line hover:border-white/14',
                )}
              >
                <span>
                  <span
                    className="block text-[24px] leading-[28px] text-text"
                    style={{ fontFamily: stack(f), fontWeight: 700 }}
                  >
                    Revenue grew 40%
                  </span>
                  <span className="mt-1 block text-[11px] leading-[14px] text-text-3">
                    {f} · {ABOUT[f]}
                  </span>
                </span>
                {selected && (
                  <Check className="size-4 shrink-0 text-violet" strokeWidth={2} aria-hidden />
                )}
              </button>
            );
          })}
        </div>
        {project.fonts && (
          <Button variant="ghost" size="md" className="w-full" onClick={() => exec(setFonts(null))}>
            Go back to the look&apos;s fonts
          </Button>
        )}
        <p className="pt-2 text-[11px] leading-[14px] text-text-3">
          All fonts are open-licence (SIL OFL) and bundled, so the export matches the preview.
        </p>
      </div>
    </div>
  );
}
