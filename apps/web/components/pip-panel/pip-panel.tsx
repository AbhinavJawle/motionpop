'use client';

import {
  PIP_MODEL_CHOICES,
  costOf,
  type PipModelId,
  type PipPlan,
  type PipScope,
} from '@motionpop/schemas';
import {
  ArrowUp,
  Check,
  ChevronDown,
  Cloud,
  Plus,
  Sparkles,
  Zap,
} from 'lucide-react';
import { AnimatePresence, motion, type Transition } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { toast } from 'sonner';
import { btn } from '@/components/paper/kit';
import { PipOrb, type OrbMood } from './pip-orb';
import { LeftPanel } from '@/components/editor/left-panel';
import { Tooltip } from '@/components/ui/tooltip';
import { useRoute } from '@/lib/ai/use-route';
import { getRouter } from '@/lib/ai/router-client';
import { cn } from '@/lib/cn';
import { useCreditsClient } from '@/lib/credits/use-credits-client';
import { closeSettingsPanel, useSettingsPanel } from '@/lib/editor/settings-panel';
import { slotCardText } from '@/lib/editor/slot-display';
import { popIn } from '@/lib/motion/presets';
import { useStill } from '@/lib/motion/use-still';
import { chipsFor, planCredits } from '@/lib/pip/plan';
import { pipModelLabel, usePipModel } from '@/lib/pip/model-store';
import {
  applyPipPlan,
  chipToPip,
  newConversation,
  sendToPip,
  syncPipProject,
  toggleStep,
  undoPipPlan,
  usePip,
  type PipEntry,
} from '@/lib/pip/use-pip';
import { makeReelMusic } from '@/lib/reel/pip-music';
import { regenerateReel } from '@/lib/reel/regenerate';
import { useReelNoteFix } from '@/lib/reel/use-reel-note-fix';
import { useAppConfig } from '@/lib/renders/hooks';
import { editorStore, useEditor } from '@/lib/stores/editor';

/**
 * The Pip panel (spec 10; design/screens/pip-empty.png and pip-conversation.png): whole-video
 * requests come back as plans of closed steps with Apply all (one undo) and Undo. Suggestion chips
 * are built in code (free); typed requests go to the cloud (☁ 2) or, without it, the code planner.
 */
export function PipPanel() {
  const open = usePip((s) => s.open);
  const settingsOpen = useSettingsPanel((s) => s.open);
  const projectId = useEditor((s) => s.project?.id ?? null);
  useEffect(() => syncPipProject(projectId), [projectId]);
  // Settings and Pip share the left panel: opening one closes the other.
  useEffect(() => {
    if (settingsOpen) usePip.getState().setOpen(false);
  }, [settingsOpen]);
  useEffect(() => {
    if (open) closeSettingsPanel();
  }, [open]);

  return (
    <LeftPanel
      open={open && !settingsOpen}
      label="Pip"
      onClose={() => usePip.getState().setOpen(false)}
    >
      <PipPanelBody />
    </LeftPanel>
  );
}

