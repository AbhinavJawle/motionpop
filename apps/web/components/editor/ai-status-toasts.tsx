'use client';

import { useEffect, useRef } from 'react';
import { toast } from '@/components/ui/toast';
import { setUpOnDevice, useAIStatus, type Availability } from '@/lib/ai/ai-status';
import {
  CLOUD_BODY,
  CLOUD_TITLE,
  READY_BODY,
  READY_TITLE,
  SETUP_ACTION,
  SETUP_BODY,
  SETUP_FAILED,
  SETUP_TOAST_ID,
  claimSessionToast,
  progressLabel,
  toastFor,
  toastsQuiet,
} from '@/lib/ai/availability';
import { fakeAiFlag } from '@/lib/credits/pick-client';
import { firebaseEnabled } from '@/lib/firebase/client';

/**
 * The on-device AI toasts of the editor (spec 09 R9.1, R9.2): one availability toast per session
 * (mint "On-device AI ready", violet "Using cloud AI"), a "Set up on-device AI" action when the
 * model can be downloaded (only that click starts the download, hybrid-ai.md), and a persistent
 * progress toast while it downloads. Renders nothing.
 */
export function AIStatusToasts(): null {
  const { availability, setupProgress } = useAIStatus();
  const last = useRef<Availability | null>(null);
  const quiet = useRef(true);

  useEffect(() => {
    quiet.current = toastsQuiet({
      firebase: firebaseEnabled(),
      fakeAi: fakeAiFlag({
        NODE_ENV: process.env.NODE_ENV,
        NEXT_PUBLIC_FAKE_AI: process.env.NEXT_PUBLIC_FAKE_AI,
      }),
      search: window.location.search,
    });
  }, []);

  useEffect(() => {
    const before = last.current;
    last.current = availability;
    const wanted = toastFor(before, availability, false);
    if (!wanted) return;
    // A closed progress toast must not outlive its download, even when the toasts are quiet.
    if (wanted.kind === 'ready' || wanted.kind === 'setup-failed') toast.dismiss(SETUP_TOAST_ID);
    if (quiet.current) return;
    const once = (wanted.kind === 'ready' && !wanted.afterSetup) || wanted.kind === 'cloud';
    if (once && !claimSessionToast(window.sessionStorage)) return;
    switch (wanted.kind) {
      case 'ready':
        toast.device(READY_TITLE, READY_BODY);
        break;
      case 'cloud':
        toast.cloud(
          CLOUD_TITLE,
          wanted.setup ? SETUP_BODY : CLOUD_BODY,
          wanted.setup
            ? {
                duration: 12_000,
                // The click is the user gesture `initializeDeviceModel` needs.
                action: { label: SETUP_ACTION, onClick: () => void setUpOnDevice() },
              }
            : undefined,
        );
        break;
      case 'progress':
        // Drawn and kept current by the progress effect below.
        break;
      case 'setup-failed':
        toast.error(SETUP_FAILED);
        break;
    }
  }, [availability]);

  useEffect(() => {
    if (quiet.current || availability !== 'downloading') return;
    toast.device(progressLabel(setupProgress), undefined, {
      id: SETUP_TOAST_ID,
      duration: Infinity,
    });
  }, [availability, setupProgress]);

  return null;
}
