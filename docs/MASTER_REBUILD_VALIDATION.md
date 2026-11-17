# LF-01 — Master Rebuild and Transparency Gate

Date: 2026-11-17. Branch `feat/master-rebuild-transparency-gate` in the existing local repository. Started on the reviewed PR #22 tree; after the user confirmed its merge, fetched and fast-forwarded this feature branch to `origin/main` merge `99eac61`. No main checkout/commit, worktree, dependency or live generation. The pre-existing staged `.vscode/settings.json` is excluded and preserved (cached diff SHA-256 `c196c824486a9883006b33270441d5ef08065918f4578b0a313362222b8251bb`). LF-02 was not started; the user-owned untracked `docs/Roadmap.md` is unchanged and excluded. All runtime projects/images are disposable synthetic fixtures; no original user project or private portrait was opened or changed.

## Architecture and actual behavior

**Characters → Master neu aufbauen** opens the existing Character Creator for the same character ID. It captures an explicit `rebuild` mode, current `baseMasterId` and `baseMasterSha256`, and offers the active identity references, current effective Art Direction and known outfit/composition/identity notes as editable inputs. New characters use `create` (old untagged attempts remain compatible). Rebuild style selections remain draft-local until approval. Missing identity references must be imported explicitly; the previous master is not silently substituted as an identity image.

The operation reuses the existing single-job GenerationController and native Codex `createCharacterMaster` path. It is a complete new generation, not editing/cutting out the previous master. The provider receives the actual ordered identity/style images, not the old master merely because it is the active version. Existing official authentication, capability gates, immutable temporary references, timer/status/cancel, savedPath validation and result import remain in force. Only an explicit generation/retry click submits a job; opening the workflow or changing settings does not. No new provider capabilities are claimed.

Main validates the captured active version before preparation and again on approval, including identity/character ownership, base hash and exact active ID. A concurrent/stale attempt cannot supersede a newer active version. Failure, cancellation, unreviewed results and rejection leave the active master unchanged. Double approval is rejected.

Approved rebuilds append Master V2/V3/etc. with `previousMasterId` for chronological version history and `sourceCandidateId` for genuine generation provenance. Direct generations have no invented `qualitySourceId`. A corrected generated candidate retains **both** its actual generation source and the reviewed cutout's quality provenance. The existing strict version and promotion-link validators accept these two distinct cases. Outfits append a version-labelled record; old profiles, expression/master IDs, masks and asset bytes remain unchanged. Studio follows the newly active version; explicit historical selection still works. Library labels expressions from historical masters.

## Actual transparency gate

The existing `analyzePixels()` pipeline is extended, not replaced. It measures decoded RGBA dimensions/format, alpha-zero/partial/opaque counts, null-alpha border samples and genuine 4-connected alpha-zero exterior pixels. Flooding starts only at the image edges and excludes isolated interior holes. This is geometric evidence, not semantic segmentation or a score.

The existing conservative classification is retained: opaque images have no reduced-alpha samples; empty images have no visible content; partial-only alpha or fewer than half fully transparent border pixels is suspicious. A nonempty image with genuine sufficiently transparent border samples can reach **Transparenz vorhanden – manuelle Prüfung erforderlich**. An invalid decode/dimension/hash/file is an error, never an approvable result. A technically transparent border is not proof against a baked inner rectangle, poor hair edges or wrong identity; all still require manual inspection. Small legitimate images are assessed from actual pixels, without a forced resolution conversion or an arbitrary minimum transparent-area percentage.

Every **new master activation**, including local master import, generated candidates and quality promotions, is enforced in main against actual bytes. Generated candidate approval requires candidate ID, expected SHA-256, identity/silhouette/activation attestations and a nonempty review note. Main rechecks the bytes and dimensions before copying/promoting. Newly imported pre-approved portraits also require real transparency and the explicit review/note. Quality promotions retain their existing required identity/style/silhouette confirmation and note, add an activation warning in the UI, and verify the complete source/output/mask/recipe chain before approval. The shared verification is also used by PR #22's unchanged approved-cutout-before-relighting rule.