function PipPanelBody() {
  const messages = usePip((s) => s.messages);
  const busy = usePip((s) => s.busy);
  const project = useEditor((s) => s.project);
  const selected = useEditor(
    (s) => s.project?.slots.find((x) => x.id === s.selectedSlotId) ?? null,
  );
  const [scopeSlot, setScopeSlot] = useState(false);
  const [typing, setTyping] = useState(false);
  const scope: PipScope =
    scopeSlot && selected ? { kind: 'slot', slotId: selected.id } : { kind: 'video' };
  const route = useRoute('pip.plan');
  const editRoute = useRoute('edit.patch');
  const generateRoute = useRoute('generate');
  const { client: credits } = useCreditsClient();
  const config = useAppConfig();
  const reelNoteFix = useReelNoteFix();
  const scroller = useRef<HTMLDivElement>(null);
  const chips = useMemo(() => (project ? chipsFor(project) : []), [project]);
  const selectedIndex = useEditor((s) => {
    if (!s.project || !selected) return 0;
    return (
      [...s.project.slots]
        .sort((a, b) => a.startMs - b.startMs)
        .findIndex((x) => x.id === selected.id) + 1
    );
  });

  useEffect(() => {
    // An empty thread starts at the top, where the glowing Pip is.
    if (!messages.length) return;
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const selectedModel = usePipModel((s) => s.model);
  const setSelectedModel = usePipModel((s) => s.setModel);

  const send = (text: string) =>
    void sendToPip(
      {
        store: editorStore,
        credits,
        getRouter,
        route,
        deviceRoute: editRoute,
        config,
        model: selectedModel,
      },
      text,
      scope,
    );
  const apply = (id: string) =>
    void applyPipPlan(
      {
        store: editorStore,
        credits,
        getRouter,
        config,
        doc: document,
        editRoute,
        generateRoute,
        // Video reels (spec 37): try on-device Nano free first; auto-escalate to cloud since
        // the Pip plan card already quoted the edit credit.
        reelNote: (sceneId, noteId) =>
          reelNoteFix.run(sceneId, noteId, reelNoteFix.route, { autoEscalate: true }),
        regenerateReel: () => regenerateReel({ credits }),
        reelMusic: (brief) => makeReelMusic(editorStore, brief),
      },
      id,
    );

  const mood = useOrbMood(busy, typing, messages);
  const summary = project ? projectSummary(project) : '';
  // Spec 38 R9: Pip is always in sight. Big in an empty chat; once you talk (or the big one
  // scrolls away) it moves into the header, small.
  const [bigInView, setBigInView] = useState(true);
  const compact = messages.length > 0 || !bigInView;
  const still = useStill();
  const orbMove = still
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 240, damping: 28 };

  return (
    <div className="flex h-full flex-col bg-paper px-4 pb-4 font-mono">
      <header className="-mx-4 flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
        <button
          type="button"
          className="-ml-1 flex h-9 items-center gap-2 rounded-md pr-1.5 transition-colors hover:bg-mist"
          onClick={() => {
            if (messages.length) newConversation();
          }}
          title="New conversation"
        >
          <AnimatePresence initial={false}>
            {compact && (
              <motion.span
                key="orb-small"
                layoutId={messages.length > 0 ? 'pip-orb' : undefined}
                transition={orbMove}
                initial={messages.length > 0 ? false : { opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                className="block"
              >
                <PipOrb mood={mood} size={38} />
              </motion.span>
            )}
          </AnimatePresence>
          <span className="relative top-[1px] font-poster text-[26px] leading-none tracking-[0.02em] text-ink">
            Pip
          </span>
          <ChevronDown className="size-3.5 text-text-3" strokeWidth={2} aria-hidden />
        </button>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="h-8 rounded-lg px-2.5 text-[12px] leading-4 text-text-2 transition-colors hover:bg-mist hover:text-ink"
            onClick={() => send('Make the whole video use one consistent look')}
          >
            Style
          </button>
          <Tooltip content="New conversation" side="bottom">
            <button
              type="button"
              aria-label="New conversation"
              onClick={newConversation}
              className="flex size-8 items-center justify-center rounded-lg border-[1.5px] border-edge text-ink transition hover:-translate-y-px hover:shadow-[2px_2px_0_var(--color-hard)]"
            >
              <Plus className="size-4" strokeWidth={2} aria-hidden />
            </button>
          </Tooltip>
        </div>
      </header>

      <div ref={scroller} className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pt-3">
        {messages.length === 0 ? (
          <EmptyState
            mood={mood}
            orbMove={orbMove}
            scroller={scroller}
            onOrbInView={setBigInView}
            summary={summary}
            chips={chips}
            onChip={(id, label) => chipToPip(editorStore, id, label, scope)}
          />
        ) : (
          <div className="flex flex-col gap-4 pb-2">
            {messages.map((m) => (
              <Message key={m.id} m={m} onApply={apply} />
            ))}
            {busy && (
              <div
                role="status"
                className="flex items-center gap-2 font-scrawl text-[19px] leading-6 text-ink"
              >
                <PipOrb mood="thinking" size={28} />
                Pip is thinking…
              </div>
            )}
          </div>
        )}
      </div>

      {/* The scope only needs a choice when a graphic is selected. */}
      {messages.length === 0 && selected && (
        <div className="mt-3 flex shrink-0 gap-1.5">
          <ScopeChip active={!scopeSlot || !selected} onClick={() => setScopeSlot(false)}>
            Whole video
          </ScopeChip>
          {selected && (
            <ScopeChip active={scopeSlot} onClick={() => setScopeSlot(true)}>
              @Slot {selectedIndex} · {slotCardText(selected).title}
            </ScopeChip>
          )}
        </div>
      )}
      <Composer
        busy={busy}
        model={selectedModel}
        onModelChange={setSelectedModel}
        onSend={send}
        onTyping={setTyping}
      />
      <p className="mt-2.5 flex shrink-0 items-center justify-center gap-1 text-[11px] leading-[14px]">
        {editRoute.kind === 'device' && route.kind === 'cloud' ? (
          <span className="flex items-center gap-1 text-mint-ink">
            <Zap className="size-3" strokeWidth={1.75} aria-hidden />
            free · on-device first
            <span className="text-text-3">· ☁ ~{route.credits} complex</span>
          </span>
        ) : editRoute.kind === 'device' ? (
          <span className="flex items-center gap-1 text-mint-ink">
            <Zap className="size-3" strokeWidth={1.75} aria-hidden />
            free · on-device
          </span>
        ) : route.kind === 'cloud' ? (
          <span className="flex items-center gap-1 text-text-2">
            <Cloud className="size-3" strokeWidth={1.75} aria-hidden />~{route.credits} credits
          </span>
        ) : (
          <span className="flex items-center gap-1 text-mint-ink">
            <Zap className="size-3" strokeWidth={1.75} aria-hidden />
            free · quick planner
          </span>
        )}
      </p>
    </div>
  );
}

/** "I can see your 0:18 video and its 3 graphics.": what Pip can see. */
function projectSummary(
  p: NonNullable<ReturnType<typeof editorStore.getState>['project']>,
): string {
  const ms = p.voiceover.durationMs;
  const clock = `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}`;
  const scenes = p.reel?.scenes.filter((s) => s.content.template !== 'none').length;
  const n = scenes ?? p.slots.length;
  const noun = scenes !== undefined ? 'scene' : 'graphic';
  if (n === 0) return `I can see your ${clock} video. No ${noun}s on it yet.`;
  return `I can see your ${clock} video and its ${n === 1 ? `one ${noun}` : `${n} ${noun}s`}.`;
}

/**
 * The orb's mood (spec 38 R2.3): thinking while a plan is made, listening while you type, done for
 * a moment after a plan lands, idle otherwise.
 */
function useOrbMood(busy: boolean, typing: boolean, messages: PipEntry[]): OrbMood {
  const applied = messages.filter((m) => m.planState === 'applied').length;
  const seen = useRef(applied);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (applied > seen.current) {
      setDone(true);
      const t = window.setTimeout(() => setDone(false), 2400);
      seen.current = applied;
      return () => window.clearTimeout(t);
    }
    seen.current = applied;
  }, [applied]);
  if (busy) return 'thinking';
  if (done) return 'done';
  if (typing) return 'listening';
  return 'idle';
}

function EmptyState({
  mood,
  orbMove,
  scroller,
  onOrbInView,
  summary,
  chips,
  onChip,
}: {
  mood: OrbMood;
  orbMove: Transition;
  scroller: RefObject<HTMLDivElement | null>;
  onOrbInView: (inView: boolean) => void;
  summary: string;
  chips: ReturnType<typeof chipsFor>;
  onChip: (id: ReturnType<typeof chipsFor>[number]['id'], label: string) => void;
}) {
  const orb = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = orb.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => onOrbInView(Boolean(e?.isIntersecting)), {
      root: scroller.current,
      threshold: 0.4,
    });
    io.observe(el);
    return () => {
      io.disconnect();
      onOrbInView(true);
    };
  }, [scroller, onOrbInView]);
  return (
    <div className="flex min-h-full flex-col items-center justify-center pb-2 text-center">
      <motion.div ref={orb} layoutId="pip-orb" transition={orbMove}>
        <PipOrb mood={mood} size={150} />
      </motion.div>
      <h2 className="mt-1 font-poster text-[30px] leading-[0.95] tracking-[0.01em] text-ink uppercase">
        What should we change?
      </h2>
      <p className="mt-1.5 max-w-[280px] text-[12px] leading-[18px] text-text-2">
        {summary || 'I can see your whole video.'}
      </p>
      <div className="mt-3.5 flex w-full flex-wrap justify-center gap-1.5">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onChip(c.id, c.label)}
            className="max-w-full truncate rounded-full border-[1.5px] border-edge bg-paper px-3 py-[5px] text-[11.5px] leading-4 text-ink transition hover:-translate-x-px hover:-translate-y-px hover:bg-mist hover:shadow-[3px_3px_0_var(--color-hard)] active:translate-x-0 active:translate-y-0 active:shadow-none"
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ScopeChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'h-7 min-w-0 truncate rounded-md px-2.5 text-[11px] leading-[14px] font-medium transition-colors',
        active
          ? 'bg-tile text-tile-ink'
          : 'text-text-2 ring-1 ring-line hover:bg-mist hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

