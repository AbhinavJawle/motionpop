'use client';

import { ChevronDown } from 'lucide-react';
import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Dropdown } from '@/components/ui/dropdown';
import { Toggle } from '@/components/ui/toggle';
import { cn } from '@/lib/cn';
import { displayValue, parseFieldInput, type Field } from '@/lib/inspector/content-form';

/** Commits one field; returns an error message to show on the field, or null. */
export type Commit = (field: Field, value: unknown) => string | null;

const FIELD_SHADOW = 'shadow-glass';
const ERROR_RING = 'shadow-[inset_0_0_0_1px_var(--color-error)]';

/**
 * An uncontrolled-feeling text input: edits a draft, commits on Enter or blur, Escape puts the
 * old value back. A refused commit keeps the draft and shows the message (spec 09 R2.3).
 */
function useDraft(field: Field, commit: Commit, report?: (message: string | null) => void) {
  const shown = displayValue(field);
  const [draft, setDraft] = useState(shown);
  // The slot changed under the field (undo, a quick edit, another version): show the new value.
  const [seen, setSeen] = useState(shown);
  if (seen !== shown) {
    setSeen(shown);
    setDraft(shown);
  }
  const [error, setErrorState] = useState<string | null>(null);
  const setError = (message: string | null) => {
    setErrorState(message);
    report?.(message);
  };
  const run = () => {
    if (draft === displayValue(field)) {
      setError(null);
      return;
    }
    const parsed = parseFieldInput(field, draft);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(commit(field, parsed.value));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      run();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setDraft(displayValue(field));
      setError(null);
      e.currentTarget.blur();
    }
  };
  return { draft, setDraft, error, run, onKeyDown };
}

function ErrorText({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 px-1 text-[10px] leading-[13px] text-error">
      {message}
    </p>
  );
}

