import { components, scenes, type MotionComponent, type Scene } from '@motionpop/motion';
import type { z } from 'zod';

/**
 * Everything the editor can render (spec 07 task 27): the library components and the scenes,
 * the same set the runtime mounts in the preview and the render. Scenes are components whose
 * params are the score, so most code only needs `componentFor`.
 */
const all: Readonly<Record<string, MotionComponent<unknown> | undefined>> = {
  ...(components as unknown as Record<string, MotionComponent<unknown>>),
  ...(scenes as unknown as Record<string, MotionComponent<unknown>>),
};
const sceneMap = scenes as unknown as Readonly<Record<string, Scene<unknown> | undefined>>;

export function componentFor(id: string): MotionComponent<unknown> | undefined {
  return Object.hasOwn(all, id) ? all[id] : undefined;
}

export function sceneFor(id: string): Scene<unknown> | undefined {
  return Object.hasOwn(sceneMap, id) ? sceneMap[id] : undefined;
}

export const isScene = (id: string): boolean => sceneFor(id) !== undefined;

/** The params schema of a component or scene (a scene's is its score schema). */
export const schemaFor = (id: string): z.ZodType | undefined => componentFor(id)?.params;
