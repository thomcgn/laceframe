# Live Relighting Studio — implementation and validation

2026-11-16. Branch `feat/live-relighting-studio`, based on merged UX-01 PR #14 (`c42dbe7`), after PR #12/#13. Existing repository only; no worktree/main checkout or main commit. The user's staged `.vscode/settings.json` is preserved byte-for-byte and excluded. All image/project tests use temporary synthetic fixtures; no private artwork or existing user project was opened. No live image generation, external image service, model dependency or Codex allowance usage.

## Working workflow

Open **Assetqualität → Live Relighting öffnen** from a master, master candidate, expression or quality derivative in Characters, either Studio mode, or Library. Adjust direction (0–360 degrees), intensity, cool/warm temperature, ambient light, shadow strength, contrast and highlights. Preview changes remain in memory. Original/preview toggle, native zoom, parameter/mask undo/redo, reset and explicit discard are functional. The action row remains visible at 960×720 and 1440×900.

**Als Lichtkandidat übernehmen** recomputes in main and requires the exact current preview pixel SHA-256 before writing a new candidate. Existing AssetQuality comparison, notes, human silhouette/style checkbox and approval/export gates are reused. A candidate is never automatically approved. An improvement of the current master produces Master V2+, a relit creator candidate can become its first Master V1, and an expression improvement retains its original master/variant/action/attempt linkage in a new expression. Originals, prior candidates, approved versions and historic prompts/masks remain unchanged.

**Lichtrevision bearbeiten** loads a stored recipe and its verified masks against the original input, including after project restart. Saving appends another record rather than overwriting the recipe. The existing stale-master gate remains: a historical recipe based on an obsolete master cannot replace the newer current master. To improve that current master, select it and open a new relighting operation. Historical recipes remain inspectable, reproducible and available as independent candidates.

## Rendering and alpha contract

`src/shared/relighting.ts` defines the strict settings/record contract and canonical `2d-rgba8-lut-v1` calculation. This is **encoded-sRGB 2D tone correction**, not inferred surface illumination. Direction controls a planar image-space gradient. There are 256 spatial light bands, byte lookup tables, bounded channel rounding/clipping and no resampling, blur, bloom, texture synthesis or automatic geometry/region detection. Geometry is explicitly `2d-gradient-no-normals`; optional future normal-map algorithms require their own version/contract, not a silent reinterpretation of v1.

A dedicated bundled worker computes the preview using the same module as main/export. One request runs at a time; changes are coalesced to the latest settings with a 40 ms scheduling tick. A stale result cannot enable Apply. The editor has one worker, at most five regional masks, at most eight draft undo states, and a **4,194,304-pixel / 4-MP bound** checked before processing. Large inputs are rejected without resizing; existing explicit resolution derivatives can be used separately.

WebGL presents these already-calculated canonical pixels with a nearest-filtered texture, disabled dithering and explicit straight-to-premultiplied fragment output. It does not independently approximate the tone algorithm. Context/texture/shader failure uses Canvas2D; a CPU-display switch exercises the same fallback. GPU resources and the worker are released on updates/close. The tested WebGL path does not prove that the driver used physical GPU hardware rather than a software GL implementation.

Pixelart mode quantizes illumination to 2–16 levels and uses nearest/pixelated display. Original pixel coordinates and source cluster boundaries are not spatially filtered or dithered. Tone bands can introduce intentional new shading boundaries; no automatic pixel-art reconstruction or palette/style fidelity guarantee is made. A palette restriction and second light source are not implemented. Illustrative mode has finer tonal transitions, still without spatial resampling.

Each output alpha sample is identical to its input, including partial alpha. Fully transparent pixels retain even hidden RGB on the exact PNG path. RGB correction operates pointwise on straight samples; GPU presentation explicitly premultiplies once, preventing interpolation of hidden black/white RGB into the visible foreground. Canvas/framebuffer readback can differ by a byte due to premultiplication/unpremultiplication; the smoke compares in premultiplied space with a **one-byte tolerance**. The canonical preview buffer and stored/exported PNG samples are checked by exact SHA-256. There is no separate GPU color transform with unexplained export drift.

PNG processing reuses the existing nonanimated, at-most-8-bit decoder; no 16-bit/HDR/profile preservation is claimed. WebP uses the existing Chromium decode path, which may normalize hidden transparent RGB before the canonical source is provided. This pass promises no alpha recovery or de-matting: an opaque input stays opaque and cannot pass the existing transparent-production approval/export check until separately cut out.

## Regions and Hard Pixel Lock

Face/skin, hair/beard, clothing, accessories and custom are manual region labels, not semantic recognition. The existing MaskEditor supplies paint/erase, soft weights, zoom/pan and mask undo/redo. White selects, black protects, gray blends. Regions replace the global tone within their weights; overlapping regions apply in their displayed list order. Each can carry its own light settings and name.

Expression edit masks can be explicitly copied as lighting weights when character/dimensions match. The original edit-permission record is unchanged; copying makes a separate `lighting-weight` mask and retains the original ID/SHA-256/revision as provenance. Same dimensions are not an alignment guarantee and the UI asks for visual alignment review. Edited copies drop the claim of unchanged expression-mask reuse. Main validates any retained reuse claim against actual verified original mask bytes.

