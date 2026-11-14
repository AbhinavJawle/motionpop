import { StylePackSchema, type StylePack } from '@motionpop/schemas';
import { BUNDLED_FONTS } from '../fonts/font-faces';
import editorialExplainerJson from './editorial-explainer.json' with { type: 'json' };
import testInvertedJson from './test-inverted.json' with { type: 'json' };

/** Parses a pack and checks that every font family it names is bundled (spec 03, review F3). */
export function parseStylePack(raw: unknown): StylePack {
  const pack = StylePackSchema.parse(raw);
  for (const family of [pack.fonts.display, pack.fonts.body, pack.fonts.mono]) {
    if (!(family in BUNDLED_FONTS)) {
      throw new Error(`style pack ${pack.id}: font "${family}" is not bundled`);
    }
  }
  return pack;
}

export const editorialExplainer: StylePack = parseStylePack(editorialExplainerJson);

/** Test-only pack (inverted palette, different timings). Never offered in the app. */
export const testInverted: StylePack = parseStylePack(testInvertedJson);

/** Packs offered to creators. The other four land in spec 07. */
export const stylePacks: Readonly<Record<string, StylePack>> = {
  [editorialExplainer.id]: editorialExplainer,
};
