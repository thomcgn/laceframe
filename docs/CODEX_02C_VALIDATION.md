# Codex 02C — Visual Style Library and multi-reference validation

Date: 2026-11-16. Based on merged PR #8 (`f92ae229`, containing `45696f2`). New branch `feat/task-02c-visual-style-library` in the existing local repository; no worktree or main checkout/commit. The pre-existing staged `.vscode/settings.json` is preserved byte-for-byte and excluded from this work. Tests use temporary synthetic projects; no private portrait or user project was opened or changed.

## Implemented vertical slice

The existing Create workspace now contains a working Visual Style Library. Profiles support name, description, rendering, lighting/shading, color/contrast and composition rules. Actual PNG/WebP references can be selected through the native file chooser or dropped into the library. Verified image previews, native dimensions, hash prefixes, removal and reuse are functional. Limits: six images per profile revision, 8 MiB / 16 megapixels per style image, 128 unique assets and 100 profiles per project. No automatic image conversion, style extraction or thumbnail generation service is used; thumbnails display the verified originals at a smaller viewport size.

Style assets live separately under `assets/styles/<sha256>.png|webp`. Exclusive read-only writes, bounded reads, hashes, canonical paths, native decoding and symlink checks use the existing main-process project boundary. Removal affects a new revision's membership only. It neither deletes historical image bytes nor mutates their IDs/hashes. Reuse can link the same immutable asset into another profile without rewriting it. Style paths and migration backups are ignored by git.

Each text or reference-membership edit appends an immutable profile document to `artDirectionRevisions`. The editor keys by ID/revision, and the revision selector exposes historical rules/thumbnails read-only. Historical views cannot be submitted as a new project default. Project defaults always select the current profile revision.

Create shows the active style, identity master, number of style images, effective expression source and the image-role mapping. Each character can inherit the project default, choose a particular profile, or select **Eigener Masterstil** with no style references. This supports shared style across independent identities as well as an independent neutral portrait without forcing another character's style. Personal expression overrides from PR #8 retain their exact character/variant scope. Independent, validated per-character `outfits` metadata is prepared; no outfit editor or transfer is implemented.

## Native reference transport and capability gate

The installed official CLI is **`codex-cli 0.169.0`**, as measured for this pass (the earlier live reference report used another version).

Executed `codex app-server generate-json-schema --out /tmp/laceframe-02c-codex-schemas`. Its `v2/TurnStartParams.json` specifies `input` as an array of `UserInput`, whose union includes `localImage` with required `type`/`path`. There is no single-image restriction in this exported schema. The production `probeReferenceCapability()` was then actually executed against that installed CLI in a temporary isolated test; it returned **true**, with **zero image turns**. Evidence: `/tmp/laceframe-02c-schema-proof-hlrlmbla/schema-proof.json`; the temporary test lives beside it. This is a real schema/protocol capability check, not a live image-generation test.

Before each job the existing managed ChatGPT account and enabled `image_generation` feature are still required. A read-only, bounded, timed CLI schema export additionally checks that the installed protocol can express the configured reference list. Schema errors/absence/ambiguity fail closed for multi-image submission. The existing single-master route remains available. The schema subprocess receives no API-key environment variables and does not perform login or generation.

For a configured style-image job:

1. Main validates the immutable saved attempt's master and ordered style IDs/SHA-256 against the selected effective profile revision.
2. Main resolves and verifies the project-local style files; renderer input never supplies filesystem paths.
3. Provider verifies bounded source bytes again and makes distinct read-only temporary `master.*` and `style-1.*`, `style-2.*`, … copies. Project originals remain untouched.
4. One `turn/start` sends the full working prompt/context and image inputs in fixed order: identity master first, style references afterwards. Prompt plus trusted provider instructions explicitly label identity/edit target versus rendering-only images, forbid transferring faces, hair, freckles, clothes, accessories or personality, and request one built-in image operation using all supplied references. A chosen style may change rendering/light/color treatment; original dimensions, identity and outfit remain the stated constraints.
5. The existing confirmed `imageGeneration.savedPath`/completed-turn validation, secure candidate import, manual review, timing, cancellation and single-job project lock remain in use. No API-key/HTTP provider or automatic retry was added.

If multi-image support cannot be confirmed, Generate is disabled for a profile with images and the UI names the limitation and master-only/text-style alternatives. Main also rejects such jobs before `turn/start`; it never silently discards selected style images. The deterministic smoke tests this gate and verifies that changing settings/checking availability sends no image turn.

**Boundary:** schema support proves the official transport accepts multiple local images. It does not prove that a particular model will honor every reference or preserve character identity. No actual multi-reference image was generated in this pass, because the task prohibits live generation without explicit approval. The production path is implemented; visual fidelity still requires a user-initiated generation and manual review.

## Provenance and compatibility

