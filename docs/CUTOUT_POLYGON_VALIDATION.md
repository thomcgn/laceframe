# Smart Cutout — Polygon selection validation

Date: 2026-11-17. Patch branch `feat/cutout-polygon`, based on merged PR #17 (`origin/main` at `ed8b1f6`). Existing local repository, no worktree or main checkout/commit. The pre-existing staged `.vscode/settings.json` is preserved and excluded. All project/image tests use temporary synthetic data; no user project or private portrait was opened.

## Implemented

The existing `MaskEditor` adds **Polygon/Lasso**, with native-coordinate vertices, visible lines/corners and a closed-selection guide. Click adds a corner; Enter or double-click closes; Backspace removes the last corner; Escape/“Auswahl verwerfen” clears only the pending selection. Alt-drag and existing zoom/pan preserve the same native coordinate mapping. Pending corners/closure have undo/redo; applied operations use the existing recipe history. Saving is disabled while a pending polygon still needs applying/discarding. No intermediate files are written.

“Polygon anwenden” explicitly adds one of three operations:

- **Figur schützen:** union the interior into effective Protected Foreground.
- **Hintergrund entfernen:** union the interior into effective Forced Background.
- **Auswahl begrenzen** (default): interior is a barrier to automatic connected fill/global color selection. The automatic result is clamped again after expansion/softness, preventing refinement from leaking inside. Existing manual/forced edits remain meaningful within a limit.

Protected Foreground wins over Forced Background, automatic selection and manual retention. Multiple limits exclude the union of their interiors. Polygon masks supplement the existing brush masks; erase brushes do not subtract polygon contributions. Applied polygons can be removed individually (undoable) or via Reset. Correcting an applied outline means removing it and drawing a replacement. Original source alpha is never resurrected above its original value.

`shared/cutout-polygon.ts` defines `pixel-center-even-odd-v1`: deterministic native scanline parity at `(x+0.5,y+0.5)`, half-open Y edges, left-inclusive/right-exclusive X intervals; binary 0/255, no antialiasing. Concave outlines and either winding work. Degenerate/duplicate/flat corners, self-crossings and non-adjacent touching edges fail explicitly. Integer vertices may lie on the outer image boundary `(width,height)`. Limits: 3–128 corners, 32 applied polygons, existing 4,194,304-pixel automatic-selection ceiling. Invalid/non-finite/fractional/outside coordinates and unknown operations/versions are rejected.

Rasterization and mask combination run inside the existing worker. Main independently runs the exact same shared selection algorithm before accepting the candidate weights. Effective protection/forced/limit buffers are returned for display; saved base brush masks retain their distinct roles. The existing immutable recipe stores the polygon algorithm, operation and ordered native vertices in optional `settings.polygons`, alongside the separate SHA-256 mask files, source provenance, final foreground-alpha mask and output pixel hash. Reopening recomputes the effective polygon masks from these inputs. Recipe revisions and historical coordinates remain immutable. No new IPC/filesystem access, dependency or generation route.

Legacy recipes without `polygons` remain readable without adding defaults to saved records. Opening remains read-only; a new revision does not rewrite an old cutout or master. Newly saved polygon recipes are additive schema fields; older strict-schema binaries may reject them. Existing backups/assets should be retained for downgrades.

## Actual validation

- `npm run typecheck` — passed.
- `npm run lint` — passed, zero warnings.
- `npm test` — passed: **247 tests, 13 files** (238 baseline + 9 polygon tests).
- `npm run build` — passed, packaged Linux x64 app.
- `npm run test:desktop` — passed: all five packaged desktop smokes (manual project workflow, asset quality, relighting, style analysis and expanded smart cutout).
- `npm run test:desktop:native` — passed: native provider and character creator smokes.
- `git diff --check` — passed.

New unit cases cover rectangles, concave shapes, exact diagonal pixel-center boundaries/winding, image edges, invalid/self-touching/crossing polygons, bounds/point/count limits, connected-fill barriers and global selection, softness/expansion exclusion, same-color black jacket, forced/manual edits inside limits, protected/forced conflicts, undo/redo, exact preview/main PNG bytes, restart/provenance, unchanged master bytes and pre-polygon smart-recipe retention.

The expanded actual Electron smoke uses a synthetic 1254×1254 portrait with dark background/hair and black jacket. It exercises mouse corners, Enter/double-click, duplicate click suppression, Backspace, Escape, transient undo/redo, self-crossing rejection, transformed native vertices after zoom/pan, pending-save gate, all three operations, conflicting forced/protected regions, applied undo/redo and recipe reopening. Existing checks still cover threshold/softness, cancellation/recompute/save gates, no manifest writes before Save, Master V2 manual approval and byte-identical PNG export. Both 960×720 and 1440×900 layouts were captured and visually inspected. The screenshots below show the **closed pending polygon before explicit Apply**; Save is intentionally disabled until applying/discarding it.

- [960×720 screenshot](screenshots/cutout-polygon/editor-960.png)
- [1440×900 screenshot](screenshots/cutout-polygon/editor-1440.png)

All pixel-processing tests run real local rasterization, worker, safe import and export. Native generation smokes use the existing clearly labelled `tests/support/fake-codex.mjs` protocol fixture, never a production fallback. **No live generation, API-key request or external AI call.** Temporary projects for the final full run include `/tmp/laceframe-smart-ui-k5nqC7`; ignored runtime artifacts remain under `artifacts/`.

During validation, Typecheck caught a duplicate constant in the new helper and Lint caught a reused smoke variable. One unit comparison initially compared Buffer and Uint8Array types instead of byte contents; it now compares all bytes. These were corrected before the passing complete runs above.

## Limits

Polygon mode only; optional freehand sampling is deferred. No semantic hair/coat/face detection. Collinear intermediate corners are deliberately rejected: Backspace removes the redundant corner. There is no vertex-drag editor or polygon subtraction; replace/remove an operation or undo it. The native-coordinate outline is a display guide, while actual masks use the deterministic binary rasterizer. Explicit Save still recomputes/encodes in Main through the existing bounded pipeline and can briefly block it on large images. Linux x64 was validated; other desktop platforms were not exercised. Original PR #17 limits and human-review requirements still apply.
