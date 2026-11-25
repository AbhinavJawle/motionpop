import { LookSchema, StylePackSchema, type Look, type StylePack } from '@motionpop/schemas';
import { BUNDLED_FONTS } from '../fonts/font-faces';
import editorialExplainerJson from './editorial-explainer.json' with { type: 'json' };
import fieldNotesJson from './field-notes.json' with { type: 'json' };
import paperCollageJson from './paper-collage.json' with { type: 'json' };
import newsprintJson from './newsprint.json' with { type: 'json' };
import creatorDarkJson from './creator-dark.json' with { type: 'json' };
import editorialCreamJson from './editorial-cream.json' with { type: 'json' };
import keynoteCleanJson from './keynote-clean.json' with { type: 'json' };
import studioLightJson from './studio-light.json' with { type: 'json' };
import kineticLimeJson from './kinetic-lime.json' with { type: 'json' };
import appleKeynoteJson from './apple-keynote.json' with { type: 'json' };
import risographZineJson from './risograph-zine.json' with { type: 'json' };
import blueprintSchematicJson from './blueprint-schematic.json' with { type: 'json' };
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

/** Editorial Cream: warm cream ground, serif+sans contrast, arched bottom speaker split (spec 23 default). */
export const editorialCream: Look = parseLook(editorialCreamJson);

/** Studio Light: crisp light studio canvas with elevated UI cards and seam captions (spec 23). */
export const studioLight: Look = parseLook(studioLightJson);

/** Creator Dark: obsidian studio glass, electric ember/violet accents, built for modern Reels (spec 21). */
export const creatorDark: Look = parseLook(creatorDarkJson);

/** Keynote Clean: crisp midnight-slate product showcase look with sky-cyan accents (spec 21). */
export const keynoteClean: Look = parseLook(keynoteCleanJson);

/** Kinetic Lime: obsidian + electric lime + cobalt beat-locked kinetic typography look. */
export const kineticLime: Look = parseLook(kineticLimeJson);

/** Apple Keynote: deep slate glass surfaces, crisp hardware precision & vibrant cyan accents. */
export const appleKeynote: Look = parseLook(appleKeynoteJson);

/** Risograph Zine: 2-ink coral & cobalt overprint halftone editorial look with 12 fps motion. */
export const risographZine: Look = parseLook(risographZineJson);

/** Blueprint Schematic: deep drafting navy with white hairlines & cyan vector traces. */
export const blueprintSchematic: Look = parseLook(blueprintSchematicJson);

/** Polished looks (spec 07 R3.4 + spec 21/23 modern Reel looks + curated open-source styles). */
export const looks: Readonly<Record<string, Look>> = {
  [editorialCream.id]: editorialCream,
  [studioLight.id]: studioLight,
  [creatorDark.id]: creatorDark,
  [keynoteClean.id]: keynoteClean,
  [newsprint.id]: newsprint,
  [fieldNotes.id]: fieldNotes,
  [paperCollage.id]: paperCollage,
  [kineticLime.id]: kineticLime,
  [appleKeynote.id]: appleKeynote,
  [risographZine.id]: risographZine,
  [blueprintSchematic.id]: blueprintSchematic,
};
