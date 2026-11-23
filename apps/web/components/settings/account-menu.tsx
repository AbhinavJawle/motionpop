'use client';

import { LogOut, Settings } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { PipAvatar } from '@/components/pip/pip-avatar';
import { signOutUser } from '@/lib/auth/actions';
import { useAuth } from '@/lib/auth/auth-provider';
import { popIn } from '@/lib/motion/presets';

/**
 * The avatar button and its menu (spec 13 R6.1): "Settings" and, with an account, "Sign out".
 * In the editor "Settings" opens the left panel (`onOpenSettings`); elsewhere it goes to
 * `/settings`. Arrow keys move, Escape closes and returns focus to the avatar.
 */
export function AccountMenu({
  onOpenSettings,
  size = 32,
}: {
  /** Opens Settings in place (the editor panel). Without it the menu links to `/settings`. */
  onOpenSettings?: () => void;
  size?: number;
}) {
  const auth = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const user = auth.status === 'signed-in' ? auth.user : null;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);

  useEffect(() => {
    if (open) rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    e.preventDefault();
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  };

  const openSettings = () => {
    setOpen(false);
    if (onOpenSettings) onOpenSettings();
    else router.push('/settings');
  };

  const signOut = async () => {
    setOpen(false);
    try {
      await signOutUser();
      router.push('/sign-in');
    } catch {
      toast.error("Couldn't sign out. Try again.");
    }
  };

  const itemClass =
    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs leading-4 text-text-2 outline-none transition-colors hover:bg-card-3 hover:text-text focus-visible:bg-card-3 focus-visible:text-text [&_svg]:size-4';

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        className="flex rounded-full outline-none transition-transform hover:scale-105 active:scale-95"
      >
        {user?.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element -- a remote profile photo of unknown size
          <img
            src={user.photoURL}
            alt=""
            referrerPolicy="no-referrer"
            className="rounded-full object-cover"
            style={{ width: size, height: size }}
          />
        ) : (
          <PipAvatar size={size} />
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            id={menuId}
            role="menu"
            aria-label="Account"
            {...popIn}
            style={{ transformOrigin: 'top right' }}
            className="absolute top-[calc(100%+8px)] right-0 z-40 w-[200px] rounded-card bg-glass p-1.5 shadow-glass backdrop-blur-[16px]"
          >
            {user && (
              <div className="px-2.5 pt-1.5 pb-2">
                <p className="truncate text-xs leading-4 font-medium text-text">
                  {user.displayName ?? user.email?.split('@')[0] ?? 'Creator'}
                </p>
                {user.email && (
                  <p className="truncate text-[10px] leading-[13px] text-text-3">{user.email}</p>
                )}
              </div>
            )}
            <button type="button" role="menuitem" className={itemClass} onClick={openSettings}>
              <Settings strokeWidth={1.5} aria-hidden />
              Settings
            </button>
            {user && (
              <button
                type="button"
                role="menuitem"
                className={itemClass}
                onClick={() => void signOut()}
              >
                <LogOut strokeWidth={1.5} aria-hidden />
                Sign out
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
