# Laceframe — Codex working instructions

Read `docs/MVP_PLAN.md` and `docs/CHARACTER_EXPRESSIONS.md` before editing. The project starts as an **independent cross-platform Electron desktop app** using React, TypeScript and Vite.

## Non-negotiables
- Implement working vertical slices; no empty decorative buttons or fake AI generations.
- Never redesign Ada Voss master; no character portraits are committed to this public repository.
- Keep image inputs immutable. Candidates and exports use new paths and SHA-256 provenance.
- Character profiles are extensible; expression families and variants are data, NOT a closed enum.
- Keep emotion separate from vocal action / animation / appearance.
- Portrait Artistic retains image resolution/style. No enforced 64x64 conversion.
- Renderer: `contextIsolation: true`, `nodeIntegration: false`; file I/O restricted to validated typed preload IPC. Prevent traversal and unsafe protocols.
- Never place secrets in frontend storage, git or logs.
- Do not scrape ChatGPT or re-use browser cookies. Generation integration is feature-gated until official supported auth+image usage is verified.
- Reproducible builds, type safety, targeted unit tests, no heavyweight unnecessary dependencies.
- Avoid introducing unnecessary background server / database / Docker for this offline app.
- Always validate on Linux as the immediate dev platform; keep Windows/macOS paths portable.
- Do not bypass PR review workflow; use feature branches and PRs, never commit directly to main.
- Before saying done, report commands actually run, passed/failed tests, what is implemented vs mocked.

## UX
Dark, calm and responsive. Laceframe colors: Ink #141820, Slate #242D3A, Sage #8FADA6, Copper #D9A77E, Ivory #F0E5D3. Clearly communicate import, candidate, approved and rejected states.

## Current target
Task 01 and Task 02 (including live native Codex ImageGen) are implemented per developer report. The 2026-11-16 quality pass reports 91 passing tests, monotonic timing, compact Create UI and registered comparison; see `docs/CODEX_02_UX_VALIDATION_2026-11-16.md`. Verify the quality-pass PR is integrated before Task 02B. Preserve the working provider, timer/status, sticky controls, image registration, overlay and project compatibility. Next Task 02B Art Direction / Expression Identity; then Task 03 Motion.

## Additive roadmap: Art Direction / Expression Identity

After the current Create workspace / compact UX work is integrated, implement `docs/CODEX_02B_ART_DIRECTION.md` using `docs/ART_DIRECTION_AND_EXPRESSION_IDENTITY.md`. Preserve approved masters and image-generation support from the live feature branch. Art style is project-level; character identity, outfit and personal emotion behavior are independent. Per-character overrides must never overwrite shared emotion definitions or another character's settings. Do not attempt the full photo-to-master wizard until this layer is stable.

## Risk-based testing (LF-00)

- During implementation, start with the affected unit tests, targeted lint and typecheck; then use `npm run check:fast`. Do not repeatedly package Electron or run unrelated full desktop suites for small changes.
- Before a PR, run FAST and `npm run classify:changes`. For MEDIUM run `npm run check:targeted` where desktop execution is available; HIGH requires FULL. TARGETED automatically escalates HIGH and offers no skip/level/group override. FAST alone is a development component, not a complete HIGH-risk certificate.
- `npm run check:full` includes every unit and both complete desktop commands. All existing assertions remain mandatory. After a failure, diagnose and rerun the affected tests; do not repeatedly rerun the whole suite to obtain a green log.
- Run memory-intensive local profiles sequentially. Reuse packaged artifacts only when the input fingerprint, platform/Node and actual executable/app.asar hashes match; do not mark stale builds as verified.
- After opening the PR, inspect its actual GitHub Actions results, fix failures and check the required `quality-gate`. Distinguish local evidence, fixture-backed native jobs and actual CI execution. No live generation or private-project fixtures.
- GitHub Actions is authoritative for complete pre-merge regression when available. If CI is unavailable, perform the required complete coverage locally and report failures/limitations explicitly. Do not merge PRs or change branch-protection rules automatically.
- See `docs/TEST_STRATEGY.md` for exact mappings, measurements, profile scope and one-time branch-protection setup. Do not start the next product roadmap phase without its required merge and explicit user release.
