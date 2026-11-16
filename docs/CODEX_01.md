# Codex Task 01 — Bootstrap + first real portrait workflow

## Task
Implement **the first playable/usable vertical slice** for Laceframe from `docs/MVP_PLAN.md` and `docs/CHARACTER_EXPRESSIONS.md`.

The repository is a new Electron project; do not assume prior implementation. Work in a **feature branch** and open a PR to `main`. Do not create worktrees or a second environment.

### Scope — must implement
1. Electron Forge + Vite + React + TypeScript; Linux dev launch; cross-platform path handling; package scripts for start/build/lint/typecheck/test.
2. Secure preload/context-isolated IPC with explicit validated operations, no general Node access in renderer.
3. Professional, calm dark Laceframe shell with navigation: Characters, Expressions, Motion, Inspect. Avoid fake links/buttons.
4. Create/open local project (project directory chosen with system dialog), persist versioned manifest and content-addressed original asset copies safely.
5. Drag/drop PNG/WebP from desktop, inspect real dimensions, preview checkerboard/transparency and zoom, import as **approved immutable master v1** only after user confirmation.
6. Character profile create/name and selected master; project reopen restores state.
7. Expression family/variant editor with predefined data (skeptical/concerned/angry/amused); user can add custom family and variants; `angry.shouting` exists.
8. Import candidate expression PNG, record relationship to selected master, present master/candidate side-by-side, approve/reject, persist result.
9. Tests covering schema validation, source file immutability, persistence/reload, variant editing, path safety and approval states.

### Scope — explicitly deferred
No paid API integration, no fake 'ChatGPT logged in' status, no automatic character generation, no blink/lip-sync synthesis, no Pixel Snapper yet, no forced portrait resampling. Motion UI can show a clearly identified 'coming in task 02' message; **do not** make inert player controls.

### Technical architecture
```
src/
  main/          # Electron lifecycle, dialogs, project/filesystem services, secure IPC
  preload/       # narrow typed bridge
  renderer/      # React UI, views, styles
  shared/        # domain schemas/types, pure validators
  engine/        # optional pure image ops; avoid native modules unless needed
tests/
docs/
```

Prefer simple validated JSON on disk with atomic writes and content-addressed binary originals. SQLite is NOT required for first slice. Use a safe file URI for preview or IPC-controlled bytes; disallow arbitrary file exposure.

### Done means
- Start via documented scripts, import the user-supplied portrait, name Ada Voss, lock it, add `angry / shouting` preset and import a test candidate, approve it, close/relaunch app and see persistent assets.
- Original user files never overwritten and no user assets tracked in git.
- Commands/outputs for lint, typecheck and tests included in PR description.
- Small focused commits; no giant speculative architecture.
- At completion, propose Task 02 (Motion: manually loaded blink/mouth frames, timeline, play/pause, JSON+PNG exports).

Do not claim ChatGPT Plus grants direct image-generation API access. Official sign-in capabilities must be separately verified before provider integration.
