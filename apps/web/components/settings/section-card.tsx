import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type SettingsVariant = 'page' | 'panel';

/** One Settings section: a glass card (r12) with a title and a quiet subtitle. Shared by the page and the panel. */
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
        'scroll-mt-20 rounded-card bg-card shadow-glass',
        variant === 'page' ? 'p-6' : 'p-4',
      )}
    >
      <h2
        id={`${id}-title`}
        className={cn(
          'font-semibold tracking-[-0.1px]',
          variant === 'page' ? 'text-[17px] leading-[22px]' : 'text-[15px] leading-5',
        )}
      >
        {title}
      </h2>
      {subtitle && <p className="mt-0.5 text-xs leading-4 text-text-2">{subtitle}</p>}
      <div className={variant === 'page' ? 'mt-5' : 'mt-4'}>{children}</div>
    </section>
  );
}
