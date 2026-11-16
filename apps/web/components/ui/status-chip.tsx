import { cn } from '@/lib/cn';

export type ChipStatus =
  | { kind: 'draft' }
  | { kind: 'ready' }
  | { kind: 'exported' }
  | { kind: 'rendering'; progress: number }
  | { kind: 'damaged' };

/**
 * Project status chip (projects.png): "Draft" grey, "Exported" mint, "Rendering 64%" violet
 * with a spinner. "Ready" (every slot has a graphic) uses the mint tint too.
 */
export function StatusChip({ status, className }: { status: ChipStatus; className?: string }) {
  const base =
    'inline-flex h-[22px] items-center gap-1.5 rounded-md px-2.5 text-[10px] leading-[13px] font-medium';
  switch (status.kind) {
    case 'draft':
      return <span className={cn(base, 'bg-white/8 text-text-2', className)}>Draft</span>;
    case 'ready':
      return <span className={cn(base, 'bg-mint-tint text-mint-ink', className)}>Ready</span>;
    case 'exported':
      return <span className={cn(base, 'bg-mint-tint text-mint', className)}>Exported</span>;
    case 'damaged':
      return <span className={cn(base, 'bg-error/12 text-error', className)}>Damaged</span>;
    case 'rendering':
      return (
        <span className={cn(base, 'bg-violet/14 text-violet-ink', className)}>
          <span
            aria-hidden
            className="size-2.5 animate-spin rounded-full border-[1.5px] border-violet/30 border-t-violet motion-reduce:animate-none"
          />
          Rendering <span className="tabular">{status.progress}%</span>
        </span>
      );
  }
}
