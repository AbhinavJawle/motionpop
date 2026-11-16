'use client';

import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PipAvatar } from '@/components/pip/pip-avatar';
import { CreditsChip } from '@/components/ui/credits-chip';
import { cn } from '@/lib/cn';
import { useCreditsBalance } from '@/lib/credits/use-credits-client';
import { AccountMenu } from './account-menu';
import { SettingsContent } from './settings-content';

const SECTIONS = [
  { id: 'account', label: 'Account' },
  { id: 'ai', label: 'AI & models' },
  { id: 'credits', label: 'Credits' },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];

function scrollToSection(id: SectionId): void {
  document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

/** `/settings` (spec 13 R6.1): top bar, eyebrow, headline, a sticky section nav and a 720 px column. */
export function SettingsPage() {
  const balance = useCreditsBalance();
  const [active, setActive] = useState<SectionId>('account');

  // The section in view (scroll spy) and the one named by the URL hash.
  useEffect(() => {
    const hash = window.location.hash.slice(1) as SectionId;
    if (SECTIONS.some((s) => s.id === hash)) {
      // The scroll spy below picks the section up once it is in view.
      setTimeout(() => scrollToSection(hash), 120);
    }
    const seen = new Map<string, number>();
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0);
        const top = SECTIONS.find((s) => (seen.get(s.id) ?? 0) > 0);
        if (top) setActive(top.id);
      },
      { rootMargin: '-80px 0px -45% 0px', threshold: [0, 0.2, 1] },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, []);

  return (
    <div className="min-h-dvh min-w-[1280px] bg-bg text-text">
      <header className="sticky top-0 z-30 flex h-14 items-center border-b border-white/6 bg-raised-grad pr-7 pl-5">
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
        <div className="ml-auto flex items-center gap-3">
          <CreditsChip
            credits={balance}
            onClick={() => {
              window.history.replaceState(null, '', '#credits');
              setActive('credits');
              scrollToSection('credits');
            }}
          />
          <span className="ml-2">
            <AccountMenu />
          </span>
        </div>
      </header>

      <main className="mx-auto w-[1000px] pt-14 pb-24">
        <p className="text-[11px] leading-[14px] font-medium tracking-[1.2px] text-ember">
          SETTINGS
        </p>
        <h1 className="mt-2 text-[32px] leading-10 font-semibold tracking-[-0.6px]">
          Make it yours.
        </h1>
        <div className="mt-10 flex items-start gap-12">
          <nav aria-label="Settings sections" className="sticky top-[88px] w-[180px] shrink-0">
            <ul className="space-y-1">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    aria-current={active === s.id ? 'true' : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      window.history.replaceState(null, '', `#${s.id}`);
                      setActive(s.id);
                      scrollToSection(s.id);
                    }}
                    className={cn(
                      'block rounded-chip px-3.5 py-2 text-[13px] leading-[17px] transition-colors',
                      active === s.id
                        ? 'bg-rail-active text-text shadow-glass'
                        : 'text-text-2 hover:text-text',
                    )}
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="w-[720px] min-w-0" data-testid="settings-column">
            <SettingsContent variant="page" />
          </div>
        </div>
      </main>
    </div>
  );
}
