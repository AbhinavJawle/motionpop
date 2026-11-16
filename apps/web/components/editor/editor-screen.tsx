'use client';

import { useAutoFill } from '@/lib/slots/use-auto-fill';
import { useGenerateShortcut } from '@/lib/slots/use-generate';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Pip } from '@/components/pip/pip';
import { Button } from '@/components/ui/button';
import { Timeline } from '@/components/timeline/timeline';
import { PlaybackClock } from '@/lib/editor/playback';
import { loadVoice, type LoadedVoice } from '@/lib/editor/voice';
import { IdbProjectRepository } from '@/lib/projects/idb-repository';
import { openProject } from '@/lib/projects/open';
import type { ProjectLibrary } from '@/lib/projects/repository';
import { startAutosave } from '@/lib/stores/autosave';
import { editorStore, useEditor } from '@/lib/stores/editor';
import { ExportController } from '@/components/export/export-controller';
import { AIStatusToasts } from './ai-status-toasts';
import { Inspector } from './inspector';
import { PipDock } from './pip-dock';
import { PreviewPane } from './preview-pane';
import { SettingsPanel } from './settings-panel';
import { ToolRail } from './tool-rail';
import { TopBar } from './top-bar';
import { CaptureTestHook } from './capture-test-hook';
import { useEditorKeys } from './use-editor-keys';

type Phase =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'not-found' }
  | { kind: 'invalid'; issues: string[]; hasBackup: boolean };

/**
 * The editor (spec 04): loads the project through the repository, starts autosave, loads the
 * voice (master clock + waveform peaks) and lays out top bar, rail, preview, inspector and
 * timeline. `?t=<ms>&select=<slotId>` opens at a moment (used by the design check).
 */
export function EditorScreen({
  id,
  initialMs,
  initialSlot,
}: {
  id: string;
  initialMs?: number;
  initialSlot?: string;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [voice, setVoice] = useState<LoadedVoice | null>(null);
  const repo = useMemo<ProjectLibrary>(() => new IdbProjectRepository(), []);
  const clock = useMemo(() => new PlaybackClock(editorStore), []);
  const projectId = useEditor((s) => s.project?.id);
  const rejection = useEditor((s) => s.rejection);

  useEditorKeys(clock);
  useAutoFill();
  useGenerateShortcut();

  // The pen pauses playback (spec 09 R8.1).
  const drawMode = useEditor((s) => s.drawMode);
  useEffect(() => {
    if (drawMode) clock.pause();
  }, [drawMode, clock]);

  useEffect(() => {
    let cancelled = false;
    void openProject(id, repo).then((r) => {
      if (cancelled) return;
      if (r.ok) {
        // Spec 11: the dashboard's Continue card follows the last opened project. Outside the
        // undo history; the stored copy is touched without a backup rotation.
        const openedAt = Date.now();
        editorStore.getState().load({ ...r.project, lastOpenedAt: openedAt });
        void repo.markOpened(id, openedAt).catch(() => undefined);
        if (initialSlot) editorStore.getState().select(initialSlot);
        setPhase({ kind: 'ready' });
      } else if (r.error === 'invalid') {
        setPhase({ kind: 'invalid', issues: r.issues, hasBackup: r.hasBackup });
      } else {
        setPhase({ kind: 'not-found' });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id, repo, initialSlot]);

  useEffect(() => {
    if (phase.kind !== 'ready') return;
    const stop = startAutosave(editorStore, repo);
    return () => void stop();
  }, [phase.kind, repo]);

  // Voice: synthesized or decoded, then peaks in a worker. Re-created per project.
  useEffect(() => {
    const project = editorStore.getState().project;
    if (phase.kind !== 'ready' || !project) return;
    let loaded: LoadedVoice | null = null;
    let cancelled = false;
    loadVoice(project)
      .then((v) => {
        if (cancelled) return v.revoke();
        loaded = v;
        const audio = new Audio(v.url);
        audio.preload = 'auto';
        clock.attachAudio(audio);
        if (initialMs !== undefined) clock.seek(initialMs);
        setVoice(v);
      })
      .catch((e: unknown) => {
        toast.error(`Couldn’t load the voiceover: ${e instanceof Error ? e.message : String(e)}`);
        if (initialMs !== undefined) clock.seek(initialMs);
      });
    return () => {
      cancelled = true;
      clock.pause();
      clock.attachAudio(null);
      loaded?.revoke();
    };
    // The voice depends on the project identity, not on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.kind, projectId, clock]);

  useEffect(() => () => clock.dispose(), [clock]);

  useEffect(() => {
    if (rejection) toast(rejection.reason, { description: `${rejection.label} didn’t fit` });
  }, [rejection]);

  if (phase.kind === 'loading')
    return <CenterState pip="thinking" title="Pip is opening your project…" />;
  if (phase.kind === 'not-found')
    return (
      <CenterState
        pip="empty-pockets"
        title="Pip can’t find this project"
        body="It may have been deleted, or it lives on another device."
      />
    );
  if (phase.kind === 'invalid')
    return (
      <CenterState
        pip="empty-pockets"
        title="This save looks damaged"
        body={phase.issues.slice(0, 3).join(' · ')}
        action={
          phase.hasBackup ? (
            <Button
              variant="primary"
              size="lg"
              onClick={() =>
                void repo.restoreBackup(id).then((r) => {
                  if (r.ok) {
                    editorStore.getState().load(r.project);
                    setPhase({ kind: 'ready' });
                  }
                })
              }
            >
              Restore last good version
            </Button>
          ) : null
        }
      />
    );

  return (
    <div className="flex h-dvh min-h-[720px] min-w-[1280px] flex-col overflow-hidden bg-bg text-text">
      <TopBar />
      <div className="relative flex min-h-0 flex-1">
        <ToolRail />
        <SettingsPanel />
        <PreviewPane />
        <Inspector />
        <PipDock />
      </div>
      <ExportController />
      <AIStatusToasts />
      <CaptureTestHook />
      <Timeline clock={clock} peaks={voice?.peaks ?? null} bucketMs={voice?.bucketMs ?? 10} />
    </div>
  );
}

function CenterState({
  pip,
  title,
  body,
  action,
}: {
  pip: 'thinking' | 'empty-pockets';
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-4 bg-bg text-center text-text">
      <Pip size={96} state={pip} glow />
      <h1 className="text-lg font-semibold">{title}</h1>
      {body && <p className="max-w-md text-sm text-text-2">{body}</p>}
      {action}
    </main>
  );
}
