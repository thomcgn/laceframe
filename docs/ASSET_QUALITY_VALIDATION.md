# Character asset quality, transparency and style consistency

2026-11-16. Branch `feat/character-asset-quality`, based on merged PR #11 (`origin/main` at `156a1fd`). Existing repository only, no worktree. The user's staged `.vscode/settings.json` is preserved and excluded. No private image or existing user project was opened/changed.

## Baseline / 02F dependency

Fetched origin and inspected local/remote branches, docs, available task attachments and GitHub open PRs: no 02F branch, implementation, report, attachment or open PR was available. There was no pending resolution implementation to duplicate or merge. This change therefore keeps its bounded resolution contract in `shared/asset-quality.ts`, separate from provider transport: named width/height, sampling (`nearest` / alpha-aware `bilinear`) and fit (`contain` / explicitly confirmed `cover`). Each saved derivative snapshots the full profile. Creator target profiles snapshot the selection alongside existing target dimensions. This is not a claim that a separate unseen 02F task has been implemented. A future 02F profile library can consume this contract instead of introducing a second pixel pipeline.

Read AGENTS, MVP plan, Character Expressions and 02C/02D/02E validation reports. Historical reports retain their original algorithms/test results; they are not retroactively rewritten.

## Working workflow

Characters, Create, Expressions/Inspect and Character Creator show actual main-process RGBA evidence, with expandable quality tools. The common required transparent-character instruction is included verbatim in both prompt composers **and** trusted native job instructions, even when the user edits the visual prompt. Style instructions explicitly separate identity, outfit, rendering/cluster/contour/detail/shading/material treatment and transparent composition. No transport, account entitlement or generation success is invented.

RGBA analysis counts zero/partial/opaque alpha and transparent border pixels. Fully opaque PNG is labelled opaque; entirely invisible images are empty. Missing fully transparent pixels or fewer than half transparent border pixels are conservatively suspicious. An exact repeating, opaque, two-gray checker tile pattern across the complete border produces a specific baked-checker warning. Arbitrary baked backgrounds, textured checker patterns and semantic silhouette correctness are **not** automatically recognized. Border thresholds can flag valid edge-touching silhouettes. Alpha alone never asserts a perfect cutout.

Existing raw approvals/master locks remain usable for compatibility and identity/style review. They do **not** assert production transparency: the evidence remains visible and opaque/suspicious/empty assets fail the production export check. An explicitly labelled `_RAW` PNG export is separate. New quality approval requires a note, explicit human silhouette/style check and a nonempty transparent result. Generation completion never auto-approves a candidate.

**Hintergrund freistellen** reuses the existing native-coordinate mask editor, mouse/touch, brush/eraser, partial weights, undo/redo, zoom/pan and bounded history. White retains foreground, black removes it, gray multiplies the existing alpha. There is no color-keying, black-pixel removal or uncontrolled magic wand. Turning off the mask overlay displays the real alpha result. The saved `foreground-alpha` mask is a distinct type under `assets/cutout-masks/`, separate from expression edit masks. Reopening an existing quality cutout reloads its retention mask and original source so removed pixels can be restored; saving creates another immutable candidate. Every cutout and resolution variant has its own UUID, source ID/hash, operation/version, review state and content-addressed PNG under `assets/quality/`. Sources and Codex originals remain unchanged.

A cutout from the **current** approved master can be explicitly approved as V2, V3, etc., with a new ID and `previousMasterId`. V1 and old expressions, masks, prompts, hashes and review states remain intact. Stale improvements cannot replace a newer active master. A creator result can be cut out and approved as its first Master V1, retaining original candidate, identity references, outfit, exact prompt and target-profile provenance. An expression cutout can become a separate approved expression retaining its original master/variant/action/attempt links. Resolution derivatives are separately reviewed/exported; they never silently rebind an expression or edit mask.

Resolution processing preserves aspect ratio. Contain pads with transparent RGBA; cover explicitly crops centrally. Pixel art uses nearest neighbor when selected. Illustrative bilinear sampling uses premultiplied alpha, then unpremultiplies; it never interpolates hidden black/white RGB into a visible fringe. Nearest neighbor is not a remedy for a photorealistic rendering style. Raw output dimensions remain measured and unchanged.

