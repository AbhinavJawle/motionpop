import Link from 'next/link';
import type { ReactNode } from 'react';

/** The shell of the terms and privacy pages: plain, readable, one column. */
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
    <div className="min-h-dvh bg-bg text-text">
      <header className="border-b border-line-soft">
        <nav className="mx-auto flex h-14 max-w-[720px] items-center justify-between px-4 sm:px-6">
          <Link href="/" className="text-[17px] font-semibold tracking-[-0.2px]">
            motionpop
          </Link>
          <div className="flex gap-4 text-[13px] text-text-2">
            <Link href="/terms" className="hover:text-text">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-text">
              Privacy
            </Link>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-[720px] px-4 py-12 sm:px-6">
        <h1 className="text-[32px] leading-[38px] font-semibold tracking-[-0.4px]">{title}</h1>
        <p className="mt-2 font-mono text-[12px] text-text-3">Last updated {updated}</p>
        <div className="mt-8 space-y-4 text-[15px] leading-[25px] text-text-2 [&_a]:text-violet [&_a]:underline [&_h2]:mt-10 [&_h2]:text-[19px] [&_h2]:leading-[26px] [&_h2]:font-semibold [&_h2]:text-text [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-text">
          {children}
        </div>
      </main>
    </div>
  );
}
