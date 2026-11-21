# Spec 28 tasks

- [x] 1. Speech map + word tightening from the audio, with a reliability check and word-gap fallback (R1.1, R1.2)
- [x] 2. Retake rules: repeated takes (last kept), false starts, restarts, stumbles, asides; parallel lines kept (R2.1, R2.2, R2.4)
- [x] 3. Edit plan: head/tail, interior silences, retakes, fillers; carve-out, priority, sliver folding; kinds and reasons on cuts (R4.1, R4.2)
- [x] 4. Cloud review `reel.edit` through `packages/ai` + guards in `applyReview` (R3.1, R3.2)
- [x] 5. Pipeline: measure before transcription, copy to the worker, reel step titles and summaries (R1.3, R5.1)
- [x] 6. Founder's raw clip through the real app to export; export re-transcribed (R6.1)
- [x] 7. Over-cut check on clean and edited clips; contrast and refrain guard (`isRetakePair`) with regression tests (R2.3, R6.2)
- [x] 8. Close-out: gates green, dev log
