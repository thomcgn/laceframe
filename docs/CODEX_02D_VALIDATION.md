# Codex 02D — Expression masks and Hard Pixel Lock

Date: 2026-11-16. Branch `feat/task-02d-expression-masking`, based on merged PR #9 (`90faa18`). Existing local repository, no worktree, no checkout/commit/update of local main. The pre-existing staged `.vscode/settings.json` is preserved and excluded from the commit. All projects/images used for validation are temporary synthetic fixtures; no user project or private portrait was opened or changed.

## Implemented workflow

Create offers **Ohne Maske / Soft Lock / Hard Pixel Lock**. Hard Lock uses a saved mask revision associated with the selected character's exact immutable master ID and SHA-256. Masks can be reused for other emotions of that character. Each attempt snapshots mask ID/hash/revision alongside the existing style, personal expression, master, immutable prompt, provider and execution metadata. Loading a historical attempt restores its mask selection; later edits append revisions rather than changing history.

The actual mask editor supports native-coordinate circular brush strokes with interpolation, adjustable diameter, grayscale weight, eraser, reset, undo/redo, translucent Sage overlay toggle, fit/zoom and pan. Pointer capture handles mouse/touch; wheel/trackpad pans, Ctrl+wheel zooms, Alt+drag pans, Ctrl+Z / Ctrl+Shift+Z restores history. Undo storage is bounded to 64 MiB of previous states (at least one) and at most 32 steps; a new stroke clears redo. The modal keeps keyboard focus inside, asks before discarding edits, and leaves save/close accessible at 960×720. A mask is saved only through an explicit save action.

Mask inputs are typed `Uint8Array` weights, not renderer paths or arbitrary image metadata. Main checks the master, dimensions, pixel limit and prior revision, encodes an opaque grayscale PNG and saves it under `assets/masks/<sha256>.png` with exclusive read-only writes. Revisions get independent IDs while unchanged bytes may share a content-addressed file. Preview/open validate hashes, canonical paths, non-symlink bounded files, dimensions, PNG integrity and opaque grayscale values. Historical revisions remain available; stale revisions cannot overwrite a newer series head. No mask deletion or garbage collector is introduced.

Native generation still requires the explicit Generate click, managed ChatGPT account, actual enabled ImageGen, existing reference checks and the single-job project lock. It produces a separate **raw candidate**. The mask is NOT sent as a disguised extra image/inpainting input. The prompt and trusted selection context describe local Hard Lock honestly; existing master/style references keep their roles. Timing, cancellation, safe result import and image resolution are retained.

For a saved masked attempt, Create compares master/raw/composite and can show the saved mask overlay. Different dimensions block compositing without scaling. With equal dimensions the user must explicitly confirm origin, crop and facial registration before **Registrierung bestätigen & Composite erstellen**. Main verifies source hashes again and produces a new candidate. This action is separate from AI generation and does not consume Codex allowance. The raw image and original master are retained unchanged. A hard-lock raw candidate cannot be approved, enforced both by UI and main commands; the composite requires its own manual approval/rejection. Pre-existing unmasked assets retain their existing review workflow.

Create, Inspect and the Expressions review panel use the same comparison component. Slider/overlay, synchronized zoom/pan and native union-canvas origin remain available. An explicit **Visuell normalisiert** option stretches only the displayed candidate to the master canvas, with a clear warning: it does not change source bytes, establish registration or enable a blocked composite. No second comparison algorithm was added.

## Exact pixel rule and format boundary

The added pinned, pure-JavaScript `pngjs@7.0.0` decoder/encoder is used only in main for pixel processing; no native binary/image service was added. Types are a development dependency. The compositing version is `1`, rule `rgba8-straight-round`:

- Weight **0**: copy all four original decoded master RGBA8 channels exactly, including RGB under transparent alpha.
- Weight **255**: copy all four decoded raw-candidate channels exactly.
- Weight **1–254**: independently calculate each straight/unpremultiplied channel as `round((master * (255 - weight) + raw * weight) / 255)`.

Mask, master and raw dimensions must match. Processing makes a real buffer copy before editing. Source file bytes and input pixel buffers remain unchanged. The output is a separate RGBA8 PNG at the original dimensions. Its manifest records raw ID/hash, mask ID/hash/revision, master/character, attempt/prompt/provider, version/rule, user-confirmed origin registration and independent review state.

**Current Hard Lock boundary:** PNG with at most 8-bit samples, at most 16 megapixels, non-animated. WebP and 16-bit PNG are preserved by the existing import workflow but cannot be hard-composited; they are never silently converted, quantized or resized. Unsupported masters are rejected before a native image turn. Unsupported raw results remain available for inspection and cause an honest composite error. PNG decompression is explicitly bounded before the decoder, including its Adam7/interlaced path. PNG display metadata/color profiles are not copied; the guarantee concerns decoded RGBA8 sample values, not identical compressed file bytes or color-managed display appearance. Gray-edge blending is the formula above, not a claim of linear-light color processing.

## Installed App Server / Soft Lock check

Actually executed, without image turns:

