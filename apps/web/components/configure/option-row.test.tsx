// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only removal of a DOM API
delete (Element.prototype as any).animate;
if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as never;
}

import { DescribeField, OptionRow, Toggle, type Option } from './option-row';

afterEach(cleanup);

const options: Option<'a' | 'b' | 'c'>[] = [
  { value: 'a', label: 'Alpha', art: <i /> },
  { value: 'b', label: 'Beta', sub: 'second', art: <i /> },
  { value: 'c', label: 'Gamma', art: <i /> },
];

function Harness({
  start = 'a',
  onPick,
}: {
  start?: 'a' | 'b' | 'c';
  onPick?: (v: string) => void;
}) {
  const [v, setV] = useState<'a' | 'b' | 'c'>(start);
  return (
    <OptionRow
      layoutKey="t"
      label="Pick"
      options={options}
      value={v}
      soon="More soon"
      onChange={(n) => {
        onPick?.(n);
        setV(n);
      }}
    />
  );
}

const checked = () =>
  screen
    .getAllByRole('radio')
    .filter((r) => r.getAttribute('aria-checked') === 'true')
    .map((r) => r.textContent);

describe('OptionRow', () => {
  it('is a labelled radiogroup with one checked card and a roving tab stop', () => {
    render(<Harness start="b" />);
    expect(screen.getByRole('radiogroup', { name: 'Pick' })).toBeTruthy();
    expect(checked()).toHaveLength(1);
    expect(checked()[0]).toContain('Beta');
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('tabindex'))).toEqual([
      '-1',
      '0',
      '-1',
    ]);
    expect(screen.getByText('More soon')).toBeTruthy();
  });

  it('clicking selects', () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    fireEvent.click(screen.getByRole('radio', { name: /Gamma/ }));
    expect(onPick).toHaveBeenCalledWith('c');
    expect(checked()[0]).toContain('Gamma');
  });

  it('arrow keys move the selection and the focus, and wrap around', () => {
    render(<Harness start="a" />);
    const radios = () => screen.getAllByRole('radio');
    fireEvent.keyDown(radios()[0]!, { key: 'ArrowRight' });
    expect(checked()[0]).toContain('Beta');
    expect(document.activeElement).toBe(radios()[1]);

    fireEvent.keyDown(radios()[1]!, { key: 'ArrowDown' });
    expect(checked()[0]).toContain('Gamma');

    fireEvent.keyDown(radios()[2]!, { key: 'ArrowRight' });
    expect(checked()[0]).toContain('Alpha');
    expect(document.activeElement).toBe(radios()[0]);

    fireEvent.keyDown(radios()[0]!, { key: 'ArrowLeft' });
    expect(checked()[0]).toContain('Gamma');
    fireEvent.keyDown(radios()[2]!, { key: 'ArrowUp' });
    expect(checked()[0]).toContain('Beta');
  });

  it('other keys change nothing', () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    fireEvent.keyDown(screen.getAllByRole('radio')[0]!, { key: 'a' });
    expect(onPick).not.toHaveBeenCalled();
  });
});

describe('Toggle', () => {
  it('flips aria-checked through onChange', () => {
    function T() {
      const [on, setOn] = useState(false);
      return <Toggle label="Captions" checked={on} onChange={setOn} />;
    }
    render(<T />);
    const sw = screen.getByRole('switch', { name: 'Captions' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(sw);
    expect(sw.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(sw);
    expect(sw.getAttribute('aria-checked')).toBe('false');
  });
});

describe('DescribeField', () => {
  it('caps the text at 300 characters, counts it and commits on blur', () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(
      <DescribeField
        label="Describe"
        value="hi"
        onChange={onChange}
        onCommit={onCommit}
        placeholder="p"
        status="Pip reads this"
      />,
    );
    expect(screen.getByText('2/300')).toBeTruthy();
    expect(screen.getByText('Pip reads this')).toBeTruthy();
    const box = screen.getByLabelText('Describe');
    fireEvent.change(box, { target: { value: 'x'.repeat(400) } });
    expect(onChange).toHaveBeenCalledWith('x'.repeat(300));
    fireEvent.blur(box);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});
