# Smart Background Removal and Protected Pixels — validation

2026-11-17. Branch `feat/smart-background-removal`, based on merged Style Intelligence PR #16 (`origin/main` `a92a654`). GitHub open-PR search returned no open PRs before implementation. Existing local repository only; no worktree or main commit. The user's pre-existing staged `.vscode/settings.json` is byte-identical and excluded. All tests use temporary synthetic projects and pixel geometry; no private portrait, Ada image, existing user project or game artwork was opened/modified/committed. No live image generation, AI segmentation, new model/runtime dependency, cloud service or paid API.

## Actual workflow

The existing **Assetqualität → Hintergrund freistellen** dialog is extended in place. It remains `MaskEditor`, with the existing viewport, native-coordinate brush, zoom/pan, focus handling and manual editing. The expression/lighting mask paths retain their original behavior. There is no second cutout application or export pipeline.

For images up to 4,194,304 pixels, choose **Pipette**, click a visible original pixel and see its actual native x/y and RGBA plus a color swatch. Further clicks add colors/seeds (up to 32); individual removal is available in the compact Seeds disclosure. All sampling uses verified original RGBA, including partial alpha, rather than the processed canvas. Transparent seed clicks and outside coordinates are rejected. **Automatischer Hintergrund** explicitly recomputes the current selection and permits additional seed clicks. Selection also updates immediately when seeds or thresholds change.

Connected selection is on by default. Global matching requires explicitly unchecking it and displays a warning to protect matching clothing/hair first. Farbtoleranz, Kantenweichheit, Schutzmaske anzeigen, Auswahl anzeigen and Original/Ergebnis/Alpha are directly accessible. Light, dark and checker backgrounds are display-only. The image remains at native resolution; CSS nearest/pixelated presentation is inherited from the existing canvas. The compact two-column desktop layout keeps the actual portrait beside controls, with sticky preview and one sticky bottom action row. Small-window controls can scroll without hiding the whole portrait or disabling Cancel.

**Schützen / Schutz radieren** and **Hintergrund erzwingen / Erzwungenen Hintergrund radieren** edit two separate binary masks. The existing Pinsel/Radierer edit manual retention (including gray weights). Protected pixels display green, forced background orange, and overlapping inputs purple. The live conflict count explains that protection wins. Toggling overlays does not change output. Protected pixels are retained even if automatic selection, forced background, manual retention, expansion or softness would otherwise remove them.

Undo/Redo restores seeds, tolerance, connectivity, expansion/softness and all three edit masks together. A brush stroke is one history entry. Reset clears the draft's selection/three masks and can itself be undone. Tool/view/zoom/pan/name controls are UI/metadata, not image-history entries. Closing warns about unsaved image/parameter changes. **Auswahl abbrechen** terminates the worker and invalidates stale results; saving remains disabled until **Auswahl neu berechnen** or a new edit produces the current result. Saving a stale/failed/cancelled result cannot bypass main verification.

Only **Freigestellten Kandidaten speichern** writes a separate derived PNG and mask records. Main recomputes the selection, compares exact retention bytes against the worker preview, enforces existing Hard Pixel Lock, then reuses existing content-addressed quality/mask storage. The original never becomes a writable target. The new candidate still needs human notes and explicit silhouette/style review. Existing review can create Master V2 or an approved expression, and existing PNG export reuses exact saved result bytes. No automatic asset approval.

## Deterministic algorithm

Contract: `shared/smart-cutout.ts`, algorithm **`lab76-seeded-rgba8-v1`**. Preview runs the same module as main verification.

1. Native sRGB bytes are linearized with the standard sRGB transfer function. D65 XYZ is converted to CIE L*a*b*, cached as three Float32 values per source pixel. Distance is squared Euclidean **Delta E 1976**, not CIEDE2000 or a percentage. Tolerance is 0–100 Lab units. There is no learned color/subject classifier.
2. A pixel is eligible if its original RGB is within tolerance of **any** original seed RGB. Protected samples are excluded from traversal. Fully transparent pixels can connect background regions but cannot be used as seeds; their alpha remains zero. Eligibility is calculated against fixed seed colors, never successively against already removed pixels or a drifting neighbor color.
3. Default connected selection uses four native neighbors and a bounded Uint32 queue. All seeds share the union of selected colors; each selected pixel enters the queue at most once. A barrier of protected pixels stops traversal. Disconnected eligible areas need another seed or explicit global matching. Preprocessing is O(pixels × seeds), flood fill O(pixels); no recursive fill or unbounded queue.
4. Optional expansion/shrink is a separable square max/min filter, radius −3…3, with clamped image borders. Softness is a separable box average, radius 0…8, truncated windows at borders and byte rounding after each axis. These affect automatic selection only; forced background remains an explicit hard correction.
5. Final retention is **255 if protected; otherwise 0 if forced; otherwise round(manualRetention × (255−automaticSelection)/255)**. Protection is applied after morphology/softness, including conflicts. Binary protected/forced masks reject gray values; manual retention supports 0–255.
6. The existing cutout function copies original RGB unchanged and computes `round(originalAlpha × retention/255)`. It never increases source alpha, removes black RGB globally or paints replacement colors/backgrounds. Source alpha=0 and its hidden RGB stay unchanged on the exact PNG path; source partial alpha remains bounded by its original value. Overlay tint/backgrounds are presentation only.

