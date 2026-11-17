# Laceframe

An independent offline desktop studio for character portraits and expressions, built with Electron Forge, Vite, React and TypeScript. The Studio joins master creation and expression production in one retained character context; no account, API key or generation service is required.

## Run on Linux

Use Node.js **22.13+** and npm (validated with Node 26.13.0 / npm 12.2.1). A graphical Linux desktop and Electron's normal system libraries are required. Keep Chromium's sandbox enabled; the application does not disable it.

```sh
npm ci
npm run start
```

The lockfile pins dependencies. Fonts are bundled locally. Manual projects work offline; the optional native Codex provider uses the installed Codex CLI and its existing ChatGPT sign-in. Only an explicit generation click submits the master image and prompt. The development server binds locally for Vite hot reload.

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:desktop
npm run test:desktop:native
npm run make
```

`build` creates an unpacked native application in `out/`. `make` creates a ZIP for the current OS; on Linux/macOS its Forge maker requires the system `zip` command. This machine lacks `zip`, so ZIP creation currently fails with `spawn zip ENOENT`; the unpacked application builds and runs. Forge is configured for Linux, Windows and macOS; build on each target OS. Windows/macOS execution, packaging and signing have not yet been validated. `test:desktop` uses the packaged Linux executable and a running display; set `LACEFRAME_EXECUTABLE` for another executable path. Its temporary projects contain synthetic images only. Playwright supplies native-dialog selections during this test; filesystem, IPC, image decoding and the renderer are real. Playwright itself adds `--no-sandbox` to its instrumented Electron launch; `npm run start` was also launched separately with the normal sandbox enabled.

To verify development CSP, React Refresh and the preload sender check, start a fresh development instance with `npm run start -- -- --remote-debugging-port=9232`, then run `npm run test:dev` in another terminal. The debug port is used only when explicitly requested by this command.

## Portrait workflow

1. **Projekt erstellen …**: select an empty local directory **outside this public repository**. Alternatively, open an existing directory containing `laceframe.json`.
2. Under **Characters**, create and name a character, for example Ada Voss. Drop one PNG/WebP from the desktop or choose a file with the system dialog.
3. Inspect the preview and dimensions, then explicitly confirm **Freigegebenen Master sperren**. The original bytes are copied and hashed. Master V1 is immutable; reviewed improvements create a separate version and never overwrite it.
4. Under **Studio → Expression erstellen**, select an emotion family and variant. **Expressions** manages the templates and character-specific expression performance. The editable presets include `angry / shouting` (Anbrüllen). Add custom families/variants, or edit their names, identifiers, intensity, instructions and suggested vocal action.
5. Choose the actual vocal action independently and import a candidate **PNG**. Compare it with its exact master in **Studio** or **Library**, then approve or reject it. Different canvas sizes are visibly flagged, not silently resampled.
6. Close the application, relaunch and open the same directory. Characters, selected character, master, presets, candidates and review states are restored.

Previews show transparency on a checkerboard and provide native-pixel zoom. No private Ada Voss artwork is included in this repository. All verification images are generated in memory or temporary directories.

## Local storage and security

A schema-versioned `laceframe.json` contains UUID relationships, native dimensions, timestamps, approval state and SHA-256 provenance. Binary files are content-addressed:

```text
project/
  laceframe.json
  assets/originals/<sha256>.png    # or .webp; approved master bytes
  assets/candidates/<sha256>.png   # or .webp for Create results
```

Originals are written exclusively and marked read-only; imports never write to the source file. Repeated imports reuse identical bytes but retain distinct candidate IDs. Candidate review does not move or rewrite image data. Manifest saves use a synced temporary file and atomic rename. External manifest edits trigger a conflict instead of being overwritten. Opening a project validates its schema, references, hashes, dimensions and canonical asset paths before replacing the active workspace. Keep backups of the complete project directory.

The renderer has context isolation, sandboxing and no Node integration. The narrow preload exposes fifteen typed operations; main-process handlers validate input and the exact sender/frame, serialize writes, restrict image formats/sizes and reject traversal and symlinks. Previews use controlled image bytes. Packaged UI resources use a restricted `laceframe://app` protocol and CSP with network connections denied. Arbitrary file/protocol access, navigation, popups and permissions are blocked. There is no background server/database in the packaged application.

