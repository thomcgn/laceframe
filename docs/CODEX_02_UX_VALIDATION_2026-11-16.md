# Codex 02 — UX and Quality Validation (reported 2026-11-16)

**Source:** developer's completed Codex 02 review report supplied by project owner on 2026-11-16. This file records reported test results; it is not a rerun of those tests.

## Implemented, reported

- Native ImageGen remains integrated in `feat/task-02-create-workspace` (prior native-integration PR #4 merged).
- Main-process monotonic GenerationClock via `performance.now()`; renderer reads typed status every second and formats elapsed/terminal duration as `HH:MM:SS`. ISO timestamps are provenance; no fabricated percentage or estimated time.
- Actual stages: preparation, auth/capability, model/thread startup, turn start, image generation start/completion, validation, import and stopping. Fast stages may be missed by one-second polling.
- Persisted per-attempt execution: startedAt/duration/status; endedAt for terminal. Candidate and successful completion are saved atomically. Failed/cancelled attempts retain duration without fictional results. Interrupted processes remain explicitly incomplete, without guessed elapsed/terminal time.
- Provider availability independent of previous operation outcome; Generate enabled after success/failure/cancel if ready and selections valid. Sticky generation/cancel bar stays visible outside disabled project fieldset.
- Create workspace condensed: selectors for character/master/family/variant/provider, central comparison, collapsible prompt/inspector/history, separate collapsible project management.
- Registered Before/After canvas: common (0,0), union of source dimensions, shared fit/zoom/pan, no resampling or source mutation; interactive vertical divider, keyboard/touch/pointer interactions, overlay opacity and mismatch warning. No pixel difference mode.
- No facial masks, pixel-lock compositing, poses/hands, Motion or transitions.

## Tests reported

| Check | Reported result |
| --- | --- |
| `npm run typecheck` | passed |
| `npm run lint` | passed, zero warnings |
| `npm test` | passed: 91 tests in 4 files (78 prior + 13 added) |
| `npm run build` | passed, Linux x64 unpacked app |
| `npm run test:desktop` | passed |
| `npm run test:desktop:native` | passed, deterministic fixture protocol |
| `npm run start -- -- --remote-debugging-port=9232 --user-data-dir=<temporary directory>` + `npm run test:dev` | passed |
| `git diff --check` | passed |

Automated checks covered time freezing, clock jumps, interrupted jobs, save failures, status transitions, retries from user clicks after each terminal outcome, comparison geometry/interaction/accessibility, 960x720 overflow, sticky cancel and reopen/persistence. Synthetic 600x400 and 400x600 test images were used; screenshots locally at `artifacts/create-quality-960.png` and `artifacts/create-quality-1440.png`, ignored by git. There was **no new live image generation** in this pass. The deterministic `tests/support/fake-codex.mjs` was used for native smoke, never as production fallback.

## Known boundaries

- Linux validated; Windows/macOS not validated.
- Older strict-schema binaries might reject added optional execution metadata; use current compatible version for projects saved after this change.
- User project/portrait not altered by tests.
- No mask/pixel-lock guarantee or identity fidelity proof.
- UI quality pass is reported on feature branch; merge status of this review PR must be checked before starting follow-up coding.

## Impact on next implementation

**Do not reimplement** GenerationClock, progress stages, sticky generate/cancel controls, Create compaction, registered compare slider, pan/zoom or overlay opacity. Preserve all of them. Extend the existing v2 project format safely and test migration of old and newly-timed attempts. Tests for new art-direction and per-character expression features should run the full existing quality suite, not replace it.