The worker is independent of GPU support. It caches original Lab once, processes one request at a time and coalesces edits to the latest draft on a 40 ms scheduling tick. Serial/draft checks prevent a stale response from enabling Save. New source reads are bounded and stale reads are discarded after closure. No intermediate preview images or project writes occur on sliders, brush strokes or worker results.

## Persistence and security

The existing `qualityAssets` cutout record retains its final `foreground-alpha` mask for compatibility. Optional `smartCutout` metadata adds:

- Algorithm/recipe revision, exact source asset ID/hash through the existing derivative fields, and previous cutout ID for correction history.
- Ordered native seeds with exact original RGBA, tolerance, connected/global mode, expansion and softness.
- Separate **manual-retention**, **protected-foreground**, **forced-background** mask types; each has canonical PNG path, SHA-256 and main-assigned revision. Matching immutable bytes can share a content-addressed file without conflating their roles.
- Canonical output RGBA SHA-256, with native PNG dimensions/format/hash in the existing derivative record.

Reopening a saved cutout loads the **original source plus the saved manual/protected/forced masks and settings**, not a repeatedly processed output. Correction appends a new recipe/candidate and increments changed-mask revisions; old records/bytes remain unchanged. Legacy manual cutouts open as a manual retention base with empty protection/force and no color seeds, so they remain editable. Existing master ancestry/stale-source approval checks remain active: a historical original recipe cannot silently replace a newer current master. A further cutout of the current master starts from that master's existing alpha; it cannot infer/recover removed alpha. Historical recipes remain reachable through their quality records in Library. This pass does not weaken those review gates or provide semantic alpha recovery.

A new optional `smartCutoutVersion: 1` marker is written on project save. Old projects open read-only; before their first write the existing migration mechanism saves exclusive byte-exact `laceframe.v2.pre-smart-cutout.backup.json` when no earlier migration takes precedence. New projects already have the marker. There is no repeated adoption-time backup attempt. Older strict-schema binaries may reject new fields; reverting requires the original manifest backup and complete asset directories.

On open, strict schemas validate algorithm/settings, source/character/previous-revision relationships, seed bounds, mask roles/paths/revisions, dimensions, byte/hash integrity, binary protection masks and output pixel hash. Explicit save verifies seed RGBA against original pixels, recomputes the preview weights and preserves existing hard-lock checks before writing mask/result files. Existing reviewed states, prompts, characters, styles, relighting recipes, IDs and image files are retained.

Preload adds only **`cutoutSource(assetId)`** and **`smartCutoutRecipe(qualityId)`**, both ID-validated and restricted to existing character assets/records. No renderer-supplied filesystem path, process API, token or generic IPC is exposed. Main keeps trusted sender/frame/origin checks, generation project lock, safe canonical paths, bounded reads and symlink/hash checks. Mask storage remains in existing `assets/cutout-masks`; no parallel store or background service. Exported optional provenance JSON includes the actual derivative/recipe records through the existing export mechanism.

## Executed checks on Linux

| Command | Actual result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, zero warnings |
| `npm test` | **238 passed, 13 files** (223 baseline + 15 new) |
| `npm run build` | Passed, packaged Linux x64 application and bundled smart-cutout worker |
| `npm run test:desktop` | Passed: all five manual, quality, relighting, style analysis and smart-cutout suites |
| `npm run test:desktop:native` | Passed: native provider/mask/composite and Creator/UX suites |
| `git diff --check` | Passed |

Unit/integration coverage includes flat black and varying dark backgrounds; known black coat/hair, enclosed glasses and tunnel pixels; disconnected areas and multiple colors/seeds; different Delta E thresholds; protected/forced precedence and conflicts; soft/expanded/shrunk selection; alpha, hidden RGB and source immutability; empty seeds/legacy manual retention; invalid seeds/masks/oversize inputs; native zoom/pan coordinate mapping; undo/redo/history bounds; cached-versus-fresh determinism; stale preview rejection; typed immutable masks/changed revisions; damaged/unsafe mask data; save/reopen/correction; manual Master V2 approval; transparent PNG payload and byte-exact legacy backup.