function Composer({
  busy,
  model,
  onModelChange,
  onSend,
  onTyping,
}: {
  busy: boolean;
  model: PipModelId;
  onModelChange: (m: PipModelId) => void;
  onSend: (t: string) => void;
  onTyping: (typing: boolean) => void;
}) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const submit = () => {
    if (!text.trim() || busy) return;
    onSend(text);
    setText('');
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(120, el.scrollHeight)}px`;
  }, [text]);
  useEffect(() => onTyping(text.trim().length > 0), [text, onTyping]);
  return (
    <div className="mt-3 shrink-0 rounded-[12px] border-2 border-edge bg-paper px-3 pt-3 pb-2 shadow-[4px_4px_0_var(--color-hard)] transition-shadow focus-within:shadow-[5px_5px_0_var(--color-hard)]">
      <textarea
        ref={ref}
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 1000))}
        onKeyDown={onKey}
        placeholder="Ask Pip anything…"
        aria-label="Ask Pip"
        className="block min-h-[40px] w-full resize-none bg-transparent font-mono text-[13px] leading-[19px] text-ink outline-none placeholder:text-text-3"
      />
      <div className="mt-2 flex items-center gap-2.5 text-text-3">
        <label className="relative flex h-7 min-w-0 items-center gap-1 rounded-md px-1.5 text-[11px] text-text-2 transition-colors hover:bg-mist hover:text-ink">
          <Sparkles className="size-3 shrink-0 text-violet" strokeWidth={1.75} aria-hidden />
          <select
            aria-label="Pip AI model"
            data-testid="pip-model-select"
            value={model}
            disabled={busy}
            onChange={(e) => onModelChange(e.target.value as PipModelId)}
            className="max-w-[132px] cursor-pointer truncate bg-transparent pr-1 font-mono text-[11px] font-medium text-text-2 outline-none"
          >
            {PIP_MODEL_CHOICES.map((choice) => (
              <option key={choice.id} value={choice.id} className="bg-paper text-ink">
                {choice.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          aria-label="Send"
          disabled={!text.trim() || busy}
          onClick={submit}
          className="ml-auto flex size-8 shrink-0 items-center justify-center rounded-full border-[1.5px] border-black bg-flame text-black shadow-[2px_2px_0_var(--color-hard)] transition hover:-translate-x-px hover:-translate-y-px hover:shadow-[3px_3px_0_var(--color-hard)] disabled:border-line disabled:bg-mist disabled:text-text-4 disabled:shadow-none disabled:hover:translate-0"
        >
          <ArrowUp className="size-4" strokeWidth={2.25} aria-hidden />
        </button>
      </div>
    </div>
  );
}

function Message({ m, onApply }: { m: PipEntry; onApply: (id: string) => void }) {
  if (m.role === 'user') {
    return (
      <motion.div
        {...popIn}
        className="ml-8 self-end rounded-[12px] rounded-br-[4px] bg-tile px-3.5 py-2.5 text-[12.5px] leading-[18px] text-tile-ink"
      >
        {m.text}
      </motion.div>
    );
  }
  return (
    <motion.div {...popIn} className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 text-[12px] leading-4">
        <PipOrb mood={m.planState === 'applied' ? 'done' : 'idle'} size={26} />
        <span className="font-poster text-[19px] leading-none tracking-[0.02em] text-ink">Pip</span>
        {m.ranOn === 'device' ? (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-mint/20 px-1.5 py-0.5 text-[9.5px] font-medium text-mint-ink">
            <Zap className="size-2.5" strokeWidth={2} aria-hidden />
            Gemini Nano · free
          </span>
        ) : (
          m.model && (
            <span className="rounded-full bg-mist px-1.5 py-0.5 text-[9.5px] text-text-3">
              {pipModelLabel(m.model)}
            </span>
          )
        )}
      </div>
      <p className="border-l-[3px] border-pip pl-3 text-[12.5px] leading-[19px] text-text-body">
        {m.text}
      </p>
      {m.plan &&
        m.plan.steps.length > 0 &&
        m.planState !== 'applied' &&
        m.planState !== 'undone' && <PlanCard m={m} plan={m.plan} onApply={() => onApply(m.id)} />}
      {m.plan && (m.planState === 'applied' || m.planState === 'undone') && (
        <PlanCard m={m} plan={m.plan} done />
      )}
      {m.planState === 'applied' && m.result && <ActionCard m={m} />}
      {m.planState === 'undone' && <p className="pl-3 text-[11px] text-text-3">Undone.</p>}
    </motion.div>
  );
}

function PlanCard({
  m,
  plan,
  onApply,
  done,
}: {
  m: PipEntry;
  plan: PipPlan;
  onApply?: () => void;
  done?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const applying = m.planState === 'applying';
  const cost = planCredits(plan);
  const config = useAppConfig();
  const sceneEdits = plan.steps.some((s) => s.include && s.action === 'editScene');
  return (
    <div
      className={cn(
        'rounded-[12px] border-2 border-edge bg-paper px-3.5 py-3',
        !done && 'shadow-[4px_4px_0_var(--color-hard)]',
      )}
    >
      <ol className="flex flex-col gap-2">
        {plan.steps.map((s, i) => {
          const st = m.stepStates?.[s.id];
          return (
            <li key={s.id} className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-[12.5px] leading-[17px]">
                {editing && !done && (
                  <input
                    type="checkbox"
                    checked={s.include}
                    onChange={() => toggleStep(m.id, s.id)}
                    aria-label={`Include ${s.label}`}
                    className="accent-violet"
                  />
                )}
                <span className={cn('min-w-0 flex-1', !s.include && 'text-text-4 line-through')}>
                  <span className="mr-1.5 font-poster text-[16px] leading-none text-text-3">
                    {i + 1}
                  </span>
                  {s.label}
                </span>
                {s.credits > 0 && st?.state !== 'done' && (
                  <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-violet/10 px-1.5 py-0.5 text-[10px] text-violet-ink">
                    <Cloud className="size-2.5" strokeWidth={1.5} aria-hidden />
                    {s.credits}
                  </span>
                )}
                <AnimatePresence>
                  {st?.state === 'done' && (
                    <motion.span
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                    >
                      <Check className="size-4 text-mint" strokeWidth={2.5} aria-label="Done" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
              {st?.state === 'running' && (
                <span className="w-fit rounded-full bg-pip/35 px-2 py-0.5 text-[10.5px] text-ink">
                  …in progress
                </span>
              )}
              {st?.state === 'skipped' && (
                <span className="text-[10.5px] text-text-3">Skipped · {st.reason}</span>
              )}
            </li>
          );
        })}
      </ol>
      {sceneEdits && !done && (
        <p className="mt-2 text-[10.5px] leading-[14px] text-text-3">
          A scene edit is {costOf('edit', 1, config)} credit, plus {costOf('custom', 1, config)}{' '}
          when Pip writes a new graphic for it.
        </p>
      )}
      {plan.dropped.length > 0 && (
        <p className="mt-2 text-[10.5px] leading-[14px] text-text-3">
          Left out: {plan.dropped.map((d) => `${d.label} (${d.reason})`).join(', ')}
        </p>
      )}
      {!done && (
        <div className="mt-3.5 flex gap-2.5">
          <button
            type="button"
            disabled={applying || plan.steps.every((s) => !s.include)}
            onClick={onApply}
            className={btn('flame', 'sm', false, 'h-9 flex-1 px-2')}
          >
            {applying ? 'Applying…' : cost > 0 ? `Apply all · ☁ ${cost}` : 'Apply all'}
          </button>
          <button
            type="button"
            disabled={applying}
            onClick={() => setEditing((e) => !e)}
            className={btn('paper', 'sm', false, 'h-9 flex-1 px-2')}
          >
            {editing ? 'Done editing' : 'Edit plan'}
          </button>
        </div>
      )}
    </div>
  );
}

function ActionCard({ m }: { m: PipEntry }) {
  const n = m.result?.changes ?? 0;
  const firstSlot = m.result?.slotIds[0];
  return (
    <div className="rounded-[12px] bg-mint-tint px-3.5 py-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[12.5px] leading-[17px] font-medium text-mint-ink">
          <Check className="size-4" strokeWidth={2.5} aria-hidden />
          {n === 0 ? 'Nothing changed' : `Updated ${n} ${n === 1 ? 'step' : 'steps'}`}
        </p>
        <div className="flex flex-col items-end gap-1 text-[11.5px]">
          {/* A plan restored after a reload has no undo handle; ⌘Z history still covers it. */}
          {m.entries && (
            <button
              type="button"
              className="text-ink underline decoration-[1.5px] underline-offset-[3px] hover:decoration-flame"
              onClick={() => undoPipPlan(editorStore, m.id)}
            >
              Undo
            </button>
          )}
          {firstSlot && (
            <button
              type="button"
              className="text-ink underline decoration-[1.5px] underline-offset-[3px] hover:decoration-flame"
              onClick={() => {
                const st = editorStore.getState();
                if (st.project?.slots.some((s) => s.id === firstSlot)) st.select(firstSlot);
                else toast('That graphic is no longer on the timeline.');
              }}
            >
              View on timeline
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
