import { bigNumber } from './big-number';
import { custom } from './custom';

export { bigNumber, custom };
export const components = { [bigNumber.id]: bigNumber, [custom.id]: custom } as const;
