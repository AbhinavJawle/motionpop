---
inclusion: fileMatch
fileMatchPattern: ["packages/components/**", "packages/schemas/**"]
---

# Component contract

Every scene component in `packages/components/src/scenes/<component-id>/` must have:

| File | Purpose |
|---|---|
| `schema.ts` | zod props schema with defaults. Exports `<Name>PropsSchema` and `type <Name>Props`. |
| `<Name>.tsx` | The Remotion component. |
| `catalog.ts` | `{ id, name, description, examplePrompt, exampleProps, compatibleSkills }`. `exampleProps` must parse with the schema. |
| `<name>.test.ts` | Unit tests for layout/timing helpers. |
| `<name>.property.test.ts` | fast-check: any valid props → timing fits the duration, layout stays inside the safe zone, displayed numbers equal input. |

It must also be registered in the component registry (`packages/components/src/registry.ts`).

## Rules
1. **Tokens only.** Colours, fonts, easing and default durations come from the style pack passed in. No hex codes, font names or bezier arrays in component code.
2. **Responsive.** Read width/height from `useVideoConfig()`. Lay out per format; never assume 16:9.
3. **Safe zones and type scale** come from the format preset in `@motionpop/schemas`.
4. **Deterministic.** Same props + same frame → same pixels. No `Math.random`, `Date`, network calls or effects that depend on load timing. Use `random(seed)` from `remotion` if randomness is needed.
5. **Skill hooks.** Accept the shared `direction` object (reveal order, hold points, emphasis target, camera keyframes, SFX cue points) and honour it. Don't hardcode staging the skill should control.
6. **Pure layout and timing logic** lives in plain `.ts` helpers so it can be tested without rendering.
7. **Data integrity.** Numbers are formatted with `Intl.NumberFormat` using the props' locale; the formatted final value must equal the input value.
8. **Fonts** are loaded through Remotion's font loading (`@remotion/google-fonts` or `staticFile`) so renders never fall back to system fonts.

A component isn't done until `pnpm --filter @motionpop/components test` passes and a still renders in every format preset.
