'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AccountMenu } from '@/components/settings/account-menu';
import { useCreditsBalance } from '@/lib/credits/use-credits-client';
import { DASHBOARD_COPY as C } from '@/lib/dashboard/copy';
import { cn } from '@/lib/cn';
import { btn, PipMark } from './kit';
import s from './paper.module.css';

/**
 * The app bar outside the editor (spec 35): a strip of film like the marketing nav, with the
 * mark, Projects and Styles, the credit balance, "New project" and the account menu.
 */
export function AppBar({
  active,
  onCredits,
}: {
  active?: 'projects' | 'styles' | 'settings';
  /** Replaces the credits link (Settings scrolls to its own Credits section). */
  onCredits?: () => void;
}) {
  const router = useRouter();
  const balance = useCreditsBalance();
  return (
    <header className={s.bar}>
      <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-4 px-4 sm:gap-8 sm:px-6 lg:px-10">
        <Link href="/dashboard" className="flex items-center gap-2.5" aria-label="motionpop home">
          <PipMark />
          <span className="hidden font-sans text-[22px] leading-none font-semibold tracking-[-0.03em] sm:inline">
            motionpop
          </span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-5 sm:ml-4 sm:gap-7">
          {(
            [
              ['projects', '/dashboard', C.nav.projects],
              ['styles', '/styles', C.nav.styles],
            ] as const
          ).map(([id, href, label]) => (
            <Link
              key={id}
              href={href}
              aria-current={active === id ? 'page' : undefined}
              className={s.barLink}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 sm:gap-4">
          <button
            type="button"
            onClick={onCredits ?? (() => router.push('/settings#credits'))}
            aria-label={balance === null ? 'Credits loading' : `${balance} credits`}
            className={cn(
              'hidden h-9 rounded-lg px-2 text-[13px] text-paper/75 transition-colors hover:text-paper md:block',
            )}
          >
            <span className="font-poster text-[22px] leading-none tracking-[0.02em] text-paper">
              {balance ?? '–'}
            </span>{' '}
            credits
          </button>
          <button
            type="button"
            onClick={() => router.push('/start')}
            className={btn('flame', 'sm', true)}
          >
            <Plus className="size-4" strokeWidth={2} aria-hidden />
            <span className="sr-only sm:not-sr-only">{C.newProject}</span>
          </button>
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
