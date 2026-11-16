/**
 * Fonts bundled with every composition so preview and render use identical glyphs.
 * Geist + Geist Mono variable woff2 (SIL OFL 1.1, see OFL-Geist.txt), one file per family covering 100–900.
 * Caveat variable woff2, latin subset, 400–700 (SIL OFL 1.1, see OFL-Caveat.txt): the hand font of looks.
 */
export const BUNDLED_FONTS = {
  Geist: 'Geist-Variable.woff2',
  'Geist Mono': 'GeistMono-Variable.woff2',
  Caveat: 'Caveat-Variable.woff2',
  Fraunces: 'Fraunces-Variable.woff2',
  'Space Grotesk': 'SpaceGrotesk-Variable.woff2',
  'Bricolage Grotesque': 'BricolageGrotesque-Variable.woff2',
  'Playfair Display': 'PlayfairDisplay-Variable.woff2',
} as const;
/** Weight range each bundled file covers. */
const WEIGHTS: Record<keyof typeof BUNDLED_FONTS, string> = {
  Geist: '100 900',
  'Geist Mono': '100 900',
  Caveat: '400 700',
  Fraunces: '100 900',
  'Space Grotesk': '300 700',
  'Bricolage Grotesque': '200 800',
  'Playfair Display': '400 900',
};
export type BundledFamily = keyof typeof BUNDLED_FONTS;

/** First family of a CSS font-family list, unquoted: `'Geist', Inter, sans-serif` → `Geist`. */
export function primaryFamily(stack: string): string {
  const first = stack.split(',')[0] ?? '';
  return first.trim().replace(/^['"]|['"]$/g, '');
}

/** CSS font-family value for a bundled family name, with system fallbacks: `Geist Mono` → `'Geist Mono', ui-monospace, monospace`. */
export function fontStack(family: string): string {
  const name = primaryFamily(family);
  const fallback = /mono/i.test(name)
    ? 'ui-monospace, monospace'
    : name === 'Caveat'
      ? 'cursive'
      : 'system-ui, sans-serif';
  return `'${name}', ${fallback}`;
}

/**
 * `@font-face` rules (base64 data URLs) for the bundled families used by the given stacks.
 * `data` maps family → base64 woff2 (dist/fonts.json, built by scripts/build-runtime.ts).
 */
export function fontFaceCss(
  stacks: readonly string[],
  data: Readonly<Record<string, string>>,
): string {
  const families = [...new Set(stacks.map(primaryFamily))].filter(
    (f): f is BundledFamily => f in BUNDLED_FONTS && typeof data[f] === 'string',
  );
  return families
    .map(
      (f) =>
        `@font-face { font-family: '${f}'; src: url(data:font/woff2;base64,${data[f]}) format('woff2'); font-weight: ${WEIGHTS[f]}; font-style: normal; font-display: block; }`,
    )
    .join('\n');
}
