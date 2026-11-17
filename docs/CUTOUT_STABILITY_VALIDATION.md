# Cutout stability, editor UX and relighting workflow guard

Date: 2026-11-17. Based on merged PR #19/#20, `origin/main` at `ae330f2`. Branch `fix/cutout-stability-relighting-guard` in the existing repository; no worktree/main commit. Initial GitHub search found no open PR. The pre-existing staged `.vscode/settings.json` remains byte-identical and excluded (cached diff SHA-256 `c196c824486a9883006b33270441d5ef08065918f4578b0a313362222b8251bb`). Only disposable synthetic projects/images were used; no private portrait, original user project, live ImageGen or cloud service.

## Reproduced P0 cause and correction

The real Electron development app uses React Strict Mode. Its setup → cleanup → setup replay cancelled the pending `requestAnimationFrame` but left `frame.current` nonzero. `requestRender()` consequently refused every later frame. The independent worker finished, so the UI reported success even though the canvas had never received the original image. Packaged production smoke tests did not exercise this development-only effect replay.

Before changing image loading, an isolated real Electron reproduction used the existing synthetic 1254×1254 PNG with dark coat/skin/partial alpha. With zero colors/seeds and unchanged retention:

| Observation | Baseline | Only resetting the cancelled frame ID |
| --- | --- | --- |
| Worker/status | `Vorschau bereit · 58/59 ms · 0 reduzierte Maskenpixel · 0 Konflikte` | Same successful worker result |
| Actual canvas coat pixel (625,950) | `[0,0,0,0]` | `[0,0,0,255]` |
| Actual canvas skin pixel (500,500) | `[0,0,0,0]` | `[165,115,90,255]` |

The original failure was replayed once more, retaining a genuine before screenshot. The paired after screenshot uses the same fixture with the lifecycle correction, before the subsequent UX changes. Temporary reproduction scripts/logs are `/tmp/laceframe-cutout-before.cjs`, `laceframe-cutout-before.log`, `laceframe-cutout-before-replay.log`, `laceframe-cutout-frame-fix.log`. They are not production code or a fallback.

The production correction resets the cancelled frame ID during cleanup. For automatic cutout (≤4 MP) it also removes the competing browser `preview(master.id)`/Image.decode load: the canvas, original view, pipette and worker all use the same dimension-validated `cutoutSource(id)` RGBA bytes. Display starts before background selection finishes. Larger legacy manual cutouts retain their bounded original-image decode, now with dimension/stale-load checks. No alpha is forced opaque; retention 255 preserves original alpha and hidden RGB in canonical pixels. Original/Result/Alpha, overlays and checker/light/dark backgrounds affect presentation only.

Readiness requires a loaded source, a valid current worker result and an actual successful canvas paint of that result. Load, original-loaded/painting, calculating, ready, cancelled, load-error and calculation-error messages are distinct. Worker array sizes/counters are checked, stale messages remain rejected, invalid/failed/pending results cannot save. Errors expose an explicit retry; a real corrupted-file read and recovery and an invalid worker payload were tested. Existing mask histories, worker coalescing, immutable source/candidate storage and main recomputation on Save remain in use.

## Editor UX

Existing icon tools/cursors/shortcuts remain at the top; the Sage protection cross is unchanged. The left column identifies the active tool and shows only its relevant color selection, brush or polygon controls. Protection and explicit removal have plain-language effect descriptions. Selected background colors and their removal are directly visible with the color tools. A single non-nested **Erweitert** area holds metadata/reset and optional selection expansion/technical explanation. Polygon history appears with the polygon tool. No new brush/selection engine or destructive reset was added.

Original/Ergebnis/Alpha, inspection backgrounds and independent protection/removal/selection overlays sit directly above the image. Undo/Redo join close/save in the bottom row. The image grows with the available viewport; existing Fit, native zoom, vertical slider, anchored wheel, temporary Alt/Space hand, live cursor and polygon rubber band are retained. The actual Electron tests inspect canvas feedback before pointerup and exercise 960×720, 1280×800, 1440×900 and maximized 1920×1080, including DPR 2.

## Trusted relighting rule

The main-process `checkedRelightSource()` validates the project metadata and follows the selected asset's actual quality/promoted-master/expression ancestry (bounded to 64 records). It requires an explicitly approved cutout and approved selected/intermediate descendant revisions. It verifies character relationships, source hashes, promotion links and dimensions. Each source/output/mask is bounded, canonical-path/symlink/hash checked. Cutout output is recomputed from its retention mask; Smart Cutout recipes/mask roles are verified; light/resolution descendants are recomputed from their saved parameters. Actual decoded output must agree with that provenance and contain nonempty, genuine alpha transparency. A transparent raw import alone never qualifies.

