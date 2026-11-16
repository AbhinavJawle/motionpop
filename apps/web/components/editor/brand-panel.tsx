'use client';

import { brandColourIssue, type Brand } from '@motionpop/schemas';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { saveBrand, sameBrand, useSavedBrand } from '@/lib/brand/saved-brand';
import { setBrand } from '@/lib/commands';
import { lookFor } from '@/lib/motion/registry';
import { useEditor } from '@/lib/stores/editor';

const HEX = /^#[0-9a-fA-F]{6}$/;

function ColourField({
  label,
  hint,
  value,
  onChange,
  issue,
  optional,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  issue: string | null;
  optional?: boolean;
}) {
  const id = useId();
  const err = useId();
  const valid = HEX.test(value);
  return (
    <div>
      <label htmlFor={id} className="block text-[13px] leading-[17px] text-text">
        {label}
        {optional && <span className="text-text-3"> · optional</span>}
      </label>
      <p className="text-[11px] leading-[14px] text-text-3">{hint}</p>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={valid ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="size-9 shrink-0 cursor-pointer rounded-chip border border-line bg-card-2 p-1"
        />
        <input
          id={id}
          value={value}
          spellCheck={false}
          placeholder={optional ? 'None' : '#RRGGBB'}
          onChange={(e) => onChange(e.target.value.trim())}
          aria-invalid={!!issue || (value !== '' && !valid)}
          aria-describedby={issue ? err : undefined}
          className="h-9 w-full rounded-chip bg-card-2 px-3 font-mono text-[12px] text-text uppercase shadow-glass outline-none placeholder:text-text-3 placeholder:normal-case focus:shadow-violet-glow"
        />
      </div>
      {(issue || (value !== '' && !valid)) && (
        <p id={err} className="mt-1.5 text-[11px] leading-[14px] text-warn">
          {issue ?? 'Use a hex colour like #1E5AA8.'}
        </p>
      )}
    </div>
  );
}

/**
 * The Brand panel (Brand rail item and the top bar's Brand kit chip): brand colours replace the
 * look's accents in every graphic, the captions and the export. Applying is one command; "Save as
 * my brand" remembers the kit in this browser for other projects and Pip's brand chip.
 */
export function BrandPanelBody() {
  const project = useEditor((s) => s.project);
  const exec = useEditor((s) => s.exec);
  const saved = useSavedBrand((s) => s.brand);
  const look = project ? lookFor(project.styleId) : null;
  const start = project?.brand ?? saved;
  const [accent, setAccent] = useState(start?.accent ?? look?.colors.accent ?? '#FF7A3D');
  const [accent2, setAccent2] = useState(start?.accent2 ?? '');
  if (!project || !look) return null;

  const bg = look.colors.bg;
  const accentIssue = HEX.test(accent) ? brandColourIssue(accent, bg) : null;
  const accent2Issue = HEX.test(accent2) ? brandColourIssue(accent2, bg) : null;
  const valid =
    HEX.test(accent) && !accentIssue && (accent2 === '' || (HEX.test(accent2) && !accent2Issue));
  const draft: Brand | null = valid
    ? { accent: accent.toUpperCase(), ...(accent2 ? { accent2: accent2.toUpperCase() } : {}) }
    : null;
  const applied = sameBrand(project.brand, draft);
  const isSaved = sameBrand(saved, draft);

  return (
    <div className="flex h-full flex-col px-5 pt-4 pb-4">
      <header className="flex h-10 shrink-0 items-center border-b border-white/6 pb-3">
        <h2 className="text-[17px] leading-[22px] font-semibold text-text">Brand</h2>
      </header>
      <div className="-mx-1 min-h-0 flex-1 space-y-5 overflow-y-auto px-1 pt-4 pb-6">
        <p className="text-[12px] leading-[17px] text-text-2">
          Your colours replace the look&apos;s accents in every graphic, the captions and the
          export.
        </p>

        <div
          aria-hidden
          className="flex h-16 items-center justify-center gap-3 rounded-card border border-line"
          style={{ background: bg }}
        >
          <span className="text-[22px] font-bold" style={{ color: look.colors.ink }}>
            40
            <span style={{ color: HEX.test(accent) && !accentIssue ? accent : look.colors.accent }}>
              %
            </span>
          </span>
          <span
            className="h-2 w-16 rounded-full"
            style={{
              background: HEX.test(accent2) && !accent2Issue ? accent2 : look.colors.accent2,
            }}
          />
        </div>

        <ColourField
          label="Main colour"
          hint="Numbers, bars, highlights and the caption pill."
          value={accent}
          onChange={setAccent}
          issue={accentIssue}
        />
        <ColourField
          label="Second colour"
          hint="Comparisons and the second series in charts."
          value={accent2}
          onChange={setAccent2}
          issue={accent2Issue}
          optional
        />

        <div className="space-y-2 pt-1">
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            disabled={!draft || applied}
            onClick={() => draft && exec(setBrand(draft))}
          >
            {applied ? 'On this video' : 'Use on this video'}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            disabled={!draft || isSaved}
            onClick={() => draft && saveBrand(draft)}
          >
            {isSaved ? 'Saved as my brand' : 'Save as my brand'}
          </Button>
          {project.brand && (
            <Button
              variant="ghost"
              size="md"
              className="w-full"
              onClick={() => exec(setBrand(null))}
            >
              Go back to the look&apos;s colours
            </Button>
          )}
        </div>
        <p className="text-[11px] leading-[14px] text-text-3">
          Saved brands stay in this browser. Ask Pip to &quot;use brand colours everywhere&quot; in
          any project.
        </p>
      </div>
    </div>
  );
}
