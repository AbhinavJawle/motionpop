'use client';

import { exportCost, type RenderOptions } from '@motionpop/schemas';
import { isRenderable } from '@motionpop/motion/compiler';
import { useCallback, useEffect } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';
import {
  exportOptionsState,
  isActive,
  startFailureMessage,
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
        after.follow(res.renderId, {
          renderId: res.renderId,
          status: 'queued',
          progress: 0,
          costCredits: res.costCredits,
          title: snapshot.title,
          format: picked.format,
          resolution: picked.resolution,
          durationMs: snapshot.durationMs,
        });
        return;
      }
      if (res.error === 'render-active' && res.detail?.renderId) {
        // Another render is running: show its progress instead (R2.7).
        after.follow(res.detail.renderId);
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

  // A reload during a render: show its progress again.
  const active = useActiveRender();
  useEffect(() => {
    const ui = exportStore.getState();
    if (active && !ui.renderId && !ui.starting) ui.follow(active.renderId, active);
  }, [active]);

  // Follow the render, with or without the modal.
  const onView = useCallback((v: RenderView) => exportStore.getState().applyView(v), []);
  useRenderJob(client, renderId, onView);

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
      onOptions={(next) => exportStore.getState().setOptions(next)}
      onExport={() => void start(options)}
      onClose={() => exportStore.getState().close()}
      isActiveRender={isActive(view?.status)}
    />
  );
}