The same check runs for source access and again on `createRelighting` Apply, where the expected source SHA-256 from the opened editor is also required. Direct IPC cannot bypass disabled UI controls. The one additional ID-only typed preload method, `relightEligibility(id)`, reports the authoritative eligibility/reason without filesystem/token access. Existing Hard Pixel Lock checks remain in force.

UI buttons stay disabled while the source is being checked or is unsuitable, with the reason beside the existing **Hintergrund freistellen** action. Saving a cutout leaves a candidate blocked; explicit quality notes/silhouette review/approval select the approved cutout or its promoted master and enable relighting. A saved light recipe can be edited only against its eligible original source, never silently reinterpreted against an unrelated current master.

Historical relighting records without an approved cutout are not migrated, rewritten or deleted. Their preview/comparison, recipe reads, permitted exports and subsequent cutout remain available; new relighting from that nonconforming source is blocked. Synthetic candidate and approved legacy records were checked. Old file/schema backups and stale-master approval rules remain intact; no project migration or runtime dependency.

## Actual validation

| Command | Actual result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, zero warnings |
| `npm test` | Passed: **274 tests, 16 files** |
| `npm run build` | Passed: packaged Linux x64 |
| `npm run test:desktop` | Passed: all **seven** suites, including the new cutout stability suite |
| `npm run test:desktop:native` | Passed: native Create and Character Creator suites |
| `LACEFRAME_DEV=1 node scripts/cutout-stability-smoke.cjs` against `npm run start` | Passed: actual development Electron with React StrictMode |
| `git diff --check` | Passed |

The packaged and development stability runs both include actual canvas readback, retry/reopen, legacy export and partial-alpha checks. Full suite logs were retained locally under `/tmp/laceframe-cutout-desktop-final.log`, `/tmp/laceframe-cutout-native.log`, `/tmp/laceframe-cutout-unit.log` and `/tmp/laceframe-cutout-ui-dev-final.log`. Screenshots at the four required sizes were captured and visually inspected.

Intermediate test failures were resolved before these final runs: a new eligibility status made an old export locator ambiguous; a fixture with too little removed background correctly failed the existing quality gate and was changed to a real protected-center cutout; partial-alpha browser readback needed the documented RGB-only tolerance; and project reopening required waiting for the current master before switching to Library. None of these fixes weakens the alpha, full-canvas hash or approval assertions.

New tests cover exact retention/alpha/original frame composition; raw opaque and transparent imports; unapproved/rejected cutouts; approved cutouts and promoted masters; approved subsequent relighting; stale Apply hashes; changed source/output/mask bytes; malformed provenance and forged output even with superficial hashes updated; legacy records and unchanged files. Existing relighting storage tests now begin with a real explicitly reviewed cutout rather than bypassing the new invariant. The old creator-before-cutout relighting test now asserts rejection, preserving the candidate and identity references.

The dedicated Electron smoke checks the **entire actual opaque 1254×1254 canvas SHA-256**, zero background colors/removed pixels, original display before delayed real-worker execution, all views, recompute, zoom/Fit/resize, reopens, context controls, error/retry, real cutout-save/review/unlock and direct IPC denial. Its extended synthetic historical fixture checks comparison/raw PNG export/cutout with no manifest rewrite, and a separate partial-alpha import checks unchanged alpha 128/0 and Alpha view. Canonical RGBA tests are exact; browser Canvas2D RGB readback for partial alpha can differ by one byte because of premultiplication, so only that display comparison has a one-byte RGB tolerance. Alpha and opaque-frame hash remain exact.

Native automated image jobs use the existing explicitly labelled `tests/support/fake-codex.mjs` process/protocol fixture via temporary test PATH. Local PNG processing, workers, WebGL/CPU preview, IPC, storage, review and exports are real. No image generation or provider implementation was replaced; no live generation was performed.

## Screenshots

Synthetic pixel geometry only, no portrait. [Before](screenshots/cutout-stability/before.png) and [after lifecycle correction](screenshots/cutout-stability/after-lifecycle.png) use the same geometric fixture. Final UX captures: [960×720](screenshots/cutout-stability/editor-960.png), [1920×1080](screenshots/cutout-stability/editor-1920.png). Additional sizes remain in ignored `artifacts/`.

## Limits

Linux x64 only; Windows/macOS input/packaging remain untested. Automatic selection and relighting remain limited to 4 MP, manual masks to 16 MP; no implicit resize. Main verification recomputes bounded chains and can briefly occupy main, especially with large sources; no constant-latency claim. Alpha evidence and a valid reviewed chain do not prove an ideal silhouette or identity. Color-based selection still needs manual protection for touching same-colored clothing/hair. No semantic segmentation, de-matting, AI dependency, new generation, new master artwork, palette reconstruction or 3D relighting. UI masks/drafts remain session-bound until explicitly saved.
