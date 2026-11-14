import type { DetailedHTMLProps, HTMLAttributes } from 'react';

type PlayerAttributes = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
  src?: string;
  srcdoc?: string;
  width?: number | string;
  height?: number | string;
  controls?: boolean;
  muted?: boolean;
};

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'hyperframes-player': PlayerAttributes;
    }
  }
}
