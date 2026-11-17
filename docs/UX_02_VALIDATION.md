# UX-02 — Precision editing and responsive cutout workspace

Date: 2026-11-17. Based on merged PR #18 (`origin/main` at `49c8788`); branch `feat/ux-02-precision-editor` in the existing repository, no worktree/main checkout or commit. The pre-existing staged `.vscode/settings.json` is preserved. Tests use temporary synthetic projects; no user project or private portrait is opened.

## Implemented behavior

The existing `MaskEditor` remains shared by cutout, expression and regional relighting masks. Direct icon tools replace the dropdown: pipette, automatic background selection, brush/eraser, protected foreground/removal, forced background/removal, polygon and hand. The protection icon is an original outlined Sage cross, with no red emblem. Buttons expose names, native tooltips, keyboard shortcuts and pressed state; an outline/dot also marks the selected tool. No icon dependency added.

Brush previews are scheduled through `requestAnimationFrame`, not deferred until pointerup. Smart cutout keeps transient brush drafts in a ref instead of publishing the whole React history on each move. Each completed/cancelled stroke commits one history entry. Pointer cancellation, lost capture and window/element focus loss retain the partial stroke as one undoable edit. Loss events for reused pointer IDs are ignored while a new stroke owns capture. Save is unavailable during an active stroke or an unverified/pending cutout calculation.

Worker requests are invalidated synchronously when the current draft changes. An incoming message must match both the latest serial and exact current draft. Immediate cutout feedback combines current brush values with the last available automatic selection and separate polygon contributions. Flood/edge topology can still finish asynchronously; the visible calculation status and Save gate remain active until the exact current worker result arrives. Main recomputes that result before persistence, as before. The two additional transient polygon-contribution buffers do not change saved recipes or algorithm results. No drawing/hover/view change writes image files.

The custom dual black/white ring and center marker use the actual continuous native brush position and CSS image scale. Cursor movement updates DOM geometry directly, with no React hover state. Tool, diameter, zoom, pan and ResizeObserver changes refresh its geometry; leaving the image hides it. Integer original-pixel sampling for seeds/polygon corners remains separate. An open polygon has a dashed rubber-band line to the current cursor; closed geometry remains visible until explicit Apply/discard. Existing rasterization and silhouette/protected priorities are retained.

Alt or Space temporarily selects an open hand; dragging shows a closed hand and changes only the view. Releasing the modifier during an existing pan retains the hand until pointerup, then restores the previous tool. B/E/I/H/L and brackets select tools/resize a brush outside text inputs; Ctrl+Z/Ctrl+Shift+Z undo/redo. Space still activates a focused button normally. No shortcut is applied while editing text/select/range controls.

The dialog fills the available viewport with safe 8px margins. Header/tool icons, image and bottom actions remain visible; only the sidebar settings scroll. Contextual controls expose color/seeds/edge settings for pipette/automatic selection, brush parameters for brush tools, and explicit polygon operations for polygons. Shared review/background controls remain accessible. Body scrolling is locked only for the editor lifetime and restored on close. One mask Reset remains; Fit resets only the view.

The image-edge rail provides logarithmic vertical zoom, percentage, 100% and Fit. Wheel zoom holds the native point under the cursor fixed; Shift+wheel or predominantly horizontal trackpad motion pans. Existing pointer/touch drawing and Alt/Space pan remain available. Fit uses both measured image-area dimensions. Free zoom uses an absolute CSS scale, retained across resize. **100% means one image pixel per CSS pixel**; tooltip and DPR label distinguish physical HiDPI pixels (at DPR 2, one CSS pixel covers 2×2 device pixels). No image resampling/export conversion occurs.

## Validation

| Command | Actual result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, zero warnings |
| `npm test` | Passed: **252 tests, 14 files** (247 baseline + 5 geometry tests) |
| `npm run build` | Passed, packaged Linux x64 |
| `npm run test:desktop` | Passed: all five packaged desktop suites |
| `npm run test:desktop:native` | Passed: native provider and character creator suites |
| `git diff --check` | Passed before final commit |

The automated checks cover:

- Geometry unit tests: fit, continuous/native coordinates, repeated anchored zoom/pan, 1:1 CSS mapping and shortcuts. Existing rasterization, legacy recipes, master immutability, provenance and export tests remain in use.
- Packaged Smart Cutout smoke: all six brush roles change the actual canvas before pointerup; Save stays disabled during the stroke. Rapid pointer movement, one-stroke undo/redo, hover/zoom cursor diameter, tool icons/shortcuts, typed-name isolation, bracket resizing, pointercancel, focus loss, delayed lost-capture protection, explicit stale-worker events, Alt/Space view-only pan, modifier release before pointerup, wheel anchoring, vertical zoom/Fit/100%, resize, polygons and closed-selection behavior.
- Actual Electron maximize state plus 1920×1080 renderer viewport, also 960×720, 1280×800 and 1440×900. Image area must exceed 60% of viewport height; editor spans nearly the full width, main actions stay within the viewport, no horizontal overflow. Actual CDP DPR 2 checks both CSS 1:1 image width and brush diameter.
- Expression smoke and nested relighting-mask smoke inspect drawn pixels and disabled Save **before pointerup**. Frame-based undo assertions wait for the actual scheduled paint. Existing Hard Lock, alpha, Master V2+, quality approval, restart and exact PNG export still run.

Native generation tests use the existing explicitly labelled `tests/support/fake-codex.mjs` protocol fixture. Local mask/worker/file processing is real. No live image generation, new AI dependency, API key request or external AI call.

## Screenshots and observed runs

Screenshots contain only the synthetic test portrait, actual cursor and controls; no private artwork:

- [960×720](screenshots/ux-02/editor-960.png)
- [1920×1080, maximized Electron window](screenshots/ux-02/editor-1920.png)

1280×800 and 1440×900 screenshots are retained in ignored `artifacts/`. All four were inspected for image area and reachable actions. The latest complete Smart Cutout run used `/tmp/laceframe-smart-ui-hM9nVz`; PNG export/source hashes and recipe restart were checked there. The existing 4-MP worker benchmark also passed: 2444 ms end-to-end including source preparation/transport, 611 ms selection time, 147 renderer animation frames during the off-thread operation. This is not a claim of 60fps full-canvas painting.

During development, Typecheck caught JSX nesting while wrapping the existing controls. Old dropdown/select smoke actions were replaced with actual icon/slider interactions. The native undo test initially read the canvas before the scheduled frame; it now waits for the visible result. Early live-stroke checks encountered premature completion; capture ownership is now explicitly checked, delayed capture-loss events are tested, and CDP mouse tests establish OS/document focus before drawing so the separate blur policy is not accidentally invoked. An isolated temporary probe passed four six-stroke runs; a fifth hit the old five-second initialization timeout, so initial-worker readiness now allows 20 seconds. Final complete suite results refer to the corrected tests and source. No live generation was retried or performed.

## Limits

No new segmentation, rasterization engine, mask schema or data migration. PR #17/#18 limits still apply: automatic cutout at most 4,194,304 pixels; legacy/manual masks retain their existing bounds and history budgets. Large full-canvas previews can take longer than one display frame; no 60fps guarantee. Intermediate brush feedback uses the last automatic selection until the worker verifies the current topology; only verified pixels can be saved. The two extra polygon contribution buffers add at most 8 MiB at the automatic-selection ceiling, in addition to existing bounded buffers. Linux x64 was exercised; Windows/macOS input, window management and packaging remain unvalidated. The optional freehand polygon mode remains deferred.
