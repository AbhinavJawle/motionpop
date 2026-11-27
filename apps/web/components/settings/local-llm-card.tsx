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
  ChevronDown,
  Copy,
  Pause,
  Play,
  RefreshCw,
  Server,
  ShieldCheck,
  Terminal,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
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
type GuideOs = 'windows' | 'macos' | 'linux';
const OS_LIST: { id: GuideOs; label: string }[] = [
  { id: 'windows', label: 'Windows' },
  { id: 'macos', label: 'macOS' },
  { id: 'linux', label: 'Linux' },
];
const subscribeNoop = () => () => {};
const getClientOrigin = () => window.location?.origin || '*';
const getClientIsHttps = () => window.location?.protocol === 'https:';
const getClientOs = (): GuideOs => {
  if (typeof navigator === 'undefined') return 'windows';
  const ua = `${navigator.userAgent ?? ''} ${navigator.platform ?? ''}`.toLowerCase();
  if (ua.includes('win')) return 'windows';
  if (ua.includes('mac')) return 'macos';
  if (ua.includes('linux')) return 'linux';
  return 'windows';
};

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

function CommandBlock({
  command,
  copied,
  copyLabel,
  onCopy,
  page,
}: {
  command: string;
  copied: boolean;
  copyLabel: string;
  onCopy: () => void;
  page: boolean;
}) {
  return (
    <div
      className={cn(
        'mt-1 flex items-start justify-between gap-2 rounded-md px-2 py-1.5',
        page ? 'bg-black/8' : 'bg-black/25',
      )}
    >
      <code className="min-w-0 flex-1 break-all font-mono text-[10px] leading-[15px]">
        {command}
      </code>
      <CopyCommandButton copied={copied} label={copyLabel} onCopy={onCopy} />
    </div>
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
  const [guideOpen, setGuideOpen] = useState(false);
  const [selectedOs, setSelectedOs] = useState<GuideOs | null>(null);
  const [models, setModels] = useState<LocalLlmModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>({ kind: 'idle' });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const originHint = useSyncExternalStore(subscribeNoop, getClientOrigin, () => '*');
  const isHttpsOrigin = useSyncExternalStore(subscribeNoop, getClientIsHttps, () => false);
  const detectedOs = useSyncExternalStore(subscribeNoop, getClientOs, () => 'windows' as GuideOs);
  const guideOs = selectedOs ?? detectedOs;
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

  const ollamaPullCmd = 'ollama pull qwen3:8b';
  const ollamaCorsCmd = `OLLAMA_ORIGINS="${originHint}" OLLAMA_CONTEXT_LENGTH=16384 ollama serve`;
  const ollamaMacPermanentCmd = `launchctl setenv OLLAMA_ORIGINS "${originHint}" && launchctl setenv OLLAMA_CONTEXT_LENGTH 16384`;
  const ollamaWinCorsCmd = `$env:OLLAMA_ORIGINS="${originHint}"; $env:OLLAMA_CONTEXT_LENGTH="16384"; ollama serve`;
  const ollamaWinPermanentCmd = `[System.Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "${originHint}", "User"); [System.Environment]::SetEnvironmentVariable("OLLAMA_CONTEXT_LENGTH", "16384", "User")`;
  const ollamaWinCmdPromptCmd = `set OLLAMA_ORIGINS=${originHint}&& set OLLAMA_CONTEXT_LENGTH=16384&& ollama serve`;
  const ollamaLinuxSystemdCmd = `Environment="OLLAMA_ORIGINS=${originHint}"\nEnvironment="OLLAMA_CONTEXT_LENGTH=16384"`;

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

      {/* Collapsible step-by-step setup guide tailored to selected runtime */}
      <div
        data-testid="local-llm-connect-guide"
        className={cn(
          'mt-3 rounded-lg text-[11px] leading-[16px]',
          page
            ? 'border border-ink/25 bg-paper/80 text-ink'
            : 'border border-white/8 bg-card/70 text-text-2',
        )}
      >
        <button
          type="button"
          onClick={() => setGuideOpen((o) => !o)}
          aria-expanded={guideOpen}
          aria-controls="local-llm-connect-guide-panel"
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left font-semibold hover:opacity-85"
        >
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Terminal className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />
            <span>How to connect {LOCAL_LLM_PRESETS[preset].label}</span>
            <span className="font-normal opacity-65">· Step-by-step guide</span>
          </span>
          <ChevronDown
            className={cn('size-3.5 shrink-0 transition-transform', guideOpen && 'rotate-180')}
            strokeWidth={2}
            aria-hidden
          />
        </button>

        {guideOpen && (
          <div
            id="local-llm-connect-guide-panel"
            className={cn(
              'space-y-2.5 border-t px-3 py-2.5',
              page ? 'border-ink/15' : 'border-white/8',
            )}
          >
            {preset === 'ollama' && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[10px] font-medium uppercase tracking-wide opacity-70">
                    Choose your OS
                  </span>
                  <div className="flex gap-1" role="group" aria-label="Operating system">
                    {OS_LIST.map((os) => {
                      const active = guideOs === os.id;
                      return (
                        <button
                          key={os.id}
                          type="button"
                          onClick={() => setSelectedOs(os.id)}
                          aria-pressed={active}
                          className={cn(
                            'rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
                            active
                              ? page
                                ? 'border border-ink bg-ink text-paper'
                                : 'border border-violet/60 bg-violet-sel text-violet-ink'
                              : page
                                ? 'border border-ink/25 bg-paper text-ink hover:bg-mist'
                                : 'border border-white/12 bg-card text-text-2 hover:text-text',
                          )}
                        >
                          {os.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <ol className="list-decimal space-y-2.5 pl-4">
                  <li>
                    <p>
                      <strong>Install Ollama &amp; download a model</strong> (once): install from{' '}
                      <a
                        href="https://ollama.com/download"
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-2 hover:opacity-80"
                      >
                        ollama.com
                      </a>
                      , then open{' '}
                      <strong>{guideOs === 'windows' ? 'PowerShell' : 'Terminal'}</strong> and run:
                    </p>
                    <CommandBlock
                      command={ollamaPullCmd}
                      copied={copiedId === 'pull'}
                      copyLabel="Copy Ollama pull command"
                      onCopy={() => copyCommand('pull', ollamaPullCmd)}
                      page={page}
                    />
                    <p className="mt-1 text-[10px] opacity-75">
                      8B+ chat models (like <code className="font-mono">qwen3:8b</code> or{' '}
                      <code className="font-mono">gemma3:12b</code>) produce the best motion
                      graphics.
                    </p>
                  </li>

                  {guideOs === 'windows' && (
                    <>
                      <li>
                        <p>
                          <strong>Quit the Ollama tray app first:</strong> look in your Windows
                          system tray (bottom-right taskbar, near the clock), right-click the
                          Ollama llama icon, and click <strong>Quit Ollama</strong>.{' '}
                          <span className="opacity-75">
                            (If you skip this, port 11434 will already be in use.)
                          </span>
                        </p>
                      </li>
                      <li>
                        <p>
                          <strong>Start Ollama with browser access (CORS)</strong> in{' '}
                          <strong>PowerShell</strong> (keep this window open while using Motionpop):
                        </p>
                        <CommandBlock
                          command={ollamaWinCorsCmd}
                          copied={copiedId === 'win-ps'}
                          copyLabel="Copy Windows PowerShell command"
                          onCopy={() => copyCommand('win-ps', ollamaWinCorsCmd)}
                          page={page}
                        />
                        <div className="mt-2 space-y-1.5 rounded-md border border-current/15 p-2">
                          <p className="font-medium">
                            Want it permanent so the Ollama tray app always works?
                          </p>
                          <p className="text-[10px] opacity-80">
                            Run this once in PowerShell, then quit &amp; reopen the Ollama app from
                            the Start menu:
                          </p>
                          <CommandBlock
                            command={ollamaWinPermanentCmd}
                            copied={copiedId === 'win-perm'}
                            copyLabel="Copy Windows permanent setup command"
                            onCopy={() => copyCommand('win-perm', ollamaWinPermanentCmd)}
                            page={page}
                          />
                          <p className="pt-1 text-[10px] opacity-75">
                            Using Command Prompt (<code className="font-mono">cmd.exe</code>)
                            instead of PowerShell?
                          </p>
                          <CommandBlock
                            command={ollamaWinCmdPromptCmd}
                            copied={copiedId === 'win-cmd'}
                            copyLabel="Copy Windows Command Prompt command"
                            onCopy={() => copyCommand('win-cmd', ollamaWinCmdPromptCmd)}
                            page={page}
                          />
                        </div>
                      </li>
                    </>
                  )}

                  {guideOs === 'macos' && (
                    <>
                      <li>
                        <p>
                          <strong>Quit the Ollama menu-bar app first:</strong> click the llama icon
                          in your macOS menu bar and choose <strong>Quit Ollama</strong> so port{' '}
                          <code className="font-mono">11434</code> is free.
                        </p>
                      </li>
                      <li>
                        <p>
                          <strong>Start Ollama with browser access (CORS)</strong> in{' '}
                          <strong>Terminal</strong> (keep this window open while using Motionpop):
                        </p>
                        <CommandBlock
                          command={ollamaCorsCmd}
                          copied={copiedId === 'mac-term'}
                          copyLabel="Copy macOS Terminal command"
                          onCopy={() => copyCommand('mac-term', ollamaCorsCmd)}
                          page={page}
                        />
                        <div className="mt-2 space-y-1.5 rounded-md border border-current/15 p-2">
                          <p className="font-medium">
                            Or make it work with the macOS Ollama menu-bar app:
                          </p>
                          <p className="text-[10px] opacity-80">
                            Run once in Terminal, then quit &amp; reopen the Ollama app from
                            Applications:
                          </p>
                          <CommandBlock
                            command={ollamaMacPermanentCmd}
                            copied={copiedId === 'mac-perm'}
                            copyLabel="Copy macOS launchctl command"
                            onCopy={() => copyCommand('mac-perm', ollamaMacPermanentCmd)}
                            page={page}
                          />
                        </div>
                      </li>
                    </>
                  )}

                  {guideOs === 'linux' && (
                    <>
                      <li>
                        <p>
                          <strong>Stop any background Ollama service</strong> if installed via
                          systemd (<code className="font-mono">sudo systemctl stop ollama</code>),
                          then start Ollama with browser access (CORS):
                        </p>
                        <CommandBlock
                          command={ollamaCorsCmd}
                          copied={copiedId === 'linux-term'}
                          copyLabel="Copy Linux command"
                          onCopy={() => copyCommand('linux-term', ollamaCorsCmd)}
                          page={page}
                        />
                        <p className="mt-1.5 text-[10px] opacity-80">
                          To keep it permanent under systemd, run{' '}
                          <code className="font-mono">sudo systemctl edit ollama.service</code>, add
                          these lines under <code className="font-mono">[Service]</code>, then run{' '}
                          <code className="font-mono">
                            sudo systemctl daemon-reload &amp;&amp; sudo systemctl restart ollama
                          </code>
                          :
                        </p>
                        <CommandBlock
                          command={ollamaLinuxSystemdCmd}
                          copied={copiedId === 'linux-systemd'}
                          copyLabel="Copy Linux systemd lines"
                          onCopy={() => copyCommand('linux-systemd', ollamaLinuxSystemdCmd)}
                          page={page}
                        />
                      </li>
                    </>
                  )}

                  <li>
                    <p>
                      <strong>Connect below:</strong> leave the URL as{' '}
                      <code className="font-mono">http://localhost:11434/v1</code>, click{' '}
                      <strong>Detect models</strong>, pick your model, and click{' '}
                      <strong>Save &amp; enable</strong>.
                      {isHttpsOrigin && (
                        <>
                          {' '}
                          If Chrome asks to allow access to your local network (
                          <code className="font-mono">localhost</code>), click{' '}
                          <strong>Allow</strong>.
                        </>
                      )}
                    </p>
                  </li>
                </ol>
              </>
            )}

            {preset === 'lmstudio' && (
              <ol className="list-decimal space-y-2 pl-4">
                <li>
                  <strong>Install LM Studio &amp; download a model:</strong> get LM Studio from{' '}
                  <a
                    href="https://lmstudio.ai"
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2 hover:opacity-80"
                  >
                    lmstudio.ai
                  </a>
                  , open the <strong>Discover</strong> (magnifying glass) tab, and download a chat
                  model (8B+ like <strong>Qwen3 8B</strong> or <strong>Gemma 3 12B</strong> works
                  best).
                </li>
                <li>
                  <strong>Load the model into memory:</strong> click{' '}
                  <strong>Select a model to load</strong> in the top bar and pick your model.{' '}
                  <span className="opacity-80">
                    (Tip: set <strong>Context Length</strong> to at least{' '}
                    <code className="font-mono">16384</code> in the load settings so full timelines
                    fit.)
                  </span>
                </li>
                <li>
                  <strong>Turn on CORS &amp; start the server:</strong> open the{' '}
                  <strong>Developer</strong> (terminal icon) tab on the left →{' '}
                  <strong>Server Settings</strong> → switch <strong>Enable CORS</strong>{' '}
                  <strong>ON</strong> → toggle <strong>Status</strong> at the top-left to{' '}
                  <strong>Running</strong> (default port <code className="font-mono">1234</code>).
                </li>
                <li>
                  <strong>Connect below:</strong> keep the URL as{' '}
                  <code className="font-mono">http://localhost:1234/v1</code>, click{' '}
                  <strong>Detect models</strong>, pick your loaded model, and click{' '}
                  <strong>Save &amp; enable</strong>.
                  {isHttpsOrigin && (
                    <>
                      {' '}
                      If Chrome asks to allow local network access to{' '}
                      <code className="font-mono">localhost</code>, click <strong>Allow</strong>.
                    </>
                  )}
                </li>
              </ol>
            )}

            {preset === 'custom' && (
              <ol className="list-decimal space-y-2 pl-4">
                <li>
                  <strong>Start an OpenAI-compatible server:</strong> run any local server (like{' '}
                  <code className="font-mono">llama-server</code>, vLLM, or Open WebUI) that exposes{' '}
                  <code className="font-mono">/v1/models</code> and{' '}
                  <code className="font-mono">/v1/chat/completions</code>.
                </li>
                <li>
                  <strong>Enable browser access (CORS):</strong> allow origin{' '}
                  <code className="font-mono">{originHint}</code> in your server&apos;s CORS
                  settings and configure at least a <code className="font-mono">16384</code> token
                  context window when supported.
                </li>
                <li>
                  <strong>Connect below:</strong> paste your server&apos;s{' '}
                  <code className="font-mono">/v1</code> base URL (e.g.{' '}
                  <code className="font-mono">http://localhost:8080/v1</code>), add an optional
                  bearer token if required, then click <strong>Detect models</strong> and{' '}
                  <strong>Save &amp; enable</strong>.
                </li>
              </ol>
            )}
          </div>
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
                  <strong>Ollama (macOS / Linux CLI):</strong> quit the Ollama app if open, then
                  run{' '}
                  <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-[10px]">
                    {ollamaCorsCmd}
                  </code>{' '}
                  (macOS menu-bar app: run{' '}
                  <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-[10px]">
                    launchctl setenv OLLAMA_ORIGINS &quot;{originHint}&quot;
                  </code>{' '}
                  and{' '}
                  <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-[10px]">
                    launchctl setenv OLLAMA_CONTEXT_LENGTH 16384
                  </code>
                  , then quit &amp; reopen Ollama).
                </li>
                <li>
                  <strong>Ollama (Windows PowerShell):</strong> quit Ollama from the tray, then run{' '}
                  <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-[10px]">
                    {ollamaWinCorsCmd}
                  </code>
                  .
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