New Create attempts retain style ID/exact revision, ordered style-reference IDs/hashes, master ID/hash, personal performance text, complete immutable prompt revision, provider, and existing execution timestamps/duration/outcome. Historical result imports use their saved provenance rather than today's defaults. Removing a reference or revising a style cannot rewrite an old prompt or block a valid historical import.

Current schema version 2 is extended with a `visualStyleVersion: 1` marker and strictly validated collections. Opening older projects remains read-only. Before the first necessary write:

- v1 retains `laceframe.v1.backup.json` behavior;
- v2 missing the prior art-direction collections retains `laceframe.v2.pre-art-direction.backup.json`;
- PR8 v2 without the visual marker gets `laceframe.v2.pre-visual-style.backup.json`.

Backups are exclusive, byte-exact and conflict checked. Migration archives only the known current text profile. Old counter-only revisions that were never recorded cannot be reconstructed; their original attempt prompts remain available and unchanged. No historical profile text is invented. New references/revisions are fully archived from this baseline onward. Existing master/candidate bytes, approval states, IDs and old timed/untimed prompt records remain readable. Older strict-schema binaries may not read newly saved visual-library fields; an original backup plus the complete asset directory is needed when reverting.

## Actual validation on Linux

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, zero warnings |
| `npm test` | **118 passed, 6 files** (101 baseline + 17 added) |
| `npm run build` | Passed, unpacked Linux x64 application |
| `npm run test:desktop` | Passed |
| `npm run test:desktop:native` | Passed, expanded visual-library/multi-reference checks |
| `git diff --check` | Passed |
| Installed production schema capability probe (temporary isolated Vitest) | Passed, actual CLI schema supports multiple local images; no generation |
| `npm run start -- -- --remote-debugging-port=9236 --user-data-dir=<temporary>` and existing dev-smoke script copied outside git with only its port changed to 9236 | Passed, first render, typed preload and reload with normal sandbox |

New unit coverage includes immutable style bytes/paths/permissions, profile revision retention after remove/edit/reuse, saved historical import, hash/ID/order validation, six-image cap, non-images/oversize inputs, corrupted/missing/symlinked/traversing references, pre-visual v2 migration/backup, shared style with independent character choices, project isolation, schema capability fail-closed behavior, ordered identity + two style-image transport, persisted reference provenance and unsupported-multi-image rejection before any turn followed by successful master-only submission.

The packaged native smoke imports PNG via actual chooser/read/staging and WebP via actual drop bytes, displays thumbnails, removes/reuses an image, inspects historical revisions, then runs identity + two style references through the production IPC/process/protocol/import pipeline. It retains the prior two-character isolation, prompt revision, approve/review, real slider mouse/touch/keyboard, pan/zoom/overlay, 960px layout, timer, sticky cancel, failure/cancel/regeneration and auth checks. It additionally generates a deterministic master-only candidate and verifies an unconfirmed-schema UI gate without sending another image request. The manual desktop smoke preserves the existing manual workflow and close/relaunch/reopen checks. Screenshots at 960×720 and 1440×1000 were visually inspected; synthetic images only, ignored `artifacts/`.

Native automated jobs use the explicitly labelled `tests/support/fake-codex.mjs` injected through test PATH, including its deterministic schema-export response. It is never a production fallback. **No live image generation, API-key request or paid external API call was made.** The previously documented live single-reference edit is distinct from these tests and used an earlier CLI.

During implementation, Typecheck caught an unavailable array helper and a missing test parameter type; Lint caught an obsolete import and unqualified browser globals. These were fixed. The first expanded smoke used an unsupported regex option label, and another assertion expected confirmation even after the user had already adopted a fresh editable template; both fixture assertions were corrected. Final results above refer to corrected complete runs. The known VA-API warning appeared during the successful normal-sandbox development run without a renderer error.

## Remaining limitations

- No live multi-reference generation or visual quality/identity-fidelity proof in this pass. A successful job is a candidate, never automatic identity approval. Exact pixel preservation is not promised.
- Only Linux x64 and the currently installed CLI schema were examined. Windows/macOS execution, packaging/signing/input behavior and other CLI versions/accounts remain unvalidated; runtime checks are conservative.
- Local schema export is the feature signal for multiple input images; there is no invented account-level multi-image permission. Managed ChatGPT auth and ImageGen availability are independently checked for every job.
- Reference images remain in the library while historical revisions use them. There is no destructive garbage collector or semantic style-quality detector.
- A native dialog or OS drag can supply PNG/WebP; one file per import. There is no bulk-import wizard. Portrait Artistic retains actual result resolution.
- Outfit data is prepared only. Photo-to-master, new character creator, facial masks/pixel-lock compositing, gestures and Motion/transitions are not included.

## Official sources actually opened

- [Codex App Server](https://learn.chatgpt.com/docs/app-server): version-specific schema export, stdio JSON-RPC and typed turn inputs.
- [Image generation](https://learn.chatgpt.com/docs/image-generation): built-in generation/reference workflow. This does not replace the installed-schema check or constitute a new live test.
