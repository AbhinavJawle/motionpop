/**
 * Fonts bundled with every composition so preview and render use identical glyphs.
 * Geist + Geist Mono variable woff2 (SIL OFL 1.1, see OFL-Geist.txt), one file per family covering 100–900.
 */
export const BUNDLED_FONTS = {
  Geist: 'Geist-Variable.woff2',
  'Geist Mono': 'GeistMono-Variable.woff2',
} as const;
export type BundledFamily = keyof typeof BUNDLED_FONTS;

/** First family of a CSS font-family list, unquoted: `'Geist', Inter, sans-serif` → `Geist`. */
export function primaryFamily(stack: string): string {
  const first = stack.split(',')[0] ?? '';
  return first.trim().replace(/^['"]|['"]$/g, '');
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
        `@font-face { font-family: '${f}'; src: url(data:font/woff2;base64,${data[f]}) format('woff2'); font-weight: 100 900; font-style: normal; font-display: block; }`,
    )
    .join('\n');
}
