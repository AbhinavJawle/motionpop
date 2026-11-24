'use client';

import { testGeminiApiKey, type ByokModelMode } from '@motionpop/ai';
import {
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { clearByokKey, getByokKey, setByokKey, setByokModelMode, useByok } from '@/lib/ai/byok';
import { cn } from '@/lib/cn';
import type { SettingsVariant } from './section-card';

export const AI_STUDIO_KEY_URL = 'https://aistudio.google.com/apikey';

type Feedback =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok'; message: string }
  | { kind: 'error'; message: string };

/**
 * Bring Your Own Key (Google AI Studio Gemini API key) configuration inside Settings -> AI & models
 * (Spec 42). Stored strictly in browser `localStorage`, sent directly to Google via
 * `x-goog-api-key` header, never persisted to Motionpop servers or Firestore.
 */
export function ByokCard({ variant }: { variant: SettingsVariant }) {
  const { active, maskedKey, modelMode } = useByok();
  const [draft, setDraft] = useState('');
  const [reveal, setReveal] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>({ kind: 'idle' });
  const page = variant === 'page';

  const onSaveAndTest = async (e: React.FormEvent) => {
    e.preventDefault();
    const candidate = draft.trim();
    if (!candidate) {
      setFeedback({ kind: 'error', message: 'Paste your Google AI Studio Gemini API key first.' });
      return;
    }
    setFeedback({ kind: 'testing' });
    const test = await testGeminiApiKey(candidate);
    if (!test.ok) {
      setFeedback({ kind: 'error', message: test.message });
      return;
    }
    const saved = setByokKey(candidate);
    if (!saved.ok) {
      setFeedback({ kind: 'error', message: saved.message });
      return;
    }
    setDraft('');
    setReveal(false);
    setFeedback({
      kind: 'ok',
      message: 'Verified & saved in this browser. Cloud Gemini runs now cost 0 Motionpop credits.',
    });
  };

  const onTestSaved = async () => {
    const key = getByokKey();
    if (!key) return;
    setFeedback({ kind: 'testing' });
    const res = await testGeminiApiKey(key);
    setFeedback(
      res.ok
        ? { kind: 'ok', message: 'Key verified with Google AI Studio.' }
        : { kind: 'error', message: res.message },
    );
  };

  const onRemove = () => {
    clearByokKey();
    setDraft('');
    setReveal(false);
    setFeedback({
      kind: 'ok',
      message: 'Key removed. Switched back to Motionpop cloud credits & on-device AI.',
    });
  };

  const onModeChange = (next: ByokModelMode) => {
    setByokModelMode(next);
  };

  return (
    <div
      id="byok"
      data-testid="byok-section"
      className={cn(
        'scroll-mt-24 rounded-xl',
        page
          ? 'border-2 border-ink bg-mist/60 p-4 shadow-[3px_3px_0_#000]'
          : 'border border-white/10 bg-card-2 p-3.5',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <KeyRound
              className={cn('size-4 shrink-0', page ? 'text-ink' : 'text-violet-ink')}
              strokeWidth={2}
              aria-hidden
            />
            <h3 className={cn('font-semibold', page ? 'text-[14px] text-ink' : 'text-[13px]')}>
              Bring your own Gemini API key (BYOK)
            </h3>
            <span
              data-testid="byok-status-badge"
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold uppercase',
                active
                  ? page
                    ? 'border border-ink bg-[#3ddc97] text-ink'
                    : 'bg-mint-tint text-mint-ink'
                  : page
                    ? 'border border-ink bg-paper text-black/70'
                    : 'bg-white/10 text-text-2',
              )}
            >
              {active ? 'Active · 0 credits' : 'Optional · Browser-only'}
            </span>
          </div>
          <p className="mt-1 text-xs leading-4 text-text-2">
            Use your own Google AI Studio key to run cloud directing, generation, voices &amp; art
            at <strong>0 Motionpop credits</strong>. On-device Gemini Nano still runs first when
            ready.
          </p>
        </div>

        <a
          href={AI_STUDIO_KEY_URL}
          target="_blank"
          rel="noreferrer"
          className={cn(
            'inline-flex shrink-0 items-center gap-1 text-[11px] font-medium hover:underline',
            page ? 'text-ink underline decoration-[1.5px] underline-offset-4' : 'text-violet',
          )}
        >
          Get a key in AI Studio
          <ExternalLink className="size-3" strokeWidth={2} aria-hidden />
        </a>
      </div>

      {active && maskedKey && (
        <div
          className={cn(
            'mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2',
            page ? 'border-2 border-ink bg-paper' : 'bg-card',
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            <CheckCircle2
              className={cn('size-4 shrink-0', page ? 'text-[#15803d]' : 'text-mint-ink')}
              strokeWidth={2}
              aria-hidden
            />
            <span className="font-mono text-xs" data-testid="byok-masked-key">
              {maskedKey}
            </span>
            <span className="text-[11px] text-text-2">saved in this browser</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              disabled={feedback.kind === 'testing'}
              onClick={() => void onTestSaved()}
            >
              {feedback.kind === 'testing' ? 'Testing…' : 'Test key'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={onRemove}
              aria-label="Remove Gemini API key"
            >
              <Trash2 className="size-3.5" strokeWidth={1.75} aria-hidden />
              Remove
            </Button>
          </div>
        </div>
      )}

      <form onSubmit={(e) => void onSaveAndTest(e)} className="mt-3 flex flex-wrap gap-2">
        <div
          className={cn(
            'flex min-w-[210px] flex-1 items-center gap-1.5 rounded-lg px-2.5',
            page
              ? 'h-9 border-2 border-ink bg-paper focus-within:ring-2 focus-within:ring-flame'
              : 'h-8 border border-white/12 bg-card',
          )}
        >
          <input
            type={reveal ? 'text' : 'password'}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (feedback.kind !== 'idle') setFeedback({ kind: 'idle' });
            }}
            placeholder={active ? 'Paste a new key to replace…' : 'AIzaSy…'}
            aria-label="Gemini API key"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent font-mono text-xs outline-none placeholder:text-text-3"
          />
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? 'Hide API key' : 'Show API key'}
            className="p-1 text-text-2 hover:text-text"
          >
            {reveal ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
        </div>
        <Button type="submit" variant="ai" size="sm" disabled={feedback.kind === 'testing'}>
          {feedback.kind === 'testing' ? 'Verifying…' : active ? 'Replace key' : 'Save & test key'}
        </Button>
      </form>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-text-2">BYOK model preset</span>
        <div
          role="radiogroup"
          aria-label="BYOK Gemini model preset"
          className="inline-flex gap-1.5"
        >
          {(
            [
              ['balanced', 'Balanced (2.5 Pro + Flash)'],
              ['flash', 'Fast / Free tier (2.5 Flash)'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={modelMode === id}
              onClick={() => onModeChange(id)}
              className={cn(
                'rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                page
                  ? modelMode === id
                    ? 'border-2 border-ink bg-ink text-paper'
                    : 'border-2 border-ink bg-paper text-ink hover:bg-mist'
                  : modelMode === id
                    ? 'bg-violet-sel text-violet-ink'
                    : 'bg-card text-text-2 hover:text-text',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {feedback.kind === 'ok' && (
        <p
          role="status"
          className={cn(
            'mt-2.5 text-xs leading-4 font-medium',
            page ? 'text-[#15803d]' : 'text-mint-ink',
          )}
        >
          {feedback.message}
        </p>
      )}
      {feedback.kind === 'error' && (
        <p role="alert" className="mt-2.5 text-xs leading-4 font-medium text-error">
          {feedback.message}
        </p>
      )}

      <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-[15px] text-text-2">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
        <span>
          Stored only in this browser&apos;s <code className="font-mono">localStorage</code> and
          sent straight to Google AI Studio via the{' '}
          <code className="font-mono">x-goog-api-key</code> header — never sent to Motionpop servers
          or Firestore. Lyria 2 soundtracks &amp; Cloud Run MP4 exports remain on Motionpop servers
          (free).
        </span>
      </p>
    </div>
  );
}
