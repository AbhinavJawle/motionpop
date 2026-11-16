// @vitest-environment happy-dom
import { APP_CONFIG_DEFAULTS, type RenderOptions } from '@motionpop/schemas';
import { bigNumberSlot, fixtureProject } from '@motionpop/motion/testing/project-fixture';
import { isRenderable } from '@motionpop/motion/compiler';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportOptionsState, type ExportOptionsInput } from '@/lib/renders/export-flow';
import { ExportDialog } from './export-dialog';

// happy-dom's Web Animations stub rejects on cancel; motion then uses its JS driver.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only removal of a DOM API
delete (Element.prototype as any).animate;

// The still compiles a composition in a player: not what these tests are about.
vi.mock('./video-still', () => ({
  VideoStill: () => <div data-testid="video-still" />,
  fitBox: () => ({ width: 1, height: 1 }),
}));

afterEach(() => cleanup());

const project = () =>
  fixtureProject({
    slots: [bigNumberSlot('s1', 0, 3000), bigNumberSlot('s2', 4000, 7000)],
  });

const base: RenderOptions = { format: '16:9', resolution: '1080p', captions: false, music: false };

function stateFor(over: Partial<ExportOptionsInput> = {}, options: RenderOptions = base) {
  return exportOptionsState({
    project: project(),
    options,
    config: APP_CONFIG_DEFAULTS,
    mode: 'cloud',
    balance: 120,
    online: true,
    isRenderable,
    ...over,
  });
}

/** The dialog with its options kept in state, like the controller does. */
function Harness({
  over,
  onExport = () => {},
  onClose = () => {},
  startError = null,
}: {
  over?: Partial<ExportOptionsInput>;
  onExport?: () => void;
  onClose?: () => void;
  startError?: string | null;
}) {
  const [options, setOptions] = useState<RenderOptions>(base);
  return (
    <>
      <button type="button">Export</button>
      <ExportDialog
        open
        view="options"
        project={project()}
        options={options}
        optionsState={stateFor(over, options)}
        renderView={null}
        startError={startError}
        free={over?.mode === 'offline'}
        isActiveRender={false}
        onOptions={setOptions}
        onExport={onExport}
        onRetry={() => {}}
        onClose={onClose}
      />
    </>
  );
}