Hard-Lock raw results cannot be relit to bypass compositing. For a composite or descendant, main rejects a relight that changes **any** protected master RGBA sample. A manual regional correction limited to allowed pixels remains possible. Existing main-process generation locking, source/character isolation, trusted sender/frame checks and immutable project boundaries remain in force.

## Persisted data and compatibility

A new `qualityAssets` operation, `relighting`, retains source ID/SHA-256, output PNG path/hash/dimensions, candidate/review status, algorithm and geometry version, full global/regional settings, canonical output pixel hash, recipe revision, region IDs/names/roles/revisions and each mask's path/hash/type. Region mask revisions are assigned by main from the prior ID/content, not trusted renderer counters. New native-coordinate PNGs use the existing exclusive read-only content-addressed `assets/quality/` store; masks use `assets/relight-masks/`. Export reuses existing exact PNG bytes and optional provenance JSON.

Opening older projects writes nothing and adds no required root field. Before the first relighting write on an already current project, an exclusive byte-exact `laceframe.v2.pre-relighting.backup.json` is saved; earlier migration backup precedence remains intact. The extended operation/metadata is validated conservatively, including canonical paths, source relationships, dimensions, mask hashes and output pixel provenance on reopen. Old strict-schema binaries may reject the new operation; reverting requires the pre-feature manifest and complete original asset directories. No automatic destructive garbage collection.

## Actually executed checks

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, zero warnings |
| `npm test` | **208 passed, 11 files** (195 baseline + 13 relighting tests) |
| `npm run build` | Passed, unpacked Linux x64 Electron application with bundled worker |
| `npm run test:desktop` | Passed: existing manual suite, existing cutout/quality suite and new real relighting suite |
| `npm run test:desktop:native` | Passed: native provider/mask/composite suite and Creator/UX suite |
| `git diff --check` | Passed |

Unit/integration coverage: neutral identity transform, source immutability/hidden RGB, all light parameters, quantized bands/native coordinates, partial region weights/overlap, malformed/out-of-range/oversize inputs, 4-MP allocation/time bound, zero-write reads/preview work, stale preview hash rejection, saved recipe/masks/backup/reopen, exact export pixels, manual Master V1/V2 and expression promotion, corrupt/unsafe/duplicate/reused masks, unchanged source bytes and hard-lock raw/protected-pixel rejection with successful allowed-region derivation.

The packaged relighting smoke uses the real worker, real WebGL and forced Canvas2D, checks premultiplied agreement, alpha and hidden PNG RGB, no intermediate manifest/quality files, quantized nearest display, undo/redo/reset, original toggle, painted region creation and restored region/mask after restart, actual human Master V2 approval, exact native-directory export and discard. The actual 4-MP worker is also exercised with rapid slider events, with no persistent intermediate images. The secure preload allowlist test was extended by the two specific ID-based read methods; there is no generic filesystem, process, token or arbitrary-path API.

Native automated generation tests retain their explicitly labelled `fake-codex.mjs` protocol fixture. No production generation or provider implementation changed.

## Observed performance and limits

- Direct canonical Node/V8 calculation for 2048×2048 was measured at **279 ms** in an isolated run. Actual packaged worker at this size measured **260–262 ms** in the successful desktop runs. A small 128×96 preview was a few milliseconds. These are observations on this Linux host, not a 60-FPS promise; more/fuller regions cost more work. The UI remains off the worker's computation thread and coalesces stale updates. Main recomputation/PNG encoding on explicit Apply is synchronous and can briefly occupy main.
- Electron's metrics during the final 4-MP fixture run reported working sets of roughly **305 MiB Browser/main, 165 MiB GPU, 86 MiB Utility and 292 MiB Tab/renderer**, with corresponding per-process peaks around 338/180/86/323 MiB. This includes Electron, Playwright instrumentation, existing preview/quality decoders, worker/canvas/driver buffers and shared pages; it is not a unique-memory sum or an isolated incremental relighting allocation. `artifacts/relighting-performance.json` records the measured run. The explicit pixel/mask/history/job bounds are the implemented memory controls; no universal driver-memory guarantee is claimed.
- Only Linux x64 and this available WebGL/Canvas implementation were tested. Windows/macOS, HDR/ICC-aware workflows, 16-bit/APNG, depth/normal-map rendering, palette-limited relighting and a second light remain outside this pass.
- Regional selection is manual; lighting does not prove identity/style approval. Eight draft undo states and the existing bounded MaskEditor history are in memory. Unapplied drafts are discarded on close/restart; committed recipe/assets restore from project storage.
- Initial validation caught a Buffer-versus-Uint8Array assertion, obsolete preload surface expectations, a wrong textarea/checkbox label, a collapsed replacement Master V2 panel, and a stale Playwright locator after relaunch. Assertions were corrected while preserving their pixel/review checks. Restoring a recipe from an approved master initially lacked an editor link; it now resolves that master's recorded quality source. Large-mask dirty tracking avoids serializing raw mask arrays to JSON on Escape. Final results above refer to corrected complete runs.

## Screenshots

Synthetic fixtures only; no character artwork committed. Both captures were visually inspected, with native zoom and the CPU fallback enabled after the real GPU comparison test.

- [960×720 editor](screenshots/relighting/editor-960.png)
- [1440×900 editor](screenshots/relighting/editor-1440.png)
