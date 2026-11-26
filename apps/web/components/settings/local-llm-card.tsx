'use client';

import {
  isLoopbackBaseUrl,
  listLocalLlmModels,
  LOCAL_LLM_PRESETS,
  type LocalLlmModelInfo,
  type LocalLlmPreset,
} from '@motionpop/ai';
import {
  Check,
  CheckCircle2,
  Copy,
  Pause,
  Play,
  RefreshCw,
  Server,
  ShieldCheck,
  Terminal,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  clearLocalLlmConfig,
  getLocalLlmConfig,
  getSavedLocalLlmApiKey,
  saveLocalLlmConfig,
  setLocalLlmEnabled,
  useLocalLlm,
} from '@/lib/ai/local-llm';
import { cn } from '@/lib/cn';
import type { SettingsVariant } from './section-card';

type Feedback =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok'; message: string }
  | { kind: 'error'; message: string; corsHint?: boolean };

const PRESET_LIST: LocalLlmPreset[] = ['ollama', 'lmstudio', 'custom'];

function CopyCommandButton({
  copied,
  label,
  onCopy,
}: {
  copied: boolean;
  label: string;
  onCopy: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={label}
      className="inline-flex shrink-0 items-center gap-1 rounded border border-current/25 px-1.5 py-0.5 text-[10px] font-medium hover:opacity-80"
    >
      {copied ? (
        <>
          <Check className="size-3" aria-hidden />
          Copied
        </>
      ) : (
        <>
          <Copy className="size-3" aria-hidden />
          Copy
        </>
      )}
    </button>
  );
}

/**
 * Local LLM server configuration (Ollama, LM Studio, or any OpenAI-compatible server) inside
 * Settings -> AI & models. Acts as a full local provider for all routed text/JSON directing &
 * editing tasks at 0 Motionpop credits — even offline.
 */
