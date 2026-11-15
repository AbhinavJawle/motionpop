import { statPunch } from './stat-punch';

export * from './define';
export { statPunch };

/** Scene registry (spec 07). Scenes are components; the runtime looks ids up in both maps. */
export const scenes = { [statPunch.id]: statPunch } as const;
