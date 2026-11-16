'use client';

import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { fadeIn, modal } from '@/lib/motion/presets';
import { Button } from './button';

const subscribeNoop = () => () => {};

/**
 * "Export dialog" (design/figma-export.css l.66576): backdrop rgba(5,5,9,0.79); dialog 560 wide,
 * rgba(19,18,26,0.96) + 16px blur, r24, 0 24px 64px shadow; title Geist 600 24/31, subtitle 13px text-2.
 * Scales in from 0.96 with a backdrop fade. Escape and backdrop click close; focus moves in and is restored.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  className,
  closeClassName,
  contentClassName,
  hideHeading,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  /** Moves the ✕ (the ready dialog sits it 4 px higher). */
  closeClassName?: string;
  /** Replaces the default `mt-6` gap above the content. */
  contentClassName?: string;
  /** Keep the heading for assistive tech but draw it yourself (the ready dialog). */
  hideHeading?: boolean;
}) {
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // The latest `onClose` without re-running the focus effect: a new callback on every render of
  // the parent must not steal focus back to the panel.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
      if (e.key === 'Tab' && panelRef.current) {
        // Minimal focus trap: wrap Tab within the dialog.
        const items = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])',
        );
        const first = items[0];
        const last = items[items.length - 1];
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    const t = setTimeout(() => panelRef.current?.focus(), 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [open]);

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="scrim"
          {...fadeIn}
          className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-6"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={panelRef}
            {...modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            className={cn(
              'relative max-h-full w-[560px] max-w-full overflow-y-auto rounded-modal bg-dialog p-8 shadow-modal backdrop-blur-[16px] outline-none',
              className,
            )}
          >
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close"
              onClick={onClose}
              className={cn('absolute top-6 right-6 [&_svg]:size-5', closeClassName)}
            >
              <X strokeWidth={1.5} aria-hidden />
            </Button>
            <h2
              id={titleId}
              className={cn(
                'pr-10 text-2xl leading-[31px] font-semibold',
                hideHeading && 'sr-only',
              )}
            >
              {title}
            </h2>
            {description && (
              <p
                id={descId}
                className={cn(
                  'mt-1 text-[13px] leading-[17px] text-text-2',
                  hideHeading && 'sr-only',
                )}
              >
                {description}
              </p>
            )}
            <div className={contentClassName ?? 'mt-6'}>{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