The new packaged smoke uses an actual **1254×1254** synthetic source with known dark-background variation, touching black coat, dark hair, enclosed black frame samples and partial alpha. It paints protection/force through real pointer events, samples seeds before/after real zoom and pan, changes tolerance/softness, checks conflict/undo/redo and original/alpha/result views, observes no manifest writes until Save, reads actual PNG/hash/provenance, closes/reopens, edits/restores the saved recipe, cancels/retries, saves another revision, manually approves Master V2 and verifies the final native-directory PNG export equals the saved bytes and the original file SHA-256 is unchanged. Source pixel coordinates and stored seed RGBA are checked against the fixture, not guessed from visual similarity.

The existing manual suite verifies the exact expanded preload allowlist and unsafe protocol/IPC rejection. Quality/export, Style Intelligence, relighting, expression masks/Hard Lock, creator and independent character/prompt workflows all remain in the complete suites. Native generation tests use the existing explicitly labelled protocol double through temporary test PATH; it is never a production fallback. No live image generation, image-tool use or model fidelity claim follows from these tests.

During development Typecheck caught typed-array buffer generic mismatches and uninitialized React refs; these were corrected without broad type weakening. The first new UI test attempted a source-pixel click while the target canvas was outside the dialog's visible scroll area, so protection was not painted. The test now scrolls the real viewport into view and asserts the expected protection tint before running selection. That failed assertion was not removed. Initial screenshots also exposed an overly tall top toolbar and overlapping action rows; controls now sit beside the sticky image and actions share one row. Final results refer to the corrected complete runs.

## Performance and explicit limits

- Automatic tools: **4,194,304 native pixels**; no implicit resize. Larger existing cutouts retain their previous manual editor (up to its existing 16MP bound) and show an honest automatic-tool limitation. PNG/WebP use existing decode rules; nonanimated ≤8-bit PNG for exact processing. No new JPEG/16-bit/HDR/ICC-aware pipeline. WebP decode may normalize hidden transparent RGB; exact hidden-RGB claims apply to PNG.
- Max 32 original color seeds; one cached worker and one pending latest draft. Image-history snapshots have a conservative 32 MiB previous/future budget (up to 32 entries, plus current buffers; at least one state). Closing/cancellation releases the worker; no saved running job or automatic restart/resume.
- At 4MP, canonical RGBA is 16 MiB, cached Lab 48 MiB, flood queue at most 16 MiB; eligibility/selection/weights, edge-filter scratch, immutable edit/history masks, IPC/canvas/decoder copies and JS overhead are additional bounded allocations. This is not a promise of a fixed process RSS.
- The actual packaged **2048×2048** worker test (full-image selection, a protected/forced conflict and 2px softness) measured **2294 ms end-to-end**, **575 ms selection phase after Lab preparation**, with **139 browser animation frames** during processing. A separate successful run measured 2055/565 ms and 124 frames. Both checked that the conflict retains alpha weight 255. These are host/content observations, not a frame-rate guarantee; up to 32 unmatched colors cost more than a single-color flood.
- Final Electron working sets were about **247 MiB Browser/main** (peak 358), **140 MiB GPU** (peak 155), **78 MiB Utility**, **272 MiB Tab** (peak 382). They include Electron, shared pages, existing previews/quality tools, history, Playwright, decoding and the 4MP benchmark, not solely incremental cutout buffers. Do not sum them as unique RAM. Raw observations remain in ignored `artifacts/smart-cutout-performance.json`.
- Main recomputation/PNG encoding on explicit Save is synchronous per image and can briefly occupy main. Preview/selection computation runs off the renderer. This pass does not promise a cancellable atomic save once import begins. Failed saves can leave unused immutable content-addressed mask files, as with the existing asset store; no destructive garbage collector.
- Color selection cannot distinguish touching same-colored clothing/hair from background without explicit protection/extra seeds/manual correction. Anti-aliased hair, baked matte colors, glass and complex boundaries still need visual review. Alpha-only feathering does not decontaminate dark/white RGB already baked into the source. No semantic segmentation, face detection, 3D geometry or perfect silhouette guarantee.
- Linux x64 tested; Windows/macOS packaging/input/performance remain unvalidated. No new AI, Motion, automatic portrait redesign or global darkness removal.

## Inspected screenshots

Synthetic pixel geometry only; no private portrait. Captured at actual BrowserWindow sizes with light/dark inspection backgrounds. Controls can scroll while the portrait and bottom actions remain accessible.

- [960×720](screenshots/smart-cutout/editor-960.png)
- [1440×900](screenshots/smart-cutout/editor-1440.png)
