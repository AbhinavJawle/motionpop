# Motion engine research: how cheap models can make great motion graphics

Research date: 15 Nov 2026. Scope: spec 07 (scene engine and looks). Goal: every video looks expensive, fast, on a cheap or on-device model.

## 1. Verdict

The direction in spec 07 is right, and the research backs it strongly. Every serious system that lets a model write animation freely shows the same failure: the code runs, but the result is visually wrong. The systems that work all do three things:

1. **Shrink what the model decides** to high-level choices (scene, variant, content, timing anchors). Never coordinates or code.
2. **Check the output automatically** with explicit rules, and feed failures back for a repair pass.
3. **Separate planning from execution** (planner → executor → critic).

Spec 07 already does 1 and most of 3. The biggest gains left are: a **repair loop** on the quality gates, **the voice itself as a timing signal**, **exemplar retrieval**, **an eval harness** (which then unlocks automatic prompt optimization), and **reference-image style locking** for generated images.

## 2. What the research says

| Source | What they found | What it means for us |
|---|---|---|
| MoVer (Stanford, 2025) | An LLM pipeline produced a correct motion graphic for 58.8% of prompts on the first try, and 93.6% after up to 50 rounds of feeding failed checks back to the model. Checks are written as logic predicates over motion (direction, timing, order, position). | Our quality gates should not only reject: they should produce a failure report the model can fix. One or two repair rounds on a cheap model is far cheaper than a big model. |
| OmniLottie / LottieGPT (2026) | General LLMs asked to write vector animation (Lottie JSON) failed to produce valid output 40–60% of the time. Reliability only came after training a model on a compact, purpose-built token format. | Free-form JSON animation from a general model is unreliable. Keep the model's output tiny and schema-bound. A fine-tuned small model is a possible post-hackathon step. |
| Code2Video (NUS, 2025) | A Planner → Coder → Critic pipeline beat direct code generation by about 40% on a learning-outcome test. The Critic uses a grid of named cells so the model refers to regions, not coordinates. | Validates the director pass + enforcer split. Named anchors instead of coordinates is the right contract. |
| TheoremExplainAgent (2025) | Long explainer videos worked, but most had layout errors: misaligned text, overlapping shapes, inconsistent sizes. | These are exactly the errors our deterministic layouts and gates remove. |
| LogoMotion (Columbia/Adobe, CHI 2025) | Visual program repair: render, compare bounding boxes layer by layer, ask the model to fix the specific layer. | Gate reports should name the failing actor and the rule, not just "failed". |
| LaySPA, AesthetiQ (2025–26) | LLMs make systematic layout errors (misalignment, sizing). Aesthetic quality improves with a multi-part critique and a model judge ranking candidates. | Generate 2–3 candidate plans cheaply, score them, keep the best. |
| GEPA / DSPy prompt optimization | Optimized prompts let small models match or beat large ones on narrow tasks. One reported case: about 75x cheaper and twice as reliable after moving to a small model. Caveats: needs a good metric, and the "reflection" model must be a frontier model. | Once we have an eval harness, run GEPA offline to tune the `component.fill` and `direct.plan` prompts for Flash and Nano. |
| VLM-as-judge in production (AI Engineer 2026, video QA papers) | Model judges are useful but noisy; they work when calibrated with human labels and used in a repeatable harness. | Use a judge offline for regression testing, not in the user's waiting time. |
| Speech-modulated typography (AffType, CHI 2023; "Hidden bawls, whispers, and yelps", 2022) | Loudness, pitch and duration of speech can be mapped to font weight, size, baseline and spacing, and people can match the result back to the audio. | The voice is a free, deterministic signal for emphasis and timing. See section 4. |
| Retention / pacing articles | Claims range from "change every 2–3 s" to "every 8–12 s" to "every 30–45 s", mostly from marketing blogs with weak methods. | Don't cite these numbers in the pitch. The energy setting (calm → hype) is the right answer; calibrate with our own tests. |

## 3. Recommended architecture changes

Each item names the spec-07 piece it touches.

### 3.1 Score → Gate → Repair loop (quality gates, `component.fill`)
- Gates already check overflow, overlap, contrast, sync and beat budget. Make each gate emit a short structured report: `{ slot, actor, rule, measured, limit, hint }`.
- If a slot fails, send the report back to the same cheap model once ("label overflows by 34 px at 9:16; shorten to ≤ 4 words"). If it still fails, fall back to the scene's safe default variant.
- Cap at 2 repair rounds. Log every failure; it becomes training and eval data.

