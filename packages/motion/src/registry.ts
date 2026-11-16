import type { Look, StylePack } from '@motionpop/schemas';
import type { z } from 'zod';
import { components } from './components';
import type { MotionComponent } from './contract';
import { scenes, type Scene } from './scenes';
import { editorialExplainer, looks, stylePacks } from './styles';

/**
 * Everything that can render (spec 07 task 27, moved here by spec 08 task 4): the library
 * components and the scenes, the same set the runtime mounts in the preview and in the render.
 * Scenes are components whose params are the score, so most code only needs `componentFor`.
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

/**
 * The look of a project: a polished look, else a style pack, else the editorial explainer.
 * The preview and the render both resolve `project.styleId` here, so they cannot drift
 * (spec 08 review F4). A plain pack is a valid look, so the result is also the compile style.
 */
export function lookFor(styleId: string): StylePack | Look {
  if (Object.hasOwn(looks, styleId)) return looks[styleId] ?? editorialExplainer;
  if (Object.hasOwn(stylePacks, styleId)) return stylePacks[styleId] ?? editorialExplainer;
  return editorialExplainer;
}
