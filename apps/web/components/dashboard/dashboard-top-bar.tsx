'use client';

import { Plus } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PipAvatar } from '@/components/pip/pip-avatar';
import { AccountMenu } from '@/components/settings/account-menu';
import { CreditsChip } from '@/components/ui/credits-chip';
import { toast } from '@/components/ui/toast';
import { useCreditsBalance } from '@/lib/credits/use-credits-client';
import { DASHBOARD_COPY as C } from '@/lib/dashboard/copy';
import { buttonMotion } from '@/lib/motion/presets';

/**
 * Dashboard top bar (projects.png, design §11): 80 px, panel colour, hairline at the bottom;
 * logo at x 45, nav "Projects" (ember underline) and "Styles", credits chip at x 1032,
 * "+ New project" 160×40 at x 1152, avatar at x 1336.
 */
export function DashboardTopBar() {
  const router = useRouter();
  const balance = useCreditsBalance();
  return (
    <header className="relative z-20 h-20 border-b border-line bg-panel">
      <div className="mx-auto flex h-full max-w-[1440px] items-center pr-[72px] pl-[45px]">
        <Link
          href="/dashboard"
          className="flex items-center gap-[11px]"
          aria-label="motionpop home"
        >
          <PipAvatar size={24} ring={false} />
          <span className="text-[22px] leading-7 font-semibold tracking-[-0.3px]">motionpop</span>
        </Link>
        <nav aria-label="Main" className="ml-[71px] flex h-full items-center gap-[42px]">
          <Link
            href="/dashboard"
            aria-current="page"
            className="relative flex h-full items-center text-sm leading-[18px] font-medium text-text"
          >
            {C.nav.projects}
            <span aria-hidden className="absolute right-0 bottom-0 left-0 h-0.5 bg-ember" />
          </Link>
          <button
            type="button"
            onClick={() => toast(C.toasts.styles)}
            className="text-sm leading-[18px] text-text-2 transition-colors hover:text-text"
          >
            {C.nav.styles}
          </button>
        </nav>
        <div className="ml-auto flex items-center">
          <CreditsChip
            variant="dashboard"
            credits={balance}
            onClick={() => router.push('/settings')}
          />
          <motion.button
            type="button"
            {...buttonMotion}
            onClick={() => router.push('/start')}
            className="ml-4 inline-flex h-10 w-40 items-center gap-2.5 rounded-chip bg-[linear-gradient(180deg,#FF975C,#FF7A3D)] pl-4 text-[13px] leading-4 font-semibold text-[#2A1308] shadow-[0_4px_16px_rgb(255_122_61/0.1),inset_0_1px_0_rgb(255_255_255/0.25)] hover:brightness-105"
          >
            <Plus className="size-4" strokeWidth={1.75} aria-hidden />
            {C.newProject}
          </motion.button>
          <span className="ml-6">
            <AccountMenu />
          </span>
        </div>
      </div>
    </header>
  );
}
