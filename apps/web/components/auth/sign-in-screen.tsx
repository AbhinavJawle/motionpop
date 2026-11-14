'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { Pip } from '@/components/pip/pip';
import type { PipState } from '@/components/pip/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { createAccount, sendReset, signInWithEmail, signInWithGoogle } from '@/lib/auth/actions';
import { useAuth } from '@/lib/auth/auth-provider';
import { authErrorMessage } from '@/lib/auth/errors';
import { safeNextPath } from '@/lib/auth/next-path';
import { fadeIn, popIn } from '@/lib/motion/presets';

type Mode = 'sign-in' | 'create' | 'reset';
type Busy = null | 'google' | 'email';

const COPY: Record<Mode, { title: string; sub: string; submit: string; busy: string }> = {
  'sign-in': {
    title: 'Welcome to Motionpop',
    sub: 'Sign in and pick up where your voice left off.',
    submit: 'Sign in',
    busy: 'Signing in…',
  },
  create: {
    title: 'Welcome to Motionpop',
    sub: 'Make an account. Your first 20 credits are on Pip.',
    submit: 'Create account',
    busy: 'Creating your account…',
  },
  reset: {
    title: 'Forgot your password?',
    sub: 'Tell Pip your email and a reset link flies over.',
    submit: 'Send reset link',
    busy: 'Sending…',
  },
};

const field =
  'h-10 w-full rounded-chip bg-card-2 px-3 text-[13px] leading-[18px] text-text shadow-glass outline-none transition-shadow duration-200 placeholder:text-text-3 focus:shadow-violet-glow disabled:opacity-40';

/** Sign in (screens.md, not designed: glass card, Pip waving, Google + email/password). */
export function SignInScreen() {
  const auth = useAuth();
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get('next'));
  const ids = { email: useId(), password: useId(), error: useId() };

  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Signed in (now or already): go where the user was heading.
  useEffect(() => {
    if (auth.status === 'signed-in') router.replace(next);
  }, [auth.status, next, router]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setNotice(null);
  };

  async function attempt(kind: Exclude<Busy, null>, fn: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (mode === 'reset') {
      void attempt('email', async () => {
        await sendReset(email);
        setNotice('Check your inbox. The link works for an hour.');
      });
      return;
    }
    void attempt('email', () =>
      mode === 'create' ? createAccount(email, password) : signInWithEmail(email, password),
    );
  }

  const pip: PipState =
    auth.status === 'signed-in' ? 'celebrating' : error ? 'thinking' : busy ? 'thinking' : 'waving';
  const copy = COPY[mode];

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-bg px-6 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute top-[18%] left-1/2 size-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(139_124_255/0.10),transparent)]"
      />

      <motion.div {...popIn} className="relative flex w-full max-w-[380px] flex-col items-center">
        <Pip state={pip} size={104} glow look="cursor" decorative seed={7} />
        <p className="mt-4 text-[19px] leading-[25px] font-semibold tracking-[-0.2px] text-text">
          motionpop
        </p>

        <Card className="mt-6 w-full p-7">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={mode} {...fadeIn}>
              <h1 className="text-[22px] leading-[28px] font-semibold text-text">{copy.title}</h1>
              <p className="mt-1.5 text-[13px] leading-[18px] text-text-2">{copy.sub}</p>
            </motion.div>
          </AnimatePresence>

          {auth.status === 'local' ? (
            <LocalMode onContinue={() => router.replace(next)} />
          ) : (
            <>
              {mode !== 'reset' && (
                <>
                  <Button
                    variant="secondary"
                    size="lg"
                    className="mt-6 h-10 w-full text-[13px]"
                    disabled={busy !== null || auth.status === 'loading'}
                    onClick={() => void attempt('google', signInWithGoogle)}
                  >
                    {busy === 'google' ? 'Opening Google…' : 'Continue with Google'}
                  </Button>
                  <div className="my-5 flex items-center gap-3" aria-hidden>
                    <span className="h-px flex-1 bg-line" />
                    <span className="font-mono text-[10px] tracking-[1px] text-text-3">OR</span>
                    <span className="h-px flex-1 bg-line" />
                  </div>
                </>
              )}

              <form
                onSubmit={onSubmit}
                className={mode === 'reset' ? 'mt-6 flex flex-col gap-3' : 'flex flex-col gap-3'}
                noValidate
                aria-describedby={error ? ids.error : undefined}
              >
                <label htmlFor={ids.email} className="sr-only">
                  Email
                </label>
                <input
                  id={ids.email}
                  type="email"
                  autoComplete="email"
                  placeholder="Email"
                  className={field}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy !== null}
                  required
                />
                {mode !== 'reset' && (
                  <>
                    <label htmlFor={ids.password} className="sr-only">
                      Password
                    </label>
                    <input
                      id={ids.password}
                      type="password"
                      autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
                      placeholder={mode === 'create' ? 'Password (6+ characters)' : 'Password'}
                      className={field}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={busy !== null}
                      required
                    />
                  </>
                )}

                <AnimatePresence initial={false}>
                  {(error || notice) && (
                    <motion.p
                      key={error ?? notice}
                      {...fadeIn}
                      id={error ? ids.error : undefined}
                      role={error ? 'alert' : 'status'}
                      className={
                        error
                          ? 'text-[12px] leading-[16px] text-error'
                          : 'text-[12px] leading-[16px] text-mint-ink'
                      }
                    >
                      {error ?? notice}
                    </motion.p>
                  )}
                </AnimatePresence>

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="mt-1 h-10 w-full text-[13px]"
                  disabled={busy !== null || auth.status === 'loading'}
                >
                  {busy === 'email' ? copy.busy : copy.submit}
                </Button>
              </form>

              <div className="mt-5 flex flex-col items-center gap-2 text-[12px] leading-[16px] text-text-2">
                {mode === 'sign-in' && (
                  <>
                    <TextButton onClick={() => switchMode('reset')}>Forgot password?</TextButton>
                    <span>
                      New here?{' '}
                      <TextButton strong onClick={() => switchMode('create')}>
                        Create an account
                      </TextButton>
                    </span>
                  </>
                )}
                {mode !== 'sign-in' && (
                  <span>
                    {mode === 'create' ? 'Have an account? ' : ''}
                    <TextButton strong onClick={() => switchMode('sign-in')}>
                      {mode === 'create' ? 'Sign in' : 'Back to sign in'}
                    </TextButton>
                  </span>
                )}
              </div>
            </>
          )}
        </Card>

        <p className="mt-6 text-center text-[11px] leading-[14px] text-text-3">
          Bring your voice. We’ll bring the motion.
        </p>
      </motion.div>
    </main>
  );
}

function TextButton({
  children,
  onClick,
  strong = false,
}: {
  children: string;
  onClick: () => void;
  strong?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        strong
          ? 'font-medium text-violet-ink transition-colors hover:text-text'
          : 'text-text-2 transition-colors hover:text-text'
      }
    >
      {children}
    </button>
  );
}

function LocalMode({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="mt-6 flex flex-col gap-4">
      <p className="text-[13px] leading-[18px] text-text-body">
        Accounts are off in this build. Your projects stay on this device.
      </p>
      <Button variant="primary" size="lg" className="h-10 w-full text-[13px]" onClick={onContinue}>
        Continue
      </Button>
    </div>
  );
}
