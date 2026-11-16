'use client';

import type { PipPlan, PipScope } from '@motionpop/schemas';
import { ArrowUp, Check, ChevronDown, Cloud, Mic, Paperclip, Plus, Zap } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { Pip } from '@/components/pip/pip';
import { LeftPanel } from '@/components/editor/left-panel';
import { Tooltip } from '@/components/ui/tooltip';
import { useRoute } from '@/lib/ai/use-route';
import { getRouter } from '@/lib/ai/router-client';
import { cn } from '@/lib/cn';
import { useCreditsClient } from '@/lib/credits/use-credits-client';
import { closeSettingsPanel, useSettingsPanel } from '@/lib/editor/settings-panel';
import { slotCardText } from '@/lib/editor/slot-display';
import { popIn } from '@/lib/motion/presets';
import { chipsFor, planCredits } from '@/lib/pip/plan';
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
  const scope: PipScope =
    scopeSlot && selected ? { kind: 'slot', slotId: selected.id } : { kind: 'video' };
  const route = useRoute('pip.plan');
  const editRoute = useRoute('edit.patch');
  const generateRoute = useRoute('generate');
  const { client: credits } = useCreditsClient();
  const config = useAppConfig();
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
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = (text: string) =>
    void sendToPip({ store: editorStore, credits, getRouter, route, config }, text, scope);
  const apply = (id: string) =>
    void applyPipPlan(
      { store: editorStore, credits, getRouter, config, doc: document, editRoute, generateRoute },
      id,
    );

  return (
    <div className="flex h-full flex-col px-5 pt-4 pb-4">
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-white/6 pb-3">
        <button
          type="button"
          className="flex items-center gap-1.5 text-[17px] leading-[22px] font-semibold text-text"
          onClick={() => {
            if (messages.length) newConversation();
          }}
          title="New conversation"
        >
          Pip
          <ChevronDown className="size-3.5 text-text-2" strokeWidth={1.5} aria-hidden />
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="h-6 rounded-full bg-card-2 px-3 text-[11px] leading-[14px] text-text-2 hover:text-text"
            onClick={() => send('Make the whole video use one consistent look')}
          >
            Style
          </button>
          <Tooltip content="New conversation" side="bottom">
            <button
              type="button"
              aria-label="New conversation"
              onClick={newConversation}
              className="flex size-7 items-center justify-center rounded-full text-text-2 hover:bg-card hover:text-text"
            >
              <Plus className="size-4" strokeWidth={1.5} aria-hidden />
            </button>
          </Tooltip>
        </div>
      </header>

      <div ref={scroller} className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pt-4">
        {messages.length === 0 ? (
          <EmptyState
            chips={chips}
            onChip={(id, label) => chipToPip(editorStore, id, label, scope)}
          />
        ) : (
          <div className="flex flex-col gap-3 pb-2">
            {messages.map((m) => (
              <Message key={m.id} m={m} onApply={apply} />
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-[12px] text-text-2">
                <Pip state="thinking" size={22} decorative />
                Pip is thinking…
              </div>
            )}
          </div>
        )}
      </div>

      {messages.length === 0 && (
        <div className="mt-3 flex shrink-0 gap-2">
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
      <Composer busy={busy} onSend={send} />
      <p className="mt-2 flex shrink-0 items-center justify-center gap-1 text-[11px] leading-[14px]">
        {route.kind === 'cloud' ? (
          <span className="flex items-center gap-1 text-text-2">
            <Cloud className="size-3" strokeWidth={1.5} aria-hidden />~{route.credits} credits
          </span>
        ) : (
          <span className="flex items-center gap-1 text-mint-ink">
            <Zap className="size-3" strokeWidth={1.5} aria-hidden />
            free · quick planner
          </span>
        )}
      </p>
    </div>
  );
}

function EmptyState({
  chips,
  onChip,
}: {
  chips: ReturnType<typeof chipsFor>;
  onChip: (id: ReturnType<typeof chipsFor>[number]['id'], label: string) => void;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative mt-2 flex size-[88px] items-center justify-center">
        <div aria-hidden className="absolute inset-0 rounded-full bg-violet/10 blur-2xl" />
        <Pip state="idle" size={56} glow decorative />
      </div>
      <h2 className="mt-3 text-[18px] leading-[23px] font-semibold text-text">
        What should we make move?
      </h2>
      <p className="mt-2 text-[12.5px] leading-[17px] text-text-2">
        I can see your whole timeline. Ask for one graphic or change the whole video.
      </p>
      <div className="mt-4 flex w-full flex-col gap-1.5">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onChip(c.id, c.label)}
            className="h-[26px] w-full rounded-full border border-white/8 px-3 text-left text-[11.5px] leading-[15px] text-text-body transition-colors hover:border-violet/40 hover:bg-card hover:text-text"
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
        'h-[22px] min-w-0 truncate rounded-full px-3 text-[11px] leading-[14px] transition-colors',
        active
          ? 'bg-violet-sel text-text shadow-glass'
          : 'border border-white/8 text-text-2 hover:text-text',
      )}
    >
      {children}
    </button>
  );
}

