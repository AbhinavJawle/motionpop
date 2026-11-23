'use client';

import type { Format } from '@motionpop/schemas';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { HelpSheet } from '@/components/dashboard/help-sheet';
import { ProjectTitle } from '@/components/editor/top-bar';
import { PipMark } from '@/components/paper/kit';
import { AccountMenu } from '@/components/settings/account-menu';
import { SegmentedPills } from '@/components/ui/segmented-pills';
import { useCreditsBalance } from '@/lib/credits/use-credits-client';
import { useStartDraft } from '@/lib/intake/use-start-draft';

const FORMATS: readonly { value: Format; label: string }[] = [
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '1:1', label: '1:1' },
];

/**
 * The project bar of Start, Recording and Script (spec 35): a white bar on an ink rule, so you
 * can tell you're making something. Title and format edit the Start draft, which Processing
 * turns into the project (spec 11 R7.1).
 */
export function ProjectTopBar() {
  const router = useRouter();
  const balance = useCreditsBalance();
  const [draft, update] = useStartDraft();
  const [help, setHelp] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b-2 border-ink bg-paper">
      <div className="relative mx-auto flex h-16 max-w-[1240px] items-center px-4 sm:px-6 lg:px-10">
        <Link href="/dashboard" className="flex items-center gap-2.5" aria-label="motionpop home">
          <PipMark />
        </Link>
        <Link
          href="/dashboard"
          className="ml-4 flex items-center gap-1 text-[13px] underline-offset-4 hover:underline"
        >
          <ChevronLeft className="size-4" strokeWidth={2} aria-hidden />
          Home
        </Link>
        <span aria-hidden className="mx-4 hidden h-6 w-[2px] bg-ink sm:block" />
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
        <div className="ml-auto flex items-center gap-5">
          <button
            type="button"
            onClick={() => router.push('/settings#credits')}
            aria-label={balance === null ? 'Credits loading' : `${balance} credits`}
            className="hidden text-[13px] text-black/70 hover:text-ink lg:block"
          >
            <span className="font-poster text-[22px] leading-none text-ink">{balance ?? '–'}</span>{' '}
            credits
          </button>
          <button
            type="button"
            onClick={() => setHelp(true)}
            className="text-[13px] underline decoration-[1.5px] underline-offset-4 hover:decoration-flame"
          >
            Help
          </button>
          <AccountMenu />
        </div>
      </div>
      <HelpSheet open={help} onClose={() => setHelp(false)} />
    </header>
  );
}
