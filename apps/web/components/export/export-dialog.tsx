'use client';

import type { EditorProject, RenderOptions } from '@motionpop/schemas';
import { AnimatePresence, motion } from 'motion/react';
import { Modal } from '@/components/ui/modal';
import { easeOutSoft } from '@/lib/motion/presets';
import type { ExportOptionsState, ExportView } from '@/lib/renders/export-flow';
import type { RenderView } from '@/lib/renders/render-client';
import { ErrorView } from './error-view';
import { OptionsView, ProjectCard } from './options-view';
import { ProgressView } from './progress-view';

export interface ExportDialogProps {
  open: boolean;
  view: ExportView;
  project: EditorProject;
  options: RenderOptions;
  optionsState: ExportOptionsState;
  renderView: RenderView | null;
  startError: string | null;
  free: boolean;
  isActiveRender: boolean;
  onOptions: (next: RenderOptions) => void;
  onExport: () => void;
  onRetry: () => void;
  onClose: () => void;
}

/**
 * The export dialog: the options of export.png, which cross-fade (240 ms) into progress or an
 * error under the same header and project card. The ready dialog (export-ready.png) follows.
 */
export function ExportDialog(p: ExportDialogProps) {
  // Starting shows the progress at 0 % at once: the voice upload and the request take a moment.
  const body: 'options' | 'progress' | 'error' | 'ready' =
    p.view === 'starting' ? 'progress' : p.view;
  return (
    <Modal
      open={p.open}
      onClose={p.onClose}
      title="Export video"
      description="A little voice. Ready for the world."
      className="min-h-[768px] px-8 pt-[29px] pb-[23px]"
      closeClassName="top-[24px] right-[26px]"
      contentClassName="mt-[23px]"
    >
      <ProjectCard
        project={p.project}
        format={p.renderView?.format ?? p.options.format}
        scenes={p.optionsState.renderable}
      />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={body}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.24, ease: easeOutSoft }}
        >
          {body === 'options' && (
            <OptionsView
              options={p.options}
              onOptions={p.onOptions}
              state={p.optionsState}
              startError={p.startError}
              onExport={p.onExport}
            />
          )}
          {body === 'progress' && <ProgressView view={p.renderView} />}
          {body === 'error' && (
            <ErrorView view={p.renderView} free={p.free} onRetry={p.onRetry} onClose={p.onClose} />
          )}
          {body === 'ready' && <ProgressView view={p.renderView} />}
        </motion.div>
      </AnimatePresence>
    </Modal>
  );
}
