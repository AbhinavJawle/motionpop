'use client';

import { useEffect, useState } from 'react';
import { AppBar } from '@/components/paper/app-bar';
import { PaperPage, poster } from '@/components/paper/kit';
import { cn } from '@/lib/cn';
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

/** `/settings` (spec 13 R6.1, paper in spec 35): the app bar, a poster headline, a sticky index and the sections. */
export function SettingsPage() {
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
    <PaperPage>
      <AppBar
        active="settings"
        onCredits={() => {
          window.history.replaceState(null, '', '#credits');
          setActive('credits');
          scrollToSection('credits');
        }}
      />
      <main className="mx-auto w-full max-w-[1240px] px-6 pt-14 pb-24 lg:px-10">
        <h1 className={cn(poster, 'text-[clamp(56px,7vw,104px)]')}>Make it yours.</h1>
        <div className="mt-12 flex flex-col items-start gap-10 md:flex-row md:gap-14">
          <nav
            aria-label="Settings sections"
            className="w-full shrink-0 md:sticky md:top-[96px] md:w-[200px]"
          >
            <ul className="flex gap-2 md:flex-col md:gap-0 md:border-l-2 md:border-ink">
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
                      'relative block py-2 font-poster text-[26px] leading-none uppercase transition-colors md:pl-5',
                      active === s.id ? 'text-ink' : 'text-black/40 hover:text-ink',
                    )}
                  >
                    {active === s.id && (
                      <span
                        aria-hidden
                        className="absolute top-1/2 -left-[2px] hidden h-7 w-[5px] -translate-y-1/2 rounded-full bg-flame md:block"
                      />
                    )}
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="w-full max-w-[760px] min-w-0" data-testid="settings-column">
            <SettingsContent variant="page" />
          </div>
        </div>
      </main>
    </PaperPage>
  );
}
