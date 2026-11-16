# Codex 02 — UX and quality validation

Date: 2026-11-16. Implemented on `feat/task-02-create-workspace`, without a worktree or changes to local `main`. PR #4 (native integration) was already merged; this pass has a separate review PR from the same feature branch.

## Implemented behavior

- `GenerationClock` uses Node's monotonic `performance.now()` in the main process. Wall-clock ISO timestamps are provenance; clock corrections never change elapsed time. The renderer polls typed status once per second and formats the supplied duration as `HH:MM:SS`. Terminal durations freeze. There are no progress percentages or estimated completion times.
- Real stages distinguish local preparation, account/capability checks, model/thread startup, `turn/started`, `imageGeneration` start/completion, validation, import and stopping. Rapid stages may pass between status polls. No model reasoning or raw diagnostics enter the renderer.
- Each native attempt stores `execution.startedAt`, `durationMs` and status. Terminal records also store `endedAt`. Completed metadata and the actual candidate commit in the same atomic manifest save. Import/save failure produces failure metadata, never a successful generation without a candidate. Failed and cancelled attempts retain their duration without fabricated images.
- A running marker is saved once; polling does not write the manifest. After an unclean exit it stays explicitly **Nicht abgeschlossen · keine gesicherte Endzeit** in history, without a fabricated end time, success, automatic resume or retry. Older attempts without timing metadata still open; their duration is not invented. Existing projects are not rewritten on open. The optional metadata extends the current v2 format; use this build to reopen projects containing the new fields (older strict-schema binaries may reject them).
- Provider readiness is separate from the last operation's outcome. A failed or cancelled operation does not disable a still-available provider. Every subsequent explicit click still performs the official account/capability preflight. Generate disables during a job and re-enables after success/failure/cancellation when the prompt/master/provider remain valid. Missing authentication/capability continues to block it.
- A sticky action bar keeps generation, actual status, elapsed time and cancellation available outside the locked project fieldset. Cancellation refreshes both terminal status and the saved project snapshot. If final atomic import has already begun, it finishes safely rather than reporting a completed candidate as cancelled.
- Create now has compact character/master/emotion/variant/provider selectors, a central registered comparison and collapsed prompt, technical inspector and history. Project management is a separate collapsed disclosure in Create. Manual import displays its own truthful status. Edited prompt conflicts automatically expose the prompt drawer.

## Registered image comparison

Master and candidate share one native-pixel origin `(0, 0)` and a union canvas `max(width) × max(height)`. Neither image is stretched or independently fitted. A single transform applies fit/native zoom and pan to both images. Different dimensions are displayed explicitly, with empty extents/checkerboard instead of silent resampling. Image bytes and source hashes are untouched.

Before/After clips the candidate against an opaque checkerboard layer with a movable vertical divider. Pointer capture supports mouse and touch, including dragging beyond the initial handle. The labelled ARIA slider supports arrows (1%), Shift+arrows (10%), Home and End. Drag the canvas to pan; focus it and use arrow keys to pan in 24-screen-pixel steps. Zoom options: fit, 25%, 50%, 100%, 200%, 400%. Reset restores fit, centered pan, 50% comparison and 50% opacity.

Overlay uses the same registration and an adjustable 0–100% candidate opacity. The comparison displays differences only; identity remains an explicit human review decision. Pixel-difference mode was optional and is not included. No masks, compositing, poses, hands, Motion or transitions were added.

## Commands actually run

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, zero warnings |
| `npm test` | Passed: **91 tests, 4 files** (78 existing + 13 added) |
| `npm run build` | Passed, unpacked Linux x64 Electron application |
| `npm run test:desktop` | Passed, existing import/master lock/manual Create/library/review/provenance/secure IPC and close/relaunch/reopen |
| `npm run test:desktop:native` | Passed, actual packaged renderer/IPC/process/JSON-RPC/file import with deterministic protocol fixture |
| `npm run start -- -- --remote-debugging-port=9232 --user-data-dir=<temporary directory>` + `npm run test:dev` | Passed, first render/preload and reload with normal application sandbox |
| `git diff --check` | Passed |

The new unit coverage checks monotonic time under a backwards wall-clock jump, terminal duration freezing, provisional import completion followed by save failure, failure/cancel times, formatting beyond 24 hours, incomplete-job/schema invariants, actual event stages, persisted/reopened metadata, repeated explicit success → failure → cancel → success, union-canvas geometry, shared transforms, slider limits and keyboard controls.

The extended packaged native smoke checks the live `00:00:01` timer and actual ImageGen-start stage, saved outcome metadata, button disabling during a job and re-enabling after **all three** terminal outcomes, regeneration after cancellation, auth gating and blocked project mutation. It drives the real comparison with Playwright mouse/keyboard and Chromium touch events, verifies native image rectangles/common origins, shared zoom/pan, opacity and mismatched-dimension warning, checks no horizontal overflow at 960×720, and checks cancellation remains enabled and in the viewport after scrolling to the bottom.

Screenshots with synthetic 600×400 / 400×600 test images were captured and visually inspected at 960×720 and 1440×1000 (`artifacts/create-quality-960.png`, `artifacts/create-quality-1440.png`, ignored by git). No portrait artwork was used or committed. All automated project data lives in temporary directories; no user project or master was opened or modified.

The initial fixture extension needed an explicit `node:timers` import to satisfy ESLint. That was corrected and the complete checks above rerun successfully. The familiar VA-API warning also appeared during the successful normal-sandbox development run; the renderer/preload checks passed.

## Test boundaries and remaining limits

The native smoke uses the explicitly labelled `tests/support/fake-codex.mjs` process injected through temporary PATH. It exercises the real production client/controller/UI with synthetic image bytes; it does not prove generation model quality. Production has no fixture fallback. **No live image generation or paid API request was made for this quality pass.** The previous controlled live reference edit remains documented separately in [Native Codex validation](NATIVE_CODEX_VALIDATION.md).

Linux was tested. Windows/macOS packaging, signing and native input behavior remain unvalidated. A process crash cannot supply a trustworthy completion time; the unfinished attempt is displayed honestly instead of reconstructing one from wall time. Fast protocol stages may not be individually visible with one-second polling. Identity fidelity, pixel-lock preservation, masks and Motion remain outside this pass.
