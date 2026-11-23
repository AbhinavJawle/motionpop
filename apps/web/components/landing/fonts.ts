import localFont from 'next/font/local';

/** Marketing-site faces (spec 34), self-hosted, SIL OFL 1.1. Geist Mono comes from the root layout. */
export const display = localFont({
  src: './fonts/BebasNeue-Regular.woff2',
  variable: '--font-display',
  display: 'swap',
  fallback: ['Impact', 'Arial Narrow', 'sans-serif'],
});

export const hand = localFont({
  src: './fonts/PatrickHand-Regular.woff2',
  variable: '--font-hand',
  display: 'swap',
  fallback: ['Comic Sans MS', 'cursive'],
});
