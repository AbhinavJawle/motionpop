// @vitest-environment happy-dom
import type { FrameNote } from '@motionpop/schemas';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Route } from '@/lib/ai/route';
import { bubbleAnchor } from '@/lib/notes/geometry';
import { NoteInput, NoteView, type NoteNotice } from './note-bubble';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only removal of a DOM API
delete (Element.prototype as any).animate;
afterEach(cleanup);

const placement = bubbleAnchor({ x: 0.4, y: 0.5, w: 0.2, h: 0.2 });
const note: FrameNote = {
  id: 'n1',
  tMs: 0,
  shape: { kind: 'circle', points: [0.5, 0.5, 0.1] },
  text: 'Make this slower',
  status: 'open',
};
const DEVICE: Route = { kind: 'device', mode: 'ONLY_ON_DEVICE', allowCloud: false };
const noop = () => {};

function view(over: Partial<Parameters<typeof NoteView>[0]> = {}) {
  const fns = { onDelete: vi.fn(), onReopen: vi.fn(), onFixAgain: vi.fn(), onTryCloud: vi.fn() };
  render(
    <NoteView
      note={note}
      n={1}
      placement={placement}
      fixed={false}
      busy={false}
      notice={null}
      {...fns}
      {...over}
    />,
  );
  return fns;
}

describe('NoteInput', () => {
  it('saves on Enter with the trimmed text and cancels on Escape', () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(
      <NoteInput n={2} placement={placement} route={DEVICE} onSave={onSave} onCancel={onCancel} />,
    );
    const input = screen.getByLabelText('What should change?');
    fireEvent.keyDown(input, { key: 'Enter' }); // empty: nothing
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '  make it slower ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSave).toHaveBeenCalledWith('make it slower');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });
  it('shows where it runs before the action: on-device free, or the reason it is off', () => {
    const { unmount } = render(
      <NoteInput n={1} placement={placement} route={DEVICE} onSave={noop} onCancel={noop} />,
    );
    expect(screen.getByText('free · on-device')).toBeTruthy();
    unmount();
    render(
      <NoteInput
        n={1}
        placement={placement}
        route={{ kind: 'disabled', reason: 'Needs connection' }}
        onSave={noop}
        onCancel={noop}
      />,
    );
    expect(screen.getByText('Needs connection')).toBeTruthy();
  });
});

describe('NoteView', () => {
  it('an open note shows its text, Fix it and a delete button', () => {
    const fns = view();
    expect(screen.getByText('Make this slower')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Fix it' }));
    expect(fns.onFixAgain).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete note 1' }));
    expect(fns.onDelete).toHaveBeenCalled();
  });
  it('a fixed note shows ✓ Fixed and "Still there?", which reopens it', () => {
    const fns = view({ fixed: true, note: { ...note, status: 'fixed', fixedVersionId: 'v' } });
    expect(screen.getByText('✓ Fixed')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Still there?' }));
    expect(fns.onReopen).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Delete note 1' })).toBeNull();
  });
  it('busy shows Pip is on it and no actions', () => {
    view({ busy: true });
    expect(screen.getByText('Pip is on it…')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Fix it' })).toBeNull();
  });
  it('a device failure offers the cloud and Fix again; an escalation says why', () => {
    const fns = view({ notice: { kind: 'device-failed' } as NoteNotice });
    fireEvent.click(screen.getByRole('button', { name: /Try in the cloud/ }));
    expect(fns.onTryCloud).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Fix again' })).toBeTruthy();
    cleanup();
    view({ notice: { kind: 'escalate', message: 'That needs a new graphic. Try Generate.' } });
    expect(screen.getByText('That needs a new graphic. Try Generate.')).toBeTruthy();
  });
});
