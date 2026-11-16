import type { Slot } from '@motionpop/schemas';
import { spokenText } from '@/lib/editor/slot-display';
import { selectWords, useEditor } from '@/lib/stores/editor';

/** "Why this graphic" card: 320×44, violet 2 px edge, label y6, quote y23 (design/figma-export.css). */
export function YouSaid({ slot }: { slot: Slot }) {
  const words = useEditor(selectWords);
  const said = spokenText(slot, words);
  return (
    <div className="relative mt-2 h-11 rounded-chip bg-reason px-3 pt-1.5 shadow-glass">
      <span aria-hidden className="absolute top-2 left-0 h-7 w-0.5 rounded-full bg-violet" />
      <p className="text-[10px] leading-[13px] font-medium text-violet-ink-2">You said</p>
      <p className="mt-1 truncate text-xs leading-4 text-text-body">
        {said ? `“${said}”` : slot.reason}
      </p>
    </div>
  );
}
