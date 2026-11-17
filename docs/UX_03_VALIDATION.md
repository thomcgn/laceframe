# UX-03 — Expression Designer & Studio workflow

Date: 2026-11-17. Branch `feat/ux-03-expression-designer`, stacked on `feat/ux-02-precision-editor` (`a1083b7`). PR #19 remains open; this PR must follow it. No worktree, main checkout/commit or migration. The pre-existing staged `.vscode/settings.json` is excluded and preserved (cached diff SHA-256 `c196c824486a9883006b33270441d5ef08065918f4578b0a313362222b8251bb`). Tests use disposable synthetic projects, never private portraits or user projects.

## Navigation and ownership

| Before | After |
| --- | --- |
| Characters → Art Direction → Studio → Library → Motion | Characters → Art Direction → **Expressions** → Studio → Library → Motion |
| Family/variant forms hidden in Library's “Emotionsvorlagen & manueller Import” | Dedicated Expression Designer with family/variant selection, creation, names/slugs, intensity, independent vocal-action defaults and global generation template |
| Global template buried inside the technical Studio Inspector | Global template edited directly beside the variant in Expressions |
| Personal performance edited in a separate Studio disclosure | Character × variant editor alongside global rules; explicit effective-direction preview |
| Legacy manual import mixed with definitions in Library | New manual imports use Studio's existing chooser/drop, immutable attempt/prompt and candidate review pipeline; Library contains assets |

Studio retains its master/family/variant/provider selectors and a compact effective expression summary. Vocal action/intensity are directly accessible; “Expression bearbeiten” opens the exact character/family/variant. Return leaves the retained Studio draft authoritative, including its master, creative instructions, expert text and selected variant. “Im Studio verwenden” explicitly selects the Designer's saved combination and uses variant defaults. Unrelated characters' Studio drafts remain mounted and independent. Family switching now applies the selected variant's action/intensity defaults consistently with direct variant selection.

Expressions uses the existing `addFamily`, `editFamily`, `addVariant`, `editVariant` and `setExpressionPerformance` commands. Scoped family/variant/personal draft maps survive workspace/selection changes within an open project. Save success clears the corresponding local edit; failure keeps the draft and exposes the existing error. Project-switch guards include Expressions drafts. Successful project open resets the Designer session, including when reopening the same project; cancelled dialogs retain it. Unsaved UI drafts are not crash/restart persistence.

The existing personal-performance contract is preserved: a nonempty personal direction replaces the shared expression *direction* for that character/variant. Family/name, action, intensity, Character Lock and style remain independent. Empty personal direction restores inheritance. This UI explicitly labels this behavior; it does not silently combine contradictory templates or rewrite another character's definition. The effective preview indicates unsaved rules and disables using that combination until saved.

Automatic / Supplement / Expert Override remain in the existing Prompt Builder. Full technical prompts stay behind an explicit disclosure (or explicit Expert Override). Style/base changes still refresh automatic/supplement prompts and require an explicit resolution for an edited expert override. Historical prompts remain read-only; inspecting history does not adopt it into the working draft. No changes to domain schema, storage, provider, IPC/preload, image processing or immutable image provenance.

## Validation

| Command | Actual Linux result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, zero warnings |
| `npm test` | **255 passed, 15 files** (252 baseline + 3 added) |
| `npm run build` | Passed, packaged Linux x64 app |
| `npm run test:desktop` | Passed, all six suites |
| `npm run test:desktop:native` | Passed, provider + creator suites |
| `git diff --check` | Passed |

The first dedicated UI run exposed a Designer initialized before character creation without a fallback to the active character, plus ambiguous implicit textarea/select labels. Both were corrected, including explicit accessible labels. Native navigation initially clicked while the previous character's view was changing; the fixture now waits for the actual target-character summary and resets scroll before clicking. A final guard also blocks using an unsaved family definition, alongside unsaved variant/performance edits. Final results refer to corrected tests, not initial failures.

Screenshots are actual full-page captures at **960×720** and **1440×900** viewports. They were visually inspected; only a synthetic flat-color 16×16 image appears, no character portrait. Technical full prompt is closed in the automatic Studio screenshots.

| Workspace | 960×720 | 1440×900 |
| --- | --- | --- |
| Expressions | [Screenshot](screenshots/ux-03/expressions-960.png) | [Screenshot](screenshots/ux-03/expressions-1440.png) |
| Studio | [Screenshot](screenshots/ux-03/studio-960.png) | [Screenshot](screenshots/ux-03/studio-1440.png) |

New unit coverage exercises arbitrary family/variant creation/edit/reopen, duplicate-slug failure with persisted state intact, isolated personal rules and restoring shared inheritance. The dedicated Electron UX-03 smoke exercises actual family/variant fields, scoped drafts across navigation and family switches, global/personal saving, exact Studio handoff/return, retained supplement/expert text, visible manual-import availability, asset-only Library and both desktop sizes. Existing desktop and native scripts are updated to navigate to Expressions. The manual suite also constructs genuine pre-Create imported assets through the existing typed IPC command to preserve legacy-import compatibility coverage; all new user imports use Studio's actual chooser/drop.

Native jobs use the existing explicitly labelled `tests/support/fake-codex.mjs` through the smoke test's temporary PATH. They test the actual IPC/process/protocol/import/review integration, not live image-generation quality. No live generation, API-key call, external AI request or automatic generation was performed.

## Limits

Linux x64 only; Windows/macOS and visual ImageGen fidelity were not tested. Draft retention lasts for the open project/session; users must save definitions to persist them across restart. No new Expression delete/reorder command, batch editor, animation or image engine was added. Existing masks, hard lock, creator, relighting, style analysis, quality/export and cutout remain on their existing paths. PR #19 is an explicit prerequisite; no competing shared MaskEditor/styles.css patch is included.
