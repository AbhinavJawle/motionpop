'use client';

import { useAutoFill } from '@/lib/slots/use-auto-fill';
import { useAutoPictures } from '@/lib/images/use-auto-pictures';
import { useAutoChoreograph } from '@/lib/film/use-film';
import { useGenerateShortcut } from '@/lib/slots/use-generate';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Pip } from '@/components/pip/pip';
import { Button } from '@/components/ui/button';
import { Timeline } from '@/components/timeline/timeline';
import { PlaybackClock } from '@/lib/editor/playback';
import { loadVoice, type LoadedVoice } from '@/lib/editor/voice';
import { useSoundBed } from '@/lib/sound/use-sound-bed';
import { useVoiceState } from '@/lib/editor/voice-state';
import { AudioElsewhereError } from '@/lib/audio/hybrid-audio-store';
import { projectLibrary } from '@/lib/projects/use-project-list';
import { openProject } from '@/lib/projects/open';
import type { ProjectLibrary } from '@/lib/projects/repository';
import { setActiveAutosave, startAutosave } from '@/lib/stores/autosave';
import { appAudioStore } from '@/lib/audio/app-audio-store';
import { audioRefsOf } from '@/lib/projects/summary';
import { editorStore, useEditor } from '@/lib/stores/editor';
import { ExportController } from '@/components/export/export-controller';
import { AIStatusToasts } from './ai-status-toasts';
import { PictureNudge } from './picture-nudge';
import { Inspector } from './inspector';
import { PipDock } from './pip-dock';
import { PreviewPane } from './preview-pane';
import { SettingsPanel } from './settings-panel';
import { PipPanel } from '@/components/pip-panel/pip-panel';
import { useRailPanel } from '@/lib/editor/rail-panel';
import { useSettingsPanel } from '@/lib/editor/settings-panel';
import { usePip } from '@/lib/pip/use-pip';
import { useEditorTheme, type EditorTheme } from '@/lib/editor/theme';
import { ToolRail } from './tool-rail';
import { RailPanels } from './rail-panels';
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
  const repo = useMemo<ProjectLibrary>(() => projectLibrary(), []);
  const clock = useMemo(() => new PlaybackClock(editorStore), []);
  const projectId = useEditor((s) => s.project?.id);
  const rejection = useEditor((s) => s.rejection);

  const theme = useEditorTheme((s) => s.theme);
  useEffect(() => useEditorTheme.getState().hydrate(), []);
  useEditorKeys(clock);
  useSoundBed(clock, voice?.voiceLevelDb ?? null);
  useAutoFill();
  // Spec 07c: free open-licence pictures arrive by themselves after the drafts.
  useAutoPictures();
  // Spec 19 R4.2: freshly uploaded video projects automatically choreograph gapless beats.
  useAutoChoreograph(phase.kind === 'ready');
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

  // Spec 38 R2.1: the editor is Pip-first. Pip's panel is open when a project opens, unless
  // another left panel already holds the slot.
  useEffect(() => {
    if (phase.kind !== 'ready') return;
    if (useRailPanel.getState().open || useSettingsPanel.getState().open) return;
    usePip.getState().setOpen(true);
    editorStore.getState().setRail('ai');
  }, [phase.kind, projectId]);

  useEffect(() => {
    if (phase.kind !== 'ready') return;
    const handle = startAutosave(editorStore, repo, {
      uploadsIdle: () => {
        const p = editorStore.getState().project;
        return appAudioStore().idle(p ? audioRefsOf(p) : []);
      },
    });
    setActiveAutosave(handle);
    return () => {
      setActiveAutosave(null);
      void handle.stop();
    };
  }, [phase.kind, repo]);

  // Voice: synthesized or decoded, then peaks in a worker. Re-created per project.
  useEffect(() => {
    const project = editorStore.getState().project;
    if (phase.kind !== 'ready' || !project) return;
    let loaded: LoadedVoice | null = null;
    let cancelled = false;
    useVoiceState.setState({
      status: 'loading',
      peaks: null,
      seek: (ms) => clock.seek(ms),
    });
    loadVoice(project)
      .then((v) => {
        if (cancelled) return v.revoke();
        loaded = v;
        const audio = new Audio(v.url);
        audio.preload = 'auto';
        clock.attachAudio(audio);
        if (initialMs !== undefined) clock.seek(initialMs);
        setVoice(v);
        useVoiceState.setState({ status: 'ready', peaks: v.peaks, bucketMs: v.bucketMs });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        useVoiceState.setState({
          status: e instanceof AudioElsewhereError ? 'elsewhere' : 'error',
        });
        if (e instanceof AudioElsewhereError) {
          // Storage refused the read and this browser has no copy (design §2.4).
          toast(e.message, {
            description: 'Open it on the device that recorded it to hear it here.',
          });
        } else {
          toast.error(`Couldn’t load the voiceover: ${e instanceof Error ? e.message : String(e)}`);
        }
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
    <div
      {...themeAttrs(theme)}
      className="flex h-dvh min-h-[720px] min-w-[1280px] flex-col overflow-hidden bg-bg font-mono text-text"
    >
      <TopBar />
      {/* Spec 38 R6: the sidebar (rail + panel) runs the full height; the timeline sits under
          the preview and inspector only. */}
      <div className="relative flex min-h-0 flex-1">
        <ToolRail />
        <SettingsPanel />
        <PipPanel />
        <RailPanels />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative flex min-h-0 flex-1">
            <PreviewPane />
            <Inspector />
          </div>
          <Timeline clock={clock} peaks={voice?.peaks ?? null} bucketMs={voice?.bucketMs ?? 10} />
        </div>
        <PipDock />
      </div>
      <ExportController />
      <AIStatusToasts />
      <PictureNudge />
      <CaptureTestHook />
    </div>
  );
}

/** Light is paper (`[data-paper]`); dark is the night desk (spec 38 R5). */
function themeAttrs(theme: EditorTheme) {
  return theme === 'light'
    ? { 'data-paper': '', 'data-editor': '', 'data-theme': 'light' }
    : { 'data-editor': '', 'data-theme': 'dark' };
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
    <main
      {...themeAttrs(useEditorTheme.getState().theme)}
      className="flex h-dvh flex-col items-center justify-center gap-4 bg-bg text-center text-text"
    >
      <Pip size={96} state={pip} glow />
      <h1 className="text-lg font-semibold">{title}</h1>
      {body && <p className="max-w-md text-sm text-text-2">{body}</p>}
      {action}
    </main>
  );
}
