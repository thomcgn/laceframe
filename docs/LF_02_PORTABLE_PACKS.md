# LF-02 — Portable Style & Expression Packs

Date: 2026-11-17. Branch `feat/lf-02-portable-packs`, based on merged LF-01 / PR #23 (`ee6348f`). Existing repository only; no worktree or main checkout/commit. The pre-existing staged `.vscode/settings.json` is preserved and excluded. The user's previously untracked `docs/Roadmap.md` is included with the phase status update requested by that roadmap. No private project, portrait, selfie, game artwork, live ImageGen request, model download or new runtime dependency.

## User workflow

Art Direction and Expressions now expose native JSON chooser/export actions. Import opens a complete content preview and per-item decision before any project write: new, identical, changed, conflict or skipped. The default is **skip** for existing/ambiguous entries. Cancel leaves the project unchanged. Updating an unambiguous stable ID requires an explicit selection; names alone never identify a definition. Changes after preview invalidate its complete project SHA-256, including writes in the same millisecond.

New imports allocate local UUIDs and retain portable IDs separately. Existing projects have unique family slugs and case-insensitive style names. A new copy with a collision receives a deterministic local `-import-2`, `-import-3`, … suffix, shown in the preview. Source style names and family slugs remain separately retained for roundtrip/export. Multiple copies of one portable ID become ambiguous and cannot be silently updated. Variant slug collisions inside a matched family also require a new copy or skipping. Updating a family maps variants by stable ID; omitted local variants and character-scoped performances are not deleted.

Exports use a native directory chooser, outside the project, and exclusive file creation. Repeating an export into the same filename fails rather than overwrites. The filename contains only a validated kind, UUID and revision. JSON contains no embedded images, asset filenames, renderer-supplied filesystem commands, master/character profiles, masks, attempts or personal performance collections. Free text is not a semantic privacy filter: authors must inspect it before sharing. Style export requires an explicit rendering-only content review, enforced by main. The linter offers uncertain hints, not automatic censorship or guaranteed semantic separation.

## Version 1 formats

The executable strict schemas and serializers are in `src/shared/packs.ts`:

- `format: "laceframe.style"`, `schemaVersion: 1`: stable pack UUID/revision/provenance; asset category `portrait | sprite | scene`; intent, positive/negative rules, contours, pixel clusters, manually described apparent density, shading, material rendering, color/light treatment, composition and explicitly labelled additional rules. `legacy` retains exact original free-text fields alongside structured fields. Optional reference hashes and typed analyzer findings contain no image data or local source paths.
- `format: "laceframe.expressions"`, `schemaVersion: 1`: stable family/variant UUIDs and lowercase kebab-case slugs, labels, global instructions, optional intensity and independent vocal action. All families or the selected family can be exported. Personal expression overrides are excluded. A later Character Package is out of scope.

There is no automatic normalization of free rule text: imported rendering whitespace/CRLF survives roundtrip. External labels must already be normalized; incompatible slugs/labels are rejected, not silently rewritten. Existing project definitions remain readable even if they need a slug edit before sharing. Portable source revision/provenance is retained separately from the new local profile revision. An imported family selection can re-export its source envelope; a new bundle mixing local/source families uses the exporting project's pack UUID and revision 1. This is an exchange revision, not a release registry or cryptographic author signature. Conflict decisions compare complete content, not revision numbers alone.

Unknown fields, formats and schema versions fail closed. A future schema version needs a separately documented validator/migration; version 1 does not guess compatibility or discard unknown information. Intentionally free extra rules have explicit labelled fields.

Measured analyzer findings retain their algorithm, reference hash, ROI/native dimensions and validated measurements. Existing imported findings and current-revision local findings are retained, subject to the bounded format. Imported findings are supplied provenance, not proof that this installation measured an unavailable image; they are not injected as local Style Analyzer runs. Actual analysis still uses the existing bounded worker and verified project assets. No apparent pixel density or physical light geometry is fabricated.

## Security and persistence

Both new preload operations are typed (`choosePack`, `exportPack`); paths stay in main. Native JSON reads reuse bounded nonsymlink file reads, inode checks and `O_NOFOLLOW` where available, plus fatal UTF-8 decoding. Before schema parsing: at most 512 KiB, depth 20 and 30,000 JSON values. Arrays/text/findings have further schema bounds. Dangerous prototype keys, absolute local paths, traversal strings, URLs/data URLs and null bytes are rejected in all incoming/exported strings. This is deliberately conservative; a rule containing a literal URL/path must be edited before sharing. JSON is data, never evaluated. A foreign UUID is an opaque exchange key, never a local filename or filesystem instruction.

