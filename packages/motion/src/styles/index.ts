import { LookSchema, StylePackSchema, type Look, type StylePack } from '@motionpop/schemas';
import { BUNDLED_FONTS } from '../fonts/font-faces';
import editorialExplainerJson from './editorial-explainer.json' with { type: 'json' };
import fieldNotesJson from './field-notes.json' with { type: 'json' };
import paperCollageJson from './paper-collage.json' with { type: 'json' };
import newsprintJson from './newsprint.json' with { type: 'json' };
import creatorDarkJson from './creator-dark.json' with { type: 'json' };
import keynoteCleanJson from './keynote-clean.json' with { type: 'json' };
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

/** The default look: warm paper, ink type, one ember accent, snappy motion with camera snaps. */
export const editorialExplainer: Look = parseLook(editorialExplainerJson);

/** Test-only pack (inverted palette, different timings). Never offered in the app. */
export const testInverted: StylePack = parseStylePack(testInvertedJson);

/** Packs offered to creators. The other four land in spec 07. */
export const stylePacks: Readonly<Record<string, StylePack>> = {
  [editorialExplainer.id]: editorialExplainer,
};

/** Parses a look (a style pack with the spec 07 craft blocks) and checks its fonts are bundled. */
export function parseLook(raw: unknown): Look {
  const look = LookSchema.parse(raw);
  const { display, body, mono, hand } = look.fonts;
  for (const family of [display, body, mono, ...(hand ? [hand] : [])]) {
    if (!(family in BUNDLED_FONTS))
      throw new Error(`look ${look.id}: font "${family}" is not bundled`);
  }
  return look;
}

/** Field Notes: a reporter's desk. Paper, ink, red marker, handwritten labels. */
export const fieldNotes: Look = parseLook(fieldNotesJson);

/**
 * Paper Collage: cut paper on kraft, torn coral and cream strips, tape, cut-out words and a
 * 12 fps stop-motion step (spec 07 task 22; provenance in README.md).
 */
export const paperCollage: Look = parseLook(paperCollageJson);

/**
 * Newsprint: the editorial collage explainer. Newsprint ground, halftone cut-outs on torn colour,
 * highlighter and red marker, high-contrast serif headlines, paper maps, paper-sweep and pull-back
 * cuts, and a 12 fps step.
 */
export const newsprint: Look = parseLook(newsprintJson);

/** Creator Dark: obsidian studio glass, electric ember/violet accents, built for modern Reels (spec 21). */
export const creatorDark: Look = parseLook(creatorDarkJson);

/** Keynote Clean: crisp midnight-slate product showcase look with sky-cyan accents (spec 21). */
export const keynoteClean: Look = parseLook(keynoteCleanJson);

/** Polished looks (spec 07 R3.4 + spec 21 modern Reel looks). */
export const looks: Readonly<Record<string, Look>> = {
  [creatorDark.id]: creatorDark,
  [keynoteClean.id]: keynoteClean,
  [newsprint.id]: newsprint,
  [fieldNotes.id]: fieldNotes,
  [paperCollage.id]: paperCollage,
};
