'use client';

import { Folder, Image, LayoutGrid, Mic, Music, Sparkles, Star, Type, type LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { spring } from '@/lib/motion/presets';
import { useEditor, type RailItem } from '@/lib/stores/editor';

const ITEMS: readonly { id: RailItem; label: string; icon: LucideIcon }[] = [
  { id: 'voice', label: 'Voice', icon: Mic },
  { id: 'ai', label: 'AI', icon: Sparkles },
  { id: 'styles', label: 'Styles', icon: LayoutGrid },
  { id: 'media', label: 'Media', icon: Image },
  { id: 'audio', label: 'Audio', icon: Music },
  { id: 'fonts', label: 'Fonts', icon: Type },
  { id: 'brand', label: 'Brand', icon: Star },
  { id: 'projects', label: 'Projects', icon: Folder },
];

/** 72 px tool rail ("Tool rail" in design/figma-export.css). Panels behind it land in later specs. */
export function ToolRail() {
  const rail = useEditor((s) => s.rail);
  const setRail = useEditor((s) => s.setRail);

  return (
    <nav
      aria-label="Tools"
      className="relative flex w-[72px] shrink-0 flex-col items-center gap-1.5 border-r border-white/6 bg-panel pt-3"
    >
      {ITEMS.map(({ id, label, icon: Icon }) => {
        const active = rail === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            onClick={() => {
              setRail(id);
              if (id !== 'ai') toast(`${label} panel is on its way.`);
            }}
            className={cn(
              'relative flex h-[50px] w-14 flex-col items-center rounded-chip pt-[7px] transition-colors',
              active ? 'text-text' : 'text-text-2 hover:text-text',
            )}
          >
            {active && (
              <motion.span
                layoutId="rail-active"
                transition={spring}
                className="absolute inset-0 rounded-chip bg-rail-active shadow-glass"
              />
            )}
            <Icon
              className={cn('relative size-5', active && 'text-violet')}
              strokeWidth={1.5}
              aria-hidden
            />
            <span className="relative mt-[5px] text-[10px] leading-[13px] font-medium">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