### 3.2 The voice is a signal (new: `audio.prosody`, on-device, free)
- From the waveform plus word timings, compute per word: loudness, pitch, duration per syllable, and pauses. Pure signal processing, no AI, runs in the browser.
- The **AI decides what matters** (semantic emphasis in the score). **The audio decides exactly when and how hard** (snap the cue to the stressed word within ±1 word; louder delivery → bigger scale-pop or heavier weight).
- Pauses longer than ~300 ms are natural scene boundaries and camera-move points.
- This makes "graphics that follow your voice" literally true, and it's a strong hybrid-AI demo moment (all on-device).
- See experiment 1: works, but is noisy on its own. That's why it refines AI choices rather than replacing them.

### 3.3 Exemplar retrieval (`component.fill`)
- For each scene × variant, keep 3–5 "gold scores": hand-approved example JSON written at build time with a top model.
- Insert the 2 closest examples into each fill prompt (match by scene and content type). Few-shot examples help small models more than long instructions do.

### 3.4 Schema discipline (all AI tasks)
- Use Gemini structured output (`responseSchema`) with string enums for scene ids, variant ids, entrances and anchors.
- Keep schemas small and flat. Gemini rejects schemas that are too complex (too many states, many optional properties, large enums), and Google's docs warn not to repeat the schema in the prompt.
- Validate again with zod; constrained decoding guarantees shape, not sense.
- Generate one slot per call (or a small batch) instead of one huge call for the whole video.

### 3.5 Cheap candidates, deterministic scoring (`direct.plan`)
- Ask for 2–3 alternative plans in one call (or sample twice). Score each with code: variety, energy-curve fit, gate pass rate, image budget. Keep the best.
- No model judge needed at runtime.

### 3.6 Image style locking (`image.generate`)
- Text recipes drift. Nano Banana 2 (Gemini 3.1 Flash Image) accepts many reference images and is built for multi-reference consistency. Pass 2–3 fixed style-reference images per look with every request, plus the look's text recipe.
- Nano Banana 2 Lite is cheaper but, per Google, not optimized for multiple references. Test it as the default and fall back to Nano Banana 2 for looks where it drifts.
- Ask for a plain, flat background in the prompt to make cutouts clean.

### 3.7 Cutouts on-device (cutout spike, task 1)
- Candidate: **BiRefNet** (the MIT-licensed architecture) running in the browser through Transformers.js on WebGPU, with WASM fallback. A lite variant is about 47 MB quantized.
- License trap: **RMBG-2.0 is CC-BY-NC (non-commercial)**, and RMBG-1.4 has its own restrictive license. Use BiRefNet weights with a permissive license, and verify the weights' license, not just the code.
- On-device cutouts are free and private, which adds another hybrid moment.

### 3.8 Read time vs juice (beat engine)
- Experiment 2 shows that at "hype", the engine adds about 11 juice events in 14 s. Some of those land while text is being read.
- Rule: during a read hold, juice may only be non-covering and slow (background parallax, a micro camera push ≤ 3%, texture drift). No snaps, no overlays.

### 3.9 Eval harness (new, before tuning anything)
- A fixed set of ~20 voiceovers (different topics, energies, lengths) × 2 looks × 2 formats.
- Per run: render keyframes at each cue. Compute gate metrics, variety, timing error to the stressed word. Ask Gemini with a fixed rubric to score keyframes 1–5 on hierarchy, readability, polish and on-brand look.
- Calibrate the judge: you label 30 keyframes once, then adjust the rubric until the judge agrees with you.
- This harness is also what makes GEPA possible (3.10) and gives the Kiro write-up real numbers.

### 3.10 Later: optimize, then distill
- **After the hackathon MVP works:** run GEPA offline with a frontier reflection model to optimize the fill and plan prompts for Flash and Nano, using the harness as the metric.
- **Post-hackathon:** fine-tune a small model on logged, gate-passing scores (as LottieGPT and the Manim training work did for their formats).

## 4. Experiments run

Both scripts are attached. No model API keys were available here, so these test the deterministic parts, not the cheap model.

**Experiment 1: finding stress and pauses from audio alone.** I synthesized a 14 s voiceover (24 words, the Suez example) where 4 words were spoken louder, higher and slower, with natural pauses at punctuation. The analysis used only the waveform plus word timings.
- Pauses: **6 of 6 found** from energy alone.
- Stressed words: **3 of 4 correct** ("one", "nine", "billion"). It missed "finally" and wrongly flagged "Six" (likely a pitch-estimation error on the "s" sound).
- Takeaway: audio is a strong timing signal but too noisy to decide emphasis alone. Use it to refine AI choices (±1 word), as in 3.2. The voice was synthetic, so real recordings need testing next.

