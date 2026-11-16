'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { imageCost } from '@/lib/images/generate';
import { chipToPip, usePip } from '@/lib/pip/use-pip';
import { needsPicture } from '@/lib/pip/plan';
import { useAppConfig } from '@/lib/renders/hooks';
import { editorStore, useEditor } from '@/lib/stores/editor';

/**
 * Once per project open: when ready graphics could carry a picture and none has one yet, offer
 * to add them, with the total cost (spec 07 R4.5: one confirm per video, never automatic). The
 * action hands over to Pip's plan card, where each picture can be left out before Apply all.
 */
export function PictureNudge(): null {
  const projectId = useEditor((s) => s.project?.id ?? null);
  const config = useAppConfig();
  const shown = useRef<string | null>(null);

  useEffect(() => {
    if (!projectId || shown.current === projectId) return;
    const t = setTimeout(() => {
      const p = editorStore.getState().project;
      if (!p || p.id !== projectId || (p.assets?.length ?? 0) > 0) return;
      const n = Math.min(6, needsPicture(p).length);
      if (n === 0) return;
      shown.current = projectId;
      toast(`Add pictures to ${n} graphic${n === 1 ? '' : 's'}?`, {
        description: `Painted in your look · ☁ ${n * imageCost(config)} credits`,
        duration: 12000,
        action: {
          label: 'Show me',
          onClick: () => {
            usePip.getState().setOpen(true);
            chipToPip(editorStore, 'pictures', `Add pictures to ${n} graphics`, { kind: 'video' });
          },
        },
      });
    }, 4000);
    return () => clearTimeout(t);
  }, [projectId, config]);

  return null;
}
