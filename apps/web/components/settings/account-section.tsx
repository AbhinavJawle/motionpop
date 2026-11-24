'use client';

import { LogOut } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { PipAvatar } from '@/components/pip/pip-avatar';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { useAuth } from '@/lib/auth/auth-provider';
import { signOutUser } from '@/lib/auth/actions';
import { useCredits } from '@/lib/credits/use-credits';
import { SectionCard, type SettingsVariant } from './section-card';

/** Account (R6.2): avatar (Pip face fallback), name, email, plan chip, sign out. */
export function AccountSection({ variant }: { variant: SettingsVariant }) {
  const auth = useAuth();
  const { plan } = useCredits();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const user = auth.status === 'signed-in' ? auth.user : null;

  const signOut = async () => {
    setBusy(true);
    try {
      await signOutUser();
      router.push('/sign-in');
    } catch {
      toast.error("Couldn't sign out. Try again.");
      setBusy(false);
    }
  };

  return (
    <SectionCard id="account" title="Account" variant={variant}>
      <div className="flex items-center gap-3.5">
        {user?.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element -- a remote profile photo of unknown size
          <img
            src={user.photoURL}
            alt=""
            referrerPolicy="no-referrer"
            className="size-10 shrink-0 rounded-full object-cover"
          />
        ) : (
          <PipAvatar size={40} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[15px] leading-5 font-medium" data-testid="account-name">
              {user
                ? (user.displayName ?? user.email?.split('@')[0] ?? 'Creator')
                : 'Working locally'}
            </p>
            {plan && (
              <Chip
                tone={plan === 'judge' ? 'ember' : plan === 'free' ? 'neutral' : 'mint'}
                className="h-[19px]"
              >
                <span data-testid="plan-chip">
                  {plan === 'judge'
                    ? 'Judge'
                    : plan === 'pro'
                      ? 'Studio'
                      : plan === 'creator'
                        ? 'Creator'
                        : 'Free'}
                </span>
              </Chip>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs leading-4 text-text-2">
            {user ? (user.email ?? '') : 'Your projects stay on this device.'}
          </p>
        </div>
        {user ? (
          <Button variant="secondary" size="md" onClick={() => void signOut()} disabled={busy}>
            <LogOut strokeWidth={1.5} aria-hidden />
            Sign out
          </Button>
        ) : auth.status === 'signed-out' ? (
          <Link
            href="/sign-in"
            className="inline-flex h-8 items-center rounded-chip bg-card-2 px-3 text-[11px] text-text shadow-glass hover:bg-white/10"
          >
            Sign in
          </Link>
        ) : null}
      </div>
    </SectionCard>
  );
}
