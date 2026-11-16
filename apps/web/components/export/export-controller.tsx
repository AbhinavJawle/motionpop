'use client';

import { exportCost, type EditorProject, type RenderOptions } from '@motionpop/schemas';
import { isRenderable } from '@motionpop/motion/compiler';
import { useCallback, useEffect, useRef } from 'react';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth/auth-provider';
import {
  exportOptionsState,
  isActive,
  startFailureMessage,
  transitionToast,
  viewOf,
} from '@/lib/renders/export-flow';
import { defaultOptions, exportStore, useExportUi } from '@/lib/renders/export-store';
import {
  useActiveRender,
  useAppConfig,
  useCreditBalance,
  useOnline,
  useRenderClient,
  useRenderJob,
} from '@/lib/renders/hooks';
import { VoiceError, resolveVoiceBlob } from '@/lib/renders/voice-upload';
import type { RenderView } from '@/lib/renders/render-client';
import { editorStore, useEditor } from '@/lib/stores/editor';
import { ExportDialog } from './export-dialog';

/** What the dialog shows from the moment a render exists until its first snapshot arrives. */
function queuedView(
  renderId: string,
  costCredits: number,
  project: EditorProject,
  options: RenderOptions,
): RenderView {
  return {
    renderId,
    status: 'queued',
    progress: 0,
    costCredits,
    title: project.title,
    format: options.format,
    resolution: options.resolution,
    durationMs: project.durationMs,
  };
}

/**
 * Owns the export flow in the editor (spec 08 design §12–§13): starts the render, follows it
 * (also while the modal is closed) and shows the dialog. Mounted once in the editor screen.
 */
export function ExportController() {
  const client = useRenderClient();
  const config = useAppConfig();
  const balance = useCreditBalance();
  const online = useOnline();
  const auth = useAuth();
  const project = useEditor((s) => s.project);
  const open = useExportUi((s) => s.open);
  const starting = useExportUi((s) => s.starting);
  const renderId = useExportUi((s) => s.renderId);
  const view = useExportUi((s) => s.view);
  const storedOptions = useExportUi((s) => s.options);
  const startError = useExportUi((s) => s.startError);
  const costOverride = useExportUi((s) => s.costOverride);

  const free = client.mode === 'offline';
  const options = storedOptions ?? (project ? defaultOptions(project.format) : null);

  const start = useCallback(
    async (picked: RenderOptions) => {
      const ui = exportStore.getState();
      const current = editorStore.getState().project;
      if (!current || ui.starting) return;
      ui.setOptions(picked);
      ui.beginStart();
      // Freeze what is exported now: later edits don't change a running render (R2.1).
      const snapshot = structuredClone(current);
      const expectedCost = free
        ? 0
        : (ui.costOverride ??
          exportCost(picked.resolution, snapshot.durationMs, config.exportCredits));
      let voice: Blob;
      try {
        voice = await resolveVoiceBlob(snapshot);
      } catch (e) {
        const code = e instanceof VoiceError ? e.code : 'voice-missing';
        exportStore.getState().failStart(startFailureMessage({ ok: false, error: code }));
        return;
      }
      const res = await client.start({
        requestId: crypto.randomUUID(),
        options: picked,
        expectedCost,
        project: snapshot,
        voice,
      });
      const after = exportStore.getState();
      if (res.ok) {
        after.follow(res.renderId, queuedView(res.renderId, res.costCredits, snapshot, picked));
        return;
      }
      if (res.error === 'render-active' && res.detail?.renderId) {
        // Another render is running: show its progress instead (R2.7).
        after.follow(res.detail.renderId, queuedView(res.detail.renderId, 0, snapshot, picked));
        return;
      }
      const cost = res.detail?.cost;
      after.failStart(
        startFailureMessage(res, cost),
        res.error === 'cost-changed' ? cost : undefined,
      );
    },
    [client, config.exportCredits, free],
  );

  // "Try again" and the toast's "Retry": a new request with the same options (R6.2).
  const retry = useCallback(() => {
    const ui = exportStore.getState();
    const again = ui.view
      ? { format: ui.view.format, resolution: ui.view.resolution, captions: false, music: false }
      : ui.options;
    ui.reset();
    if (again) void start(again);
  }, [start]);
  const retryRef = useRef(retry);
  useEffect(() => {
    retryRef.current = retry;
  });

  // A reload during a render: show its progress again.
  const active = useActiveRender();
  useEffect(() => {
    const ui = exportStore.getState();
    if (active && !ui.renderId && !ui.starting) ui.follow(active.renderId, active);
  }, [active]);

  // Follow the render, with or without the modal.
  const onView = useCallback((v: RenderView) => exportStore.getState().applyView(v), []);
  useRenderJob(client, renderId, onView);

  // With the modal closed, a render that ends gets a toast (R4.5, R6.2).
  const lastStatus = useRef<{ id: string | null; status: RenderView['status'] | null }>({
    id: null,
    status: null,
  });
  useEffect(() => {
    const before = lastStatus.current;
    lastStatus.current = { id: renderId, status: view?.status ?? null };
    if (before.id !== renderId) return;
    const t = transitionToast(before.status, view, open, free);
    if (!t) return;
    if (t.kind === 'ready') {
      toast.success('Your video is ready', {
        action: { label: 'Open', onClick: () => exportStore.getState().openAsIs() },
      });
    } else {
      toast.error(t.message, {
        action: { label: 'Retry', onClick: () => retryRef.current() },
        classNames: {
          actionButton:
            'ml-auto rounded-lg bg-violet-fill px-2.5 py-1 text-[11px] font-medium text-violet-ink',
        },
      });
    }
    // Only a change of status or of the modal can need a toast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.status, renderId, open]);

  if (!project || !options) return null;
  const optionsState = exportOptionsState({
    project,
    options,
    config,
    mode: client.mode,
    balance: auth.status === 'signed-in' ? balance : null,
    online,
    costOverride,
    isRenderable,
  });
  const current = viewOf(starting, view);
  return (
    <ExportDialog
      open={open}
      view={current}
      project={project}
      options={options}
      optionsState={optionsState}
      renderView={view}
      startError={startError}
      free={free}
      client={client}
      onOptions={(next) => exportStore.getState().setOptions(next)}
      onExport={() => void start(options)}
      onRetry={retry}
      onClose={() => exportStore.getState().close()}
      isActiveRender={isActive(view?.status)}
    />
  );
}