New masters store a `masterReview`: source SHA-256, check timestamp, algorithm `alpha-review-v1`, alpha counts, transparent border and exterior counts, human confirmations and note. These records are hash-linked in the project schema. Renderer-supplied quality scores or alpha measurements are never accepted. No filesystem, token or new unrestricted preload access was added.

Creator and Library reuse the same MasterApproval UI. Opaque/suspicious/invalid images cannot enable the approval action merely by checking all boxes. They expose regeneration preparation/retry, rejection and the existing cutout correction route. The correction creates a separate candidate; only an explicitly reviewed valid cutout can become the next master. Checkerboard/light/dark comparison backgrounds change presentation only. Normal, supplementary and Expert Override master prompts are normalized and receive the mandatory transparent-character instruction in main and provider instructions. The persisted revision matches the transmitted text. Explicit background conflicts are named and blocked before preparation; the text detector is conservative, not a general natural-language consistency proof. **Generative output transparency is not guaranteed; inappropriate output activation is blocked.**

## History, compatibility and deletion

Characters exposes the current version and a lazy master history: approval date, generation/import/quality origin, active versus archived state, actual transparency evidence and linked expressions/masks/quality revisions. Library provides existing historical comparison and export. Previous masters are archived by retaining their IDs/assets and moving the active pointer; no historical expression or mask is reassigned.

There is no physical master-delete action or garbage collector. A safe destructive implementation needs a complete reference audit across master ancestry, expression attempts/assets, masks, quality sources/recipes, exports and rebuild attempts. That is explicitly deferred, as allowed by the request; no unsafe partial deletion is offered.

No project schema-version migration or retroactive transparency gate on open is introduced. Existing untagged masters/attempts, including historical opaque masters and prior quality V2+, remain readable with their original provenance and existing export rules. They are not silently certified as new transparent/relight-ready assets. Rejected/failed/pending attempts remain historical. New optional fields on new records may be rejected by older strict-schema binaries; reverting software requires a complete original project/asset backup. No new migration backup is advertised for this additive extension.

A newly staged opaque local master import cannot be activated. The persisted generated-candidate cutout recovery route is implemented; a staged file is not silently turned into a fabricated AI attempt. Offline manual work remains available with technically transparent reviewed master imports.

## Actual tests

| Command | Actual result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, zero warnings |
| `npm test` | Passed: **300 tests in 17 files** |
| `npm run build` | Passed, packaged Linux x64 application |
| `npm run test:desktop` | Passed: all seven packaged desktop suites |
| `npm run test:desktop:native` | Passed: native provider and expanded Character Creator suites |
| `git diff --check` | Passed |

After the screenshot review identified a stretched rejection button, the approval form was given its own full-width flex row. Typecheck, lint, all unit tests, build and the complete native suite were rerun; the latter additionally checks the rejection button's actual height in all four window sizes. The ordinary desktop suite passed in the preceding complete run. No processing or approval logic changed after that run.

New unit coverage tests create/rebuild preparation, captured origin, same-character V1→V2→V3, old expression/mask/reference preservation, stale and foreign targets, double review, failed/cancelled attempts, pending restart, opaque black/white/color, sparse/partial-only/empty alpha, genuine exterior connectivity, partial edges with review, mandatory attestations, unknown candidate ID, mismatched/corrupt/missing bytes, imported-master gating, reviewed cutout rescue and tampered rescue mask, preserved untagged manifests, protected actual prompts in all three modes and conflicting/negative background instructions.

The expanded packaged Creator smoke uses the existing explicitly labelled `tests/support/fake-codex.mjs` via temporary PATH. It submits real local process/protocol jobs against that fixture, imports the actual returned PNG bytes, asserts no new turn while preparing Rebuild, preserves V1 through opaque output/rejection/failure/cancellation, tests direct IPC approval denial and single-job rejection, opens the actual cutout correction editor, reopens a pending transparent candidate, performs all human approval controls, activates V2, checks Studio selection and historical links, and captures 960×720 / 1280×800 / 1440×900 / 1920×1080 layouts. It uses no installed live image service.