export function LocalLlmCard({ variant }: { variant: SettingsVariant }) {
  const snap = useLocalLlm();
  const [draftPreset, setDraftPreset] = useState<LocalLlmPreset | null>(null);
  const [draftBaseUrl, setDraftBaseUrl] = useState<string | null>(null);
  const [draftModel, setDraftModel] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [clearSavedKey, setClearSavedKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [models, setModels] = useState<LocalLlmModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>({ kind: 'idle' });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const reqSeqRef = useRef(0);
  const page = variant === 'page';

  const preset = draftPreset ?? snap.preset;
  const baseUrl = draftBaseUrl ?? snap.baseUrl;
  const model = draftModel ?? snap.model ?? '';

  const effectiveKey = useCallback((): string | null => {
    const typed = apiKey.trim();
    if (typed) return typed;
    if (clearSavedKey) return null;
    return getSavedLocalLlmApiKey();
  }, [apiKey, clearSavedKey]);

  const fetchModels = useCallback(async (url: string, key?: string | null) => {
    const seq = ++reqSeqRef.current;
    setLoadingModels(true);
    try {
      const res = await listLocalLlmModels(url, { apiKey: key });
      if (seq !== reqSeqRef.current) return null;
      if (res.ok) {
        setModels(res.models);
        setDraftBaseUrl(res.baseUrl);
      }
      return res;
    } finally {
      if (seq === reqSeqRef.current) setLoadingModels(false);
    }
  }, []);

  // Auto-discover installed models when a local provider is already active.
  useEffect(() => {
    if (!snap.active) return;
    const cfg = getLocalLlmConfig();
    if (!cfg) return;
    let cancelled = false;
    void listLocalLlmModels(cfg.baseUrl, { apiKey: cfg.apiKey }).then((res) => {
      if (!cancelled && res.ok) setModels(res.models);
    });
    return () => {
      cancelled = true;
    };
  }, [snap.active, snap.baseUrl]);

  const onSelectPreset = (next: LocalLlmPreset) => {
    reqSeqRef.current++;
    setLoadingModels(false);
    setDraftPreset(next);
    setDraftBaseUrl(LOCAL_LLM_PRESETS[next].defaultBaseUrl);
    setModels([]);
    setFeedback({ kind: 'idle' });
  };

  const onDetectModels = async () => {
    setFeedback({ kind: 'testing' });
    const res = await fetchModels(baseUrl, effectiveKey());
    if (!res) return;
    if (!res.ok) {
      setFeedback({
        kind: 'error',
        message: res.message,
        ...(res.corsHint ? { corsHint: true } : {}),
      });
      return;
    }
    if (res.models.length === 0) {
      setFeedback({
        kind: 'error',
        message:
          preset === 'lmstudio'
            ? `Connected to ${res.baseUrl}, but no model is loaded yet. Load a chat model in LM Studio first.`
            : `Connected to ${res.baseUrl}, but no chat models were found. Pull one first (e.g. ollama pull qwen3:8b).`,
      });
      return;
    }
    const chosen =
      model.trim() && res.models.some((m) => m.id === model.trim())
        ? model.trim()
        : (res.models[0]?.id ?? '');
    if (chosen) setDraftModel(chosen);
    setFeedback({
      kind: 'ok',
      message: `Connected to ${res.baseUrl} (${res.models.length} ${res.models.length === 1 ? 'model' : 'models'} detected). Pick a model and click Save & enable.`,
    });
  };

  const onSaveAndEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedModel = model.trim();
    const key = effectiveKey();

    setFeedback({ kind: 'testing' });
    const check = await fetchModels(baseUrl, key);
    if (!check) return;
    if (!check.ok) {
      setFeedback({
        kind: 'error',
        message: check.message,
        ...(check.corsHint ? { corsHint: true } : {}),
      });
      return;
    }

    if (check.models.length > 0 && trimmedModel && !check.models.some((m) => m.id === trimmedModel)) {
      const preview = check.models
        .slice(0, 4)
        .map((m) => m.id)
        .join(', ');
      setFeedback({
        kind: 'error',
        message: `Model "${trimmedModel}" was not found on ${check.baseUrl}. Available: ${preview}. Pick one from the dropdown or pull it first.`,
      });
      return;
    }

    const finalModel = trimmedModel || check.models[0]?.id || '';
    if (!finalModel) {
      setFeedback({
        kind: 'error',
        message:
          preset === 'lmstudio'
            ? 'No model is loaded in LM Studio. Load a chat model in LM Studio, then click Save & enable.'
            : 'No model selected. Pull a model (e.g. ollama pull qwen3:8b) or type its name.',
      });
      return;
    }

    if (check.models.length === 0 && preset !== 'custom') {
      setFeedback({
        kind: 'error',
        message:
          preset === 'lmstudio'
            ? `Connected to ${check.baseUrl}, but no model is loaded in LM Studio yet.`
            : `Connected to ${check.baseUrl}, but no models are installed yet. Run ollama pull ${finalModel} first.`,
      });
      return;
    }

    const saved = saveLocalLlmConfig({
      enabled: true,
      preset,
      baseUrl: check.baseUrl,
      model: finalModel,
      apiKey: key,
    });
    if (!saved.ok) {
      setFeedback({ kind: 'error', message: saved.message });
      return;
    }
    setDraftPreset(null);
    setDraftBaseUrl(null);
    setDraftModel(null);
    setApiKey('');
    setClearSavedKey(false);
    setFeedback({
      kind: 'ok',
      message: `Local provider active with ${finalModel}. Directing, edits & notes now run locally at 0 Motionpop credits.`,
    });
  };

  const onTogglePause = () => {
    const next = !snap.enabled;
    const ok = setLocalLlmEnabled(next);
    if (!ok) return;
    setFeedback({
      kind: 'ok',
      message: next
        ? `Resumed local provider (${snap.model}).`
        : 'Local provider paused. Switched back to your default AI provider.',
    });
  };

  const onDisconnect = () => {
    reqSeqRef.current++;
    setLoadingModels(false);
    clearLocalLlmConfig();
    setModels([]);
    setDraftPreset(null);
    setDraftBaseUrl(null);
    setDraftModel(null);
    setApiKey('');
    setClearSavedKey(false);
    setFeedback({
      kind: 'ok',
      message: 'Local server removed. Switched back to Motionpop cloud / BYOK / on-device AI.',
    });
  };

  const originHint =
    typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '*';
  const isHttpsOrigin =
    typeof window !== 'undefined' && window.location?.protocol === 'https:';
  const ollamaPullCmd = 'ollama pull qwen3:8b';
  const ollamaCorsCmd = `OLLAMA_ORIGINS="${originHint}" ollama serve`;

  const copyCommand = (id: string, cmd: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(cmd).then(() => {
        setCopiedId(id);
        setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1800);
      });
    }
  };

  const normalizedForCheck = baseUrl.trim()
    ? /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(baseUrl.trim())
      ? `http://${baseUrl.trim()}`
      : baseUrl.trim()
    : '';
  const isLoopback = normalizedForCheck ? isLoopbackBaseUrl(normalizedForCheck) : true;
  const isRemotePlainHttp =
    Boolean(normalizedForCheck) && !isLoopback && normalizedForCheck.toLowerCase().startsWith('http://');
  const hasManualModelOutsideList =
    Boolean(model.trim()) && !models.some((m) => m.id === model.trim());

  return (
    <div
      id="local-llm"
      data-testid="local-llm-section"
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
            <Server
              className={cn('size-4 shrink-0', page ? 'text-ink' : 'text-violet-ink')}
              strokeWidth={2}
              aria-hidden
            />
            <h3 className={cn('font-semibold', page ? 'text-[14px] text-ink' : 'text-[13px]')}>
              Run your own local AI (Ollama / LM Studio)
            </h3>
            <span
              data-testid="local-llm-status-badge"
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold uppercase',
                snap.active
                  ? page
                    ? 'border border-ink bg-[#3ddc97] text-ink'
                    : 'bg-mint-tint text-mint-ink'
                  : snap.model && !snap.enabled
                    ? page
                      ? 'border border-ink bg-[#fde68a] text-ink'
                      : 'bg-ember/15 text-ember-soft'
                    : page
                      ? 'border border-ink bg-paper text-black/70'
                      : 'bg-white/10 text-text-2',
              )}
            >
              {snap.active
                ? 'Active · 0 credits'
                : snap.model && !snap.enabled
                  ? 'Paused'
                  : 'Optional · Full local'}
            </span>
          </div>
          <p className="mt-1 text-xs leading-4 text-text-2">
            Use a model already downloaded on your computer to run directing, edits, frame notes,
            and motion graphics at <strong>0 Motionpop credits</strong> — private, fast, and works
            even offline.
          </p>
        </div>
      </div>

      {/* Active / Paused saved banner */}
      {snap.model && (
        <div
          className={cn(
            'mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2',
            page ? 'border-2 border-ink bg-paper' : 'bg-card',
          )}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <CheckCircle2
              className={cn(
                'size-4 shrink-0',
                snap.active
                  ? page
                    ? 'text-[#15803d]'
                    : 'text-mint-ink'
                  : 'text-text-3',
              )}
              strokeWidth={2}
              aria-hidden
            />
            <span className="font-mono text-xs font-medium" data-testid="local-llm-active-model">
              {snap.model}
            </span>
            <span className="truncate font-mono text-[11px] text-text-2">{snap.baseUrl}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" type="button" onClick={onTogglePause}>
              {snap.enabled ? (
                <>
                  <Pause className="size-3.5" strokeWidth={1.75} aria-hidden />
                  Pause
                </>
              ) : (
                <>
                  <Play className="size-3.5" strokeWidth={1.75} aria-hidden />
                  Resume
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={onDisconnect}
              aria-label="Remove local LLM server"
            >
              <Trash2 className="size-3.5" strokeWidth={1.75} aria-hidden />
              Remove
            </Button>
          </div>
        </div>
      )}

      {/* Runtime presets */}
      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Local runtime presets">
        {PRESET_LIST.map((id) => {
          const info = LOCAL_LLM_PRESETS[id];
          const selected = preset === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelectPreset(id)}
              aria-pressed={selected}
              className={cn(
                'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                selected
                  ? page
                    ? 'border-2 border-ink bg-ink text-paper'
                    : 'border border-violet/60 bg-violet-sel text-violet-ink'
                  : page
                    ? 'border-2 border-ink bg-paper text-ink hover:bg-mist'
                    : 'border border-white/12 bg-card text-text-2 hover:text-text',
              )}
            >
              {info.label}
            </button>
          );
        })}
      </div>

      {/* Concise how-to-connect steps tailored to selected runtime */}
      <div
        data-testid="local-llm-connect-guide"
        className={cn(
          'mt-3 rounded-lg px-3 py-2 text-[11px] leading-[16px]',
          page
            ? 'border border-ink/25 bg-paper/80 text-ink'
            : 'border border-white/8 bg-card/70 text-text-2',
        )}
      >
        <p className="flex items-center gap-1.5 font-semibold">
          <Terminal className="size-3 shrink-0" strokeWidth={2} aria-hidden />
          How to connect {LOCAL_LLM_PRESETS[preset].label}
        </p>
        {preset === 'ollama' && (
          <ol className="mt-1 list-decimal space-y-1 pl-4">
            <li>
              Download a model once:{' '}
              <span className="inline-flex flex-wrap items-center gap-1 align-middle">
                <code className="rounded bg-black/10 px-1.5 py-0.5 font-mono text-[10px]">
                  {ollamaPullCmd}
                </code>
                <CopyCommandButton
                  copied={copiedId === 'pull'}
                  label="Copy Ollama pull command"
                  onCopy={() => copyCommand('pull', ollamaPullCmd)}
                />
              </span>
            </li>
            <li>
              Start Ollama so your browser can reach it:{' '}
              <span className="inline-flex flex-wrap items-center gap-1 align-middle">
                <code className="rounded bg-black/10 px-1.5 py-0.5 font-mono text-[10px]">
                  {ollamaCorsCmd}
                </code>
                <CopyCommandButton
                  copied={copiedId === 'cors'}
                  label="Copy Ollama CORS command"
                  onCopy={() => copyCommand('cors', ollamaCorsCmd)}
                />
              </span>
            </li>
            <li>
              Click <strong>Detect models</strong>, pick your model, then hit{' '}
              <strong>Save &amp; enable</strong>.
            </li>
          </ol>
        )}
        {preset === 'lmstudio' && (
          <ol className="mt-1 list-decimal space-y-1 pl-4">
            <li>Download and load a chat model in LM Studio (8B+ like Qwen3 8B works best).</li>
            <li>
              Open <strong>Developer → Local Server</strong>, turn on <strong>Enable CORS</strong>,
              and start the server on port <code className="font-mono">1234</code>.
            </li>
            <li>
              Click <strong>Detect models</strong>, pick your model, then hit{' '}
              <strong>Save &amp; enable</strong>.
            </li>
          </ol>
        )}
        {preset === 'custom' && (
          <ol className="mt-1 list-decimal space-y-1 pl-4">
            <li>
              Start any local server that supports the standard OpenAI chat API (like{' '}
              <code className="font-mono">llama-server</code> or vLLM) with browser access (CORS)
              turned on.
            </li>
            <li>
              Paste its address below, click <strong>Detect models</strong>, and hit{' '}
              <strong>Save &amp; enable</strong>.
            </li>
          </ol>
        )}
      </div>

      {/* Endpoint & model form */}
      <form onSubmit={(e) => void onSaveAndEnable(e)} className="mt-3 space-y-2.5">
        <div className="flex flex-wrap gap-2">
          <div
            className={cn(
              'flex min-w-[210px] flex-1 items-center gap-1.5 rounded-lg px-2.5',
              page
                ? 'h-9 border-2 border-ink bg-paper focus-within:ring-2 focus-within:ring-flame'
                : 'h-8 border border-white/12 bg-card',
            )}
          >
            <input
              type="text"
              inputMode="url"
              value={baseUrl}
              onChange={(e) => {
                setDraftBaseUrl(e.target.value);
                if (feedback.kind !== 'idle') setFeedback({ kind: 'idle' });
              }}
              placeholder={LOCAL_LLM_PRESETS[preset].defaultBaseUrl}
              aria-label="Local LLM server URL"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent font-mono text-xs outline-none placeholder:text-text-3"
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={loadingModels || feedback.kind === 'testing'}
            onClick={() => void onDetectModels()}
          >
            <RefreshCw
              className={cn('size-3.5', loadingModels && 'animate-spin')}
              strokeWidth={2}
              aria-hidden
            />
            {loadingModels ? 'Checking…' : 'Detect models'}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {models.length > 0 ? (
            <select
              aria-label="Local LLM model"
              value={model}
              onChange={(e) => setDraftModel(e.target.value)}
              className={cn(
                'min-w-[200px] flex-1 rounded-lg px-2.5 font-mono text-xs outline-none',
                page
                  ? 'h-9 border-2 border-ink bg-paper text-ink focus:ring-2 focus:ring-flame'
                  : 'h-8 border border-white/12 bg-card text-text-1',
              )}
            >
              {hasManualModelOutsideList && <option value={model}>{model}</option>}
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.parameterSize ? `${m.id} (${m.parameterSize})` : m.id}
                </option>
              ))}
            </select>
          ) : (
            <div
              className={cn(
                'flex min-w-[200px] flex-1 items-center rounded-lg px-2.5',
                page
                  ? 'h-9 border-2 border-ink bg-paper focus-within:ring-2 focus-within:ring-flame'
                  : 'h-8 border border-white/12 bg-card',
              )}
            >
              <input
                type="text"
                value={model}
                onChange={(e) => {
                  setDraftModel(e.target.value);
                  if (feedback.kind !== 'idle') setFeedback({ kind: 'idle' });
                }}
                placeholder="Model name (e.g. qwen3:8b, gemma3:12b)"
                aria-label="Local LLM model"
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 bg-transparent font-mono text-xs outline-none placeholder:text-text-3"
              />
            </div>
          )}

          <Button type="submit" variant="ai" size="sm" disabled={feedback.kind === 'testing'}>
            {feedback.kind === 'testing'
              ? 'Connecting…'
              : snap.active
                ? 'Update local model'
                : 'Save & enable'}
          </Button>
        </div>

        {/* Optional bearer key for custom servers */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowAdvanced((s) => !s)}
            className="text-[11px] font-medium text-text-2 underline-offset-3 hover:text-text hover:underline"
          >
            {showAdvanced
              ? 'Hide optional server token'
              : snap.hasApiKey && !clearSavedKey
                ? 'Optional server token (saved)'
                : 'Add optional bearer token (for custom proxies)'}
          </button>
          {snap.hasApiKey && !clearSavedKey && (
            <button
              type="button"
              onClick={() => {
                setClearSavedKey(true);
                setApiKey('');
              }}
              className="text-[11px] font-medium text-text-2 underline-offset-3 hover:text-error hover:underline"
            >
              Clear saved token
            </button>
          )}
        </div>
        {showAdvanced && (
          <div
            className={cn(
              'flex items-center rounded-lg px-2.5',
              page
                ? 'h-8 border-2 border-ink bg-paper focus-within:ring-2 focus-within:ring-flame'
                : 'h-8 border border-white/12 bg-card',
            )}
          >
            <input
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                if (e.target.value.trim()) setClearSavedKey(false);
              }}
              placeholder={
                snap.hasApiKey && !clearSavedKey
                  ? 'Leave blank to keep saved token, or paste new…'
                  : 'Optional Authorization: Bearer token'
              }
              aria-label="Optional local server API key"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent font-mono text-xs outline-none placeholder:text-text-3"
            />
          </div>
        )}
      </form>

      {!isLoopback && baseUrl.trim().length > 0 && (
        <p className="mt-2 text-[11px] leading-[15px] text-amber-700 dark:text-amber-300">
          {isRemotePlainHttp
            ? "Heads up: this address isn't on your own computer and isn't encrypted (http://). Use https:// for remote servers — we block sending access tokens over plain http://."
            : "Heads up: this address isn't on your own computer — only connect to servers you run and trust."}
        </p>
      )}

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
        <div role="alert" className="mt-2.5 space-y-2">
          <p className="text-xs leading-4 font-medium text-error">{feedback.message}</p>
          {feedback.corsHint && (
            <div
              className={cn(
                'rounded-lg px-3 py-2 text-[11px] leading-[16px]',
                page
                  ? 'border border-ink bg-paper text-ink'
                  : 'border border-white/10 bg-card text-text-2',
              )}
            >
              <p className="font-semibold">Quick connection fix:</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                <li>
                  <strong>Ollama CLI:</strong> restart with{' '}
                  <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-[10px]">
                    {ollamaCorsCmd}
                  </code>{' '}
                  (macOS menu-bar app: run{' '}
                  <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-[10px]">
                    launchctl setenv OLLAMA_ORIGINS &quot;{originHint}&quot;
                  </code>{' '}
                  and quit/reopen Ollama).
                </li>
                <li>
                  <strong>LM Studio:</strong> Developer → Local Server → turn on{' '}
                  <strong>Enable CORS</strong>, load a model, and start the server.
                </li>
                {isHttpsOrigin && (
                  <li>
                    <strong>Browser prompt:</strong> If Chrome asks to allow local network access to{' '}
                    <code className="font-mono">localhost</code>, click <strong>Allow</strong>.
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-[15px] text-text-2">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
        <span>
          Your browser talks straight to your own computer — prompts never touch our servers or
          cookies. Voice generation and AI images still use credits (or your Gemini key).
        </span>
      </p>
    </div>
  );
}