Main revalidates the exact pack, full project hash and complete unique decision set on apply. Missing/ambiguous targets, invalid choices or schema failures leave project state and bytes unchanged. Existing generation project locks and trusted sender/frame validation also cover pack IPC. Renderer still has no Node/filesystem/token API.

Project schema stays at version 2 with an optional `portablePacksVersion: 1`, portable identity/style metadata and bounded migration records. Opening old projects is read-only. Before the first necessary write an unmodified LF-01 project gets an exclusive, byte-exact `laceframe.v2.pre-portable-packs.backup.json`; older formats retain their earlier-priority migration backup containing the original bytes. A conflicting or unsafe existing backup blocks the write. New projects start with the marker. Atomic manifest save and external-write protection remain unchanged.

Older strict-schema binaries may reject newly saved fields. Reverting requires the original manifest backup **and complete immutable asset directory**. No master, expression, mask, style revision, candidate, prompt or asset bytes are retroactively rewritten.

## Linter and Ada-style migration

The existing Art Direction editor now provides a linter and a reviewable free-text migration assistant for Ada Voss or any selected legacy profile. For example, `render leather as grouped highlights` is suggested as style/material rendering; `keep black leather jacket` as outfit; selfie instructions as identity; neutral-expression instructions as expression. Mixed/unknown sentences remain uncertain and must be split or reclassified manually. No semantic classifier or model is claimed.

The assistant shows every nonempty source line, editable proposed text and one of `style`, `identity`, `outfit`, `expression`, `composition`, `unclear`. Only an explicit reviewed migration creates a new revision. Original field strings, including CRLF/whitespace, are archived with UTF-8 SHA-256 and their exact source profile/revision. Main validates the source revision and decision coverage; reopen validates archived source/hash linkage. Original revision and historical attempt links remain untouched.

Only user-confirmed style and composition selections enter the new global style. Identity/outfit/expression/unclear entries stay in the immutable migration record; they are **not** automatically assigned to a character or copied into the new style. The real user's Ada project was not opened or modified; this behavior is proven with synthetic mixed-rule fixtures. Reference image membership remains separately managed and immutable; the assistant makes no claim to classify the content of those images.

Structured rules have a working editor, reset/discard and labelled extra rules. Existing free-text editing and Style Analyzer adoption remain available and archived. Missing hash-only pack references are named explicitly; available hashes may resolve to verified project style assets, but JSON never downloads or reconstructs an image. Missing references are not represented as supplied image inputs.

## Prompt layers

Both Creator and expression Studio display the actual source of system constraints, current Style/revision, identity master/references, outfit, global or personal expression performance, composition and creative supplements. Shared structured style text participates in both composers. Identity/outfit remain supplied from the chosen character/references, not from an imported character profile. Expressions continue to use the selected approved master and effective per-character performance.

New expression Expert submissions also retain the mandatory technical alpha instruction in the main-owned saved/transmitted prompt, without rewriting old attempts. The existing Creator protection, immutable reference/candidate pipeline, master transparency/approval gate and native provider sandbox/capability checks remain authoritative. An imported pack cannot switch those checks off. These instructions do not guarantee transparent or identity-faithful model output; human review and the existing technical gates remain necessary.

## Actual validation

Local checks and CI checks are distinguished. No GitHub Actions quality workflow existed at the start of LF-02, so full regression coverage was checked locally. The separate LF-00 infrastructure request is queued after LF-02, per the user's explicit priority.

| Actually executed command | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, zero warnings |
| `npm test` | Passed: **327 tests in 18 files**, including 27 new pack tests |
| `npm run build` | Passed, packaged Linux x64; reused for subsequent desktop runs |
| `npm run test:desktop` | **Failed at the existing Smart Cutout live-pointer assertion after the first five suites passed**; later suites did not run in this invocation |
| `node scripts/smart-cutout-smoke.cjs` | Passed targeted rerun with unchanged script/assertions |
| `node scripts/cutout-stability-smoke.cjs` | Passed |
| `npm run test:desktop:packs` | Passed, including a final repeat after the interrupted aggregate command |
| `npm run test:desktop:native` | Passed: both native-provider and Creator/Rebuild suites |
| `git diff --check` | Passed |

All eight ordinary desktop constituent suites are therefore covered by successful executions, but the aggregate `npm run test:desktop` invocation is **not reported as a passing command**. Its trace showed an extra `pointermove` with `buttons:0` during the held live stroke, followed by the assertion that capture was lost. The unchanged standalone run passed. This does not establish the root cause or fix a production capture bug; test flakiness on the shared Linux/XWayland desktop remains a limitation. No capture/pixel assertions were removed, no existing smoke was changed to retry, and no full suite was repeatedly rerun to obtain a green aggregate log.

