# PR #8 — Art Direction / Expression Identity review and validation

Date: 2026-11-16. Reviewed initial PR head `9fbfe8c` against local/remote main `8c9f8cd`. Work continues on the PR's existing `feat/task-02b-create-ui-tests` branch, without a worktree or direct main changes. The pre-existing staged `.vscode/settings.json` was preserved byte-for-byte and excluded from the commit. No user project or portrait was opened or changed.

## Review findings and corrections

1. **Incomplete current-selection validation:** the initial provider rejected wrong supplied values but accepted omitted style/performance fields even when configured. New draft submission now requires the exact current project style ID/revision and the selected character/variant's effective personal override, including absence. Both manual preparation and native generation use this boundary. Existing attempts are validated independently: paired ID/revision, known profile and a revision no newer than that profile. Historical revisions need not equal today's default/revision.
2. **Historical manual results were blocked:** revalidating a saved attempt against today's defaults rejected legitimate imports after a style revision or personal-expression change. Result ingestion now validates its saved immutable master/hash/variant and candidate uniqueness. A later configuration change does not rewrite or invalidate the original prompt provenance; new attempts still require fresh selections.
3. **No backup for pre-02B v2:** opening stays read-only; the first explicit save of a v2 manifest missing either additive collection first creates an exclusive, byte-exact `laceframe.v2.pre-art-direction.backup.json`. Conflicting backups and symlinks are not overwritten. Existing v1 backup behavior remains intact. Projects already containing the fields do not need this migration.
4. **Only one style could be created through UI:** a working **Weiteren Stil anlegen** / cancel action now permits additional profiles, explicitly creates/selects the new style, and keeps existing profiles. Editor instances track profile ID/revision. The six Create selectors remain on one row at wide widths and reflow at smaller desktop sizes.
5. **Saved prompt display could drift:** pristine saved prompts now have explicit in-memory saved-revision state. Changes to style, performance or selection require adopting the new template or explicitly keeping the old text. Loading history also detects the difference even when the current computed template itself has not changed. Existing persisted prompt revisions are never rewritten; the UI distinguishes saved revisions from actual manual edits.
6. **Unstable accessible names after textarea re-render:** profile and personal-expression textareas now have explicit accessible labels. The extended desktop test revisits and edits populated fields after several jobs.

## Actual validation

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, no warnings |
| `npm test` | Passed: **101 tests in 5 files** |
| `npm run build` | Passed, unpacked Linux x64 Electron application |
| `npm run test:desktop` | Passed |
| `npm run test:desktop:native` | Passed, extended two-character/style workflow |
| `git diff --check` | Passed |

The unmodified PR initially passed 95 unit tests (the preceding 91 plus four initial 02B tests). Six regression tests were added for stale/missing/malformed selections, historical import after settings changes, pre-02B v2 migration with timed/untimed attempts and approvals, conflicting backups, project isolation and saved-prompt conflict behavior. Existing tests cover shared fallback, character-specific prompt composition, override deletion, strict schema/IPC/path validation, immutable sources, timing, cancellation and restart.

The extended packaged native smoke uses actual UI controls to create and select **two style profiles**, save a personal expression, then pass the resolved style/performance prompt through the production process/JSON-RPC client. It checks that the official `localImage` identity input is still present, imports and approves a candidate, exercises failure/cancellation/regeneration and validates persisted timing/provenance. It then saves a style revision, verifies explicit prompt adoption and unchanged historical attempts, creates a second synthetic character/master and saves a different personal expression. A second deterministic job keeps the same project style but links to that character's own master and direction; switching back restores the first character's notes. Existing slider keyboard/mouse/touch, synchronized zoom/pan, opacity, 960px layout, sticky cancellation, project lock and auth-gating checks remain in this test.

The manual desktop smoke also passes the existing PNG/WebP import, master lock, manual Create, prompt/browser allowlist, library editing, approve/reject, secure preload/IPC, provenance and close/relaunch/reopen checks. Migration tests compare actual image bytes, full old attempt records, timing and approved asset records before/after save and reopen.

The first extended smoke run exposed the populated-textarea label issue; it was corrected. The next run reached the second-character step but its unsaved-draft confirmation was automatically dismissed by Playwright. The test now explicitly accepts that expected user confirmation; this was a test setup issue, not a bypass of the application's guard. Final results above refer to corrected runs.

## Test boundary and remaining limitations

- **No live ImageGen request or paid API request was made.** Native smoke injects the explicitly labelled `tests/support/fake-codex.mjs` through temporary PATH; it supplies synthetic PNGs and protocol events. Production never selects it as a fallback. This verifies integration, selection/provenance, status, process lifecycle and result ingestion, not new generation quality or portrait identity fidelity. The previous controlled live reference edit remains documented in `NATIVE_CODEX_VALIDATION.md`.
- This PR is the **text-profile follow-up**, not the complete 02B asset specification. Local style-reference import/thumbnails, multiple image-reference submission, character-specific style assignment, a photo-to-master wizard and outfit/identity-profile editors are not implemented. UI explicitly discloses that style rules are text and no extra style image is sent; the character's approved master remains the identity reference.
- The profile UI edits name/rendering rules. Optional lighting/color/framing fields already supported by the model/composer have no dedicated controls yet. A profile revision counter and exact attempt prompt snapshots preserve provenance; a browsable archive of full historical profile documents is not implemented.
- Linux x64 was tested. Windows/macOS packaging, signing/input behavior and other installed Codex versions remain unvalidated. No masks, pixel-lock guarantee, gestures or Motion were added.
- Current code reads old v1/v2 projects and preserves assets/reviews. Older strict-schema binaries may reject newly saved profile metadata; use the current build, or an original migration backup together with the complete asset directory when reverting.