See [Task 01 validation and limitations](docs/TASK_01_VALIDATION.md), [MVP plan](docs/MVP_PLAN.md) and [character/expression rules](docs/CHARACTER_EXPRESSIONS.md).

## Studio workflow (UX-01 / UX-03)

The navigation is **Characters / Art Direction / Expressions / Studio / Library / Motion**. Characters manages identities and master versions. Art Direction manages shared profiles, separate rendering/light/color/framing rules, references, revisions, defaults and character assignments. Expressions manages global families/variants and per-character performance with an explicit effective-rule preview. **Expression bearbeiten** opens the current Studio combination; **Zurück zum Studio** retains its master, variant and working prompt. Studio reuses the existing **Master erstellen** and **Expression erstellen** operations under one character selector. Library opens actual masters, master candidates, expressions and quality variants, with comparison, review, cutout and PNG/JSON export. Motion is a later milestone after Style Intelligence.

Drafts remain in memory when changing workspace, mode or character within the open project. **Art Direction bearbeiten → Zurück zum Studio** returns to the same draft; profile revisions are visible in Studio. Generation polling, monotonic timer and sticky Cancel stay active outside Studio. Project changes warn about unsaved Studio/Expressions/style edits. UI drafts are not autosaved across application restarts; saved attempts/results retain their existing disk persistence.

The structured Prompt Builder has three modes: **Automatisch** follows current settings; **Ergänzen** appends creative instructions; **Expert Override** retains editable full text and blocks changed-context submission until the conflict is resolved. The full technical prompt is collapsed by default. Viewing a historical attempt only changes review selection; **Als neuen Entwurf übernehmen** is explicit. Saved prompts and trusted provider instructions remain unchanged.

Select **Studio → Expression erstellen**, choose the character, approved master, emotion family/variant and independent vocal action (in the compact expression summary). Project management is a separate disclosure. The central Before/After comparison registers master and candidate at the same native-pixel origin with shared zoom/pan; different dimensions stay visible. Drag the divider or use arrows, Shift+arrows, Home/End; Overlay adds adjustable opacity. The prompt editor and technical provenance are collapsible. The editable Character-Lock prompt includes the original dimensions and identity constraints; when you change options after editing, explicitly keep your text or adopt the new template.

**Prompt kopieren & ChatGPT öffnen** saves an immutable prompt revision, copies the actual prompt and opens the external browser. Attach the master image yourself; **Referenz im Ordner zeigen** locates its verified immutable file. Drop the actual PNG/WebP result onto the result preview or select it through the file dialog. Approve it directly as an Expression, reject it, or open the exact candidate in Library. Replacement creates another attempt and preserves the old image and revision. The history survives project close/reopen. No image is resized or generated by the manual provider.

Schema v2 stores attempts and prompt revisions with exact master, variant and result provenance. Opening v1 projects migrates only in memory; the first explicit save preserves the exact original manifest as `laceframe.v1.backup.json` before writing v2. Old app versions cannot open v2; use the backup with the complete asset directory if reverting.

**Native Codex image generation is implemented.** In Studio, select **Codex · ImageGen**, check availability and click **Mit Masterreferenz generieren**. Install the official Codex CLI separately and sign in with ChatGPT using `codex login` first. The executable must be available in Laceframe's PATH. No API key is required or accepted by this provider. The explicit click uses your Codex allowance and submits a temporary immutable copy of the approved master as an official `localImage` input with the full prompt and selected emotion/variant/action. Exactly one job runs; the project stays locked until completion or cancellation. The sticky action bar keeps cancellation and a main-process monotonic `HH:MM:SS` timer visible, with actual protocol stages. Start/end/duration/outcome metadata persist with each attempt; interrupted jobs never become successful automatically. Generate becomes available again after success, failure or cancellation when its prerequisites hold. Results are imported as candidates with exact master/prompt provenance, never approved automatically. There is no 64×64 conversion.

The native provider runs the local official App Server over stdio JSON-RPC. It checks managed ChatGPT authentication and the enabled image-generation feature before each image turn. It only accepts a confirmed `imageGeneration.savedPath` under that job's generated-image thread directory, validates bounded image bytes and decodes them through the existing project service. The renderer receives status and project assets, never Codex paths or credentials. A separate Sign-in-with-ChatGPT/Responses provider remains unavailable for image generation; it is a different access route.

