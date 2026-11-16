# Laceframe — MVP implementation plan

**Status:** approved planning baseline, not implemented. **Goal:** a usable offline portrait/expression/animation desktop studio first; generative AI added behind a replaceable provider once its officially supported capabilities are verified.

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

MVP prioritizes Characters / Expressions / Motion / Inspect / export. Create supports *manual image import* immediately. Do not mock a working ChatGPT login.

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

### Phase 3 — motion MVP
Keyframe clip model where frames reference imported approved variants/frames. Duration per frame, optional looping and preview. Import eye blink frames manually first. Acceptance: play/pause at selected FPS, export exact ordered PNG + JSON, same canvas dimensions and anchors; never deform master.

### Phase 4 — image generation integration
Provider interface, prompt composer, reference/master selection, preview candidate, non-destructive accept to pipeline. Official Sign in with ChatGPT is *a possible integration only for eligible supported image capabilities*. Sign-in alone is NOT image API authorization; do not implement undocumented endpoints/session scraping. Keep manual import fully functional regardless.

### Phase 5 — advanced editing
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
