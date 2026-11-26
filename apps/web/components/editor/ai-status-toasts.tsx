'use client';

import { useEffect, useRef } from 'react';
import { toast } from '@/components/ui/toast';
import { useAIStatus } from '@/lib/ai/ai-status';
import {
  READY_BODY,
  READY_TITLE,
  SETUP_FAILED,
  SETUP_TOAST_ID,
  progressLabel,
  toastsQuiet,
} from '@/lib/ai/availability';
import { fakeAiFlag } from '@/lib/credits/pick-client';
import { firebaseEnabled } from '@/lib/firebase/client';

/**
 * On-device AI setup progress toasts. Never shows automatic startup banners/toasts when opening
 * the browser or editor; only surfaces progress and completion/failure for a download the user
 * explicitly started in Settings (`setupActive`). Renders nothing.
 */
export function AIStatusToasts(): null {
  const { availability, setupActive, setupProgress, setupError } = useAIStatus();
  const wasSettingUp = useRef(false);
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
    if (setupActive) {
      wasSettingUp.current = true;
      return;
    }
    if (!wasSettingUp.current) return;
    wasSettingUp.current = false;
    toast.dismiss(SETUP_TOAST_ID);
    if (quiet.current) return;
    if (availability === 'available') {
      toast.device(READY_TITLE, READY_BODY);
    } else if (availability === 'downloadable' && setupError !== 'Download cancelled.') {
      toast.error(SETUP_FAILED);
    }
  }, [setupActive, availability, setupError]);

  useEffect(() => {
    if (quiet.current || !setupActive || availability !== 'downloading') return;
    toast.device(progressLabel(setupProgress), undefined, {
      id: SETUP_TOAST_ID,
      duration: Infinity,
    });
  }, [setupActive, availability, setupProgress]);

  return null;
}
