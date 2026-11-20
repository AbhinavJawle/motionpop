'use client';

import { pipPlanTask } from '@motionpop/ai';
import {
  APP_CONFIG_DEFAULTS,
  type AppConfig,
  type ChatMessage,
  type PipPlan,
  type PipScope,
  type StepState,
} from '@motionpop/schemas';
import { create } from 'zustand';
import type { Route } from '@/lib/ai/route';
import { pipAnswer } from '@/lib/ai/fake-router';
import { newSpendKey, type CreditsClient } from '@/lib/credits/client';
import { spendWithUi } from '@/lib/credits/spend-with-ui';
import type { Router } from '@motionpop/ai';
import type { EditorStore } from '@/lib/stores/editor';
import type { Command } from '@/lib/commands/command';
import { applyPlan, undoPlan, type ApplyDeps } from './apply';
import { useSavedBrand } from '@/lib/brand/saved-brand';
import { openRailPanel } from '@/lib/editor/rail-panel';
import { loadThread, saveThread } from './persist';
import { codePlan, enforcePlan, pipInput, type ChipId } from './plan';
import { usePipModel } from './model-store';

/**
 * Pip's conversation (spec 10), lean: one thread per project, kept in this browser across reloads
 * (`persist.ts`). A typed
 * message routes to the cloud (`pip.plan`, 2 credits, refunded on failure); without the cloud it
 * falls back to the code planner, free, and says so. Chips always build their plan in code.
 */
export interface PipEntry extends ChatMessage {
  /** Undo handle of an applied plan (not persisted). */
  entries?: Command[];
}

interface PipState {
  open: boolean;
  projectId: string | null;
  messages: PipEntry[];
  busy: boolean;
  setOpen(open: boolean): void;
  toggle(): void;
}

export const usePip = create<PipState>((set) => ({
  open: false,
  projectId: null,
  messages: [],
  busy: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}));

// Every change to the open project's thread is saved (messages are few and small).
usePip.subscribe((s, prev) => {
  if (s.projectId && s.messages !== prev.messages && s.projectId === prev.projectId)
    saveThread(s.projectId, s.messages);
});

const THREAD = 'main';
const msgId = () => `m-${crypto.randomUUID().slice(0, 8)}`;

function push(m: Omit<PipEntry, 'schemaVersion' | 'id' | 'threadId' | 'createdAt'>): string {
  const id = msgId();
  usePip.setState((s) => ({
    messages: [
      ...s.messages,
      { schemaVersion: 1, id, threadId: THREAD, createdAt: Date.now(), ...m } as PipEntry,
    ],
  }));
  return id;
}

function patch(id: string, p: Partial<PipEntry>): void {
  usePip.setState((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, ...p } : m)) }));
}

/** Opening a project brings back its thread from this browser (or starts an empty one). */
export function syncPipProject(projectId: string | null): void {
  if (usePip.getState().projectId !== projectId)
    usePip.setState({
      projectId,
      messages: projectId ? loadThread(projectId) : [],
      busy: false,
    });
}

export function newConversation(): void {
  usePip.setState({ messages: [], busy: false });
}

export interface SendDeps {
  store: EditorStore;
  credits: CreditsClient | null;
  getRouter: () => Promise<Router | null>;
  route: Route;
  config?: Pick<AppConfig, 'creditCosts' | 'imageCredits' | 'exportCredits'>;
  /** Optional model id override (defaults to the Pip model selector's active model). */
  model?: string;
}