The existing ordinary desktop suites retain real chooser/drop/import, approved transparency, expression drafts, mask/worker/live pointer pixels, cutout revisions, alpha, GPU/CPU lighting and exact PNG/export/reopen checks. Historical opaque sources are now explicitly constructed as **pre-gate fixture manifests** in test-only helpers, then opened through the normal service/app; production approval is never intercepted or bypassed. New import/generation approval tests use the actual guarded commands. This preserves the old opaque-source correction tests without adding an application exception to the gate.

Initial checks caught the old V2-only-quality schema assumption, accidental rebuild fields on unrelated strict IPC commands, a missing controlled-details `open` binding in the cutout handoff, an ambiguous/shadowed test helper and missing dialog acceptance for the new activation warning. These were corrected. Several intermediate full runs lost native pointer capture during the existing real pre-pointerup stroke test. The harness now flushes two animation frames after the preceding control event before starting the stroke, while retaining all live capture/pixel/save-disabled assertions and adding event diagnostics; there is no retry or recapture during a stroke and no production MaskEditor change. The underlying Chromium/OS timing cause is not conclusively established. A later full run passed that test and exposed a stale one-shot dialog handler left armed by a pristine editor close; the handler is now removed in finally, preventing a later activation dialog from being accepted twice. Screenshot review also caught the stretched rejection button described above. Reported command results refer to completed passing runs after the relevant corrections.

## Screenshots

Synthetic flat-color PNG blocks only, no portrait or generated artwork. Actual Electron captures were visually inspected; these are full-page captures made at the stated **window content size**, so their raster heights include scrolling content. The fixed navigation and generation bar are visible at the scroll position used for review. All four widths are checked for horizontal overflow, reachable controls and compact rejection buttons.

- [Opaque candidate: warning, real counts, correction actions and disabled activation](screenshots/master-rebuild/opaque.png)
- [960 × 720: explicit identity, silhouette, note and activation review](screenshots/master-rebuild/review-960.png)
- [1440 × 900: full-width review form](screenshots/master-rebuild/review-1440.png)
- [1920 × 1080: review layout](screenshots/master-rebuild/review-1920.png)
- [Activated V2 and archived V1 history with separate expression links](screenshots/master-rebuild/history.png)

## Manual acceptance

1. Open a disposable project with an approved master, select the character and choose **Master neu aufbauen**. Verify its references/outfit/style are offered and V1 stays active. Merely opening or editing must not generate.
2. Review the full prompt in each mode. A positive black/white/color-background instruction must show a conflict; the mandatory alpha instruction remains in every submitted prompt.
3. Only if deliberately testing the installed provider, click Generate; this consumes Codex allowance and was **not** performed live for this report. Test failure/cancel separately and confirm the previous master remains active.
4. Review an imported generation candidate on checker/light/dark backgrounds. An opaque result must remain unapprovable even with all confirmations. Use **Hintergrund freistellen** for a separate correction, then inspect its pixels and quality provenance before approval.
5. For a technically transparent candidate, confirm identity, silhouette and activation, enter a note and approve. Verify the same character now uses V2, V1 and its expressions/masks remain historical, and Studio selects V2.
6. Close/reopen the project. Inspect history, pending candidates, immutable prompt/source hashes and PNG exports. Relighting must still require a reviewed cutout; master approval alone must not unlock it.

## Limits

- Linux x64 only; Windows/macOS execution, input, packaging and signing are untested.
- No live generation or transparency/identity-fidelity proof from a real model in this pass. Native jobs in automated tests are labelled protocol fixtures; processing/storage/export are real.
- Technical alpha analysis does not guarantee silhouette/identity/style quality or detect every baked background. Human review remains mandatory; background conflict text matching can miss complex contradictions.
- Existing processing bounds remain: up to 16 MP for quality analysis/new master activation, 4 MP for automatic cutout/relighting, 16 MP manual masks. No automatic resize. Main's bounded quality/ancestry recomputation can occupy main briefly; no 16 MP latency/peak-memory benchmark is claimed.
- Failed/cancelled jobs never create fake results. No automatic retries or restart of a pending generation; saved candidates/attempts are retained, not in-flight process resurrection.
- Master deletion/recursive cleanup is deferred. Legacy originals, generated originals and historical sources remain untouched.
