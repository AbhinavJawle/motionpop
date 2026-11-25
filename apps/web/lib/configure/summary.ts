import { builtInSkills } from '@motionpop/ai';
import { costOf, type AppConfig, type EditConfig } from '@motionpop/schemas';
import type { JobKind } from '../pipeline/eta';

/**
 * The configure screen's summary (spec 39 R2.7, R2.9, design §7). Pure: the same choices and
 * context give the same rows. Prices come from `costOf`, never from here.
 */

export interface SummaryContext {
  kind: JobKind;
  /** The take is a script (its voice is made after Create). */
  script?: { minutes: number };
  signedIn: boolean;
  /** Credits on hand; null while loading or signed out. */
  balance: number | null;
  online: boolean;
  config: Pick<AppConfig, 'creditCosts' | 'imageCredits' | 'exportCredits' | 'killSwitch'>;
  /** Who read the creator's own words: Gemini Nano or the keyword resolver (R4.3). */
  resolvedBy?: 'device' | 'rules';
  /** True when user-supplied Gemini BYOK key is saved in this browser (Spec 42). */
  byok?: boolean;
}

/** The creator described their own recipe or style, so `resolved` is what the edit follows. */
export const usesResolved = (edit: Pick<EditConfig, 'recipeId' | 'customStyle'>): boolean =>
  edit.recipeId === 'custom' || edit.customStyle !== undefined;

export type RowRoute = 'device' | 'cloud' | 'none';

export interface SummaryRow {
  id: string;
  label: string;
  /** "Free", "Free · on-device", "3 credits", "up to 6 credits", "Off · needs credits". */
  value: string;
  /** Credits this row may charge (the most it can). */
  credits: number;
  /** True when `credits` is a ceiling, not a price. */
  upTo?: boolean;
  route: RowRoute;
  note?: string;
}

export interface Summary {
  rows: SummaryRow[];
  total: number;
  totalUpTo: boolean;
  /** Why Create can't run, if it can't. */
  block?: string;
  /** A line under the total (free fallbacks in use). */
  note?: string;
}

/** Most illustrations a reel generates (lib/reel/media.ts default). */
export const REEL_ILLUSTRATIONS_MAX = 3;

const credits = (n: number) => `${n} ${n === 1 ? 'credit' : 'credits'}`;

