# UX-01 — Workflow, navigation and Prompt Builder validation

Date: 2026-11-16. Branch `feat/ux-01-studio-workflow`, existing repository, no worktrees. PR #12 and the cutout fix #13 are merged; this branch is based on `origin/main` at `02ba87b`. No main checkout/commit, user project, private portrait, dependency, main-process provider, preload contract or project schema was changed. The pre-existing staged `.vscode/settings.json` is excluded and retained byte-for-byte.

## Implemented workflow

[Navigation/baseline analysis](UX_01_NAVIGATION.md) was written before implementation. The five real workspaces are Characters, Art Direction, Studio, Library and Motion. StyleLibrary is independently accessible, with separately visible lighting/color/framing rules, actual reference thumbnails, immutable revisions, project default and per-character assignment. Motion explicitly remains a later milestone after Style Intelligence; no analyzer/outfit-generator placeholder was introduced.

Studio uses the existing Creator and Create operations behind one character context and separate Master/Expression modes. Visited character/mode editors stay mounted in the open project, preserving outfit, composition, master/version, emotion, provider, creative text, expert text, review and comparison state. The style editor and Library also remain mounted across workspace navigation. Explicit handoffs carry character/master/candidate IDs; Art Direction receives the actual style ID. Library resolves a quality descendant's master through its saved ancestry rather than the character's current master. Historical expression comparison also uses the attempt's actual master.

Automatic and Supplement modes deterministically follow current structured settings, including after saving an attempt. Expert Override retains editable text and exposes context/revision conflicts. Full technical text is initially collapsed. Expression history inspection changes the reviewed attempt only; adoption into the working draft is a separate explicit action. Historical prompt/reference records are never recomposed. Provider instructions, transparency rules and reference roles remain enforced by the unchanged main-process implementation.

Generate/import prerequisites appear beside the sticky action; correctable fields have focus/scroll links that open containing disclosures. The global action slot stays outside the locked project fieldset and retains status, timer and Cancel during workspace navigation. Creator availability checks on returning to a finished job no longer replace its terminal execution status. Existing main-process monotonic timing, single-job lock, auth/capability gating, safe result import and cancellation are reused.

Library selects masters, creator candidates, expressions and quality records by actual ID, with type/status filters, registered comparison, approval/rejection, historical prompt inspection, same-master Expression handoff, and existing AssetQuality/cutout/export. A specifically selected quality record opens that exact version, including when it has later descendants. Raw masked expressions remain unapprovable; local compositing is linked back to Studio. Existing family/variant editing and manual import remain in a separate Library disclosure.

## Actually run on Linux

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, zero warnings |
| `npm test` | Passed: **195 tests, 10 files** (185 baseline + 10 new) |
| `npm run build` | Passed, unpacked Linux x64 application |
| `npm run test:desktop` | Passed: manual workflow and quality/cutout/export suites |
| `npm run test:desktop:native` | Passed: expanded native-provider and Creator suites |
| `npm run start -- -- --remote-debugging-port=9232 --user-data-dir=<temporary>` followed by `npm run test:dev` | Passed, first render, exact-URL reload and typed preload with normal sandbox; instance closed afterwards |
| `git diff --check` | Passed |

Packaged native tests explicitly inject `tests/support/fake-codex.mjs` through a temporary PATH. They exercise the actual IPC, child-process/protocol client, provenance, import and UI with deterministic synthetic images. This is a labelled test double, never a production fallback. **No live generation, image-tool request, API-key request or Codex allowance consumption occurred.** Alpha, cutout, local compositing, image decoding and file/export checks run the real production code on temporary synthetic projects. No private existing project was opened.

## UX acceptance coverage