**Experiment 2: deterministic beat scheduler.** I took 6 AI-style content cues, snapped each to the most stressed nearby word, enforced read holds, and filled quiet gaps with juice at each energy level.
- calm: 7 changes in 14 s, longest still gap 2.7 s
- steady: 8 changes, 2.1 s
- lively: 11 changes, 1.6 s
- hype: 17 changes, 1.0 s
- All levels met their budget. Finding: at lively/hype, juice must respect read holds (3.8).

## 5. Tooling and licenses

| Need | Recommendation | License note |
|---|---|---|
| Render engine (D-009) | **HyperFrames**: HTML → deterministic MP4 via headless Chrome + FFmpeg; frame-adapter pattern supports custom runtimes; built for agents. | Apache-2.0, no team-size or per-render terms. Strong fit for an open-source product. |
| Alternative render engine | Remotion | Source-available: free for individuals and teams up to 3; companies of 4+ need a paid license. That would apply to anyone self-hosting the product at a company, which conflicts with "open source for everyone". |
| Tweens and easing (inside our own core) | Anime.js v4 easing functions, or write our own | MIT |
| Avoid | GSAP in product code (decided earlier); Theatre.js studio | Theatre.js studio package is AGPL-3.0 |
| Word timings in browser | Transformers.js Whisper with word timestamps (cross-attention alignment heads) | Check the open bug where word timestamps break on WebGPU; WASM may be needed for that step. Remotion's whisper-webgpu wrapper falls under Remotion's license. |
| Cutouts | BiRefNet in browser (Transformers.js / ONNX Runtime Web) | Avoid RMBG-2.0 (non-commercial) |
| Prompt optimization | DSPy GEPA (offline) | MIT |

## 6. Suggested additions to spec 07 tasks

1. `audio.prosody` module (on-device, free), feeding the beat engine and emphasis intensity. Nov 30 scope: it's small and strengthens the core pitch.
2. Gate reports + 1–2 repair rounds in `component.fill`. Nov 30 scope.
3. Gold-score exemplar library per scene × variant, with retrieval. Nov 30 scope for the 6 MVP scenes.
4. Schema rules (enums, flat, zod re-validation) written into `ai-tasks.md`.
5. Style-reference images per look for `image.generate`.
6. BiRefNet as a candidate in the cutout spike, with a weights-license check.
7. Read-hold rule for juice.
8. Eval harness (20 voiceovers, keyframe metrics, calibrated judge). Start before Nov 30 even if small: it gives real numbers for both write-ups.
9. After Nov 30: GEPA prompt optimization. Post-hackathon: fine-tuned small model.

## Sources

- MoVer: https://arxiv.org/abs/2502.13372
- LogoMotion: https://arxiv.org/abs/2405.07065
- Keyframer: https://arxiv.org/abs/2402.06071
- OmniLottie: https://huggingface.co/papers/2603.02138
- LottieGPT: https://arxiv.org/abs/2604.11792
- Code2Video: https://arxiv.org/abs/2510.01174
- TheoremExplainAgent: https://arxiv.org/abs/2502.19400
- LaySPA: https://arxiv.org/abs/2602.13912
- AesthetiQ: https://arxiv.org/abs/2503.00591
- GEPA in DSPy: https://dspy.ai/getting-started/gepa-optimization/
- GEPA production lessons: https://decagon.ai/blog/optimizing-gepa-for-production
- Video judge in the loop: https://www.zenml.io/llmops-database/distilling-video-quality-evaluation-from-committee-of-experts-into-fast-vlm
- Speech-modulated typography: https://arxiv.org/abs/2202.10631
- AffType: https://doi.org/10.1145/3544549.3585625
- Gemini structured output limits: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/control-generated-output
- Firebase AI Logic structured output: https://firebase.google.com/docs/ai-logic/generate-structured-output
- Firebase AI Logic image models: https://firebase.google.com/docs/ai-logic/generate-images-gemini
- Nano Banana models: https://ai.google.dev/gemini-api/docs/image-generation
- HyperFrames: https://github.com/heygen-com/hyperframes
- Remotion license FAQ: https://www.remotion.dev/docs/license/faq
- Anime.js: https://github.com/juliangarnier/anime
- Browser Whisper word timestamps: https://huggingface.co/posts/Xenova/386072637398041
- WebGPU word-timestamp bug: https://github.com/huggingface/transformers.js/issues/820
- RMBG-2.0 WebGPU (license CC-BY-NC): https://huggingface.co/yamura4/RMBG-2.0-WebGPU
