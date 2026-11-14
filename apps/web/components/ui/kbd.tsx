import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Keyboard hint ("Space play · ⌘G generate"). Mono, quiet. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-md bg-card-2 px-1 font-mono text-[10px] leading-none text-text-2 shadow-quiet',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
