'use client';

import { useRef, useState } from 'react';
import { DASHBOARD_COPY as C } from '@/lib/dashboard/copy';
import { useNow } from '@/lib/dashboard/use-now';
import { CaptureBar, type CaptureBarHandle } from './capture-bar';
import { DashboardTopBar } from './dashboard-top-bar';
import { GreetingHeader } from './greeting-header';
import { HelpSheet } from './help-sheet';

/** `/dashboard` (spec 11 R2–R6): top bar, greeting, capture bar, body, footer. */
export function DashboardScreen() {
  const now = useNow();
  const capture = useRef<CaptureBarHandle>(null);
  const [help, setHelp] = useState(false);

  return (
    <div className="min-h-dvh min-w-[1280px] bg-bg text-text">
      <DashboardTopBar />
      <main className="mx-auto max-w-[1440px] px-[72px]">
        <GreetingHeader now={now} />
        <CaptureBar ref={capture} />
      </main>
      <footer className="mx-auto flex max-w-[1440px] items-center justify-between px-[72px] pt-[60px] pb-[26px] text-[11px] leading-[14px] text-text-3">
        <span>{C.footer.line}</span>
        <button
          type="button"
          onClick={() => setHelp(true)}
          className="mr-[13px] transition-colors hover:text-text"
        >
          {C.footer.help}
        </button>
      </footer>
      <HelpSheet open={help} onClose={() => setHelp(false)} />
    </div>
  );
}
