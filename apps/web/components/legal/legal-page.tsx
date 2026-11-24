import Link from 'next/link';
import type { ReactNode } from 'react';
import { AppBar } from '@/components/paper/app-bar';
import { PaperPage, poster } from '@/components/paper/kit';
import { cn } from '@/lib/cn';

/** The shell of the terms and privacy pages (spec 35 + spec 40): black film-strip bar, paper column. */
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
      <AppBar />
      <main className="mx-auto max-w-[760px] px-6 pt-14 pb-24">
        <h1 className={cn(poster, 'text-[88px]')}>{title}</h1>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4 text-[12px] text-black/55">
          <p>Last updated {updated}</p>
          <div className="flex gap-5 text-[13px] text-ink">
            <Link href="/terms" className="underline-offset-4 hover:underline">
              Terms
            </Link>
            <Link href="/privacy" className="underline-offset-4 hover:underline">
              Privacy
            </Link>
          </div>
        </div>
        <div className="mt-10 space-y-4 text-[14px] leading-[1.8] [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mt-12 [&_h2]:border-t-2 [&_h2]:border-ink [&_h2]:pt-5 [&_h2]:font-poster [&_h2]:text-[34px] [&_h2]:leading-[0.95] [&_h2]:uppercase [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-semibold">
          {children}
        </div>
      </main>
    </PaperPage>
  );
}