export async function sendToPip(deps: SendDeps, text: string, scope: PipScope): Promise<void> {
  const project = deps.store.getState().project;
  const message = text.trim();
  if (!project || !message || usePip.getState().busy) return;
  const history = usePip
    .getState()
    .messages.slice(-6)
    .map((m) => ({
      role: m.role,
      text: m.plan ? `${m.text} ${m.plan.steps.map((s) => s.label).join('; ')}` : m.text,
    }));
  push({ role: 'user', text: message.slice(0, 2000), scope, credits: 0 });
  usePip.setState({ busy: true });
  const input = pipInput(project, scope, history, message);

  const fromCode = (note?: string) => {
    const plan = enforcePlan(pipAnswer(input), project, 'code');
    push({
      role: 'pip',
      text: note ? `${plan.reply}. ${note}` : plan.reply,
      scope,
      plan,
      planState: 'proposed',
      ranOn: 'code',
      credits: 0,
    });
  };

  try {
    if (deps.route.kind !== 'cloud' || !deps.credits) {
      fromCode(
        deps.route.kind === 'disabled'
          ? `(${deps.route.reason}: I used my quick planner)`
          : undefined,
      );
      return;
    }
    const spent = await spendWithUi(
      deps.credits,
      { action: 'pip-plan', key: newSpendKey(), refId: project.id },
      deps.config ?? APP_CONFIG_DEFAULTS,
    );
    if (!spent || !spent.ok) {
      push({
        role: 'pip',
        text: 'I need a recharge for that one. Try a suggestion below, they’re free.',
        scope,
        credits: 0,
      });
      return;
    }
    const router = await deps.getRouter().catch(() => null);
    try {
      if (!router) throw new Error('no router');
      const selectedModel = deps.model ?? usePipModel.getState().model;
      const res = await router.run(pipPlanTask(), input, {
        mode: 'ONLY_IN_CLOUD',
        allowCloud: false,
        ...(selectedModel ? { model: selectedModel } : {}),
      });
      const plan = enforcePlan(res.output, project, 'cloud');
      push({
        role: 'pip',
        text: plan.reply,
        scope,
        plan,
        planState: 'proposed',
        ranOn: 'cloud',
        model: res.model,
        credits: res.costCredits,
      });
    } catch {
      await deps.credits.refund(spent.txId).catch(() => {});
      fromCode('(The cloud didn’t answer, so I used my quick planner. Credits returned.)');
    }
  } finally {
    usePip.setState({ busy: false });
  }
}

export function chipToPip(store: EditorStore, chip: ChipId, label: string, scope: PipScope): void {
  const project = store.getState().project;
  if (!project) return;
  push({ role: 'user', text: label, scope, credits: 0 });
  const savedBrand = useSavedBrand.getState().brand;
  const plan = codePlan(chip, project, undefined, savedBrand);
  // No brand kit yet: Pip says so and opens the Brand panel next to the chat.
  if (chip === 'brand' && !savedBrand) openRailPanel('brand');
  push({
    role: 'pip',
    text: plan.reply,
    scope,
    plan,
    planState: 'proposed',
    ranOn: 'code',
    credits: 0,
  });
}

export function toggleStep(messageId: string, stepId: string): void {
  const m = usePip.getState().messages.find((x) => x.id === messageId);
  if (!m?.plan || m.planState !== 'proposed') return;
  const plan: PipPlan = {
    ...m.plan,
    steps: m.plan.steps.map((s) => (s.id === stepId ? { ...s, include: !s.include } : s)),
  };
  patch(messageId, { plan });
}

export async function applyPipPlan(deps: ApplyDeps, messageId: string): Promise<void> {
  const m = usePip.getState().messages.find((x) => x.id === messageId);
  if (!m?.plan || m.planState !== 'proposed' || usePip.getState().busy) return;
  usePip.setState({ busy: true });
  patch(messageId, { planState: 'applying', stepStates: {} });
  const states: Record<string, { state: StepState; reason?: string }> = {};
  try {
    const r = await applyPlan(deps, m.plan, (id, state, reason) => {
      states[id] = reason ? { state, reason } : { state };
      patch(messageId, { stepStates: { ...states } });
    });
    patch(messageId, {
      planState: 'applied',
      stepStates: r.states,
      result: { slotIds: r.slotIds.slice(0, 60), changes: r.changes },
      entries: r.entries,
    });
  } finally {
    usePip.setState({ busy: false });
  }
}

export function undoPipPlan(store: EditorStore, messageId: string): void {
  const m = usePip.getState().messages.find((x) => x.id === messageId);
  if (!m?.entries) return;
  undoPlan(store, m.entries);
  patch(messageId, { planState: 'undone' });
}