A live controlled reference test changed only the pot color of a test image and preserved its 1254×1254 canvas; this establishes reference-edit capability, not a guarantee of portrait identity preservation. The manual browser/import workflow remains available. See [native integration and exact validation results](docs/NATIVE_CODEX_VALIDATION.md).

Run `npm run test:desktop:native` after building for the deterministic packaged native-provider UI smoke test. Its explicitly labelled protocol fixture exercises success, failure and cancellation without additional live generations; the application has no simulated-generation fallback.

Under **Art Direction**, **Art Direction · gemeinsamer Spielstil** manages project-wide visual rendering profiles with description, rendering, light/shading, color/contrast and composition rules. **Weiteren Stil anlegen** adds a profile. Import actual PNG/WebP style references through the chooser or drop zone (up to six per revision, 8 MiB and 16 megapixels each; 128 unique library assets per project). Thumbnails use the verified original bytes. Remove/reuse references or save rules to create a new immutable revision; the revision selector shows historical rules and references read-only. Removed references stay available to history and other profiles.

**Expression Identity** remains specific to character and variant. **Charakter Stilzuordnung** chooses the project default, a particular profile or **Eigener Masterstil** without style references. This lets distinct characters share rendering while a third character retains its own neutral portrait style. Outfit metadata is prepared separately; there is no outfit editor or automatic transfer of clothing/identity.

For native Codex, image 1 is always the selected identity master, followed by the chosen revision's style images in a fixed order. Prompt and provider instructions identify these roles and forbid transferring faces, hair, clothing, accessories or personality from style references. The installed CLI's official schema is checked before each job; unconfirmed multi-image support blocks style-image submission and explains the master-only alternative. It never silently drops configured style images, uses an API-key fallback or retries automatically. Schema support and transport checks do not prove identity fidelity or style quality; review each result.

New attempts preserve style revision, ordered reference IDs/SHA-256, personal direction, exact prompt, master hash and timing/outcome. Historical imports retain their original provenance after later profile edits. Old v1/v2 projects remain unchanged on open. The first necessary write backs up the exact original manifest: v1 backup as before; pre-02B v2 uses `laceframe.v2.pre-art-direction.backup.json`; PR8 v2 without the visual-library marker uses `laceframe.v2.pre-visual-style.backup.json`. Conflicting backups are never replaced. Migration archives the known current text profile only; earlier unrecorded profile documents are not invented, while old prompt snapshots remain readable.

