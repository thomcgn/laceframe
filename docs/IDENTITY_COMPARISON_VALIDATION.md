# Identity Comparison and Auto-Fit

2026-11-17. Separate branch `feat/identity-comparison-auto-fit`. Initially based on merged LF-00; merged the user's subsequently merged import PR #26 (`origin/main` 5b336f6) into this feature branch without a worktree, main checkout/commit or losing local work. `.vscode/settings.json` remains unchanged/untracked. No private projects or live image generation.

## Implemented

Character Creator defaults to **Identitätsvergleich**: reference left, candidate right, independent native-aspect fitting. Both have actual source dimensions, actual zoom percentage, slider, +/−, fit and 100/200/400% presets. The requested target is shown separately from actual provider dimensions. Both images retain all original pixels/bytes; display transforms only. Labels also sit inside each image viewport so they remain visible beneath the sticky job bar on small windows.

Drag with the Hand tool, temporarily hold Alt/Space, use arrows or zoom around the actual wheel cursor position. Independent cameras retain image-space center on resize. Optional linked views synchronize relative zoom-to-fit and normalized region focus/pan, allowing different resolutions to remain meaningfully comparable. Transform coordinates use CSS pixels, including HiDPI; they do not incorrectly multiply pointer positions by devicePixelRatio. New assets reset the identity cameras to fit. Switching comparison modes resets that mode's camera; no view settings are persisted as asset data.

**Pixelvergleich · erweitert** reuses the existing MasterCandidateCompare pixel implementation: native coordinates/shared origin, shared zoom/pan, blank missing areas, real slider and overlay. Creator's advanced pixel mode additionally gets wheel-at-cursor, range, +/− and Hand/Alt/Space controls. Existing Expression/Library/Hard-Lock callers keep their existing default pixel workflow, controls and registration. The original preview hook was extracted without changing its validated IPC path; no new file or token interface was introduced.

Auto-Fit uses actual decoded candidate RGBA in a temporary canvas, transferring it to one worker. It uses alpha **≥8**, 8-connected components, ignores components smaller than **max(2 pixels, 0.1% of the largest component)** and adds **4% padding, minimum 2 pixels**, bounded by the original canvas. Fully opaque/transparent and wholly sparse images fit the full canvas. Analysis is bounded to **16 MP**, otherwise full-canvas fitting plus an explicit limitation is used. Worker cleanup/termination and stale-result guards prevent an old asset from replacing current bounds. The canvas backing store is released after transfer. No persistent analysis images are written.

This is alpha geometry, **not semantic person/face detection**. Tiny legitimate detached features can fall outside the fitted region; disable Auto-Fit or use Pixelvergleich to inspect the complete image. Existing image pixels are still present. Similar appearance never implies identity approval.

Creator prompt composition now asks for canvas-filling, centered composition appropriate to the selected profile/framing, without a universal bust requirement or automatic post-generation resize. Historical prompt snapshots and masters remain unchanged. Requested dimensions remain a goal, not a claim about actual provider output.

## Optional asset crop: separate follow-up

No decorative crop button was added. The current strict quality-asset model supports `cutout`, `resolution`, `relighting`, not `crop`. A correct derived crop needs a distinct operation, source/output hashes, exact original-coordinate rectangle/dimensions, validated reconstruction/export and migration/approval tests. This is explicitly deferred under the request's allowed exception. Auto-Fit is a view region and must not silently become an exported crop. Existing export and manual approval remain in use.

## Actual local validation

- Targeted geometry/alpha/quality/Creator tests: **37 passed** before the additional framing assertion.
- Final `npm run check:fast`: passed, **406 tests / 21 files**, typecheck, zero-warning lint, diff checks (including merged import tests).
- `npm run build`: passed, Linux x64. Rebuilt for the small-window label correction and final pixel-viewport border offset; affected Creator smoke was rerun without repeating unrelated full regression.
- Expanded `node scripts/creator-smoke.cjs`: passed. Real imported EXIF JPEG is **3024×4032**, first protocol-fixture candidate is **1254×1254**, target **1024×1024**. Checks independent/linked zoom and pan, fit/100/200/400, actual cursor anchoring, Hand/Space, HiDPI 2×, resize, Auto-Fit toggle, native pixel registration/slider/overlay, exact unchanged manifest and source/candidate hashes, existing Creator/import/review/restart and Master Rebuild. All native jobs use the labelled deterministic server fixture, never live Codex.
- `node scripts/native-smoke.cjs`: passed, including Expression pixel comparison, keyboard/mouse/touch slider, overlay, masks, exact RGBA Hard Lock and approval/provenance.
- `node scripts/quality-smoke.cjs`: passed, alpha, brush/mask, derived Master V2, immutable sources, PNG+JSON export and reopen.
- Unit cases include different dimensions/aspects, exact wheel geometry, focus-preserving resize, linked relative views, opaque/transparent/partial-edge/sparse/isolated-island/thin/large images, bounded work and unchanged RGBA input, framing-aware prompts.

Actual direct measurement of the same pure alpha function on **2000×2000 (4 MP)**: **367 ms**, input **16,000,000 bytes**, typed scratch **20,000,000 bytes**, unchanged input SHA-256. At the 16 MP limit, typed input + scratch account for 144 MB; this is **not a measured total application/process-tree RAM peak**. Browser decode/canvas/compositor allocations are additional. No extrapolated timing or FPS guarantee is claimed. Worker analysis keeps this scan off the renderer UI thread.

New smoke development caught overly broad locator matches against hidden retained workspaces/implicit output status roles; locators were scoped to the active comparison. The cursor test now uses actual delivered WheelEvent coordinates rather than assuming fractional automation pointer coordinates survive browser rounding. Its image-space invariance is independently checked to eight decimals in the pure geometry unit test. No existing application assertions were weakened. Final pixel-mode wheel handling subtracts the actual viewport border; typecheck, targeted lint and the complete affected Creator smoke passed again with exact cursor-anchoring checks in both modes.

## Screenshots and CI

Synthetic rectangles only, not portraits or identity-fidelity evidence. Actual Electron screenshots at both requested window sizes were visually inspected:

- [960×720](screenshots/identity-comparison/960x720.png)
- [1920×1080](screenshots/identity-comparison/1920x1080.png)

Shared view geometry/worker/prompt and test changes are HIGH under LF-00. Latest-head FULL hosted CI and `quality-gate` are required; actual run link/conclusion will be added to the PR description after submission. Windows/macOS behavior remains unvalidated. Screenshots show synthetic native-provider fixture status; they do not establish a new live generation test. No schema migration, file cropping, automatic identity approval, new dependency or model was introduced.
