# Codex 02E — Character Creator / Photo-to-Master

Date: 2026-11-16. New branch `feat/task-02e-character-creator`, based on merged PR #10 (`bd0221e`). Existing repository, no worktree, no checkout/commit/update of local main. The pre-existing staged `.vscode/settings.json` is preserved byte-for-byte and excluded. All validation projects/images are synthetic and temporary; no user project, personal selfie or private portrait was opened or changed.

## Implemented vertical slice

**Characters → Neuen Charakter erstellen** opens a separate editor. Create a named draft character without a master, import up to three identity references, choose an existing project style, describe an independent outfit, inspect/edit the neutral master composition and prompt, then explicitly generate. Existing character/master import stays available in the character library.

Identity inputs accept PNG/JPEG/WebP, each up to 16 MiB / 16 megapixels, with bounded reads, format/native decoding, SHA-256 and exclusive read-only project copies under `assets/identities/<hash>.<format>`. JPEG support is scoped to identity inputs; it does not expand the old master/candidate format rules. Phone JPEG EXIF orientation 5–8 swaps preview metadata dimensions, matching Chromium's display without rotating/re-encoding any source bytes. Original metadata stays in the image.

Identity previews, style-only previews and outfit controls are separate. The UI shows the actual reference order: all selected identity images first, then all style images. The prompt separates IDENTITY REFERENCE, STYLE REFERENCE, OUTFIT DESCRIPTION and MASTER COMPOSITION. It forbids transferring another character's face, hair, clothes, accessories or personality from style references. Neutral defaults request a calm closed mouth, camera gaze, stable head, head/upper body, both shoulders inside the frame, no speech/shouting or dynamic gesture. Target dimensions and the open asset-profile identifier are editable; measured output dimensions are retained without resizing or 64×64 conversion.

The prompt editor is collapsible and editable, using the existing explicit adoption/keep mechanism after changing saved/edited settings. Historical attempts expose their immutable complete prompt separately from the working draft. Settings are persisted with each submitted attempt, not as an automatic background-upload or pre-generation autosave of form text.

## Separate native operation, shared secure lifecycle

`CodexImageGenerationProvider.createCharacterMaster()` accepts a distinct typed request; it does not invent a master, call the expression-edit method, require a variant, or store creator attempts in the expression collection. Expression edits and character creation share only the existing secured process/JSON-RPC transport, result validation and single-job controller.

For every actual job, existing managed ChatGPT account and enabled ImageGen are checked. Creation validates the selected character has no approved master and that the exact active identity IDs/hashes belong to that character. Current style ID/revision and ordered style hashes must match. Main resolves paths and verifies bytes; provider makes distinct read-only `identity-1.*`, `identity-2.*`, `identity-3.*`, then `style-1.*`, etc. copies in a private temporary job directory. Creation-specific trusted developer instructions explicitly request a NEW neutral master with identity/style roles, independent outfit and one built-in image operation. No original is an editable target. Copies are cleaned after success/failure/cancel; generated Codex originals remain untouched.

The installed `codex-cli 0.169.0` was actually checked with:

- `env -u OPENAI_API_KEY -u CODEX_API_KEY codex app-server generate-json-schema --out /tmp/laceframe-02e-schemas`
- `codex --version`

Exported `v2/TurnStartParams.json` has `input: array`, documented `UserInput.localImage` and no `maxItems`. SHA-256: `7306e8a95152f1071b0fb8bcc22da20a798ae34c1c57b6d26dfafc2c2b47ee9e`. The runtime schema gate conservatively requires room for all nine possible inputs (three identities + six style images) when enabling multi-reference capability; unknown/limited schemas block multi-image jobs, never silently omit identity/style inputs. One-reference creation can still use the existing basic local-image route. Transport schema acceptance does not prove reference fidelity in a real model.

Only an explicit generation click starts an image turn. Existing monotonic main-process timer, real event phases, timeout, error/cancel handling, account gating, no application retries and safe thread-bound `imageGeneration.savedPath` validation remain in use. Creation/expressions share the same single-job lock, including across workspace navigation. The active job's sticky cancel remains reachable; completing a hidden workspace's job reliably releases the UI lock. No API key, HTTP endpoint, cookie scraping, auto-login or new runtime dependency was added.

## Candidates, approval and expression handoff

Every successful result creates a separate unapproved asset under `assets/master-candidates/` and an immutable master-attempt record. It captures character, ordered identity IDs/hashes, exact style revision/references, identity notes, outfit, composition, complete prompt revision, provider and execution start/end/duration/outcome. Failed or cancelled jobs have attempts/timing but no fabricated candidate. Several jobs may produce several independent candidates, even if returned image bytes happen to be identical.

Review uses the shared comparison component with the left image labelled **Identität**, not an already approved master. Native registration, visual normalization, slider, overlay and shared zoom/pan are reused. The UI states target vs actual resolution, provides explicit rejection/another attempt, and requires a confirmation before manual Master V1 approval. Main copies the verified candidate bytes into a separate immutable original asset, assigns a new locked master ID, records candidate approval, and retains the raw master candidate and historical sources. An existing master can never be replaced; generating for a character with a locked master is rejected.

Approval records the chosen per-character style and outfit notes so the expression workflow uses that figure's own master and intended style. **Expressions mit diesem Master erstellen** opens Create with that master. Existing personal performance settings and expression masks work with the new master; no identity data is merged with another character.

## Privacy, removal and compatibility

No identity image is copied to clipboard, committed, or sent to an external provider on import/settings edits/checks. Only generation sends the explicitly listed original reference bytes to the managed Codex route. Embedded EXIF/other original metadata is retained and is therefore included with an explicitly submitted image; metadata stripping is not implemented.

