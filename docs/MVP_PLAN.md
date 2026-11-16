# Laceframe — MVP implementation plan

**Status per developer report (2026-11-16):** Task 01, Task 02 Create and native Codex App Server ImageGen implemented. Quality pass reports a compact Create UI, monotonic timer, registered Before/After slider and 91 passed unit tests. See `docs/CODEX_02_UX_VALIDATION_2026-11-16.md`; this report is not a fresh rerun of tests.

**02E follow-up:** Character Creator / Photo-to-Master adds draft identities, explicit native master generation and manual Master V1 approval, preserving expressions/styles/masks. See `docs/CODEX_02E_VALIDATION.md` for actual current checks and limitations; the phase list below retains the original plan.

**Asset quality follow-up:** decoded alpha evidence, manual immutable cutout, reviewed Master V2, alpha-aware Pixel Lock V2, separate resolution derivatives and actual PNG exports are documented in `docs/ASSET_QUALITY_VALIDATION.md`. No separate 02F implementation was available at the checked baseline.

## Product decisions

- Standalone cross-platform app, not embedded in Ada Voss game.
- Electron + React + TypeScript + Vite; build for Windows/Linux/macOS, never Arch-specific.
- Dark Laceframe identity: Ink #141820, Slate #242D3A, Sage #8FADA6, Copper #D9A77E, Ivory #F0E5D3; Inter + JetBrains Mono.
- Offline projects; local PNG/WebP import; no uploads without user action.
- Profiles: **Portrait Artistic** (no forced snapping/downscale), **Sprite Strict** (grid/palette/anchors), later **Environment Artistic**.
- Unmodified approved master is source for EVERY new generated expression, not derived from other variants.
- Emotion, expression intensity, speaking/mouth pose, appearance and condition are separate dimensions.
- Human review required before an asset is considered approved.
- Never put original unreleased Ada Voss portraits into public git; user imports them locally.

## Initial app navigation

**Create** — import/generation provider; prompt, reference, image preview.
**Characters** — character library, master versions/lock.
**Expressions** — families, variants, intensity, prompts, editable masks, approval.
**Motion** — simple blink and mouth keyframes, preview timeline, frame duration.
**Inspect** — overlay/diff, non-destructive processing, approval.
**Atlas** — PNG/spritesheet/JSON export.
**Settings** — project paths, default export profiles, external providers.

**Current order:** Tasks 01/02 completed by report → integrate separate UX-quality PR → **Task 02B Art Direction / per-character expression performance** (`docs/CODEX_02B_ART_DIRECTION.md`) → **Task 03 Motion** (`docs/CODEX_03_MOTION.md`). Native Codex ImageGen and manual import both remain supported. Codex's built-in image allowance differs from the separate Sign in with ChatGPT plan-sharing route.

## Fastest usable vertical slice

1. Launch desktop app, create project, import an existing approved portrait.
2. Mark portrait as **Master V1** and lock it. Hash and copy it into project assets.
3. Select emotion family (Skeptisch/Besorgt/Wütend/Amüsiert), pick variant or create custom.
4. Import a candidate PNG for that expression (generation adapter may be added later); link candidate to exact master.
5. See side-by-side comparison + opacity overlay, optionally define facial edit mask, accept or reject.
6. Save approved variant and show it in expression library.
7. Build a **simple animation** by sequencing approved PNG frames (e.g. eye open/closed) at configurable frame durations, with transparent canvas and fixed registration. No automatic motion inference.
8. Play/stop preview at nearest-neighbor zoom and export PNG sequence + JSON timeline; optional sprite sheet.

Do **not** promise accurate automatic image generation, blink synthesis, lip-sync, face rigging, alpha extraction or character preservation from prompts alone. They are separate follow-up tasks.

## Phases and acceptance criteria

### Phase 0 — repository bootstrap
Electron Forge + Vite + React + TS, scripts, lint, typecheck, Vitest, secure IPC/preload; README and docs. Acceptance: clean `npm install`, `npm run start`, `npm run lint`, `npm run typecheck`, `npm test` on supported dev platform.

### Phase 1 — real offline portrait workflow
Project create/open, dragged local PNG/WebP, preview, immutable master, hashed copies, metadata on disk, character library, safe IPC and validation. Acceptance: import twice yields deterministic metadata; original never overwritten; reopen restores state.

### Phase 2 — expression designer
Seed families and editable variants (NOT hardcoded enum); variant presets include controlled anger and shouting. Link candidate to master, split/overlay view, status transitions. Acceptance: can add family/variant, import candidate, reject and approve, reopen, export with manifest.

### Phase 3 — Create / generation workflow (Codex 02)
Character master selection, expression/action picker, deterministic prompt composer, prompt copy, external browser access, manual result import, preview and one-click approval. Typed provider abstraction with accurate capability flags. Acceptance: complete usable Create-to-approved-expression loop offline; no fake Generate action.

### Phase 4 — Art Direction and Expression Identity (Codex 02B)
Versioned project-wide rendering profiles, individual character identities/outfit distinctions and optional personal emotion-performance overrides, without changing approved Ada assets. Preserve current compact UI, ImageGen, timer and registered comparison. See `docs/ART_DIRECTION_AND_EXPRESSION_IDENTITY.md`.

### Phase 5 — motion MVP (Codex 03)
Keyframe clip model where frames reference imported approved variants/frames. Duration per frame, optional looping and preview. Import eye blink frames manually first. Acceptance: play/pause at selected FPS, export exact ordered PNG + JSON, same canvas dimensions and anchors; never deform master.

### Native image generation — implemented
Native official local Codex App Server ImageGen with managed ChatGPT login has passed controlled live generation and reference editing tests on the user's Linux installation. Require capability checks, explicit user action and safe import. Other systems/accounts are not proven; no session scraping or undocumented endpoints.

### Phase 6 — advanced editing
Expression-specific masks and compositing, local Pixel Snapper only in Sprite Strict mode, optional mouth-layer sprites, animation atlases, automated consistency checks and platform packages.

## Definition of done for initial MVP
- Offline end-to-end demonstration on at least one OS with build scripts structured for all three.
- No login required for manual workflow.
- No pretend generation service.
- Can register Ada's existing four approved emotion images, each linked to master.
- Edit and persist additional family and variant (e.g. Wütend → Anbrüllen).
- At least one simple PNG-frame animation plays and exports.
- Project and source files remain unchanged and recoverable.
- Unit tests for schema, immutable master, filenames, status state machine, timeline export.
- Accessible controls, no color-only state, no hardcoded app paths.
