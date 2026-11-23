'use client';

import { Copy, ExternalLink, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { DASHBOARD_COPY as C } from '@/lib/dashboard/copy';
import { popIn } from '@/lib/motion/presets';
import { projectLibrary } from '@/lib/projects/use-project-list';

const editorHref = (id: string) => `/editor/${encodeURIComponent(id)}`;

/**
 * The ⋯ menu of a project card or row (R5.4, R1.6): Open, Rename, Duplicate, Delete with a
 * confirm. A damaged save only offers Open (the editor offers its restore) and Delete.
 */
export function ProjectMenu({
  id,
  title,
  damaged = false,
  onChanged,
  className,
}: {
  id: string;
  title: string;
  damaged?: boolean;
  onChanged: () => void;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null);
  const [name, setName] = useState(title);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);

  useEffect(() => {
    if (open) root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  const run = async (work: () => Promise<void>, failed: string) => {
    setBusy(true);
    try {
      await work();
      onChanged();
    } catch (e) {
      console.error('[dashboard]', e);
      toast.error(failed);
    } finally {
      setBusy(false);
      setDialog(null);
    }
  };

  const duplicate = () =>
    run(async () => {
      const copyTitle = `${title} (copy)`.slice(0, 80);
      await projectLibrary().duplicate(id, copyTitle);
      toast.success(C.toasts.duplicated(copyTitle));
    }, C.toasts.duplicateFailed);

  const items: Array<{ label: string; icon: typeof Copy; act: () => void; danger?: boolean }> = [
    { label: C.menu.open, icon: ExternalLink, act: () => router.push(editorHref(id)) },
    ...(damaged
      ? []
      : [
          {
            label: C.menu.rename,
            icon: Pencil,
            act: () => {
              setName(title);
              setDialog('rename');
            },
          },
          { label: C.menu.duplicate, icon: Copy, act: () => void duplicate() },
        ]),
    { label: C.menu.delete, icon: Trash2, act: () => setDialog('delete'), danger: true },
  ];

  return (
    <div ref={root} className={cn('relative', className)}>
      <button
        type="button"
        aria-label={`More actions for ${title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="flex size-7 items-center justify-center rounded-lg text-text-2 transition-colors hover:bg-card-3 hover:text-text"
      >
        <MoreHorizontal className="size-4" strokeWidth={1.5} aria-hidden />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            id={menuId}
            role="menu"
            aria-label={`Actions for ${title}`}
            {...popIn}
            style={{ transformOrigin: 'top right' }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
              if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
              e.preventDefault();
              const all = [
                ...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
              ];
              const i = all.indexOf(document.activeElement as HTMLElement);
              all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]?.focus();
            }}
            className="absolute top-[calc(100%+6px)] right-0 z-40 w-[176px] rounded-card bg-glass p-1.5 shadow-glass backdrop-blur-[16px]"
          >
            {items.map((it) => (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  it.act();
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs leading-4 outline-none transition-colors hover:bg-white/8 focus-visible:bg-white/8 [&_svg]:size-4',
                  it.danger ? 'text-error' : 'text-text-2 hover:text-text',
                )}
              >
                <it.icon strokeWidth={1.5} aria-hidden />
                {it.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <Modal
        open={dialog === 'rename'}
        onClose={() => setDialog(null)}
        title="Rename project"
        className="w-[440px]"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => projectLibrary().rename(id, name), C.toasts.renameFailed);
          }}
        >
          <Input
            aria-label="Project title"
            value={name}
            maxLength={80}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            className="h-9 text-sm"
          />
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" size="lg" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button variant="primary" size="lg" type="submit" disabled={busy || !name.trim()}>
              Rename
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={dialog === 'delete'}
        onClose={() => setDialog(null)}
        title={C.deleteConfirm.title(title)}
        description={C.deleteConfirm.body}
        className="w-[440px]"
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="lg" onClick={() => setDialog(null)}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            size="lg"
            disabled={busy}
            className="bg-error/90 text-white hover:bg-error"
            onClick={() =>
              void run(async () => {
                await projectLibrary().delete(id);
                toast(C.toasts.deleted(title));
              }, C.toasts.deleteFailed)
            }
          >
            {C.menu.delete}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
