# Design references (read-only)

Visual source of truth for Motionpop. Built in Figma (Figma AI from our prompts, refined by hand), exported Nov 14, 2026.

| File | What |
|---|---|
| `screens/editor.png` | Editor: slot 2 selected, inspector, transcript timeline (2880×1800) |
| `screens/editor-generating.png` | Editor while Pip generates (progress panel replaces the inspector) |
| `screens/pip-empty.png`, `screens/pip-conversation.png` | Pip (AI) left panel, empty and with a plan |
| `screens/export.png`, `screens/export-ready.png` | Export modal and Ready modal |
| `screens/projects.png`, `projects-empty.png`, `projects-drag-over.png` | Dashboard states (1440 wide) |
| `screens/start.png`, `screens/recording.png` | Start and Recording (1440×900) |
| `figma-export.css` | Figma "Copy as CSS" for every frame, including **Styles** and **Styles · Clean Minimal** (no PNG). Absolute-positioned layers: use it for exact sizes, colours, radii, shadows, gradients and type, not as code. Frames start at the `/* Motionpop · … */` comments. |

Frame size: 1440×900 (Styles 1440×1000, Projects 1440×2136, Projects Empty/Drag over 1440×1376). The 2880-wide PNGs are 2× exports.

Not designed yet (build in the same language): Processing, Paste script, Sign in, Landing, Share, Settings, Out of credits, 9:16 editor, on-device/cloud/offline states, failed slot.
