# LF-00 — Risk-based quality checks

Date: 2026-11-17. Implemented on `feat/lf-00-risk-based-ci`, based on merged LF-02 (`240757f`, PR #24). No worktree, main commit, private project or live ImageGen request. Existing smoke scripts and assertions remain unchanged. The user's untracked `.vscode/settings.json` is excluded from the PR.

## Commands and scope

| Command | Actual scope | Desktop requirement |
| --- | --- | --- |
| `npm run classify:changes` | Read-only Git diff, risk, reasons and groups as JSON | None |
| `npm run check:fast` | Typecheck, zero-warning lint, **all** Vitest tests (two workers), committed/working/index diff whitespace checks | None; tested with DISPLAY and WAYLAND_DISPLAY removed |
| `npm run check:targeted` | Required existing integration groups, deduplicated; package once if necessary | Linux desktop/Xvfb when a group needs it |
| `npm run check:full` | FAST, packaging, entire `test:desktop`, entire `test:desktop:native`, sequentially | Linux desktop/Xvfb |

FAST is an explicit development component even on HIGH changes; it does not certify a HIGH change. CI always includes FAST, then TARGETED for MEDIUM or FULL for HIGH. FULL includes FAST once. TARGETED automatically escalates HIGH to FULL. There are no `--skip`, level or group override arguments. `QUALITY_RISK_FLOOR`, supplied by CI, can only elevate risk; invalid values fail. A LOW TARGETED run has no desktop work, which is reported as **not required**, never as a passed desktop test.

The runner records actual commands, monotonic durations, exit codes, effective risk/profile, packaging built/reused/not-required and passed/failed status under ignored `artifacts/quality/`. A failed subprocess stops the profile. SIGINT/SIGTERM is forwarded to the owned process group and cannot produce a passing report. Commands have a 20-minute limit; CI checks have a 45-minute limit. No application ImageGen request or secret is needed by these checks.

## Deterministic risk policy

`quality-classifier.cjs` reads actual commits and file changes. Local runs compare the merge base of `origin/main` and HEAD, plus staged/unstaged/untracked nonignored files. PR runs use actual base/head SHAs from the event; pushes use before/after. Manual dispatch forces HIGH/FULL. Renames are evaluated as delete plus add. NUL-delimited paths preserve spaces/newlines. Invalid commits, malformed/unmerged statuses or Git errors fail with no FAST fallback. Fetch remote refs before local classification.

Highest risk wins; labels, branch names, titles and commit messages cannot reduce it.

| Risk | Paths/reason | Required checks |
| --- | --- | --- |
| LOW | Markdown outside critical directories, renderer CSS, documentation pictures, renderer icons, LICENSE | FAST |
| MEDIUM | Recognized renderer React `.tsx` components/state/navigation | FAST + selected integration groups |
| HIGH | Main/preload/shared, renderer workers and known mask/alpha/relighting processing components | FULL: security, persistence and image invariants |
| HIGH | Test/scripts/CI changes, dependencies/locks/build configuration | FULL: changes to the validation or build trust boundary |
| HIGH | Any unknown/ambiguous productive path | FULL, fail closed |

Critical-directory matching precedes Markdown/asset rules. Unknown `.ts` logic and documentation JSON are conservative HIGH. Generic React components select **all** integration groups rather than guessing a narrow dependency graph. CSS-only changes intentionally get no desktop verification; visual review remains necessary.

| Group | Existing scripts (deduplicated) |
| --- | --- |
| Character Creator | `creator-smoke.cjs` |
| Expressions/Studio | `desktop-smoke.cjs`, `expression-designer-smoke.cjs`, `native-smoke.cjs`, `packs-smoke.cjs` |
| Art Direction/Style Intelligence | `style-analysis-smoke.cjs`, `native-smoke.cjs`, `packs-smoke.cjs` |
| Asset Quality/Cutout | `quality-smoke.cjs`, `smart-cutout-smoke.cjs`, `cutout-stability-smoke.cjs`, `native-smoke.cjs` |
| Relighting | `relighting-smoke.cjs`, `cutout-stability-smoke.cjs` |
| Native Provider/Generation | `native-smoke.cjs`, `creator-smoke.cjs` |
| Persistence/Migration | All eight ordinary and two native smoke scripts |

CharacterCreator selects Creator+Native; ExpressionDesigner selects Expressions; CreateView selects Expressions+Native; StyleLibrary/StyleAnalyzer/StyleComparison select Art Direction; MasterApproval/MasterHistory/AssetLibrary select Creator+Expressions. Other React paths select all groups. Actual mask/relighting processing paths are HIGH before these mappings apply. Pack integration is included when its script exists; an inventory unit test checks coverage against the current package commands.

## Build dependencies and reuse

Existing desktop scripts consume `out/Laceframe-linux-x64/laceframe`; they do not each package the app. Packaging is therefore needed once before desktop execution, not once per group. FAST does not inspect/start Electron or invoke a packager. FULL never omits the two existing aggregate desktop commands.

A local proof under `out/.quality-build.json` records SHA-256 of Git-visible runtime/build inputs, source/configuration/lock files, installed dependency lock, package metadata, platform/architecture/exact Node version and the **actual executable and app.asar**. Scripts are conservatively included. Docs, tests, CI, `.vscode`, generated/ignored files and test/check-only package script entries are excluded from runtime inputs. Existing Forge/Vite packaging was inspected: the application ASAR contains `.vite` and pruned package metadata; scripts/tests are not bundled. Missing/changed inputs or output hashes invalidate reuse; missing/symlinked/invalid proof/output files cannot qualify. Deleted Git-visible inputs affect the fingerprint. Ignored artwork/projects are not scanned.

Only byte-verified unchanged local artifacts are reused. CI caches npm downloads only, not Electron build outputs across PRs. This is not a reproducible-build proof or protection against someone intentionally forging a local stamp. The first CI checkout builds afresh. Dependency mutation outside lockfiles is unsupported; run `npm ci` after dependency changes.

## Actual baseline measurements

Measured sequentially on Arch Linux x64, Node 26.13.0, npm 12.2.1; existing desktop `DISPLAY=:1`. Baseline SHA **ee6348f (LF-01)**, 300 tests/17 files, seven ordinary plus two native suites. No estimates or minimum-of-retry selection. Raw logs/JSON live outside Git at `/tmp/laceframe-lf00-measurements/`.

| Command | Wall seconds | Exit code | Maximum individual descendant RSS (KiB) |
| --- | ---: | ---: | ---: |
| `npm run typecheck` | 7.138 | 0 | Not measured |
| `npm run lint` | 3.798 | 0 | Not measured |
| `npm test` | 7.398 | 0 | Not measured |
| `npm run build` | 6.112 | 0 | 448236 |
| `npm run test:desktop` | 199.634 | 0 | 411276 |
| `npm run test:desktop:native` | 57.815 | 0 | 295096 |

RSS is Linux `getrusage(RUSAGE_CHILDREN).ru_maxrss`, captured with a fresh measuring process per command: the largest individual descendant high-water mark, **not the simultaneous total memory of the process tree**. No reliable aggregate peak is claimed. The first interrupted measurement session is recorded separately and not counted as a pass; the table contains the subsequent completed baseline runs. Earlier same-SHA complete typecheck/lint/unit observations were retained.

### New profiles and actual validation

The actual headless FAST command completed in **26.496 s**, exit 0, with 386 tests/19 files at that checkpoint (59 new routing tests). Maximum individual descendant RSS: 500424 KiB. One additional floor-elevation test was added afterwards; the final FULL unit step contains 387 tests/19 files.

The routing suite exercises actual committed/staged/unstaged/untracked diffs and PR/push/manual event SHAs in temporary synthetic Git repositories, malformed Git errors, risk mixtures, HIGH escalation, trusted risk floors, cache invalidation, stable failure gates and script inventory. The real `npm run check:targeted` entrypoint also runs against an explicitly labelled synthetic orchestration fixture with an actual MEDIUM diff: exactly one fixture build and only the selected fixture smoke commands. This is not counted as an Electron application run.

`npm run check:full` completed in **305.386 s**, exit **0**. Maximum individual descendant RSS: **507908 KiB**. Typecheck, lint, **387 tests/19 files** (327 existing + 60 LF-00), a fresh Linux package, all **eight ordinary** and **two native** smoke scripts passed in one aggregate run. No retries or application test/assertion changes were needed.

| FULL step | Wall seconds | Exit |
| --- | ---: | ---: |
| Typecheck | 7.537 | 0 |
| Lint | 4.275 | 0 |
| All units, two workers | 14.500 | 0 |
| Git diff + index checks | 0.009 | 0 |
| Fresh Electron build | 6.288 | 0 |
| Complete desktop command | 213.049 | 0 |
| Complete native desktop command | 58.545 | 0 |

Actual `npm run classify:changes` returned HIGH/all groups for this infrastructure change. A subsequent read-only `reusableBuild()` check returned true for the exact newly packaged bytes; the full runner itself built once and did not reuse the stale LF-01 baseline. Workflow syntax and `git diff --check` passed. Hosted CI has not run at this pre-PR checkpoint; its actual run/conclusion will be recorded in the PR description after submission. The post-change base includes merged LF-02's 27 additional tests and pack smoke, plus LF-00 tests. These are different workloads; do not interpret before/after durations as a controlled speedup benchmark. The savings come from omitting packaging/desktop for LOW and deduplicating affected integration groups, rather than weakening existing tests.

## GitHub Actions

`quality.yml` runs on PRs to main, pushes to main, and manual FULL dispatch. It uses Ubuntu 24.04, Node 24, `npm ci`, npm cache, official actions pinned to immutable SHAs, read-only contents permission and concurrency cancellation of superseded runs. Desktop dependencies/Xvfb/Openbox/D-Bus are installed only when required. Desktop suites run sequentially on an isolated virtual display. Ubuntu's runner-only user-namespace setting is adjusted so Chromium's sandbox remains enabled; `--no-sandbox` is not used. No models or live provider credentials are installed. Synthetic diagnostics/profile reports are uploaded for seven days.

The classifier is extracted from the actual **base commit** into RUNNER_TEMP, so a PR cannot edit its own policy to select LOW. For the first rollout, when the validated base commit has no classifier, or for an initial push, FULL is mandatory. Missing/invalid base commits are errors, not a reduced bootstrap. The current-head runner can elevate the trusted base risk but cannot lower it.

The always-running `quality-gate` needs successful classification and successful required checks, plus an explicit validated profile of adequate strength. Failed, cancelled, skipped, missing or weaker results fail. A non-required desktop job is not manufactured as success. A deliberately malicious workflow/runner edit still requires human review and protected rules; the status check is not a sandbox against arbitrary code in a PR.

Workflow syntax was validated locally with checksum-verified **actionlint 1.7.12**, exit 0. ShellCheck is not installed locally and was disabled for that command; no ShellCheck success is claimed. Workflow-dispatch routing is exercised using actual Git event fixture payloads. A real GitHub manual dispatch can be tested after the workflow reaches the default branch; it is not claimed as a completed hosted test here.

Official references: [GitHub required status checks](https://docs.github.com/en/enterprise-cloud@latest/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks) explains `needs`/`always()` and skipped checks; [Playwright CI](https://playwright.dev/docs/ci) covers system dependencies and Linux/Xvfb. Manual dispatch is additional regression, not a substitute for the PR-triggered required status.

## One-time branch protection (repository owner)

After the first successful workflow appears, configure a main ruleset/branch protection in GitHub:

1. Require a pull request before merging into main.
2. Require the **`quality-gate`** status check from GitHub Actions, selecting the observed check name.
3. Require it to succeed before merge (and require an up-to-date branch if desired); prevent bypass/direct pushes as appropriate for the repository.

**No repository rule or branch protection was changed automatically.** Adding the workflow alone does not make its check mandatory. GitHub plan/repository settings may limit available rules. Main pushes still run regression but cannot retroactively block an already accepted push.

## Boundaries

Linux is the validated platform; Windows/macOS packaging and GUI input remain outside this CI matrix. TARGETED's orchestration tests use explicitly labelled synthetic command fixtures and spy executors; they prove routing/failure behavior, not that fixture commands validate the application. Native application smoke tests use the existing deterministic protocol double and never live ImageGen. All full real application test results must be listed separately from these orchestration fixtures. No product-phase work beyond LF-02 is included.
