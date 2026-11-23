'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { PipLoop } from '@/components/landing/pip-loop';
import { btn, Bubble, paper, PaperPage, PipMark, poster, Sprockets } from '@/components/paper/kit';
import { cn } from '@/lib/cn';
import { createAccount, sendReset, signInWithEmail, signInWithGoogle } from '@/lib/auth/actions';
import { useAuth } from '@/lib/auth/auth-provider';
import { authErrorMessage } from '@/lib/auth/errors';
import { safeNextPath } from '@/lib/auth/next-path';
import { fadeIn } from '@/lib/motion/presets';

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
  'h-full w-full bg-transparent text-[14px] outline-none placeholder:text-black/45 disabled:opacity-40';

/** Sign in (spec 35): the form on paper beside a black film panel with Pip juggling. */
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

  const pip = auth.status === 'signed-in' ? 'done' : 'idle';
  const copy = COPY[mode];
  const fieldBox = cn(paper.field, 'flex h-12 items-center px-3.5');

  return (
    <PaperPage className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <main className="flex flex-col px-6 py-8 sm:px-12 lg:px-16">
        <Link href="/" className="flex items-center gap-2.5 self-start" aria-label="motionpop home">
          <PipMark />
          <span className="font-sans text-[22px] leading-none font-semibold tracking-[-0.03em]">
            motionpop
          </span>
        </Link>

        <div className="my-auto w-full max-w-[420px] py-12">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={mode} {...fadeIn}>
              <h1 className={cn(poster, 'text-[64px]')}>{copy.title}</h1>
              <p className="mt-4 text-[14px] leading-[1.6] text-black/70">{copy.sub}</p>
            </motion.div>
          </AnimatePresence>

          {auth.status === 'local' ? (
            <LocalMode onContinue={() => router.replace(next)} />
          ) : (
            <>
              {mode !== 'reset' && (
                <>
                  <button
                    type="button"
                    className={btn('paper', 'lg', false, 'mt-8 w-full')}
                    disabled={busy !== null || auth.status === 'loading'}
                    onClick={() => void attempt('google', signInWithGoogle)}
                  >
                    <GoogleG />
                    {busy === 'google' ? 'Opening Google…' : 'Continue with Google'}
                  </button>
                  <div className="my-6 flex items-center gap-4" aria-hidden>
                    <span className="h-[2px] flex-1 bg-ink" />
                    <span className="font-scrawl text-[20px] leading-none">or</span>
                    <span className="h-[2px] flex-1 bg-ink" />
                  </div>
                </>
              )}

              <form
                onSubmit={onSubmit}
                className={mode === 'reset' ? 'mt-8 flex flex-col gap-3' : 'flex flex-col gap-3'}
                noValidate
                aria-describedby={error ? ids.error : undefined}
              >
                <label htmlFor={ids.email} className="sr-only">
                  Email
                </label>
                <span className={fieldBox}>
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
                </span>
                {mode !== 'reset' && (
                  <>
                    <label htmlFor={ids.password} className="sr-only">
                      Password
                    </label>
                    <span className={fieldBox}>
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
                    </span>
                  </>
                )}

                <AnimatePresence initial={false}>
                  {(error || notice) && (
                    <motion.p
                      key={error ?? notice}
                      {...fadeIn}
                      id={error ? ids.error : undefined}
                      role={error ? 'alert' : 'status'}
                      className={cn(
                        'text-[13px] leading-[1.5]',
                        error ? 'text-error' : 'text-mint-ink',
                      )}
                    >
                      {error ?? notice}
                    </motion.p>
                  )}
                </AnimatePresence>

                <button
                  type="submit"
                  className={btn('ink', 'lg', false, 'mt-2 w-full')}
                  disabled={busy !== null || auth.status === 'loading'}
                >
                  {busy === 'email' ? copy.busy : copy.submit}
                </button>
              </form>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-[13px]">
                {mode === 'sign-in' && (
                  <>
                    <span>
                      New here?{' '}
                      <TextButton strong onClick={() => switchMode('create')}>
                        Create an account
                      </TextButton>
                    </span>
                    <TextButton onClick={() => switchMode('reset')}>Forgot password?</TextButton>
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
        </div>

        <p className="text-[12px] text-black/55">
          By continuing you agree to the{' '}
          <Link href="/terms" className="underline underline-offset-2">
            terms
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="underline underline-offset-2">
            privacy notice
          </Link>
          .
        </p>
      </main>

      <aside
        aria-hidden
        className="relative hidden flex-col justify-between overflow-hidden bg-ink p-14 text-paper lg:flex"
      >
        <Sprockets className="absolute inset-x-0 top-3 opacity-25" />
        <p className={cn(poster, 'mt-10 text-[clamp(72px,7.4vw,120px)]')}>
          You talk.
          <br />
          We make it move.
        </p>
        <div className="relative flex items-end justify-between gap-6">
          <p className="max-w-[300px] pb-6 text-[14px] leading-[1.6] text-paper/75">
            Pip finds the moments in what you say and lands a graphic on the exact word.
          </p>
          <div className="relative">
            <Bubble className="absolute top-2 -left-24 rotate-[-4deg] text-ink">
              {pip === 'done' ? 'Welcome in!' : 'Ready when you are.'}
            </Bubble>
            <PipLoop name="juggle" className="size-[280px]" />
          </div>
        </div>
        <Sprockets className="absolute inset-x-0 bottom-3 opacity-25" />
      </aside>
    </PaperPage>
  );
}

/** Google's "G", drawn in one colour so it sits with the ink buttons. */
function GoogleG() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden>
      <path
        fill="currentColor"
        d="M21.35 11.1H12v3.2h5.35c-.5 2.5-2.6 3.9-5.35 3.9a6.2 6.2 0 1 1 0-12.4c1.5 0 2.9.55 3.95 1.45l2.4-2.4A9.6 9.6 0 0 0 12 2.4a9.6 9.6 0 1 0 0 19.2c5.5 0 9.4-3.9 9.4-9.4 0-.38-.02-.73-.05-1.1Z"
      />
    </svg>
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
      className={cn(
        'underline decoration-[1.5px] underline-offset-4 hover:decoration-flame',
        strong && 'font-semibold',
      )}
    >
      {children}
    </button>
  );
}

function LocalMode({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="mt-8 flex flex-col gap-5">
      <p className="text-[14px] leading-[1.6]">
        Accounts are off in this build. Your projects stay on this device.
      </p>
      <button type="button" className={btn('ink', 'lg', false, 'w-full')} onClick={onContinue}>
        Continue
      </button>
    </div>
  );
}