describe('export dialog, options view (R1.1–R1.13)', () => {
  it('shows the designed copy, the project card and the cost row (R1.1, R1.2, R1.4)', () => {
    render(<Harness />);
    const dialog = screen.getByRole('dialog', { name: 'Export video' });
    expect(within(dialog).getByText('A little voice. Ready for the world.')).toBeTruthy();
    expect(within(dialog).getByText(project().title)).toBeTruthy();
    expect(within(dialog).getByText('18 sec · 2 scenes')).toBeTruthy();
    expect(within(dialog).getByText('Editorial Explainer')).toBeTruthy();
    expect(within(dialog).getByText('Cost: 5 credits')).toBeTruthy();
    expect(within(dialog).getByText('120 available')).toBeTruthy();
    expect(within(dialog).getByText('MP4 · H.264 · 30 fps')).toBeTruthy();
    expect(
      (within(dialog).getByRole('button', { name: 'Export video' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('preselects the project format and 1080p (R1.3), and a pick updates the cost (R1.4)', () => {
    render(<Harness />);
    const formats = screen.getByRole('radiogroup', { name: 'Format' });
    expect(within(formats).getByRole('radio', { name: '16:9' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    const res = screen.getByRole('radiogroup', { name: 'Resolution' });
    expect(within(res).getByRole('radio', { name: '1080p' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    fireEvent.click(within(res).getByRole('radio', { name: '720p' }));
    expect(screen.getByText('Cost: 3 credits')).toBeTruthy();
  });

  it('format and resolution are radio groups with arrow keys, Home and End', () => {
    render(<Harness />);
    const formats = screen.getByRole('radiogroup', { name: 'Format' });
    const first = within(formats).getByRole('radio', { name: '16:9' });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    const second = within(formats).getByRole('radio', { name: '9:16' });
    expect(second.getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(second);
    // Roving tabindex: only the selected card is in the tab order.
    expect(second.tabIndex).toBe(0);
    expect(first.tabIndex).toBe(-1);
    fireEvent.keyDown(second, { key: 'End' });
    expect(within(formats).getByRole('radio', { name: '1:1' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowRight' });
    expect(within(formats).getByRole('radio', { name: '16:9' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    fireEvent.keyDown(document.activeElement as Element, { key: 'Home' });
    expect(within(formats).getByRole('radio', { name: '16:9' }).getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  it('4K is a disabled "Soon" card that explains itself and is skipped by the arrows (R1.6)', () => {
    render(<Harness />);
    const res = screen.getByRole('radiogroup', { name: 'Resolution' });
    const fourK = within(res).getByRole('radio', { name: /4K/ });
    expect(fourK.getAttribute('aria-disabled')).toBe('true');
    expect(fourK.getAttribute('aria-checked')).toBe('false');
    const desc = document.getElementById(fourK.getAttribute('aria-describedby') ?? '');
    expect(desc?.textContent).toBe('4K export is almost ready.');
    fireEvent.click(fourK);
    expect(within(res).getByRole('radio', { name: '1080p' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    const p1080 = within(res).getByRole('radio', { name: '1080p' });
    p1080.focus();
    fireEvent.keyDown(p1080, { key: 'ArrowRight' });
    // Wraps past the disabled 4K to 720p.
    expect(within(res).getByRole('radio', { name: '720p' }).getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  it('captions, transparent and music are named, off, disabled switches that say why (R1.5, R1.7)', () => {
    render(<Harness />);
    const switches = screen.getAllByRole('switch');
    expect(switches.map((s) => s.getAttribute('aria-label'))).toEqual([
      'Captions',
      'Transparent background (for editors)',
      'Include music',
    ]);
    for (const s of switches) {
      expect(s.getAttribute('aria-checked')).toBe('false');
      expect((s as HTMLButtonElement).disabled).toBe(true);
      const why = document.getElementById(s.getAttribute('aria-describedby') ?? '');
      expect(why?.textContent?.length).toBeGreaterThan(5);
    }
    expect(screen.getAllByText('Soon').length).toBe(4); // three switches and 4K
    expect(screen.getByText('Exports as WebM with alpha when enabled.')).toBeTruthy();
  });

  it('says how many slots are left out and still allows the export (R1.8)', () => {
    const p = fixtureProject({
      slots: [
        bigNumberSlot('s1', 0, 3000),
        { ...bigNumberSlot('s2', 4000, 7000), status: 'suggested' },
      ],
    });
    render(<Harness over={{ project: p }} />);
    expect(screen.getByText("1 slot isn't ready and will be left out.")).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Export video' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('disables the button with "Add a graphic first." when nothing would render (R1.8)', () => {
    render(<Harness over={{ project: fixtureProject() }} />);
    expect(screen.getByText('Add a graphic first.')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Export video' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('disables the button and says so when the balance is below the cost (R1.9)', () => {
    render(<Harness over={{ balance: 4 }} />);
    expect(screen.getByText('Not enough credits. Small edits stay free.')).toBeTruthy();
    expect(screen.queryByText(/available/)).toBeNull();
    expect(
      (screen.getByRole('button', { name: 'Export video' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('blocks a video over the limit (R1.11) and an offline browser (R1.12)', () => {
    const p = { ...project(), durationMs: 200_000 };
    const { unmount } = render(<Harness over={{ project: p }} />);
    expect(screen.getByText('Exports are up to 3 min for now.')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Export video' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    unmount();
    render(<Harness over={{ online: false }} />);
    expect(screen.getByText('Needs connection')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Export video' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('local mode shows "Local render · free" and no credits (R7.3)', () => {
    render(<Harness over={{ mode: 'offline', balance: null }} />);
    expect(screen.getByText('Cost: free')).toBeTruthy();
    expect(screen.getByText('Local render · free')).toBeTruthy();
    expect(screen.queryByText(/credits/)).toBeNull();
  });

  it('shows why a request was refused', () => {
    render(<Harness startError="That's today's exports. More tomorrow." />);
    expect(screen.getByText("That's today's exports. More tomorrow.")).toBeTruthy();
  });

  it('Export video calls onExport once', () => {
    const onExport = vi.fn();
    render(<Harness onExport={onExport} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export video' }));
    expect(onExport).toHaveBeenCalledTimes(1);
  });
});

describe('export dialog, keyboard and focus (R1.13, design §18)', () => {
  it('moves focus into the dialog, closes on Esc and returns focus to the opener', async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    function Opener() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Export
          </button>
          {open && (
            <Harness
              onClose={() => {
                onClose();
                setOpen(false);
              }}
            />
          )}
        </>
      );
    }
    render(<Opener />);
    const opener = screen.getByRole('button', { name: 'Export' });
    opener.focus();
    fireEvent.click(opener);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(document.activeElement).toBe(opener);
    vi.useRealTimers();
  });

  it('traps Tab inside the dialog', async () => {
    render(<Harness />);
    const dialog = screen.getByRole('dialog');
    const items = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    const last = items[items.length - 1] as HTMLElement;
    const first = items[0] as HTMLElement;
    last.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    first.focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('has a labelled close button and a modal dialog role', () => {
    render(<Harness />);
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true');
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });
});