See [02C implementation and validation](docs/CODEX_02C_VALIDATION.md) and the historical [PR #8 review](docs/PR_08_VALIDATION.md).

See [UX quality validation and comparison controls](docs/UX_QUALITY_VALIDATION.md) and [Task 02 implementation, official integration findings and validation](docs/TASK_02_VALIDATION.md). Motion playback/export remains Task 03.

### Expression masks and Hard Pixel Lock (02D)

In Studio’s Expression mode, choose **Hard Pixel Lock**, create/select a mask and explicitly save its revision. Paint marks allowed pixels; eraser protects pixels again. Gray weights blend; undo/redo, overlay, zoom and pan operate in original master coordinates. Generate or manually import a raw result for that saved attempt. Equal dimensions are required; after checking alignment, click **Registrierung bestätigen & Composite erstellen**. Compare raw/composite and manually approve the separate composite. Master, raw image and historical mask/prompt revisions remain immutable.

Hard Lock currently processes non-animated PNG up to 8 bits/channel and 16 megapixels. It copies every protected decoded RGBA8 channel exactly and never scales mismatched inputs. WebP/16-bit images remain importable but cannot be hard-composited. **Soft Lock is unavailable:** the checked Codex App Server input schema has no confirmed explicit inpainting-mask route. Masks are used locally, never advertised as an AI boundary. Library reuses the registered comparison; its optional visual normalization changes presentation only and cannot enable compositing.

See [02D implementation, actual tests and limitations](docs/CODEX_02D_VALIDATION.md).

### Character Creator / Photo-to-Master (02E)

Use **Characters → Neuen Charakter erstellen** or **Studio → Master erstellen** to create a draft character without a master. Import up to three identity photos/illustrations (PNG/JPEG/WebP), choose an existing Art Direction, describe an independent outfit and review the neutral portrait composition. Identity images appear separately from style-only references; the UI lists the actual ordered image inputs. Only **Neutralen Masterkandidaten generieren** sends these images to the native Codex provider and consumes Codex allowance.

Each completed job creates an unapproved master candidate with immutable prompt, references, style revision, outfit, composition and execution provenance. Reject and regenerate, or manually approve one candidate as locked Master V1. The selected style and outfit are retained; **Expressions mit diesem Master erstellen** opens the existing expression workflow. Actual output dimensions are preserved; requested dimensions and facial likeness are not guaranteed. Text-only identity creation is not offered.

Identity originals are immutable local project copies (16 MiB / 16 MP each). Unused copies can be removed; historically referenced images are archived out of the active selection, retaining their dependencies. External originals and Codex-managed files are not deleted. JPEG EXIF orientation is reflected in preview dimensions without rotating/re-encoding the source; embedded original metadata is retained. See [02E actual validation and limits](docs/CODEX_02E_VALIDATION.md).

## Character asset quality and transparent exports

Characters, both Studio modes and Library show decoded alpha evidence before review. Expand **Assetqualität** to use **Hintergrund freistellen**: erase background in a foreground-retention mask (white keeps, black removes, gray softens alpha), inspect the real alpha preview, save a separate candidate, add a quality note and explicitly approve. Existing black hair/clothes are never color-keyed. A corrected current master is approved as a new immutable Master V2; old masters, expressions and masks retain their original IDs and hashes. Saved cutout masks can be reopened/corrected from their unchanged source. The editor shows active-tool settings on the left, display-only Original/Ergebnis/Alpha and overlays above the image, and Undo/Redo/close/save below. Source loading and verified, actually painted preview readiness are separate states with explicit retry. See [cutout stability and workflow validation](docs/CUTOUT_STABILITY_VALIDATION.md).

Select a resolution profile to create a separate, aspect-preserving derivative: nearest neighbor for pixel art, alpha-aware bilinear for illustrations, transparent padding or explicitly confirmed centered crop. Compare selected historical style references, dominant colors, native resolution and detail at shared zoom; style/identity approval remains human. No resizing creates a consistent pixel-art style automatically.

**Transparentes PNG exportieren** requires an approved nonempty transparent asset. Opaque/suspicious images remain explicitly marked and can only use **Ausdrücklich Rohbild exportieren** (`_RAW`). The native chooser writes new human-named PNG + provenance JSON files outside the project and never replaces existing files. Quality processing supports PNG RGBA8/WebP up to 16 MP; source files remain untouched. See [actual validation and limits](docs/ASSET_QUALITY_VALIDATION.md), including the separate 02F dependency and versioned alpha-correct Pixel Lock rule.

See [UX-01 navigation and baseline](docs/UX_01_NAVIGATION.md) and [actual UX-01 validation and screenshots](docs/UX_01_VALIDATION.md).

### Live Relighting · 2D

Follow **Master → Hintergrund freistellen → Cutout-Kandidat prüfen und freigeben → Live Relighting**. **Assetqualität → Live Relighting öffnen** is enabled only for a verified, approved cutout or approved descendant with genuine alpha transparency. Raw masters, transparent imports alone, unreviewed/rejected cutouts and historical lighting without this provenance cannot start a new light revision. Main enforces the same rule for direct IPC and checks the source hash again on Apply. Historical assets remain readable/comparable/exportable under their existing rules. Direction, intensity, cool/warm temperature, ambient, shadows, contrast and highlights update a worker preview without saving files. Pixelart mode uses quantized illumination and nearest display. Add manual face/skin, hair/beard, clothing, accessory or custom regions with the existing mask editor; these labels do not imply automatic detection. Original/preview toggle, undo/redo/reset and discard are available.

Only **Als Lichtkandidat übernehmen** creates a separate immutable PNG candidate and saved recipe. Review it through the existing quality note/checkbox and explicit approval; eligible current-master improvements become V2+, and expression improvements retain their original master. **Lichtrevision bearbeiten** restores its original source, parameters and mask revisions. Historical improvements cannot replace a newer master. Production export retains its existing alpha/approval checks; lighting preserves alpha and cannot turn an opaque background into transparency.

This is encoded-RGB 2D tone/gradient correction, without depth or surface normals. The same versioned CPU algorithm computes worker preview and main output; WebGL presents those pixels with Canvas2D fallback. Max 4 MP, five manual regions and eight draft undo states; no automatic resizing, image generation, new model dependency, physical 3D claim, second light or palette-reconstruction feature. See [actual validation, exact-pixel contract, performance and limitations](docs/LIVE_RELIGHTING_VALIDATION.md).
