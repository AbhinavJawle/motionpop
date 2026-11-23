import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type SettingsVariant = 'page' | 'panel';

/**
 * One Settings section. On the page (spec 35): an ink-ruled paper frame with a poster title; in
 * the editor panel: a glass card. Shared by both.
 */
export function SectionCard({
  id,
  title,
  subtitle,
  variant,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  variant: SettingsVariant;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn(
        'scroll-mt-24',
        variant === 'page'
          ? 'rounded-[16px] border-2 border-ink bg-paper p-7'
          : 'scroll-mt-20 rounded-card bg-card p-4 shadow-glass',
      )}
    >
      <h2
        id={`${id}-title`}
        className={cn(
          variant === 'page'
            ? 'font-poster text-[36px] leading-[0.9] uppercase'
            : 'text-[15px] leading-5 font-semibold tracking-[-0.1px]',
        )}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          className={cn(
            'text-text-2',
            variant === 'page' ? 'mt-2 text-[13px]' : 'mt-0.5 text-xs leading-4',
          )}
        >
          {subtitle}
        </p>
      )}
      <div className={variant === 'page' ? 'mt-5' : 'mt-4'}>{children}</div>
    </section>
  );
}
