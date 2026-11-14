import { z } from 'zod';
import { FormatSchema } from './format';
import { TranscriptSchema } from './transcript';

const IntMsSchema = z.number().int().nonnegative();

export const SlotStatusSchema = z.enum(['suggested', 'generating', 'ready', 'failed']);
export type SlotStatus = z.infer<typeof SlotStatusSchema>;

export const FrameNoteSchema = z.object({
  id: z.string().min(1),
  tMs: IntMsSchema,
  shape: z.object({
    kind: z.enum(['circle', 'path']),
    points: z.array(z.number()),
  }),
  text: z.string(),
  status: z.enum(['open', 'fixed']),
});
export type FrameNote = z.infer<typeof FrameNoteSchema>;

/**
 * A single slot. Duration limits ([1000, 12000] ms, narrowed per component) are
 * enforced by commands (spec 04 task 3), not here, so loading a saved project never
 * fails because of a limit. The schema only checks what makes the data unusable.
 */
export const SlotSchema = z
  .object({
    id: z.string().min(1),
    startMs: IntMsSchema,
    endMs: IntMsSchema,
    wordStart: z.number().int().nonnegative(),
    wordEnd: z.number().int().nonnegative(),
    reason: z.string(),
    /** A library component id, or "custom" for tier-2. */
    componentId: z.string().min(1),
    skillId: z.string().min(1),
    /** Slot-level style override. */
    styleId: z.string().min(1).optional(),
    prompt: z.string(),
    params: z.record(z.string(), z.unknown()),
    status: SlotStatusSchema,
    error: z.string().optional(),
    needsInput: z.array(z.string()).optional(),
    currentVersionId: z.string().min(1).optional(),
    notes: z.array(FrameNoteSchema).default([]),
    sfx: z.array(z.object({ id: z.string().min(1), atMs: IntMsSchema })).optional(),
  })
  .refine((s) => s.endMs > s.startMs, {
    message: 'endMs must be greater than startMs',
    path: ['endMs'],
  });
export type Slot = z.infer<typeof SlotSchema>;

export const VersionSchema = z.object({
  id: z.string().min(1),
  slotId: z.string().min(1),
  componentId: z.string().min(1),
  params: z.record(z.string(), z.unknown()),
  customPath: z.string().optional(),
  source: z.enum(['ai-device', 'ai-cloud', 'ai-claude', 'user', 'plan']),
  model: z.string().optional(),
  costCredits: z.number().nonnegative(),
  /** Epoch ms (Firestore Timestamps are converted at the adapter). */
  createdAt: IntMsSchema,
  label: z.string().optional(),
});
export type Version = z.infer<typeof VersionSchema>;

export const VoiceoverSchema = z.object({
  src: z.string().min(1),
  durationMs: IntMsSchema,
  /** Min/max pairs per bucket. */
  peaks: z.array(z.number()).optional(),
});
export type Voiceover = z.infer<typeof VoiceoverSchema>;

/** The minimal shape `timelineIssues` needs, so it can run on partial or drafted projects. */
export interface TimelineInput {
  durationMs: number;
  slots: ReadonlyArray<{
    id: string;
    startMs: number;
    endMs: number;
    wordStart: number;
    wordEnd: number;
  }>;
  transcript: { words: ReadonlyArray<unknown> };
}

/**
 * Pure check of the timeline invariants (editor-timeline.md). Returns human-readable
 * issues; an empty list means valid. Slot order in the array does not matter.
 * Touching slots (end == next start) are allowed.
 */
export function timelineIssues(project: TimelineInput): string[] {
  const issues: string[] = [];
  const wordCount = project.transcript.words.length;
  const seen = new Set<string>();

  for (const s of project.slots) {
    if (seen.has(s.id)) issues.push(`duplicate slot id "${s.id}"`);
    seen.add(s.id);
    if (s.startMs < 0 || s.startMs >= s.endMs || s.endMs > project.durationMs) {
      issues.push(
        `slot "${s.id}" must satisfy 0 <= startMs < endMs <= durationMs (got ${s.startMs}..${s.endMs}, duration ${project.durationMs})`,
      );
    }
    if (s.wordStart > s.wordEnd) {
      issues.push(`slot "${s.id}" wordStart ${s.wordStart} is after wordEnd ${s.wordEnd}`);
    }
    if (s.wordStart >= wordCount || s.wordEnd >= wordCount) {
      issues.push(
        `slot "${s.id}" word range ${s.wordStart}..${s.wordEnd} is outside the transcript (${wordCount} words)`,
      );
    }
  }

  const sorted = [...project.slots].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (prev && cur && cur.startMs < prev.endMs) {
      issues.push(`slots "${prev.id}" and "${cur.id}" overlap`);
    }
  }
  return issues;
}

export const EditorProjectSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().min(1),
    title: z.string(),
    format: FormatSchema,
    fps: z.literal(30),
    styleId: z.string().min(1),
    durationMs: z.number().int().positive(),
    voiceover: VoiceoverSchema,
    transcript: TranscriptSchema,
    slots: z.array(SlotSchema),
    versions: z.array(VersionSchema),
    /** Epoch ms. */
    createdAt: IntMsSchema,
    updatedAt: IntMsSchema,
  })
  .superRefine((p, ctx) => {
    for (const message of timelineIssues(p)) {
      ctx.addIssue({ code: 'custom', message, path: ['slots'] });
    }
  });
export type EditorProject = z.infer<typeof EditorProjectSchema>;
