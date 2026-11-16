import { cn } from '@/lib/cn';

/** "Soon" pill for options that arrive later (spec 08 R1.5–R1.7, design §13.1). */
export function SoonPill({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'ml-1.5 inline-flex items-center rounded-full border border-line bg-card-2 px-1.5 py-px text-[9px] leading-[11px] font-medium tracking-[0.8px] text-text-3 uppercase',
        className,
      )}
    >
      Soon
    </span>
  );
}