Implementation checks used targeted units/lint and typecheck. A first full unit run found one native expected-prompt assertion that needed to include the now-protected actual prompt; the targeted provider/pack rerun passed, then the complete final unit suite passed. Packaging was only performed for actual Electron validation after relevant corrections; no dependency reinstall was needed. CI execution for this PR is **not claimed**.

New tests cover strict formats, rich style and multi-family roundtrips, exact whitespace/CRLF, unique local mappings, same-name/slug/portable-ID conflicts, explicit updates/skips, stale preview, unchanged bytes on refusal, character isolation and personal override preservation, malformed/version/unknown/prototype/depth/size/path/data input, actual file read/export boundaries, backup conflicts, raw migration archives, linter uncertainty and two-character prompt separation. Existing native tests also assert that the complete protected saved prompt is transmitted, then restored unchanged on reopen.

`scripts/packs-smoke.cjs` exercises a real packaged Electron app, its typed preload, chooser handlers, project management and filesystem. It migrates synthetic mixed legacy rules, resets/saves structured rules, exports actual JSON, imports into a second project, cancels without writes, rejects an unsupported schema, reviews conflicts and unchanged reimport, selects an imported family immediately in Studio, saves its actual layered prompt and reopens the project. It checks 960×720, 1440×900 and 1920×1080 with no horizontal overflow, and asserts that only one instance of each pack/rule panel exists. Only native chooser selection is stubbed; processing and file writes are real. No image-generation turn is submitted.

The existing native suites use their clearly labelled fake Codex protocol server. Success/failure/cancel/provenance/security behavior is exercised locally; there is no live provider or generated-quality claim in this report. Existing historical opaque-master fixtures remain explicitly test-only manifests.

Intermediate failures were corrected, not hidden: import-as-new initially hit the existing unique-name/slug invariants, so the preview now names local aliases while preserving portable identities. A native provenance assertion was updated to include the mandatory instruction and additionally check the actual transmitted saved text. Desktop testing exposed duplicate sibling React keys and redundant preview markup, removed with explicit unique-panel assertions. A boundary-whitespace roundtrip caught an unintended trim; source text is now preserved. Failed runs are not counted as passing regression.

## Screenshots and manual acceptance

Screenshots use synthetic rule text and flat-color images only; no portrait/game artwork. Full-page captures were taken with the documented window content dimensions, so raster height includes scrolling content. Visually inspected final captures:

- [Migration at 960 × 720](screenshots/lf-02/migration-960.png)
- [Import decisions at 960 × 720](screenshots/lf-02/import-960.png)
- [Import decisions at 1440 × 900](screenshots/lf-02/import-1440.png)
- [Import decisions at 1920 × 1080](screenshots/lf-02/import-1920.png)

1. In Art Direction select a saved profile, inspect linter hints and the exact source texts. Open migration, correct categories/text, confirm and create a new revision; inspect original revision and hash-linked original archive.
2. Edit structured material/light/cluster rules, discard once, then save explicitly. Inspect rule-source details in Creator/Studio. Verify the existing Analyzer can still be used.
3. Review scope, export Style JSON and selected/all Expression families to a new directory. Confirm no character profiles, images, paths or personal performances occur in the JSON. A repeated filename must not overwrite.
4. In a second disposable project import each file, inspect full content/conflicts and make explicit new/update/skip choices. Cancel once and verify unchanged state. New copies of seeded families must get visible local aliases rather than overwrite their definitions.
5. Select an imported family/variant in Expressions, use it in Studio, save its prompt and inspect independent identity/outfit/style/performance sources. Do not generate for this acceptance test.
6. Close/reopen and verify portable definitions, old prompts/master links and original migration text are retained. Reimport identical data should be identified and default to skipped. Unsupported versions/malformed/unsafe JSON must leave the project unchanged.

## Limits

- Linux x64 only. Windows/macOS behavior, packaging/signing and other native Codex versions are not validated here.
- No semantic privacy guarantee for arbitrary author text, no guaranteed style transfer and no live image quality/fidelity test. Review remains explicit and human.
- JSON is text/hash metadata only. No ZIP/image bundling, image downloads, licensing verification or automated style extraction from outfit/identity references.
- Text/path guards and the linter are conservative heuristics, not perfect language understanding. A literal URL/path in prose is refused by the sharing format.
- A migration creates a new revision and keeps its source archive; it does not reconstruct historically missing revisions or assign archived personal rules automatically.
- Guided Mode, outfit/state systems, Motion, game export and local model integration remain separate roadmap phases. LF-03 was not started.
