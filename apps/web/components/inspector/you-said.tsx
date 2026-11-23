import type { Slot } from '@motionpop/schemas';
import { spokenText } from '@/lib/editor/slot-display';
import { selectWords, useEditor } from '@/lib/stores/editor';

/** "You said" (spec 33): the spoken words that put this graphic here, as a quiet quote. */
export function YouSaid({ slot }: { slot: Slot }) {
  const words = useEditor(selectWords);
  const said = spokenText(slot, words);
  return (
    <figure className="relative mt-3 rounded-[10px] bg-white/[0.03] py-2.5 pr-3 pl-3.5 shadow-quiet">
      <span
        aria-hidden
        className="absolute top-3 bottom-3 left-0 w-0.5 rounded-full bg-violet/70"
      />
      <figcaption className="text-[11px] leading-[14px] font-medium text-text-3">
        You said
      </figcaption>
      <blockquote className="mt-1 line-clamp-2 text-[13px] leading-[18px] text-text">
        {said ? `“${said}”` : slot.reason}
      </blockquote>
    </figure>
  );
}
