import type { ValidatedParams } from '@motionpop/ai';
import { componentFor, isScene } from '../motion/registry';

type Entry = {
  params: { safeParse: (p: unknown) => ParseResult };
  defaults: Record<string, unknown>;
};
type ParseResult =
  | { success: true; data: unknown }
  | { success: false; error: { issues: { path: PropertyKey[] }[] } };

/**
 * The post-pass `validate` for the browser (spec 06 R3.1): parse with the component's zod
 * schema; fill every failing top-level field from the component defaults and list it in
 * `needsInput`. Components that aren't built yet keep their params as they are.
 */
export function validateParams(
  componentId: string,
  params: Record<string, unknown>,
): ValidatedParams {
  const comp = componentFor(componentId) as Entry | undefined;
  if (!comp) return { params: { ...params }, needsInput: [] };
  const first = comp.params.safeParse(params);
  if (first.success) return { params: first.data as Record<string, unknown>, needsInput: [] };
  const missing = [
    ...new Set(first.error.issues.map((i) => String(i.path[0] ?? '')).filter((k) => k !== '')),
  ];
  // A scene's defaults are example content (spec 07), not neutral values: filling them in would
  // show a number or a line nobody said. Its params stay as given and the slot stays suggested.
  if (isScene(componentId)) return { params: { ...params }, needsInput: missing };
  const filled: Record<string, unknown> = { ...params };
  for (const k of missing) filled[k] = comp.defaults[k];
  const second = comp.params.safeParse(filled);
  return {
    params: second.success ? (second.data as Record<string, unknown>) : comp.defaults,
    needsInput: missing,
  };
}