Style review shows the attempt's exact historical reference images/revision where available, their actual dimensions, shared registered slider/overlay/zoom/pan comparison, dominant 5-bit RGB groups and counts of exact changes between adjacent visible pixels. Target color rules are shown separately. These are inspection aids, not a style/identity score. Quality notes persist with the reviewed derivative. No automatic style approval.

## Hard Pixel Lock rule V2

New composites record `version: 2`, `rgba8-premultiplied-round`. Version 1 / `rgba8-straight-round` remains valid and explicitly reproducible; existing files/provenance are never reinterpreted.

For mask weight w, A = master.alpha × (255−w), B = raw.alpha × w. Interior RGB is round((master.RGB × A + raw.RGB × B)/(A+B)), alpha = round((A+B)/255). When A+B=0, hidden RGB is retained from the master. Endpoints w=0 and w=255 copy all four source channels exactly, including invisible RGB. This uses encoded RGB, not linear-light color interpolation. The prior V1 independent channel interpolation darkened a colored foreground against hidden black and could create fringes; a specific pixel test demonstrates the difference.

A raw hard-lock result cannot bypass compositing through cutout approval or approval/export of a scaled quality derivative. Cutting out a composite must retain every protected master RGBA sample exactly; an attempted protected-background change is rejected with guidance to improve the master instead. Scaling creates a separate derivative and makes no original-coordinate pixel-lock claim. Manual alignment and identity review remain required.

## Real export and security

Native chooser selects an **external directory**, never a renderer-provided path. Main verifies source hash, decoded transparency and approval before production export. PNG bytes remain unchanged when already PNG; WebP is decoded and encoded to a new PNG. Names use character, master version / expression label and actual dimensions, e.g. `Black_Coat_Master_V2_32x32.png`; explicit raw files append `_RAW`. Optional JSON is implemented at the bridge boundary and selectable in the GUI (enabled by default), retaining source/derived hash, character/master/attempt/prompt/outfit/processing metadata and exported SHA-256. No project files are moved or overwritten. Every destination is reserved exclusively; collisions/symlinks fail and only this operation's newly reserved files are rolled back. Internal project directories are refused.

Preload adds only three narrow typed operations: pixel evidence by asset UUID, saved cutout-mask bytes by derivative UUID, and export request by asset UUID/flags. No generic file/process/token interface. Main retains trusted sender/frame checks, strict schemas, bounded verified reads, symlink/canonical-path checks, immutable exclusive writes and the generation project lock. Read-only evidence is available during a job; mutations/exports stay locked. No additional runtime dependency, API key, HTTP image endpoint, segmentation service or background server.

Old projects open read-only. Before their first explicit write, pre-quality 02E projects receive exclusive byte-exact `laceframe.v2.pre-asset-quality.backup.json`; earlier migration precedence is retained. New schema fields are optional/default-empty on old files. New master chains and cutout/provenance are validated. Reverting to an older strict-schema binary requires the pre-migration manifest **and** original asset directories.

## Actual Linux validation

Results refer to the completed commands on this branch:

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, zero warnings |
| `npm test` | 185 tests passed in 9 files (158 baseline + 27 quality tests) |
| `npm run build` | Passed, packaged Linux x64 Electron |
| `npm run test:desktop` | Passed: existing manual smoke + new quality smoke |
| `npm run test:desktop:native` | Passed: native provider/mask smoke + Character Creator smoke |
| `git diff --check` | Passed |

New unit/integration tests use synthetic pixels for opaque black backgrounds, actual alpha, soft edges, empty images, baked checker pattern, corrupt/false formats, deterministic masks, retained black clothing/hidden RGB, V1/V2 composition, aspect-preserving nearest/bilinear padding/crop, immutable cutout/mask bytes, correction/reopen, Master V2 and stale improvement rejection, creator cutout first approval with identity/outfit/profile provenance, expression cutout approval/export, raw-vs-production gate, human review, path/cycle/cross-character validation, damaged/symlinked masks, exclusive export rollback and pre-quality migration backup.

The quality packaged smoke drives actual React/typed IPC/project files: opaque PNG import and export rejection, real mouse erasing along the boundary, undo/redo, mask reload/correction with gray alpha, saved candidate, explicit Master V2, black center pixels retained, original hash unchanged, actual native chooser export to PNG+JSON, renderer Node/path rejection, 960×720 layout and close/relaunch/reopen. No renderer exceptions. Synthetic screenshots under ignored `artifacts/cutout-editor-960.png` and `quality-master-v2-960.png` were visually inspected. Existing smoke coverage retains native generation lifecycle, single-job locking, account gates, error/cancel/regeneration, character separation, historical styles, prompt revisions, hard-lock pixels, slider touch/keyboard and creator workflow.

