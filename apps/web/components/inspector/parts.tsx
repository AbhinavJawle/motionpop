import { cn } from '@/lib/cn';

/** "Section divider" (design/figma-export.css): 1 px white at 6 %. */
export function Divider({ className, soft }: { className?: string; soft?: boolean }) {
  return (
    <hr
      className={cn('h-px border-0', soft ? 'bg-white/[0.04]' : 'bg-white/6', className)}
      aria-hidden
    />
  );
}

/** Section headings (spec 33): sentence case, 12 px semibold, text-2. */
export function SectionLabel({
  children,
  className,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <span id={id} className={cn('text-[12px] leading-4 font-semibold text-text-2', className)}>
      {children}
    </span>
  );
}
