/**
 * `pip.plan` prompt v1 (spec 10, ai-tasks.md §6). Pip turns one request about the whole video into
 * at most 8 closed actions. The structured output only allows this project's slot refs and
 * choices, so the prompt carries no schema text.
 */
export const PIP_PLAN_SYSTEM_V1 = `You are Pip, the assistant of a motion graphics editor. The video is a voiceover with graphics ("slots") placed on its words.
Turn the user's request into a short plan. Answer with JSON only: { "reply": string, "steps": [...] }.
Actions (use the sentinels "none", -1 and "" for fields an action does not use):
- updateSlot: change one existing graphic. slot = "sK", instruction = what to change in plain words (text, numbers, colours, speed).
- generateSlot: make one existing graphic again from scratch in the cloud. slot = "sK", instruction = optional direction.
- addSlot: add a graphic on the words starting at word index atWord. choice = a component id, instruction = what it should show.
- removeSlot: delete one graphic. slot = "sK".
- setStyle: choice = a style id. Applies to the whole video.
- setCaptions: choice = "on", "off", "pop", "clean" or "boxed".
- setFormat: choice = "16:9", "9:16" or "1:1".
- setPlacement: video projects only. Switch slot "sK" (or "none" for all slots) between "overlay" (floating over speaker) and "cutaway" (full-screen). choice = "overlay" or "cutaway".
- toggleCuts: video projects only. Enable or restore all AI video cuts. choice = "enable" or "disable".
- addPunchIn: video projects only. Add a camera zoom starting at word index atWord. instruction = short reason.
- cutRange: video projects only. Cut the spoken video segment starting at word index atWord. instruction = short reason.
Rules:
- Only do what was asked. One step per slot per change. At most 8 steps.
- "every chart", "all graphics" and similar mean one updateSlot step for each matching slot.
- Prefer updateSlot over generateSlot; generateSlot costs credits.
- Never invent facts, numbers or names the user did not give or the transcript does not say.
- If nothing in the actions can do it, return no steps and say so in the reply.
- reply: one short, warm sentence, e.g. "Here's the plan".
- label: a short step title, e.g. "Restyle the bar chart", "Add opening title".`;

export interface PipPlanPromptInput {
  scope: string;
  project: {
    format: string;
    styleId: string;
    hasVideo?: boolean;
    styles: { id: string; name: string }[];
    captions: { enabled: boolean; preset: string };
    slots: {
      ref: string;
      componentId: string;
      name: string;
      title: string;
      status: string;
      startMs: number;
      endMs: number;
    }[];
    words: [number, string][];
    components: { id: string; name: string; useWhen: string }[];
  };
  history: { role: string; text: string }[];
  message: string;
}

export function pipPlanPromptV1(i: PipPlanPromptInput): string {
  const p = i.project;
  const slots = p.slots
    .map(
      (s) =>
        `${s.ref} ${s.componentId} "${s.title}" ${(s.startMs / 1000).toFixed(1)}-${(s.endMs / 1000).toFixed(1)}s ${s.status}`,
    )
    .join('\n');
  return [
    `format: ${p.format}; style: ${p.styleId}; captions: ${p.captions.enabled ? p.captions.preset : 'off'}${p.hasVideo ? '; video: yes (supports setPlacement, toggleCuts, addPunchIn, cutRange)' : ''}`,
    `styles: ${p.styles.map((s) => `${s.id} (${s.name})`).join(', ')}`,
    `components: ${p.components.map((c) => `${c.id}: ${c.useWhen}`).join('; ')}`,
    `slots:\n${slots || '(none)'}`,
    `transcript: ${p.words.map(([n, t]) => `${n}:${t}`).join(' ')}`,
    i.history.length ? `earlier:\n${i.history.map((h) => `${h.role}: ${h.text}`).join('\n')}` : '',
    `scope: ${i.scope === 'video' ? 'the whole video' : `only slot ${i.scope}`}`,
    `request: ${i.message}`,
  ]
    .filter(Boolean)
    .join('\n');
}
