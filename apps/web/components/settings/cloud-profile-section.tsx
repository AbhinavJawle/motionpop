'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { StatusDot } from '@/components/ui/status-dot';
import { signOutUser } from '@/lib/auth/actions';
import { firebaseEnabled } from '@/lib/firebase/client';
import { SectionCard, type SettingsVariant } from './section-card';

const ProfileItemSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  account: z.string().nullable(),
  projectId: z.string().nullable(),
  aiBackend: z.string(),
  envReady: z.boolean(),
  adcReady: z.boolean(),
  gcloudAuthed: z.boolean(),
  firebaseAuthed: z.boolean(),
  state: z.enum(['ready', 'needs-setup', 'needs-login']),
});

const StatusResponseSchema = z.object({
  activeProfile: z.string().nullable(),
  currentEnv: z.object({
    projectId: z.string().nullable(),
    aiBackend: z.string(),
  }),
  profiles: z.array(ProfileItemSchema),
  warnings: z.array(z.string()),
});

type ProfileStatus = z.infer<typeof StatusResponseSchema>;
type ProfileItem = z.infer<typeof ProfileItemSchema>;

function isDevProfileSwitcherVisible(forceShow: boolean): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  if (forceShow) return true;
  if (process.env.NODE_ENV !== 'development') return false;
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true') return false;
  if (process.env.NEXT_PUBLIC_FAKE_AI === '1') return false;
  return firebaseEnabled();
}

function stateBadge(state: ProfileItem['state']): {
  tone: 'mint' | 'warn' | 'muted';
  text: string;
} {
  switch (state) {
    case 'ready':
      return { tone: 'mint', text: 'Ready' };
    case 'needs-setup':
      return { tone: 'warn', text: 'Run setup' };
    case 'needs-login':
      return { tone: 'muted', text: 'Needs Google login' };
  }
}

/**
 * Dev-only Cloud & Firebase profile switcher. Never renders in production, Playwright design
 * checks, or emulator runs. Lets the founder toggle cleanly between personal and temporary
 * Google Cloud lab accounts without losing either configuration.
 */
export function CloudProfileSection({
  variant,
  forceShow = false,
}: {
  variant: SettingsVariant;
  forceShow?: boolean;
}) {
  const visible = isDevProfileSwitcherVisible(forceShow);
  const [status, setStatus] = useState<ProfileStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void fetch('/api/dev/cloud-profile')
      .then(async (res) => {
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const json: unknown = await res.json();
        return StatusResponseSchema.parse(json);
      })
      .then((data) => {
        if (!cancelled) {
          setStatus(data);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setError('Could not load local cloud profiles.');
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  if (!visible) return null;

  async function handleSwitch(name: string) {
    setSwitching(name);
    setError(null);
    try {
      const res = await fetch('/api/dev/cloud-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Motionpop-Dev': '1' },
        body: JSON.stringify({ profile: name }),
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          json && typeof json === 'object' && 'error' in json && typeof json.error === 'string'
            ? json.error
            : `Could not switch to ${name}`;
        throw new Error(msg);
      }
      const next = StatusResponseSchema.parse(json);
      setStatus(next);
      // Clear browser Firebase Auth session from the previous project so tokens never mismatch.
      await signOutUser().catch(() => undefined);
      toast.success(
        `Switched to ${name} (${next.currentEnv.projectId ?? 'project'}). Restart pnpm dev if needed and reload.`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Switch failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setSwitching(null);
    }
  }

  return (
    <SectionCard
      id="cloud-profile"
      title="Cloud profile"
      subtitle="Local development only. Switch between your personal project and temporary Google Cloud lab account."
      variant={variant}
    >
      {error && (
        <p className="mb-3 text-xs leading-4 text-text-2" role="alert">
          {error}
        </p>
      )}

      {!status ? (
        <p className="text-xs leading-4 text-text-2">Checking local profiles…</p>
      ) : (
        <div className="space-y-2.5" data-testid="cloud-profile-list">
          {status.profiles.map((p) => {
            const active = status.activeProfile === p.name;
            const badge = stateBadge(p.state);
            const isBusy = switching === p.name;
            return (
              <div
                key={p.name}
                data-testid={`cloud-profile-${p.name}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-chip bg-card-2 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusDot tone={active ? 'mint' : badge.tone} />
                    <span className="text-[13px] leading-[17px] font-medium">{p.label}</span>
                    {active && (
                      <Chip tone="mint" className="h-[19px]">
                        Active
                      </Chip>
                    )}
                    {!active && (
                      <Chip tone="neutral" className="h-[19px]">
                        {badge.text}
                      </Chip>
                    )}
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[11px] leading-[15px] text-text-2">
                    {p.account ?? 'No Google account'} · {p.projectId ?? 'No project yet'} ·{' '}
                    {p.aiBackend}
                  </p>
                </div>

                {active ? (
                  <Link
                    href="/dev/firebase"
                    className="shrink-0 text-[11px] leading-[14px] text-violet hover:underline"
                  >
                    Verify
                  </Link>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!p.envReady || switching !== null}
                    onClick={() => void handleSwitch(p.name)}
                  >
                    {isBusy ? 'Switching…' : `Use ${p.label}`}
                  </Button>
                )}
              </div>
            );
          })}

          {status.warnings.length > 0 && (
            <div className="rounded-chip border border-white/10 px-3 py-2 text-[11px] leading-4 text-text-2">
              {status.warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
            </div>
          )}

          <p className="text-[11px] leading-4 text-text-2">
            CLI equivalent: <code className="font-mono text-text">pnpm cloud:use personal</code> or{' '}
            <code className="font-mono text-text">pnpm cloud:use lab</code>.
          </p>
        </div>
      )}
    </SectionCard>
  );
}