export function summarize(edit: EditConfig, ctx: SummaryContext): Summary {
  const byok = Boolean(ctx.byok) && ctx.online;
  const paid = byok || (ctx.signedIn && ctx.online && !ctx.config.killSwitch);
  const rows: SummaryRow[] = [];
  const free = (id: string, label: string, route: RowRoute = 'none', value = 'Free') =>
    rows.push({ id, label, value, credits: 0, route });

  if (ctx.script) {
    const n = byok ? 0 : costOf('tts', Math.max(1, ctx.script.minutes), ctx.config);
    rows.push({
      id: 'voice',
      label: 'Voice from script',
      value: byok ? 'Free · your key' : credits(n),
      credits: n,
      route: 'cloud',
    });
  }
  if (ctx.kind !== 'graphic') {
    free('transcribe', 'Transcription', 'device', 'Free · on-device');
  }
  if (edit.resolved && usesResolved(edit)) {
    const r = edit.resolved;
    const device = ctx.resolvedBy === 'device';
    rows.push({
      id: 'resolved',
      label: 'Your style',
      value: device ? 'Free · on-device' : 'Free · quick match',
      credits: 0,
      route: device ? 'device' : 'none',
      note:
        ctx.kind === 'graphic'
          ? `${builtInSkills.recipe(r.recipeId)?.name ?? r.recipeId} · ${r.look}`
          : `${builtInSkills.recipe(r.recipeId)?.name ?? r.recipeId} · ${r.look} · ${r.captionStyle} captions`,
    });
  }
  if (edit.userSkill) {
    rows.push({
      id: 'user-skill',
      label: 'Custom skill',
      value: 'Free · SKILL.md',
      credits: 0,
      route: 'none',
      note: edit.userSkill.name,
    });
  }
  if (ctx.kind !== 'graphic' && edit.sound.cleanup && !ctx.script) free('cleanup', 'Speech cleanup');

  let note: string | undefined = byok
    ? 'Using your Gemini API key (0 Motionpop credits).'
    : undefined;
  if (ctx.kind === 'graphic') {
    const reel = byok ? 0 : costOf('reel', 1, ctx.config);
    if (paid)
      rows.push({
        id: 'direct',
        label: 'Motion graphic directing',
        value: byok ? 'Free · your key' : credits(reel),
        credits: reel,
        route: 'cloud',
        note: 'Bespoke custom scenes + visual QA',
      });
    else free('direct', 'Motion graphic directing', 'device', 'Free director');
    if (edit.illustrations) {
      const max = byok ? 0 : REEL_ILLUSTRATIONS_MAX * costOf('image', 1, ctx.config);
      if (paid)
        rows.push({
          id: 'illustrations',
          label: 'AI cutout visuals',
          value: byok ? 'Free · your key' : `up to ${credits(max)}`,
          credits: max,
          upTo: !byok,
          route: 'cloud',
        });
      else
        rows.push({
          id: 'illustrations',
          label: 'AI cutout visuals',
          value: 'Off · needs credits',
          credits: 0,
          route: 'none',
        });
    }
    free('alpha', 'Transparent WebM export', 'none', 'Free');
    if (!paid)
      note = ctx.signedIn
        ? 'Paid steps run their free versions.'
        : 'Sign in or add a Gemini key for bespoke scenes and AI cutouts.';
  } else if (ctx.kind === 'video') {
    const reel = byok ? 0 : costOf('reel', 1, ctx.config);
    if (paid)
      rows.push({
        id: 'direct',
        label: 'Reel directing',
        value: byok ? 'Free · your key' : credits(reel),
        credits: reel,
        route: 'cloud',
        note: edit.sound.cleanup ? 'Includes the retake check' : undefined,
      });
    else free('direct', 'Reel directing', 'device', 'Free director');
    if (edit.illustrations) {
      const max = byok ? 0 : REEL_ILLUSTRATIONS_MAX * costOf('image', 1, ctx.config);
      if (paid)
        rows.push({
          id: 'illustrations',
          label: 'AI illustrations',
          value: byok ? 'Free · your key' : `up to ${credits(max)}`,
          credits: max,
          upTo: !byok,
          route: 'cloud',
        });
      else
        rows.push({
          id: 'illustrations',
          label: 'AI illustrations',
          value: 'Off · needs credits',
          credits: 0,
          route: 'none',
        });
    }
    if (!paid)
      note = ctx.signedIn
        ? 'Paid steps run their free versions.'
        : 'Sign in for the AI director and illustrations.';
  } else {
    free('plan', 'Graphics plan', 'device', 'Free · on-device');
  }
  if (ctx.kind !== 'graphic') {
    if (edit.captions.enabled) free('captions', 'Captions');
    if (edit.sound.sfx) free('sfx', 'Sound effects');
    if (edit.sound.music !== 'none')
      free(
        'music',
        ctx.kind === 'video' ? 'AI soundtrack' : 'Music bed',
        ctx.kind === 'video' && ctx.signedIn && ctx.online && !ctx.config.killSwitch
          ? 'cloud'
          : 'none',
      );
  }

  const total = rows.reduce((s, r) => s + r.credits, 0);
  let block: string | undefined;
  if (ctx.script) {
    if (!ctx.online) block = 'Needs connection';
    else if (!byok && !ctx.signedIn) block = 'Sign in to generate a voice';
    else if (!byok && ctx.config.killSwitch) block = 'Voices are paused right now';
    else if (!byok && ctx.balance !== null && ctx.balance < (rows[0]?.credits ?? 0))
      block = 'Not enough credits for the voice';
  }
  return {
    rows,
    total,
    totalUpTo: rows.some((r) => r.upTo && r.credits > 0),
    ...(block ? { block } : {}),
    ...(note ? { note } : {}),
  };
}
