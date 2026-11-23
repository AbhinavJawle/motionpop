'use client';

import { Folder, Image, LayoutGrid, Mic, Music, Star, Type, type LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { spring } from '@/lib/motion/presets';
import { useSettingsPanel } from '@/lib/editor/settings-panel';
import { toggleRailPanel, useRailPanel } from '@/lib/editor/rail-panel';
import { useEditor, type RailItem } from '@/lib/stores/editor';
import { usePip } from '@/lib/pip/use-pip';
import { PipAvatar } from '@/components/pip/pip-avatar';

const ITEMS: readonly { id: RailItem; label: string; icon: LucideIcon | null }[] = [
  // Spec 38 R2.1: the editor is Pip-first; Pip's item leads the rail and wears Pip's face.
  { id: 'ai', label: 'Pip', icon: null },
  { id: 'voice', label: 'Voice', icon: Mic },
  { id: 'styles', label: 'Styles', icon: LayoutGrid },
  { id: 'media', label: 'Media', icon: Image },
  { id: 'audio', label: 'Audio', icon: Music },
  { id: 'fonts', label: 'Fonts', icon: Type },
  { id: 'brand', label: 'Brand', icon: Star },
  { id: 'projects', label: 'Projects', icon: Folder },
];

/** 64 px tool rail (spec 38): ink icons on paper; the active item is an ink tile. */
export function ToolRail() {
  const rail = useEditor((s) => s.rail);
  const setRail = useEditor((s) => s.setRail);
  // While Settings is open in the left panel no rail item shows active (D-13-6).
  const settingsOpen = useSettingsPanel((s) => s.open);

  return (
    <nav
      aria-label="Tools"
      className="relative flex w-16 shrink-0 flex-col items-center gap-1 border-r-2 border-rule bg-paper pt-2.5"
    >
      {ITEMS.map(({ id, label, icon: Icon }) => {
        const active = rail === id && !settingsOpen;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            onClick={() => {
              if (id === 'ai') {
                // The AI rail item opens and closes the Pip panel (spec 10).
                const pip = usePip.getState();
                pip.setOpen(rail !== 'ai' || settingsOpen ? true : !pip.open);
              } else if (
                id === 'projects' ||
                id === 'voice' ||
                id === 'audio' ||
                id === 'styles' ||
                id === 'brand' ||
                id === 'media' ||
                id === 'fonts'
              ) {
                // Spec 11 §12: the Voice and Projects panels share the left panel.
                if (settingsOpen || useRailPanel.getState().open !== id) {
                  useRailPanel.setState({ open: id });
                } else toggleRailPanel(id);
              } else toast(`${label} panel is on its way.`);
              setRail(id);
            }}
            className={cn(
              'group relative flex h-[52px] w-[52px] flex-col items-center justify-center gap-1 rounded-[10px] transition-colors',
              active ? 'text-tile-ink' : 'text-ink/70 hover:bg-mist hover:text-ink',
              id === 'ai' && 'mb-1.5',
            )}
          >
            {active && (
              <motion.span
                layoutId="rail-active"
                transition={spring}
                className="absolute inset-0 rounded-[10px] bg-tile ring-1 ring-edge"
              />
            )}
            {Icon ? (
              <Icon className="relative size-[18px]" strokeWidth={1.75} aria-hidden />
            ) : (
              <span className="relative -my-0.5">
                <span
                  aria-hidden
                  className={cn(
                    'absolute -inset-1.5 rounded-full blur-[6px] transition-opacity',
                    active ? 'opacity-90' : 'opacity-60',
                  )}
                  style={{
                    background: 'conic-gradient(from 200deg, #8dbceb, #8b7cff, #ff6a3d, #8dbceb)',
                  }}
                />
                <PipAvatar size={22} ring={false} className="relative" />
              </span>
            )}
            <span className="relative font-mono text-[10px] leading-[12px] font-medium">
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
