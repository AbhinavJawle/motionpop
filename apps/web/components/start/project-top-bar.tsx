'use client';

import type { Format } from '@motionpop/schemas';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { HelpSheet } from '@/components/dashboard/help-sheet';
import { ProjectTitle } from '@/components/editor/top-bar';
import { PipAvatar } from '@/components/pip/pip-avatar';
import { AccountMenu } from '@/components/settings/account-menu';
import { BrandKitChip } from '@/components/ui/brand-kit-chip';
import { CreditsChip } from '@/components/ui/credits-chip';
import { SegmentedPills } from '@/components/ui/segmented-pills';
import { toast } from '@/components/ui/toast';
import { useCreditsBalance } from '@/lib/credits/use-credits-client';
import { DASHBOARD_COPY } from '@/lib/dashboard/copy';
import { useStartDraft } from '@/lib/intake/use-start-draft';

const FORMATS: readonly { value: Format; label: string }[] = [
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '1:1', label: '1:1' },
];

/**
 * The project top bar of Start and Recording (start.png, recording.png): the editor bar's
 * layout without undo, redo and Export. Title, format and style edit the Start draft, which
 * Processing turns into the project (R7.1).
 */
export function ProjectTopBar() {
  const router = useRouter();
  const balance = useCreditsBalance();
  const [draft, update] = useStartDraft();
  const [help, setHelp] = useState(false);

  return (
    <header className="relative flex h-14 shrink-0 items-center border-b border-white/6 bg-raised-grad pr-[28px] pl-5">
      <Link href="/dashboard" className="flex items-center gap-[7px]" aria-label="motionpop home">
        <PipAvatar size={24} ring={false} />
        <span className="text-[19px] leading-[25px] font-semibold tracking-[-0.2px]">
          motionpop
        </span>
      </Link>
      <span aria-hidden className="mr-4 ml-6 h-5 w-px bg-line-strong" />
      <Link
        href="/dashboard"
        className="flex items-center gap-1 text-xs leading-4 text-text-2 transition-colors hover:text-text"
      >
        <ChevronLeft className="size-4" strokeWidth={1.5} aria-hidden />
        Home
      </Link>
      <ProjectTitle title={draft.title} onRename={(title) => update({ title })} />
      <div className="absolute left-1/2 -ml-4 -translate-x-1/2">
        <SegmentedPills
          label="Video format"
          options={FORMATS}
          value={draft.format}
          onChange={(format) => update({ format, formatChosen: true })}
        />
      </div>
      <div className="ml-auto flex items-center">
        <BrandKitChip onClick={() => toast(DASHBOARD_COPY.toasts.brandKit)} />
        <CreditsChip className="ml-3" credits={balance} onClick={() => router.push('/settings')} />
        <button
          type="button"
          onClick={() => setHelp(true)}
          className="ml-[26px] flex h-8 w-24 items-center gap-2.5 rounded-chip border border-line bg-card pl-5 text-xs leading-4 text-text-2 transition-colors hover:text-text"
        >
          <span aria-hidden>?</span>
          Help
        </button>
        <span className="ml-6">
          <AccountMenu />
        </span>
      </div>
      <HelpSheet open={help} onClose={() => setHelp(false)} />
    </header>
  );
}
