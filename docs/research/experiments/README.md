# Research experiments (reference only)

Two Python scripts from the motion-engine research of 2026-11-15 (`../motion-engine-research.md`, section 4), copied here unchanged as evidence. They are not product code and are not run by CI.

- `prosody_test.py`: finds stressed words and pauses from a synthetic voiceover (needs `espeak-ng`, `numpy`, `scipy`). Reported result: 6 of 6 pauses, 3 of 4 stressed words, one false hit.
- `beats_test.py`: a toy beat scheduler over that output. Reported result: every energy level met its budget, and juice landed inside read holds at lively and hype.

Both write to and read from `/home/claude/exp/`, the research sandbox's path, so they need that path changed to run elsewhere. The voice was synthetic; real recordings are untested. The product versions are specified in `.kiro/specs/07-scene-engine-and-looks/` (prosody module and beat engine) and are written in TypeScript with their own tests.
