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

/** CONTENT, STYLE, TIMING: Geist 500 10 px, 0.8 px tracking, #8B849A, uppercase. */
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
    <span
      id={id}
      className={cn(
        'text-[10px] leading-[13px] font-medium tracking-[0.8px] text-section uppercase',
        className,
      )}
    >
      {children}
    </span>
  );
}
