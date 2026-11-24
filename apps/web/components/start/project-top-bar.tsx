'use client';

import type { Format } from '@motionpop/schemas';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { HelpSheet } from '@/components/dashboard/help-sheet';
import { ProjectTitle } from '@/components/editor/top-bar';
import { AppBar } from '@/components/paper/app-bar';
import { SegmentedPills } from '@/components/ui/segmented-pills';
import { useStartDraft } from '@/lib/intake/use-start-draft';

const FORMATS: readonly { value: Format; label: string }[] = [
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '1:1', label: '1:1' },
];

/**
 * The top navigation of Start, Recording, Script and Configure (spec 35 + spec 40): keeps the
 * black film-strip AppBar on top so the navbar never turns plain white, paired with a slim paper
 * draft bar underneath for title, aspect format and Help.
 */
export function ProjectTopBar() {
  const [draft, update] = useStartDraft();
  const [help, setHelp] = useState(false);

  return (
    <>
      <AppBar />
      <div className="border-b-2 border-ink bg-paper/95 backdrop-blur-xs">
        <div className="relative mx-auto flex h-12 max-w-[1240px] items-center px-4 sm:px-6 lg:px-10">
          <Link
            href="/dashboard"
            className="flex shrink-0 items-center gap-1 text-[13px] underline-offset-4 hover:underline"
          >
            <ChevronLeft className="size-4" strokeWidth={2} aria-hidden />
            Home
          </Link>
          <span aria-hidden className="mx-3 hidden h-5 w-[2px] bg-ink sm:block" />
          <span className="hidden sm:contents">
            <ProjectTitle title={draft.title} onRename={(title) => update({ title })} />
          </span>
          <div className="absolute left-1/2 hidden -translate-x-1/2 md:block">
            <SegmentedPills
              label="Video format"
              options={FORMATS}
              value={draft.format}
              onChange={(format) => update({ format, formatChosen: true })}
            />
          </div>
          <div className="ml-auto flex items-center gap-4">
            <button
              type="button"
              onClick={() => setHelp(true)}
              className="text-[13px] underline decoration-[1.5px] underline-offset-4 hover:decoration-flame"
            >
              Help
            </button>
          </div>
        </div>
      </div>
      <HelpSheet open={help} onClose={() => setHelp(false)} />
    </>
  );
}
