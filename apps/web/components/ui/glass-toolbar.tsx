'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * "Floating preview toolbar" (design/figma-export.css l.1518): 40px, r12, glass (70% card + 16px blur),
 * glass shadow; "Toolbar divider" 1×18 white at 10%.
 */
export function GlassToolbar({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <div
      role="toolbar"
      aria-label={label}
      className={cn(
        'inline-flex h-9 items-center gap-3 rounded-[10px] bg-glass px-3 text-xs leading-4 shadow-pop backdrop-blur-[16px]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function ToolbarDivider() {
  return <span aria-hidden className="h-4 w-px bg-white/[0.09]" />;
}
