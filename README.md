# Laceframe

An independent offline desktop studio for character portraits and expressions, built with Electron Forge, Vite, React and TypeScript. Task 01 implements a real local workflow; no account, API key or generation service is required.

## Run on Linux

Use Node.js **22.13+** and npm (validated with Node 26.13.0 / npm 12.2.1). A graphical Linux desktop and Electron's normal system libraries are required. Keep Chromium's sandbox enabled; the application does not disable it.

```sh
npm ci
npm run start
```

The lockfile pins dependencies. Fonts are bundled locally; the installed application makes no network requests. The development server binds locally for Vite hot reload.

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:desktop
npm run make
```

`build` creates an unpacked native application in `out/`. `make` creates a ZIP for the current OS; on Linux/macOS its Forge maker requires the system `zip` command. This machine lacks `zip`, so ZIP creation currently fails with `spawn zip ENOENT`; the unpacked application builds and runs. Forge is configured for Linux, Windows and macOS; build on each target OS. Windows/macOS execution, packaging and signing have not yet been validated. `test:desktop` uses the packaged Linux executable and a running display; set `LACEFRAME_EXECUTABLE` for another executable path. Its temporary projects contain synthetic images only. Playwright supplies native-dialog selections during this test; filesystem, IPC, image decoding and the renderer are real. Playwright itself adds `--no-sandbox` to its instrumented Electron launch; `npm run start` was also launched separately with the normal sandbox enabled.

To verify development CSP, React Refresh and the preload sender check, first-load rendering and renderer-initiated reloads, start a fresh development instance with `npm run start -- -- --remote-debugging-port=9232`, then run `npm run test:dev` in another terminal. The debug port is used only when explicitly requested by this command.

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
  assets/candidates/<sha256>.png   # imported candidate bytes
```

Originals are written exclusively and marked read-only; imports never write to the source file. Repeated imports reuse identical bytes but retain distinct candidate IDs. Candidate review does not move or rewrite image data. Manifest saves use a synced temporary file and atomic rename. External manifest edits trigger a conflict instead of being overwritten. Opening a project validates its schema, references, hashes, dimensions and canonical asset paths before replacing the active workspace. Keep backups of the complete project directory.

The renderer has context isolation, sandboxing and no Node integration. The narrow preload exposes seven typed operations; main-process handlers validate input and the exact sender/frame, serialize writes, restrict image formats/sizes and reject traversal and symlinks. Previews use controlled image bytes. Packaged UI resources use a restricted `laceframe://app` protocol and CSP with network connections denied. Arbitrary file/protocol access, external navigation, popups and permissions are blocked. During development, only navigation to the exact local Vite entry URL is allowed, so its startup reload can complete. There is no background server/database in the packaged application.

See [Task 01 validation and limitations](docs/TASK_01_VALIDATION.md), [MVP plan](docs/MVP_PLAN.md) and [character/expression rules](docs/CHARACTER_EXPRESSIONS.md).

## Next: Task 02

Motion is explicitly marked as coming in Task 02. The next slice is manually imported blink/mouth frames, fixed-canvas validation, a timeline with per-frame duration, play/pause and ordered PNG + JSON export with provenance. No automatic animation synthesis or image-generation integration is implemented. ChatGPT Plus or browser sessions do not grant image API access.
