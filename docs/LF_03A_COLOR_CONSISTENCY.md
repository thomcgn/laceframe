# LF-03A — Expression Color Consistency & Palette Lock

Date: 2026-11-18. Based on `origin/main` `cd41d23` (merged PR #28). Independent feature branch `feat/lf-03a-expression-color-consistency`, existing repository, no worktree/main commit. No user project, private artwork or live ImageGen request used. `.vscode/settings.json` remains untracked and unchanged.

## Working workflow

Studio expression review exposes **Farbkonsistenz prüfen** before approval. The same tool is available in Library → Assetqualität for expressions and their quality derivatives. It resolves the expression's actual historical master, never silently switches to today's active master or another character.

1. Assign hair, skin, clothes or custom regions on the approved master using the existing mask editor. Save an immutable **master palette revision**. Multiple named regions of the same role are possible, up to five regions per revision.
2. Select a palette revision. Assign each candidate region separately using the mask editor. Only with equal dimensions can the user explicitly copy master coordinates after a warning. Equal dimensions do not imply registration. Different poses/dimensions are never automatically aligned or rescaled. Confirm the assignments manually before saving.
3. Regional color measurements update in a worker as soon as candidate regions exist. Select the drifting source color using the candidate pipette or color input; select a reference swatch or sample an actual color inside the selected master region. Mouse pipettes and explicit keyboard pixel-coordinate sampling are available.
4. Adjust strength and the chromatic group radius. Default correction leaves L* unchanged. Correcting a lightness offset, for example lightened hair, requires a separate explicit checkbox. A separate mask protects pixels completely; any nonzero protection value wins.
5. Toggle original/corrected preview, undo/redo or reset. No intermediate PNG or manifest is written. **Als separaten Farbkandidaten speichern** recomputes in main, checks the preview hash, and writes a new PNG and immutable recipe.
6. Use the existing comparison, quality note, explicit silhouette/style/alpha review and approval. An approved derivative produces a separate Expression with its original master provenance. It never overwrites the master or previous Expression. Historical color candidates reopen their saved palette/masks/parameters; they require a new manual assignment confirmation before another save. Export uses the approved stored PNG bytes.

The editor keeps images beside independently scrollable controls, including at 960×720, and uses nearest-neighbor canvas display. Images are displayed independently at their own aspect ratios, not claimed to be registered in this dialog; the existing registered comparison remains available after saving.

## What the measurements and correction mean

Algorithm: **`regional-lab-offset-v1`**, encoded sRGB RGBA8 → CIELAB D65. A bounded 5-bit histogram selects up to 16 dominant groups per manually assigned master region. The representative of each group is an actual sampled master RGB, not a quantized output color. Counts refer to visible master pixels with alpha ≥128 and mask weight ≥128. This palette is a reference for measurement and manual choices, not a replacement lookup table.

The automatic checks report:

- Mean nearest-reference Euclidean distance in **a*/b***, the chromatic projection of ΔE76. L* is deliberately excluded here. Warning above **12 Lab units**.
- Mean positive L* excess above **the lightest reference +8 L***. Warning above **8 excess units**. This conservative test catches broad unwanted lightening while permitting additional darker shading. It does not detect all shifts in a region containing bright highlights.
- Actual measured visible pixel count; no invented percentage, identity match, or style score.

The configurable group radius selects pixels by a*/b* distance from the chosen source swatch. Correction applies a constant **Lab offset**, modulated by strength and mask weight, only to that group in that candidate region. It does **not** replace colors with nearest master colors, reduce the whole image to a master palette, blur, resample, add light, or generate pixels. Without the explicit lightness option, each pixel's L* is retained before conversion/rounding. With it, relative lightness differences remain until gamut/channel clipping. Local chromatic differences similarly remain rather than snapping onto discrete reference colors. Alpha, hidden RGB under alpha=0, protected pixels and pixels outside the region/group remain unchanged.

Thresholds are transparent review heuristics, not perceptual or semantic guarantees. New colored shadows may still trigger a chromatic warning; highlights, rare colors omitted from the dominant palette, partial-alpha edges and intentionally changed lighting require visual judgement. Darker tones alone do not trigger the excess-lightness test. Byte rounding and sRGB gamut clipping can reduce details near channel limits. No palette lock is a guarantee of identity or a substitute for review. Existing Style/Identity prompt locks and generation behavior are unchanged.

## Persistence and safety

- Additive, strictly validated `masterPalettes` collection in schema v2; missing collection defaults empty for old projects. Opening remains read-only. First write of an older manifest creates an exclusive byte-exact `laceframe.v2.pre-color-consistency.backup.json`, using the existing earlier-migration backup priority when needed. First semantic palette write also retains a pre-feature backup for current-format projects. Conflicting backups fail safely.
- Master palettes retain master ID/hash, character ID, algorithm, revision, timestamp, named region roles, reference colors/counts and immutable mask SHA-256/path. Revisions append; previous palette entries remain referenced.
- `qualityAssets` adds `color-correction`; records retain source ID/SHA, palette ID/exact immutable revision, algorithm, correction revision, group parameters, all region/protection mask hashes, output dimensions/format and decoded output SHA. Asset SHA remains the hash of the actual PNG. Export provenance includes character palettes.
- Masks live at content-addressed `assets/color-masks/<sha256>.png`, exclusive read-only writes. Project-relative canonical path, symlink, size, decoding, hash and dimension checks apply. Reopen checks palette extraction against the actual master and mask, and checks recipe masks/output pixel hashes. Approval recomputes the recipe and checks target swatches against the actual master region again.
- Main accepts source/master IDs and validated parameters, never renderer filesystem paths. Typed preload adds only palette/recipe read operations; existing analysis source and command boundaries are reused. No renderer Node/fs/token API. Main verifies exact master/character binding, non-overlapping candidate regions, mask sizes, preview hash, and existing Expression Hard Lock independently of the color protection mask. Color derivatives cannot bypass hard composites.
- Max **4,194,304 pixels per input**, five regions, bounded 65,536-entry conversion caches, and eight color-draft undo states. Worker jobs are debounced and superseded workers terminated; no persistent preview files. Unsupported sizes fail visibly without automatic downscaling. This is a bounded MVP, not a measured total-memory/latency guarantee for every photograph.
- Older strict-schema binaries may not accept newly saved color fields/operations. Reverting requires the original backup and complete asset directory. There is no destructive asset garbage collector; a failed write can leave unreferenced immutable bytes just as existing quality operations can.

## Actual local checks

- Targeted color suite: **16 tests passed**. Covers light hair, skin/clothing drift, allowed extra shadows/gradients, Lab/D65 endpoints, strength/soft masks, protected/hidden/partial-alpha pixels, nonselected groups, invalid sizes/overlaps/unconfirmed registration, exact preview/PNG export, explicit approval, saved recipes/revisions, wrong hashes/master/character/regions/targets, immutable history, different dimensions, legacy backup, traversing/corrupt/symlink masks and independent Hard Lock enforcement.
- Targeted existing asset-quality/relighting suites passed (40 existing tests).
- CI routing suite: **60 passed** after adding the new actual smoke to Expressions/Persistence mappings and their exact orchestration fixture inventory. No existing check or assertion was removed.
- `npm run check:fast`: passed — Typecheck, zero-warning Lint, **422 tests / 22 files**, whitespace checks. `npm run classify:changes`: **HIGH/FULL**. FAST does not certify the HIGH change alone.
- `npm run build`: passed, Linux x64 package. Builds during implementation were repeated only after relevant source changes.
- `node scripts/color-consistency-smoke.cjs`: passed on packaged Electron, real masks/worker/UI/IPC, live correction, undo/redo, no intermediate disk writes, explicit approval, exact PNG export, original/master hashes, restart and 960×720 / 1440×900 / 1920×1080. The final expanded check also reopens the exact historical color recipe, verifies identical rendered pixels, and requires a fresh manual confirmation.
- `node scripts/creator-smoke.cjs`: passed, actual identity imports, existing comparison, native provider protocol fixture, Master Rebuild, alpha gate, approval, restart. No live generation.
- `git diff --check`: passed. Hosted FULL/quality-gate results are recorded in the PR description after the run, to avoid another complete run solely for report changes. Full ordinary/native aggregate suites are delegated to HIGH CI, not repeatedly run locally.

The initial new unit tests caught fixture issues (Buffer/Uint8Array comparison, case-sensitive error expectation, duplicate read-only fixture bytes and an artificial legacy fixture retaining an incompatible old backup); fixtures were corrected without weakening product validation. Adding the smoke expanded two exact CI-routing expectations/fixture inventories. The first desktop attempts exposed test setup using a collapsed project panel and a collapsed/remounted quality panel after approval; the test now restarts/awaits the actual selected asset before export. Screenshot review moved live images beside controls. A later exact canvas comparison ran before the repaint; the smoke now polls the unchanged exact RGBA expectation for undo/redo/restored previews, without sleeps or relaxed tolerances. These failed development attempts are not counted as successful final runs.

The pre-existing Creator CI failure seen in PR #28 waited for disk reference counts after removal, then dispatched a synthetic drop before React's removal-busy state had cleared. Its smoke now also waits for the import button to be enabled. All previous import/assertion checks remain; no production identity behavior changed. The complete affected Creator smoke passed locally.

## Scope and limits

No new generation, AI segmentation, pose estimation, global palette quantization, automatic approval, prompt rewrite, Motion or Guided Mode phase. Only Linux was exercised. Windows/macOS, real artist acceptance tests and private characters were not tested. Visual screenshots use synthetic gray gradients; algorithm tests include actual skin/clothing chromatic shifts. Historical master references remain selectable even after a newer master exists.

Manual acceptance: import a candidate, open Farbkonsistenz, assign and save three master regions, separately map candidate regions, sample drift/target colors, compare with strength zero/nonzero, protect highlights/details, save, review deliberately and export. Intentionally dark new shadow bands should remain; only explicitly selected groups/regions may change. Check the output with a reopened project before accepting it for production.

Synthetic desktop screenshots: [960×720](screenshots/lf-03a/960x720.png), [1440×900](screenshots/lf-03a/1440x900.png). The 1920×1080 capture remains in ignored `artifacts/color-consistency/`.

## Hosted CI findings

[Initial Quality run 44213537633](https://github.com/thomcgn/laceframe/actions/runs/44213537633) passed HIGH classification, Typecheck, Lint, 422 unit tests and build, then failed the general Desktop smoke's exact preload method inventory: it had not yet listed the two new typed reads `colorPalette` and `colorRecipe`. The exact allowlist is extended by those two methods; unrestricted filesystem/Node methods remain forbidden. The complete affected `node scripts/desktop-smoke.cjs`, targeted lint and `git diff --check` passed locally; updated hosted results are recorded in the PR. No tolerance or application assertion is removed. The first hosted attempt is not a passed FULL regression.

The final UI review also caught an ignored mask-name edit. Master-region names now carry through into the immutable palette revision; candidate/protection mask names are read-only because their region meaning comes from that palette. The targeted smoke explicitly edits/verifies the master name and verifies the candidate name is read-only. Typecheck, targeted lint, a package built after this UI change and the complete color smoke passed. The nested editor keyboard guard uses the actual `.mask-editor` class.

[Quality run 44216138323](https://github.com/thomcgn/laceframe/actions/runs/44216138323) passed Typecheck, Lint, all 422 units, packaging and all eight existing ordinary Desktop smokes. The new color smoke then caught one remaining unsynchronized multiline Undo canvas assertion at line 204: it read the still-corrected frame immediately after Undo. That assertion now polls the **same exact original RGBA array**, matching the already synchronized redo/restore checks. No product code, pixel tolerance or expected value changes. The affected complete color smoke, targeted lint and whitespace checks passed locally against the unchanged package before the next required hosted FULL. The intermediate run 44215570112 was superseded/cancelled, not counted as a pass.
