# Identity multi-import and remembered folder

Date: 2026-11-17. Branch `fix/creator-multi-image-import`, based on main `c3368a5` (merged LF-00 PR #25). No open PR existed at the start. No worktree/main commit, private project access or live generation. `.vscode/settings.json` remains unchanged and untracked.

## Behavior

Character Creator's **Identitätsbilder hinzufügen …** supports native multi-selection and multiple dropped files, with a live `0–3 von 3 Bildern` count. Main and renderer enforce remaining capacity before import; excess selection is rejected as a whole. Native selection order/drop order is retained. Individual removal remains; **Referenz austauschen …** atomically replaces one active source, including at capacity, and archives its original bytes/history without changing historical generation references. Approval and Master Rebuild continue using the existing workflow.

The typed `identity:import` operation uses the existing trusted sender/frame gate, serialized IPC queue and generation project lock. Renderer submits bounded names/bytes, never source paths. Native paths come only from Electron. Each source uses existing PNG/JPEG/WebP inspection, 16 MiB/16 MP limits and actual main-process decoding. All files are validated and duplicate SHA-256 checked against the character and within the group before any asset write. Errors name their files; no silent truncation or partial acceptance. Exclusive content-addressed read-only asset writes are verified against collisions, with new copies removed on ordinary failure and a single atomic manifest save. Existing project schemas remain unchanged.

The batch path creates **no staging tokens**. Cancel/validation failures therefore leave no batch tokens or retained staging buffers. An unrelated pending legacy image import is rejected/preserved rather than overwritten. Legacy single-image staging/IPC stays supported. A process/OS crash during file writes may leave unreferenced immutable copies, but cannot create a partially committed reference group; no destructive automatic cleanup is added.

`ImageDialogService` is shared by the new identity selector and existing native image chooser (master/candidate/style callers). It supplies `defaultPath` from a bounded local preference under Electron **userData/image-dialog.json**. Selection persists its directory through atomic replacement with mode 0600; cancel keeps the previous bytes. Missing/corrupt preferences or vanished directories use the OS default. No directory preference enters renderer results, project manifests, packs, image exports or Git. Drop input has no renderer path access and does not alter the native folder preference. Platform dialog APIs do not offer a maximum-selection-count option, so capacity is checked immediately after confirmation, before reading/importing files.

## Actual local checks

- Relevant Vitest: `tests/identity-import.test.ts` + `tests/character-creation.test.ts`: **29 passed**.
- `npm run check:fast`: passed, **397 tests / 20 files**, typecheck, lint and diff checks. Later cancellation-message-only change received typecheck/targeted lint and affected Creator smoke again; full latest-head regression is required in CI.
- `npm run build`: passed (Linux x64). A fresh package was built again for the final cancellation UI correction; unrelated desktop suites were not repeated.
- `node scripts/desktop-smoke.cjs`: passed, including sandbox/preload inventory with the new restricted method, protocol/sender rejection, old import/review/export/reopen.
- `node scripts/style-analysis-smoke.cjs`: passed, existing style/identity import and analysis workflow.
- Expanded `node scripts/creator-smoke.cjs`: passed for native three-file PNG/JPEG/WebP selection, one plus two, multi-file drop, capacity/cancel/duplicate/corrupt whole-group rejection, immediate previews/count, disabled action at three, native multiSelections/defaultPath and remembered folder after the existing actual app close/relaunch/reopen. Existing native generation and Master Rebuild checks use the explicitly labelled deterministic protocol double; no real model call.
- Unit tests additionally cover failed manifest rollback, unchanged references and bytes, destination symlinks, decoder errors, oversized/path-bearing inputs, duplicate groups, archived replacement, no stale staging tokens, corrupt/missing settings and removed folders.

The first expanded smoke assertion mistakenly queried the success notice for an expected import error. The error was correctly shown in the alert; the assertion was corrected to inspect that alert, then the complete affected smoke passed. No application assertion or expected image value was relaxed.

## Hosted CI and limits

IPC/persistence paths make this HIGH risk under LF-00, requiring FULL. Actual latest-head CI run/result is recorded in the PR description after submission, separately from local results. No initial hosted success is assumed here. Only Linux is locally validated; native Windows/macOS dialog interaction and packaging remain untested. Native file selection is exercised by intercepting Electron's dialog result in the smoke, while production options, path reads, decoding, IPC, writes and previews actually run; OS Ctrl/Shift gestures themselves are not automated.

The independent Identity Comparison/Auto-Fit request is a separate follow-up PR, not part of this import patch.
