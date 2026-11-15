import { hookStatement } from './hook-statement';
import { statPunch } from './stat-punch';

export * from './catalogue';
export * from './define';
export { hookStatement, statPunch };

/** Scene registry (spec 07). Scenes are components; the runtime looks ids up in both maps. */
export const scenes = { [statPunch.id]: statPunch, [hookStatement.id]: hookStatement } as const;