| Requested journey | Automated evidence |
| --- | --- |
| Open/create project → style → figure → master → review | Expanded `creator-smoke.cjs`: independent Art Direction creation/reference import, identity JPEG/PNG/WebP, explicit fixture generation, candidate/Library handoff and manual Master V1 approval; close/relaunch/reopen |
| Change figure style/revision; old attempt unchanged | `native-smoke.cjs`: revised profiles and shared/own-style choice, exact old attempts preserved; independent second character's prompt/master; Unit tests for provenance and automatic/expert revisions |
| Creator → Studio → Library → same figure | Creator's workspace/mode round trips retain exact outfit and expert text; candidate ID opens in Library and returns to the same master operation |
| Approve master → Expression → review → export | Creator uses approved master ID for native expression, manual approval, Library raw PNG + provenance JSON export with exact hash, same-master return; quality suite separately proves actual transparent PNG export |
| Navigate while generating and cancel | Creator traverses Characters, Art Direction and Library during a hanging fixture job, asserting visible/enabled sticky Cancel; cancellation persists and returns usable controls. Native expression cancellation also occurs from Library |
| Incomplete draft blocked with reason | Missing identity/outfit and missing approved master are asserted near the action; outfit correction link focuses the actual input; auth/multi-reference/mask gates remain exercised |
| Automatic → Supplement → Expert → style revision conflict | Creator asserts automatic prompt update without confirmation, appended creative instruction, retained expert override, disabled Generate on conflict, explicit new-template adoption and automatic removal of creative addition |
| Inspect historical prompt without overwriting current draft | Native suite saves current prompt/master, inspects oldest attempt and exact historical text, and asserts current prompt/master plus persisted attempts unchanged |
| Existing versions, masks and quality records | Quality suite opens Master V1/V2 and an exact quality record in Library; native suite edits/reopens saved mask, checks mismatch gate, exact RGBA composite, raw/composite review and project restart |
| 960×720 / 1440×900 | Real BrowserWindow sizes and horizontal-overflow assertions in Creator, native comparison, Art Direction and Library; sticky Cancel viewport checks and screenshots |

New unit tests cover automatic/supplement updates after saved revisions, expert retention/conflict resolution, preventing automatic reuse of expert text, empty prerequisites, unchanged-state retention, all four Library asset categories, exact historical-master ancestry, cyclic/missing ancestry and character isolation. All existing tests remain in the suite; renderer selectors were adapted for intentionally hidden retained editors, new routes and explicit mode selection.

During development the expanded checks exposed the terminal-status overwrite and exact-quality-selection issues described above; both were corrected. Initial smoke failures also caught stale navigation/labels, selectors matching nested disclosures or duplicate prerequisite explanations, an obsolete confirmation listener, and missing waits for asynchronous character/project selection or a new generation's running state. These assertions were corrected without removing their underlying review/provenance/security checks. Results above refer to final corrected runs. The known VA-API warning also appeared in the successful normal-sandbox dev run without renderer exceptions.

## Screenshots

All images contain synthetic flat-color fixtures. Before images were copied from the baseline's existing smoke artifacts before editing. After images come from the revised packaged smoke runs; the named size is the window size, with full-page capture for scrollable content.

- [Before: Create, 960](screenshots/ux01/before-create-960.png)
- [Before: Creator, 960](screenshots/ux01/before-creator-960.png)
- [After: Studio Expression, 960](screenshots/ux01/after-studio-960.png)
- [After: Studio Expression, 1440](screenshots/ux01/after-studio-1440.png)
- [After: Studio Master, 960](screenshots/ux01/after-master-960.png)
- [After: Studio Master, 1440](screenshots/ux01/after-master-1440.png)
- [After: Art Direction, 960](screenshots/ux01/after-art-direction-960.png)
- [After: Art Direction, 1440](screenshots/ux01/after-art-direction-1440.png)
- [After: Library, 1440](screenshots/ux01/after-library-1440.png)

## Limits

- Unsaved UI drafts survive navigation/character/mode switches within the open project, not application restart. Project changes warn before discarding them. Saved attempts, results, sources, profiles, masks, versions and reviews retain their existing disk persistence; no navigation-only migration was added.
- In-memory editor caching grows with visited characters until switching projects. No persistent UI database or new autosave format is introduced.
- Synthetic protocol/UI tests do not establish new live model fidelity or Windows/macOS behavior. This pass validates Linux only. Playwright instruments packaged Electron with its own sandbox launch flags; the separate dev run used the normal sandbox.
- Alpha warnings and explicit raw export remain intentional; an opaque fixture is not represented as production-ready transparent artwork. Native rendering resolution remains unchanged. A comparison is not an identity approval.
- Motion, Style Intelligence, a separate outfit generator and a complete resolution-profile library remain outside this task.