/** "Title text field": 320×28, r8, 12/16 `#E6E3EF`. */
export function TitleField({
  field,
  commit,
}: {
  field: Extract<Field, { kind: 'text' }>;
  commit: Commit;
}) {
  const { draft, setDraft, error, run, onKeyDown } = useDraft(field, commit);
  const errId = useId();
  return (
    <div className="mt-[7px]">
      <input
        aria-label={field.label}
        aria-invalid={error !== null}
        aria-describedby={error ? errId : undefined}
        value={draft}
        maxLength={field.max ? field.max + 20 : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={run}
        onKeyDown={onKeyDown}
        className={cn(
          'h-7 w-full rounded-lg bg-card px-[11px] text-xs leading-4 text-field-ink outline-none transition-shadow focus:shadow-violet-glow',
          error ? ERROR_RING : FIELD_SHADOW,
        )}
      />
      <ErrorText id={errId} message={error} />
    </div>
  );
}

/** A secondary text: the same field with its label inside on the left. */
export function CompactField({
  field,
  commit,
}: {
  field: Extract<Field, { kind: 'text' }>;
  commit: Commit;
}) {
  const { draft, setDraft, error, run, onKeyDown } = useDraft(field, commit);
  const errId = useId();
  return (
    <div className="mt-2">
      <label
        className={cn(
          'flex h-7 items-center gap-2 rounded-lg bg-card px-[11px] transition-shadow focus-within:shadow-violet-glow',
          error ? ERROR_RING : FIELD_SHADOW,
        )}
      >
        <span className="w-[70px] shrink-0 truncate text-[10px] leading-[13px] text-section">
          {field.label}
        </span>
        <input
          aria-label={field.label}
          aria-invalid={error !== null}
          aria-describedby={error ? errId : undefined}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={run}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent text-[11px] leading-4 text-field-ink outline-none"
        />
      </label>
      <ErrorText id={errId} message={error} />
    </div>
  );
}

/** One table row: mono label, mono value (an input), a 5 px colour dot (ember for the focal number). */
function TableRow({
  field,
  commit,
  onError,
}: {
  field: Extract<Field, { kind: 'number' | 'short' }>;
  commit: Commit;
  onError: (path: string, message: string | null) => void;
}) {
  const { draft, setDraft, error, run, onKeyDown } = useDraft(field, commit, (m) =>
    onError(field.path, m),
  );
  const focal = field.kind === 'number' && field.focal;
  return (
    <div className="flex h-5 items-center pl-[11px]">
      <span className="w-[187px] shrink-0 truncate font-mono text-[10px] leading-[13px] text-text-2">
        {field.label}
      </span>
      <input
        aria-label={field.label}
        aria-invalid={error !== null}
        inputMode={field.kind === 'number' ? 'decimal' : undefined}
        value={draft}
        placeholder="–"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={run}
        onKeyDown={onKeyDown}
        className={cn(
          'tabular h-4 w-20 rounded bg-transparent font-mono text-[10px] leading-[13px] text-cell-ink outline-none placeholder:text-text-4 focus:bg-card-3',
          error && 'text-error',
        )}
      />
      <span
        aria-hidden
        className={cn('ml-4 size-[5px] rounded-full', focal ? 'bg-ember' : 'bg-violet')}
      />
    </div>
  );
}

/** "Revenue data · editable": 320×(20 per row), r8, 1 px ring, rows of numbers and short texts. */
export function DataTable({
  fields,
  commit,
  footer,
}: {
  fields: Extract<Field, { kind: 'number' | 'short' }>[];
  commit: Commit;
  /** The "More" row, when this table is the last block of the form. */
  footer?: ReactNode;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const onError = (path: string, message: string | null) =>
    setErrors((cur) => {
      if (message === null) {
        if (!(path in cur)) return cur;
        return Object.fromEntries(Object.entries(cur).filter(([k]) => k !== path));
      }
      return { ...cur, [path]: message };
    });
  return (
    <div className="mt-2">
      <div
        role="group"
        aria-label="Values"
        className="overflow-hidden rounded-lg bg-card shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]"
      >
        {fields.map((f) => (
          <TableRow
            key={`${f.path}:${displayValue(f)}`}
            field={f}
            commit={commit}
            onError={onError}
          />
        ))}
        {footer}
      </div>
      <ErrorText id="content-table-error" message={Object.values(errors)[0] ?? null} />
    </div>
  );
}

/**
 * "More": one table-styled row that holds the optional fields that are empty (prefix, decimals,
 * count from and the like), so a form with many of them keeps TIMING and VERSIONS on screen.
 * A real button: Tab reaches it, Enter and Space toggle it.
 */
export function MoreRow({
  open,
  count,
  onToggle,
  controls,
}: {
  open: boolean;
  count: number;
  onToggle: () => void;
  controls: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className="flex h-5 w-full items-center pl-[11px] text-left outline-none hover:bg-card-3 focus-visible:bg-card-3 focus-visible:shadow-violet-glow"
    >
      <span className="w-[187px] shrink-0 font-mono text-[10px] leading-[13px] text-text-2">
        {open ? 'Less' : 'More'}
        {!open && count > 0 && <span className="ml-1.5 text-text-3">{count} optional</span>}
      </span>
      <span className="flex-1" />
      <ChevronDown
        className={cn('mr-[9px] size-3 text-text-2 transition-transform', open && 'rotate-180')}
        strokeWidth={1.5}
        aria-hidden
      />
    </button>
  );
}

export function EnumField({
  field,
  commit,
}: {
  field: Extract<Field, { kind: 'enum' }>;
  commit: Commit;
}) {
  const [error, setError] = useState<string | null>(null);
  const NONE = '__none__';
  const options = [
    ...(field.required ? [] : [{ value: NONE, label: 'None' }]),
    ...field.options.map((o) => ({ value: o, label: o })),
  ];
  return (
    <div className="mt-2">
      <div
        className={cn(
          'flex h-7 items-center gap-2 rounded-lg bg-card pr-1.5 pl-[11px]',
          error ? ERROR_RING : FIELD_SHADOW,
        )}
      >
        <span className="w-[70px] shrink-0 truncate text-[10px] leading-[13px] text-section">
          {field.label}
        </span>
        <Dropdown
          label={field.label}
          value={field.value ?? NONE}
          options={options}
          className="min-w-0 flex-1"
          menuClassName="!top-auto bottom-full mb-1 mt-0"
          onChange={(v) => setError(commit(field, v === NONE ? undefined : v))}
        />
      </div>
      <ErrorText id={`${field.path}-error`} message={error} />
    </div>
  );
}

export function BoolField({
  field,
  commit,
}: {
  field: Extract<Field, { kind: 'bool' }>;
  commit: Commit;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-2">
      <div
        className={cn(
          'flex h-7 items-center justify-between rounded-lg bg-card px-[11px]',
          FIELD_SHADOW,
        )}
      >
        <span className="text-[10px] leading-[13px] text-section">{field.label}</span>
        <Toggle
          label={field.label}
          checked={field.value === true}
          onCheckedChange={(next) => setError(commit(field, next))}
        />
      </div>
      <ErrorText id={`${field.path}-error`} message={error} />
    </div>
  );
}

/** `{ label, value }` rows (chart data): the label is shown, the value is edited. */
export function RowsField({
  field,
  commit,
}: {
  field: Extract<Field, { kind: 'rows' }>;
  commit: Commit;
}) {
  const rows = field.rows.map<Extract<Field, { kind: 'number' }>>((r) => ({
    kind: 'number',
    path: r.valuePath,
    label: r.label,
    value: r.value,
    int: false,
    required: true,
    focal: false,
  }));
  if (rows.length === 0) return null;
  // The last row is the one the story lands on: ember, like the design's 2022 bar.
  const last = rows.length - 1;
  if (rows[last]) rows[last].focal = true;
  return <DataTable fields={rows} commit={commit} />;
}
