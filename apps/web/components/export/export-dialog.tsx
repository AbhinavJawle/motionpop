'use client';

import type { EditorProject, RenderOptions } from '@motionpop/schemas';
import { Modal } from '@/components/ui/modal';
import type { ExportOptionsState, ExportView } from '@/lib/renders/export-flow';
import type { RenderView } from '@/lib/renders/render-client';
import { OptionsView } from './options-view';

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
  onClose: () => void;
}

/** The export dialog: options (export.png) and, from tasks 16 and 17, progress, error and ready. */
export function ExportDialog(p: ExportDialogProps) {
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
      <OptionsView
        project={p.project}
        options={p.options}
        onOptions={p.onOptions}
        state={p.optionsState}
        startError={p.startError}
        onExport={p.onExport}
      />
    </Modal>
  );
}
