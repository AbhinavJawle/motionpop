import { bigNumber } from './big-number';
import { custom } from './custom';

export { bigNumber, custom };
export const components = { [bigNumber.id]: bigNumber, [custom.id]: custom } as const;
export {
  CUSTOM_ALLOW_FLAG,
  CUSTOM_LIMITS,
  customExample,
  FILM_MAX_TAIL_MS,
  customParams,
  lintCustom,
  lintProp,
  type CustomParams,
} from './custom';