Native automated jobs use only the existing explicitly labelled `tests/support/fake-codex.mjs` protocol double via temporary PATH. It is never a production fallback. **No real Codex image generation, image allowance usage, API-key request or paid API call was made.** No new claim of live transparency/style fidelity follows from these fixtures.

Initial checks found one historical unit assertion expecting V1 blending as the default; it now explicitly requests V1 while new tests verify V2. One new immutability assertion compared Buffer and Uint8Array object types rather than their equal bytes; the assertion was corrected. A later named-mask assertion initially omitted its input name in the helper; the helper now supplies the name and the desktop test also verifies it after reloading. The native smoke initially selected hidden additional comparison stages and later confused the generic visual-style instruction with a selected profile block; selectors now target the visible comparison and the exact profile-specific prompt marker. Extended comparison tools are also mounted only when opened. Final review identified and fixed a real approval gap for scaled derivatives of a hard-lock raw result; a regression assertion now verifies rejection even when that derivative has genuine transparent pixels. Production behavior was not relaxed to make tests pass.

## Concrete limits

- Quality pixel processing/export is bounded to 16 megapixels and 32 MiB inputs. PNG processing requires non-animated PNG with at most 8-bit samples; originals of other previously supported formats/dimensions remain readable but are not silently converted for hard-lock guarantees. WebP quality/cutout/export uses Chromium's decoder; hidden transparent RGB can be normalized by canvas. Exact hidden-RGB promises apply to the PNG path. No 16-bit/HDR/color-profile preservation claim for derived images.
- RGBA premultiplication prevents new interpolation fringes, but cannot reconstruct foreground colors already matted against black/white in a raw picture. Manual correction/another source can still be necessary. No automatic segmentation, semantic background classifier, face recognition or identity guarantee.
- Conservative border checks can reject legitimate silhouettes touching most canvas edges. Explicit raw export remains available; adding transparent padding creates a separately reviewable derivative. A nonempty alpha image plus human review is not a proof of perfect cutout.
- Resolution presets are local and editable per derivative, with immutable snapshots, not a separately implemented 02F reusable project-profile manager. No implicit 64×64 conversion, color quantizer, pixel-art synthesizer or automatic registration.
- Local bounded PNG work is synchronous and can occupy main for a large image. It is not a cancellable AI job; no automatic retries or background processing are started.
- Linux x64 tested. Windows/macOS packaging/signing and other Codex versions/accounts remain unvalidated. No motion/rigging/lip-sync, semantic style extraction or paid provider was added.

## Follow-up: cutout source image visibility

2026-11-16, `fix/cutout-image-preview`, based on merged PR #12 (`04ce37f`). A user reported seeing only the mask and being unable to proceed to an image export. The source preview was actually loaded/decoded, but cutout mode hid the source `<img>` and defaulted to a canvas containing only the Sage mask. The old flat-black fixture and explicit overlay-off step did not detect this usability failure.

Cutout mode now opens with the actual image and its current alpha weights visible. Switching the optional mask overlay on tints the retained source pixels instead of replacing them with a mask-only canvas; image details and actual alpha remain visible in both modes. Ordinary expression-mask behavior is retained. No import, export, project schema or immutable source bytes were changed.

The packaged quality smoke now includes a distinct colored source pixel. It asserts the original RGBA immediately on opening, confirms the tinted view still contains image detail, toggles back to exact source color, erases/corrects the mask, reads the saved candidate PNG and checks the final exported PNG for the same source color and genuine removed-background alpha. The corrective brush is explicitly 3 px so its intentional gray-alpha restoration does not reach the corner checked by the export assertion. Master approval, JSON export and restart are still exercised through actual UI/IPC/storage.

Actually rerun: `npm run typecheck`, `npm run lint`, `npm test` (**185 passed / 9 files**), `npm run build`, `npm run test:desktop` (manual + enhanced quality smoke), `npm run test:desktop:native` (native/mask + Creator smoke), `git diff --check` — all passed. Synthetic assets and the labelled native protocol fixture only; no live image generation. The user's staged `.vscode/settings.json` remains unchanged and excluded.