- `codex --version` → **codex-cli 0.169.0**.
- `env -u OPENAI_API_KEY -u CODEX_API_KEY codex app-server generate-json-schema --out /tmp/laceframe-02d-schemas` → succeeded.
- Inspected exported `v2/TurnStartParams.json`: `input` is an array of `UserInput`; `localImage` has `type`, `path` and optional `detail`. The exported document contains no `mask` property/term. SHA-256: `7306e8a95152f1071b0fb8bcc22da20a798ae34c1c57b6d26dfafc2c2b47ee9e`.
- Opened official [App Server documentation](https://learn.chatgpt.com/docs/app-server), covering its documented protocol and image input route.

This provides no confirmed explicit inpainting-mask input for the integration's supported App Server route. Soft Lock is therefore visibly unavailable, Generate/import submission is blocked in that mode, and `supportsEditingMasks` remains false. A normal `localImage` is not advertised as an inpainting mask. No API endpoint, key fallback, cookie access or live probe generation was used. Future documented mask support needs its own transport implementation and validation before enabling Soft Lock.

## Compatibility and security

Schema version 2 gains optional `maskingVersion: 1`, default-empty masks, optional attempt mask selection and optional composite provenance. The schema validates master/character/hash/dimensions, unique and consecutive mask revisions, strict canonical mask paths, exact attempt snapshots, raw/composite links and one raw result per attempt. Existing unmasked attempts, untimed records and approved expressions remain readable.

Opening an old project stays read-only. The first save of a pre-mask 02C project creates exclusive byte-exact `laceframe.v2.pre-masking.backup.json`; earlier v1/pre-art/pre-style backup paths retain precedence. Conflicting backups and symlinks are rejected. Reverting to an older strict-schema app requires the original backup plus complete original asset directories. No historical prompt, image, ID or approval is retroactively rewritten.

No new preload method or unrestricted filesystem interface was introduced. Save/composite commands use existing validated, trusted-frame IPC and project mutation serialization/active-generation lock. Renderer receives verified data previews and metadata, never Codex tokens or native source paths. The PNG processing dependency stays in main.

## Actual validation on Linux

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, zero warnings |
| `npm test` | **139 tests passed in 7 files** (118 baseline + 21 added) |
| `npm run build` | Passed, packaged Linux x64 Electron application |
| `npm run test:desktop` | Passed |
| `npm run test:desktop:native` | Passed, extended mask/composite/native/restart workflow |
| `git diff --check` | Passed |

New unit checks exercise actual stroke coordinates, eraser, undo/redo/reset, pixel-channel assertions after PNG encode/decode (including invisible protected RGB/alpha), gray blending, dimensions, format and decompression limits, immutable mask files and revisions, hash/missing/symlink/traversal rejection, wrong master and forged snapshots, raw/composite provenance and review, later mask edits, duplicate composite rejection, old project backup/reopen and incomplete/failed/cancelled native attempts. Two native-controller tests run real process/protocol handling with the explicit fixture: exact mask provenance in trusted text, **only the actual master as image reference**, successful raw import/composite, repeat generation and failure/cancel with no invented result.

The extended packaged native smoke exercises actual React controls, typed IPC, main project storage, actual child process/JSON-RPC client and deterministic fixture result import. It draws and erases using mouse, restores undo/redo/reset, draws by actual touch events, undoes by keyboard, zooms/pans and saves. It checks the 960×720 editor, blocks a mismatched generated image, explicitly confirms same-size registration, then asserts **all output channels** against master/raw/mask values read from actual saved PNGs. It switches raw/composite, blocks raw approval, approves the composite, uses the shared Inspect comparison and visual normalization, verifies Soft Lock gating, then closes/relaunches/reopens and verifies that the complete parsed saved manifest is unchanged. The saved mask editor restores after restart. Prior style-library, two-character identity/performance isolation, timing, cancellation, regeneration, auth and multi-reference gates remain exercised. The manual smoke separately retains existing manual Create, WebP import, reviews, source immutability, secure preload/IPC and reopen checks.

Screenshots `artifacts/mask-editor-960.png` and `artifacts/hard-pixel-composite.png` were visually inspected; synthetic images only, ignored and not committed. The native server `tests/support/fake-codex.mjs` remains an explicitly labelled deterministic test double injected through temporary PATH; production never uses it as a fallback. **No live image generation, Codex image allowance consumption or paid API request was made.**

During development, a new immutability assertion caught the shared-memory semantics of `Buffer.slice()` in the initial compositor; this was fixed to allocate an independent byte array. Typecheck caught the typed-array buffer generic at the IPC boundary; it now sends an owned array. Early smoke attempts exposed a duplicate test variable, selectors matching hidden/history controls, and an assertion expecting a second prompt-adoption question after a pristine template had already been adopted. Those fixture assertions were corrected. Final results refer to complete corrected runs.

## Remaining limits

- Hard Lock currently has the PNG/RGBA8/16-MP/non-animated boundary above. No WebP/16-bit conversion, image resampling, crop registration, masks generated by face recognition or automatic alignment.
- Equal dimensions do not prove matching facial coordinates. Registration is explicitly confirmed by the user; identity and edit quality still require manual review. Protected original pixels are a technical guarantee, not an identity classifier.
- No officially confirmed App Server inpainting-mask route; Soft Lock stays unavailable. No live masked image quality test was performed or claimed.
- Synchronous local bounded PNG processing can temporarily occupy main while creating a large composite. It is separate from the cancellable Codex job; it is not presented as another image generation or background retry.
- Linux x64 tested. Windows/macOS packaging/input/signing and other CLI/account versions remain unvalidated. No Motion, rigging, landmarks, gestures or destructive asset cleanup was added.