**Referenz entfernen** is explicit and explains the dependency rule:

- An unused identity asset is removed from the manifest, then its verified unshared project copy is unlinked. Shared copies needed by another identity record are retained. Paths/hash/symlinks are checked again before deletion; a failure can leave an orphaned copy, never intentionally delete a dependent original.
- A source already used by a master attempt is archived with `removedAt`, excluded from future selections/requests, and retained for historical hashes/prompts/candidate provenance. Historical previews and reopen remain valid. Other characters and external original files are untouched.

This is removal from active selection with historical retention, not a promise to securely erase storage sectors, backups, Codex-managed history or previously submitted remote data.

Schema version 2 gains optional `characterCreationVersion: 1`, default-empty identity/master-attempt/master-candidate collections and strict reference/review validation. Old projects open read-only. First write of a pre-creator 02D project creates byte-exact exclusive `laceframe.v2.pre-character-creation.backup.json`; previous v1/pre-art/pre-style/pre-masking backup precedence remains. Opening/saving does not rewrite old master/candidate bytes, approval states, masks, prompt snapshots or IDs. Older strict-schema binaries may reject new fields; reverting requires the original backup and complete asset directories.

The typed bridge keeps the same 15 operations; image chooser/staging gain a validated identity-purpose overload, and existing generation start accepts the distinct creator draft. No generic filesystem/process/path interface is exposed. Sender/frame checks, renderer sandbox/context isolation and project mutation serialization remain.

## Actual validation on Linux

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, zero warnings |
| `npm test` | **158 passed, 8 files** (139 baseline + 19 new) |
| `npm run build` | Passed, packaged Linux x64 app |
| `npm run test:desktop` | Passed |
| `npm run test:desktop:native` | Passed: existing native/mask smoke plus new Creator smoke |
| `git diff --check` | Passed |
| Installed CLI schema export / inspection | Passed; zero image turns |

Unit tests cover immutable imports/reopen, duplicate/three-image limits, format/size rejection, hash/missing/symlink/traversal checks, cross-character/hash/stale-style rejection, unused/shared copy deletion, historical source archival, pre-creator backup, dedicated no-master generation, ordered three-identity/two-style transport, trusted role instructions and temporary cleanup, separate candidates/rejection/approval/Master Lock, style/outfit transfer, expression attempt and mask handoff, auth/feature/failure/cancel/concurrency/retry and nine-image schema gating.

The existing manual packaged smoke retains import/WebP/master/review/provenance/security and restart checks. The existing native smoke retains style library, separate character performance, timing, errors/cancel/regeneration, multi-reference gates, real mouse/touch/keyboard compare/mask editor, channel-exact Hard Pixel Lock and restart coverage.

The new `scripts/creator-smoke.cjs` launches the actual packaged app with the explicitly labelled Codex protocol fixture injected through temporary PATH. It creates a real style via UI, creates a masterless draft, imports a synthetic **JPEG with EXIF orientation 6 via native chooser**, then PNG and WebP through drop/staging/native decoding. It asserts source hash and oriented preview dimensions, no image turns on import, three-identity/one-style order, the actual composed outfit/neutral prompt, responsive 960×720 layout, no-master generation, timer/lock and accessible cancel after a workspace switch, failure/cancel/retry, rejection and explicit approval. It then runs an actual native-fixture Expression job against the newly locked master, approves that expression, archives a referenced photo, closes/relaunches/reopens and verifies unchanged saved records/master/candidates. No renderer exceptions. Screenshots under ignored `artifacts/` were visually inspected.

**No live image generation or paid API request was made; no image allowance was consumed for these tests.** The deterministic protocol server is only a test fixture and never a production fallback. Installed schema inspection is a real CLI test; all automated image jobs use synthetic results and do not establish live photo likeness, neutral-expression quality or multi-reference identity fidelity.

During development, Typecheck caught an unused test import; Lint caught the missing preserved error cause and an unqualified browser `atob` in the fixture. Initial smoke selectors targeted an ambiguous Characters button, a hidden character option and a nested workspace fieldset; selectors were narrowed. Cross-workspace review also identified the need to release the originating workspace's lock after a hidden job finishes; owner-specific UI state and an explicit smoke assertion now cover that path. Final results above refer to corrected complete runs.

## Remaining limitations

- Live developer-cameo likeness and style fidelity require the user's own explicit generation followed by manual review; they are not claimed from fixture tests or transport capability.
- At least one identity image is required. Optional text-only character creation is not offered.
- Inputs: three identity images maximum, one import at a time. Identity limits are 16 MiB/16 MP; existing style limits remain six images, 8 MiB/16 MP each. Actual generated PNG/WebP dimensions are retained and may differ from targets.
- JPEG EXIF orientation 6 was tested; other EXIF orientations use the same dimension policy but are not individually exercised. Original metadata is retained. No face recognition, photo alignment, likeness score or privacy metadata scrubber.
- Historically used private sources remain archived. No destructive historical purge, secure-overwrite claim or automatic deletion of Codex-managed outputs/history.
- Art Direction is selected from the existing library; there is no automatic extraction of a game's style from a portrait. Outfit is text plus the approved image, not wardrobe geometry/segmentation.
- Linux x64 / CLI 0.169.0 validated. Windows/macOS packaging/input/signing and other CLI/account versions remain unvalidated. No Motion, webcam/video, rigging, gestures or automatic pixel registration.

## Official source actually opened

[Codex App Server](https://learn.chatgpt.com/docs/app-server): documented JSON-RPC lifecycle, version-specific schema export and local-image inputs. The local exported schema is the version-specific transport evidence; neither source is treated as proof of image fidelity or new account permissions.
