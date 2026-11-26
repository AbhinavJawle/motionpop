'use client';

import { KeyRound, Plus, Server } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AccountMenu } from '@/components/settings/account-menu';
import { useByok } from '@/lib/ai/byok';
import { useLocalLlm } from '@/lib/ai/local-llm';
import { useAuth } from '@/lib/auth/auth-provider';
import { useCreditsBalance } from '@/lib/credits/use-credits-client';
import { DASHBOARD_COPY as C } from '@/lib/dashboard/copy';
import { cn } from '@/lib/cn';
import { btn, PipMark } from './kit';
import s from './paper.module.css';

/**
 * The app bar outside the editor (spec 35): a strip of film like the marketing nav, with the
 * mark, Projects and Styles, the credit balance, "New project" and the account menu.
 */
export type AppBarTab = 'projects' | 'styles' | 'recipes' | 'skills' | 'how' | 'pricing';

/** The main tabs, on every screen outside the editor. */
const TABS: readonly (readonly [AppBarTab, string, string])[] = [
  ['projects', '/dashboard', C.nav.projects],
  ['styles', '/styles', C.nav.styles],
  ['recipes', '/recipes', 'Recipes'],
  ['skills', '/skills', 'Skills'],
  ['how', '/how-it-works', 'How it works'],
  ['pricing', '/pricing', 'Pricing'],
];

export function AppBar({
  active,
  onCredits,
}: {
  active?: AppBarTab | 'settings';
  /** Replaces the credits link (Settings scrolls to its own Credits section). */
  onCredits?: () => void;
}) {
  const router = useRouter();
  const balance = useCreditsBalance();
  const { active: byokActive } = useByok();
  const { active: localLlmActive, model: localLlmModel } = useLocalLlm();
  const auth = useAuth();
  // The public "How it works" page uses this bar too: signed out, it offers sign-in instead.
  const signedOut = auth.status === 'signed-out';
  return (
    <header className={s.bar}>
      <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-4 px-4 sm:gap-8 sm:px-6 lg:px-10">
        <Link
          href={signedOut ? '/' : '/dashboard'}
          className="flex items-center gap-2.5"
          aria-label="motionpop home"
        >
          <PipMark />
          <span className="hidden font-sans text-[22px] leading-none font-semibold tracking-[-0.03em] sm:inline">
            motionpop
          </span>
        </Link>
        <nav
          aria-label="Main"
          className="-mx-1 flex min-w-0 items-center gap-5 overflow-x-auto px-1 [scrollbar-width:none] sm:ml-2 sm:gap-6"
        >
          {TABS.filter(([id]) => !signedOut || id === 'how' || id === 'pricing').map(
            ([id, href, label]) => (
            <Link
              key={id}
              href={href}
              aria-current={active === id ? 'page' : undefined}
              className={cn(s.barLink, 'shrink-0 whitespace-nowrap')}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-3 sm:gap-4">
          {signedOut ? (
            <Link href="/sign-in" className={btn('flame', 'sm', true)}>
              Sign in
            </Link>
          ) : (
            <>
              {localLlmActive && (
                <Link
                  href="/settings#local-llm"
                  title={`Local LLM active (${localLlmModel ?? 'localhost'}) — 0 Motionpop credits`}
                  className="hidden h-7 items-center gap-1 rounded-md border border-[#3ddc97]/60 bg-[#3ddc97]/15 px-2 font-mono text-[10px] font-semibold text-[#3ddc97] uppercase transition-colors hover:bg-[#3ddc97]/25 md:inline-flex"
                >
                  <Server className="size-3" strokeWidth={2} aria-hidden />
                  LOCAL
                </Link>
              )}
              {byokActive && (
                <Link
                  href="/settings#byok"
                  title="Your browser-local Gemini API key is active (0 Motionpop credits)"
                  className="hidden h-7 items-center gap-1 rounded-md border border-[#3ddc97]/60 bg-[#3ddc97]/15 px-2 font-mono text-[10px] font-semibold text-[#3ddc97] uppercase transition-colors hover:bg-[#3ddc97]/25 md:inline-flex"
                >
                  <KeyRound className="size-3" strokeWidth={2} aria-hidden />
                  BYOK
                </Link>
              )}
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
            </>
          )}
        </div>
      </div>
    </header>
  );
}
