import { brandColourIssue, type Brand, type Look, type StylePack } from '@motionpop/schemas';

const cache = new Map<string, StylePack | Look>();

/**
 * The look with the brand's colours in place of its accents (and of the accent inside its chart
 * ramp). A colour that can't be read on the look's background is ignored: the Brand panel never
 * saves one, so this only guards old or hand-edited projects. Cached per look and colours, so
 * callers inside React selectors get a stable object.
 */
export function withBrand<L extends StylePack | Look>(look: L, brand: Brand | undefined): L {
  if (!brand) return look;
  const bg = look.colors.bg;
  const accent = brandColourIssue(brand.accent, bg) ? look.colors.accent : brand.accent;
  const accent2 =
    brand.accent2 && !brandColourIssue(brand.accent2, bg) ? brand.accent2 : look.colors.accent2;
  if (accent === look.colors.accent && accent2 === look.colors.accent2) return look;
  const key = `${look.id}|${accent}|${accent2}`;
  const hit = cache.get(key);
  if (hit) return hit as L;
  const old = look.colors.accent.toLowerCase();
  const branded = {
    ...look,
    colors: {
      ...look.colors,
      accent,
      accent2,
      chart: look.colors.chart.map((c) => (c.toLowerCase() === old ? accent : c)),
    },
  } as L;
  if (cache.size > 64) cache.clear();
  cache.set(key, branded);
  return branded;
}
