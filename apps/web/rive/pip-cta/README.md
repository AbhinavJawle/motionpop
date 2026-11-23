# Pip for the sign-up CTA (Rive source)

> The page no longer plays this Rive file (D-079 amendment): `components/landing/pip-cta-mascot.tsx` animates the same layers with `motion`, from `public/pip-cta/*.webp` (copies of `art/*.webp`). This folder is the source of those layers and the Rive version of the animation.

The mascot animation behind `apps/web/components/landing/signup-cta.tsx` (spec 31, D-079).

- `scene.rml` is generated: edit `tools/build.py`, then run it. Two artboards share one 800 x 760 space with the button's top edge at y = 640: "Pip Body" (drawn behind the button) and "Pip Hands" (in front of it). State machine "Pip", view model `PipCta` with `hover` (boolean) and `press` (trigger).
- `source/` holds the mascot reference, the full transparent mascot (`pip-plush.png`) and the full-size layers. `tools/matte.py` and `tools/parts.py` rebuild them (run them in a folder holding `ghost_src.png`, the reference, plus `morph.py`).

```bash
python3 tools/build.py                       # scene.rml + art/*.webp
rive . --verify && rive inspect . --summary
python3 tools/preview.py build/check "s0 s90 s180 s219 hover=1 s240 press s250 s262 hover=0 s300"
rive . --publish                             # build/pip-cta.riv (needs `rive login`)
cp build/pip-cta.riv ../../public/rive/pip-cta.riv
```

`preview.py` also writes `<label>_body.png` / `<label>_hands.png`; frame 0 of those, at 560 x 532 WebP, are `public/rive/pip-cta-{body,hands}.webp` (the stills).

The current workspace's plan adds the Rive splash watermark to published files (about 2.3 s of opaque black on load), so the page keeps the animation off (`PIP_CTA_RIVE_ENABLED` in `components/landing/pip-cta-mascot-stills.tsx`). Publish from a plan without the splash, copy the file, then switch it on.
