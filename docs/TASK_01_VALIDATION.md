# Task 01 validation

## Implemented

- Electron Forge 8 / Vite / React / strict TypeScript, reproducible npm lockfile, local Inter and JetBrains Mono fonts, native Linux packaging and ZIP maker configuration for all three desktop platforms.
- Context-isolated, sandboxed preload with explicit typed operations; input and sender validation in main; denied navigation, popups, permissions, arbitrary file exposure and packaged network access.
- Local project create/open using system directory dialogs, validated schema version 1, content-addressed assets, atomic manifest replacement, conflict detection and integrity checks.
- Multiple named Portrait Artistic characters with persisted active selection; confirmed, immutable Master V1; actual PNG/WebP decoding, SHA-256 and unchanged original bytes/dimensions.
- Desktop drag/drop or file dialog, cancellable import confirmation, checkerboard and native-pixel zoom.
- Editable family/variant data with the four starter families, all documented starter prompts and `angry.shouting`; independent emotion, intensity and vocal action.
- PNG candidate imports tied to exact master ID/hash, side-by-side inspection, visible size mismatch, explicit terminal approve/reject states, persistent library and reopen.
- Keyboard labels, focus indication, modal focus confinement and textual states rather than color alone.

## Checks

Commands and final results are recorded in the PR. The test suite covers schema version/shape/references, unsafe paths and symlinks, source immutability, master replacement prevention, cancellation and expired staging, content deduplication, hash integrity, persistence/reload, external-write conflicts, character selection, editable variants, master provenance and candidate review transitions.

`npm run test:desktop` drives the **packaged Linux application**, including create, real dropped PNG bytes, locked master, preset editing, candidate import, approve/reject, custom family/variant creation, a second WebP master, active-character selection, close/relaunch/open and unchanged stored state. It also checks preload surface, renderer Node isolation, sandbox preference, restricted resource routes and IPC rejection from another window. Synthetic PNG pixels are created with Electron and WebP pixels with Chromium's canvas; no character portraits are bundled. Only native-dialog selections are substituted by the test harness. OS-level pointer drag mechanics and the system file-picker UI still require manual acceptance testing. Playwright adds `--no-sandbox` to its instrumented launch; normal dev launch was separately checked with sandboxing enabled.

`npm run test:dev` separately verifies the normal development launch with sandboxing enabled, a visible React UI before any test reload, renderer-initiated same-page navigation, functional preload sender validation and no renderer exceptions. The navigation guard permits only the exact loopback Vite entry URL during development; this avoids aborting Vite’s startup reload and leaving a blank window. Packaged navigation and all other destinations remain blocked. Vite's React Refresh preamble receives a fresh development CSP nonce; the packaged policy does not allow inline scripts.

## Explicitly deferred / limitations

- Motion, masks/compositing, overlays/diffs, exports/atlases, additional master versions, archiving/reordering/duplication controls and generation providers are follow-up work. Task 01's Motion view states this clearly and has no fake playback controls.
- No AI output, mock login, fabricated provider, resampling, face inference or automated visual approval.
- `npm run make` fails on the validation host because the system `zip` executable is absent (`spawn zip ENOENT`). Install that standard packaging prerequisite to produce a ZIP. `npm run build` and the unpacked Linux executable pass independently.
- Windows/macOS paths and Forge targets are portable by design but have not been executed on those operating systems. Installers, signing and distribution updates are not delivered here.
- User-supplied Ada Voss portraits are not available for acceptance testing. The full automated workflow uses synthetic images; manual character-identity approval remains the user's responsibility.
- Read-only permissions and integrity hashes detect accidental changes; they do not make a directory tamper-proof against its OS owner. Do not edit a project concurrently in another program. Same-process writes are serialized and external manifest changes are detected; a hostile process racing filesystem operations is outside this offline application's trust boundary.
- An interrupted import/save can leave unreferenced content-addressed bytes; existing referenced images and the previous manifest remain intact. Automatic orphan cleanup/recovery UI is deferred. Back up the complete directory.
- Imports are limited to 32 MiB, 16,384 pixels per edge and 64 megapixels. The JSON manifest is limited to 4 MiB. Projects with missing/altered images fail open with an error rather than silently changing provenance.
- Development-tool dependency audit currently reports seven moderate findings in the `typescript-eslint` → `minimatch` chain. Runtime dependencies are audited separately. No forced major transitive override is introduced without upstream compatibility verification.

## Proposed Task 02

Use approved PNG assets and explicitly imported blink/mouth frames to build fixed-registration clips. Add per-frame durations, play/pause and loop preview, reject mismatched canvases/anchors, and export exact ordered PNG bytes plus a versioned JSON manifest with source SHA-256 and timing. Keep emotion, vocal action and motion separate.
