import Link from 'next/link';
import type { ReactNode } from 'react';
import { PaperPage, PipMark, poster } from '@/components/paper/kit';
import { cn } from '@/lib/cn';

/** The shell of the terms and privacy pages (spec 35): paper, one readable column. */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <PaperPage>
      <header className="border-b-2 border-ink">
        <nav className="mx-auto flex h-16 max-w-[760px] items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5" aria-label="motionpop home">
            <PipMark />
            <span className="font-sans text-[22px] leading-none font-semibold tracking-[-0.03em]">
              motionpop
            </span>
          </Link>
          <div className="flex gap-5 text-[13px]">
            <Link href="/terms" className="underline-offset-4 hover:underline">
              Terms
            </Link>
            <Link href="/privacy" className="underline-offset-4 hover:underline">
              Privacy
            </Link>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-[760px] px-6 pt-14 pb-24">
        <h1 className={cn(poster, 'text-[88px]')}>{title}</h1>
        <p className="mt-3 text-[12px] text-black/55">Last updated {updated}</p>
        <div className="mt-10 space-y-4 text-[14px] leading-[1.8] [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mt-12 [&_h2]:border-t-2 [&_h2]:border-ink [&_h2]:pt-5 [&_h2]:font-poster [&_h2]:text-[34px] [&_h2]:leading-[0.95] [&_h2]:uppercase [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-semibold">
          {children}
        </div>
      </main>
    </PaperPage>
  );
}