function Composer({ busy, onSend }: { busy: boolean; onSend: (t: string) => void }) {
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
  return (
    <div className="mt-2.5 shrink-0 rounded-card border border-white/8 bg-card px-3 pt-2.5 pb-2">
      <textarea
        ref={ref}
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 1000))}
        onKeyDown={onKey}
        placeholder="Ask Pip anything…"
        aria-label="Ask Pip"
        className="block w-full resize-none bg-transparent text-[13px] leading-[18px] text-text outline-none placeholder:text-text-3"
      />
      <div className="mt-2 flex items-center gap-2.5 text-text-2">
        <Tooltip content="Attach images soon" side="top">
          <Paperclip className="size-4" strokeWidth={1.5} aria-label="Attach (soon)" />
        </Tooltip>
        <Tooltip content="Voice input soon" side="top">
          <Mic className="size-4" strokeWidth={1.5} aria-label="Voice (soon)" />
        </Tooltip>
        <button
          type="button"
          aria-label="Send"
          disabled={!text.trim() || busy}
          onClick={submit}
          className="ml-auto flex size-7 items-center justify-center rounded-full bg-ember-grad text-white shadow-ember transition disabled:opacity-40"
        >
          <ArrowUp className="size-4" strokeWidth={2} aria-hidden />
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
        className="rounded-card border border-violet/15 bg-reason px-3.5 py-3 text-[12.5px] leading-[18px] text-text"
      >
        {m.text}
      </motion.div>
    );
  }
  return (
    <motion.div {...popIn} className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 text-[12.5px] leading-[17px]">
        <Pip state={m.planState === 'applied' ? 'done' : 'idle'} size={18} decorative />
        <span className="font-semibold text-text">Pip</span>
        <span className="text-text-2">{m.text}</span>
      </div>
      {m.plan &&
        m.plan.steps.length > 0 &&
        m.planState !== 'applied' &&
        m.planState !== 'undone' && <PlanCard m={m} plan={m.plan} onApply={() => onApply(m.id)} />}
      {m.plan && (m.planState === 'applied' || m.planState === 'undone') && (
        <PlanCard m={m} plan={m.plan} done />
      )}
      {m.planState === 'applied' && m.result && <ActionCard m={m} />}
      {m.planState === 'undone' && <p className="text-[11px] text-text-3">Undone.</p>}
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
  return (
    <div className="rounded-card border border-white/8 bg-card px-3.5 py-3">
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
                  {i + 1}. {s.label}
                </span>
                {s.credits > 0 && st?.state !== 'done' && (
                  <span className="flex items-center gap-0.5 text-[10px] text-violet-ink-2">
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
                      <Check className="size-4 text-mint" strokeWidth={2} aria-label="Done" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
              {st?.state === 'running' && (
                <span className="w-fit rounded-full bg-violet-sel px-2 py-0.5 text-[10.5px] text-violet-ink">
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
      {plan.dropped.length > 0 && (
        <p className="mt-2 text-[10.5px] leading-[14px] text-text-3">
          Left out: {plan.dropped.map((d) => `${d.label} (${d.reason})`).join(', ')}
        </p>
      )}
      {!done && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={applying || plan.steps.every((s) => !s.include)}
            onClick={onApply}
            className="h-[26px] flex-1 rounded-lg bg-violet text-[12px] font-semibold text-white shadow-generate transition hover:brightness-110 disabled:opacity-50"
          >
            {applying ? 'Applying…' : cost > 0 ? `Apply all · ☁ ${cost}` : 'Apply all'}
          </button>
          <button
            type="button"
            disabled={applying}
            onClick={() => setEditing((e) => !e)}
            className="h-[26px] flex-1 rounded-lg border border-white/10 text-[12px] text-text hover:bg-card-2 disabled:opacity-50"
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
    <div className="rounded-card border border-white/8 bg-card px-3.5 py-3">
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] leading-[17px] font-medium text-text">
          {n === 0 ? 'Nothing changed' : `Updated ${n} ${n === 1 ? 'step' : 'steps'}`}
        </p>
        <div className="flex flex-col items-end gap-1 text-[11.5px]">
          {/* A plan restored after a reload has no undo handle; ⌘Z history still covers it. */}
          {m.entries && (
            <button
              type="button"
              className="text-violet-ink hover:underline"
              onClick={() => undoPipPlan(editorStore, m.id)}
            >
              Undo
            </button>
          )}
          {firstSlot && (
            <button
              type="button"
              className="text-violet-ink hover:underline"
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
