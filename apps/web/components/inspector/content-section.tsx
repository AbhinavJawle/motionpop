'use client';

import type { Slot } from '@motionpop/schemas';
import { ChevronDown } from 'lucide-react';
import { motion } from 'motion/react';
import { Fragment, useMemo, useState } from 'react';
import { StatusDot } from '@/components/ui/status-dot';
import { cn } from '@/lib/cn';
import { commitField } from '@/lib/inspector/commit-field';
import { contentForm, type Field } from '@/lib/inspector/content-form';
import { schemaFor } from '@/lib/motion/registry';
import { editorStore } from '@/lib/stores/editor';
import { useStill } from '@/lib/motion/use-still';
import {
  BoolField,
  CompactField,
  DataTable,
  EnumField,
  RowsField,
  TitleField,
  type Commit,
} from './content-fields';
import { Divider, SectionLabel } from './parts';

/** Remembered for the session: the collapse choice survives selecting another slot (R2.5). */
let collapsedForSession = false;

/** Fields that share the data table, in one group. */
type TableField = Extract<Field, { kind: 'number' | 'short' }>;
type Block =
  | { kind: 'table'; fields: TableField[] }
  | { kind: 'field'; field: Exclude<Field, { kind: 'number' | 'short' }> };

function blocks(fields: Field[]): Block[] {
  const out: Block[] = [];
  for (const f of fields) {
    if (f.kind === 'number' || f.kind === 'short') {
      const last = out.at(-1);
      if (last?.kind === 'table') last.fields.push(f);
      else out.push({ kind: 'table', fields: [f] });
    } else out.push({ kind: 'field', field: f });
  }
  return out;
}

/**
 * CONTENT (spec 09 R2): label at y255 with a chevron, then the form built from the slot's schema:
 * title field, compact fields, the data table, dropdowns and switches. Each commit is one `user`
 * version. A scene whose gates object to the edit still takes it, with a warning underneath.
 */
export function ContentSection({ slot }: { slot: Slot }) {
  const [collapsed, setCollapsed] = useState(collapsedForSession);
  const [warning, setWarning] = useState<string | null>(null);
  const still = useStill();
  const schema = schemaFor(slot.componentId);
  const fields = useMemo(
    () => (schema ? contentForm(schema, slot.params) : []),
    [schema, slot.params],
  );

  const commit: Commit = (field, value) => {
    const r = commitField(editorStore, slot.id, field, value, { doc: document });
    if (!r.ok) return r.error;
    setWarning(r.warning);
    return null;
  };

  const toggle = () => {
    collapsedForSession = !collapsed;
    setCollapsed(!collapsed);
  };

  return (
    <section aria-label="Content">
      <Divider className="mt-2.5" />
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-controls="inspector-content-body"
        onClick={toggle}
        className="mt-[6px] flex h-[13px] w-full items-center justify-between"
      >
        <SectionLabel>Content</SectionLabel>
        <ChevronDown
          className={cn('size-3 text-text-2 transition-transform', collapsed && '-rotate-90')}
          strokeWidth={1.5}
          aria-hidden
        />
      </button>
      <motion.div
        id="inspector-content-body"
        initial={false}
        animate={{ height: collapsed ? 0 : 'auto', opacity: collapsed ? 0 : 1 }}
        transition={still ? { duration: 0 } : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className={cn('-mx-1 overflow-hidden px-1', collapsed && 'pointer-events-none')}
        aria-hidden={collapsed}
        inert={collapsed}
      >
        {!schema ? (
          <p className="mt-[7px] text-[11px] leading-4 text-text-3">
            This graphic isn’t available yet.
          </p>
        ) : fields.length === 0 ? (
          <p className="mt-[7px] text-[11px] leading-4 text-text-3">Nothing to edit here.</p>
        ) : (
          blocks(fields).map((b, i) => (
            <Fragment key={i}>
              {b.kind === 'table' ? (
                <DataTable fields={b.fields} commit={commit} />
              ) : (
                <FieldView field={b.field} commit={commit} />
              )}
            </Fragment>
          ))
        )}
        {warning && (
          <p
            role="status"
            className="mt-2 flex items-center gap-1.5 text-[10px] leading-[13px] text-warn"
          >
            <StatusDot tone="warn" className="size-[5px]" />
            {warning}
          </p>
        )}
      </motion.div>
    </section>
  );
}

function FieldView({
  field,
  commit,
}: {
  field: Exclude<Field, { kind: 'number' | 'short' }>;
  commit: Commit;
}) {
  const key = field.path;
  switch (field.kind) {
    case 'text':
      return field.title ? (
        <TitleField key={key} field={field} commit={commit} />
      ) : (
        <CompactField key={key} field={field} commit={commit} />
      );
    case 'enum':
      return <EnumField key={key} field={field} commit={commit} />;
    case 'bool':
      return <BoolField key={key} field={field} commit={commit} />;
    case 'rows':
      return <RowsField key={key} field={field} commit={commit} />;
  }
}
