'use client';

import { Cloud, Zap } from 'lucide-react';
import { Toaster as SonnerToaster, toast as sonner } from 'sonner';

/**
 * Toasts (sonner, unstyled + our tokens): glass card, slides up with sonner's spring.
 * Route toasts use the colour discipline: mint = on-device, violet = cloud (hybrid-ai.md).
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-center"
      gap={8}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'flex w-[356px] items-center gap-2.5 rounded-card bg-card-2 px-3.5 py-3 text-xs leading-4 text-text shadow-glass',
          title: 'font-medium',
          description: 'text-text-2',
          icon: 'shrink-0 [&_svg]:size-4',
          actionButton:
            'ml-auto rounded-lg bg-white/10 px-2.5 py-1 text-[11px] font-medium text-text hover:bg-white/15',
          success: '[&_[data-icon]]:text-mint',
          error: '[&_[data-icon]]:text-error',
          warning: '[&_[data-icon]]:text-warn',
        },
      }}
    />
  );
}

export const toast = Object.assign(sonner, {
  /** "On-device AI ready" style toast. */
  device: (title: string, description?: string) =>
    sonner(title, {
      description,
      icon: <Zap className="text-mint" strokeWidth={1.5} aria-hidden />,
    }),
  /** "Using cloud AI" style toast. */
  cloud: (title: string, description?: string) =>
    sonner(title, {
      description,
      icon: <Cloud className="text-violet" strokeWidth={1.5} aria-hidden />,
    }),
});
