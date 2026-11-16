'use client';

import type { Slot } from '@motionpop/schemas';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { Divider, SectionLabel } from './parts';

/** Remembered for the session: the collapse choice survives selecting another slot (R2.5). */
let collapsedForSession = false;

/**
 * CONTENT: label at y255 with a chevron on the right, then the form (task 13). The divider above
 * sits at y248.
 */
export function ContentSection({ slot }: { slot: Slot }) {
  const [collapsed, setCollapsed] = useState(collapsedForSession);
  void slot;
  const toggle = () => {
    collapsedForSession = !collapsed;
    setCollapsed(!collapsed);
  };
  return (
    <section aria-label="Content">
      <Divider className="mt-2.5" />
      <button
        type="button"
        aria-expanded={!collapsed}
        onClick={toggle}
        className="mt-[6px] flex h-[13px] w-full items-center justify-between"
      >
        <SectionLabel>Content</SectionLabel>
        <ChevronDown
          className={cn('size-3 text-text-2 transition-transform', collapsed && '-rotate-90')}
          strokeWidth={1.5}
          aria-hidden
        />
      </button>
    </section>
  );
}
