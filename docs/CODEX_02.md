# Codex Task 02 — Motion MVP: blink, speaking and shouting

Read `AGENTS.md`, `docs/MVP_PLAN.md`, and `docs/CHARACTER_EXPRESSIONS.md`. Continue from the merged Task 01 implementation on a fresh feature branch / PR. No worktrees.

## Deliverables

1. Motion editor for each character with selectable approved portrait assets as frames.
2. Timeline of ordered keyframes, each with adjustable `durationMs`; optional loop, play/pause, scrub and onion-skin preview. Start with **manual image/frame import**, not AI synthesis.
3. Naming and tags for motions: `idle-blink`, `speaking`, `shouting`, but allow user-created types.
4. Keep expression and action independent: `angry + silent`, `angry + shouting`, `concerned + speaking` etc.
5. Validate frame canvas dimensions and alignment. Allow non-destructive offset per frame and visualize landmarks; do not silently scale/resample portraits.
6. Export exact PNG sequence + manifest JSON with fps/timings, character ID, master ID/version/hash and emotion/action metadata. Optional sprite sheet only if feasible and tested.
7. Reopen saved clips and preview with same timing.
8. Unit tests for timeline validation, determinism, loop behavior, frame alignment metadata and exported manifest.

## Explicit exclusions

No fake automated mouth-generation; no speech-to-phoneme inference; no paid service; no mandatory audio input; no repainting unchanged Ada facial features; no forced 64×64 pixelation.

## Acceptance walkthrough

- Import already available approved portraits of Ada Voss.
- Add `Blink` clip using open-eye and separately provided closed-eye PNG frames.
- Adjust durations to make a believable blink and preview playback.
- Add `Speaking` clip with manually provided open/closed mouth images.
- Use the approved emotion `angry` with a distinct `shouting` vocal action and mouth-open assets.
- Export clip PNGs and JSON; restart Laceframe and confirm persistence.

A script or visual control that only simulates real playback is NOT completion.
