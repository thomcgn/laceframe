# Laceframe

An independent offline desktop studio for character portraits and expressions, built with Electron Forge, Vite, React and TypeScript. Task 02 adds an image-first Create workspace to the existing local workflow; no account, API key or generation service is required.

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
npm run make
```

`build` creates an unpacked native application in `out/`. `make` creates a ZIP for the current OS; on Linux/macOS its Forge maker requires the system `zip` command. This machine lacks `zip`, so ZIP creation currently fails with `spawn zip ENOENT`; the unpacked application builds and runs. Forge is configured for Linux, Windows and macOS; build on each target OS. Windows/macOS execution, packaging and signing have not yet been validated. `test:desktop` uses the packaged Linux executable and a running display; set `LACEFRAME_EXECUTABLE` for another executable path. Its temporary projects contain synthetic images only. Playwright supplies native-dialog selections during this test; filesystem, IPC, image decoding and the renderer are real. Playwright itself adds `--no-sandbox` to its instrumented Electron launch; `npm run start` was also launched separately with the normal sandbox enabled.

To verify development CSP, React Refresh and the preload sender check, start a fresh development instance with `npm run start -- -- --remote-debugging-port=9232`, then run `npm run test:dev` in another terminal. The debug port is used only when explicitly requested by this command.

## Portrait workflow

1. **Projekt erstellen …**: select an empty local directory **outside this public repository**. Alternatively, open an existing directory containing `laceframe.json`.
2. Under **Characters**, create and name a character, for example Ada Voss. Drop one PNG/WebP from the desktop or choose a file with the system dialog.
3. Inspect the preview and dimensions, then explicitly confirm **Freigegebenen Master sperren**. The original bytes are copied and hashed. Master V1 is locked and cannot be replaced through the application.
4. Under **Expressions**, select an emotion family and variant. The editable presets include `angry / shouting` (Anbrüllen). Add custom families/variants, or edit their names, identifiers, intensity, instructions and suggested vocal action.
5. Choose the actual vocal action independently and import a candidate **PNG**. Compare it with its exact master under **Expressions** or **Inspect**, then approve or reject it. Different canvas sizes are visibly flagged, not silently resampled.
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

## Create workspace

Select **Create**, choose the character, approved master, emotion family/variant and independent vocal action (in the collapsible Inspector). Project management is a separate disclosure. The central Before/After comparison registers master and candidate at the same native-pixel origin with shared zoom/pan; different dimensions stay visible. Drag the divider or use arrows, Shift+arrows, Home/End; Overlay adds adjustable opacity. The prompt editor and technical provenance are collapsible. The editable Character-Lock prompt includes the original dimensions and identity constraints; when you change options after editing, explicitly keep your text or adopt the new template.

**Prompt kopieren & ChatGPT öffnen** saves an immutable prompt revision, copies the actual prompt and opens the external browser. Attach the master image yourself; **Referenz im Ordner zeigen** locates its verified immutable file. Drop the actual PNG/WebP result onto the result preview or select it through the file dialog. Approve it directly as an Expression, reject it, or send it to Inspect. Replacement creates another attempt and preserves the old image and revision. The history survives project close/reopen. No image is resized or generated by the manual provider.

Schema v2 stores attempts and prompt revisions with exact master, variant and result provenance. Opening v1 projects migrates only in memory; the first explicit save preserves the exact original manifest as `laceframe.v1.backup.json` before writing v2. Old app versions cannot open v2; use the backup with the complete asset directory if reverting.

**Native Codex image generation is implemented.** In Create, select **Codex · native Bildbearbeitung**, check availability and click **Mit Masterreferenz generieren**. Install the official Codex CLI separately and sign in with ChatGPT using `codex login` first. The executable must be available in Laceframe's PATH. No API key is required or accepted by this provider. The explicit click uses your Codex allowance and submits a temporary immutable copy of the approved master as an official `localImage` input with the full prompt and selected emotion/variant/action. Exactly one job runs; the project stays locked until completion or cancellation. The sticky action bar keeps cancellation and a main-process monotonic `HH:MM:SS` timer visible, with actual protocol stages. Start/end/duration/outcome metadata persist with each attempt; interrupted jobs never become successful automatically. Generate becomes available again after success, failure or cancellation when its prerequisites hold. Results are imported as candidates with exact master/prompt provenance, never approved automatically. There is no 64×64 conversion.

The native provider runs the local official App Server over stdio JSON-RPC. It checks managed ChatGPT authentication and the enabled image-generation feature before each image turn. It only accepts a confirmed `imageGeneration.savedPath` under that job's generated-image thread directory, validates bounded image bytes and decodes them through the existing project service. The renderer receives status and project assets, never Codex paths or credentials. A separate Sign-in-with-ChatGPT/Responses provider remains unavailable for image generation; it is a different access route.

A live controlled reference test changed only the pot color of a test image and preserved its 1254×1254 canvas; this establishes reference-edit capability, not a guarantee of portrait identity preservation. The manual browser/import workflow remains available. See [native integration and exact validation results](docs/NATIVE_CODEX_VALIDATION.md).

Run `npm run test:desktop:native` after building for the deterministic packaged native-provider UI smoke test. Its explicitly labelled protocol fixture exercises success, failure and cancellation without additional live generations; the application has no simulated-generation fallback.

See [UX quality validation and comparison controls](docs/UX_QUALITY_VALIDATION.md) and [Task 02 implementation, official integration findings and validation](docs/TASK_02_VALIDATION.md). Motion playback/export remains Task 03.
