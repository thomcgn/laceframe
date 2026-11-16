# Codex Task 02B — Art Direction and Individual Expression Identity

Read `AGENTS.md`, `docs/MVP_PLAN.md`, `docs/CHARACTER_EXPRESSIONS.md` and **`docs/ART_DIRECTION_AND_EXPRESSION_IDENTITY.md`** before changing code.

## Goal

Create a reusable style layer for the game's look and per-character emotional performance overrides. Two people can share an art style yet wear different clothing and express the same named emotion differently.

## Starting point and branch safety

- Check current working tree and active feature branch first. The user has a working **native Codex App Server ImageGen** integration on `feat/task-02-create-workspace`, plus a possibly ongoing compact UI / comparison slider change.
- **Do not reset, overwrite or rebase away in-progress work.** Avoid worktrees. If the UI pass is running, sequence this task after it is completed/merged. Work from latest integrated code on a new feature branch and PR.
- Inspect actual source code and current schema before migration. Documentation on main can lag behind local feature code.
- No generated Ada Voss portraits or personal photos in public git.

## Deliverable A — project-wide style profiles

- Persist versioned `ArtDirectionProfile` (name, rendering rules, lighting, color treatment, composition, hashes/IDs of local style reference assets).
- A project-level default style; optional character override only when explicitly chosen.
- Character-specific appearance, hair, gender presentation, accessories and outfits NEVER enter shared style rules automatically.
- Local style reference import: store immutable hashed copy with safe path checks, support multiple references; do not treat Ada source as Peter's identity.
- UI: edit/create/select style, view actual style ref thumbnails. Start with text rules and optional image references; no automatic style extraction promised.

## Deliverable B — per-character expression performance

- Keep existing shared emotion families/variant IDs.
- Add optional `ExpressionPerformanceOverride` keyed by (characterId, variantId), with editable personal direction and optional notes.
- Effective expression direction = **character override if present**, else shared variant prompt.
- When switching characters, ensure dropdowns/editors load correct personal override without overwriting other characters' data.
- Allow examples: Ada angry controlled vs Peter angry controlled. Shouting remains independent vocal action. Do not duplicate entire variant family per character.
- Existing expressions stay approved and existing attempts preserve exact prompts.

## Deliverable C — generation integration

- Extend deterministic prompt composer with distinct labeled STYLE LOCK, CHARACTER LOCK, optional OUTFIT LOCK, EXPRESSION, PERFORMANCE and ACTION.
- Current Codex-native provider remains functional: its approved master is always sent as an identity reference. An additional style reference is only added when the installed official App Server protocol supports it; verify capability first, or use text style rules and disclose that no extra image reference was sent.
- Do not send identity-only Ada portrait as a 'copy her face/clothes' instruction to the second character. Include explicit no-identity-transfer rule.
- New attempts store selected art direction profile id/revision and resolved performance prompt snapshot; old attempts remain readable unchanged.

## Deliverable D — backward compatibility and UX

- Migrate old projects safely and idempotently with backup on first write. Do not modify existing PNG/WebP bytes, SHA-256 hashes or review states.
- Compact UI: project style selection under settings/character profile, expression-specific personal notes in an accordion, resolved prompt preview in Create.
- Keep controls keyboard-accessible and working (no mock buttons).
- Do not introduce unrelated animation/gesture generation; gestures such as hands grabbing hair are a separate future feature.

## Verification

- Run lint/typecheck/unit tests and existing native + desktop smoke tests where possible.
- Add targeted regression tests: existing Ada project migration, same style across two distinct characters, independent angry expression directions, non-overwrite, provider prompt/provenance, persisted revisions and malformed references.
- Manual walkthrough: Ada master + Peter master, same selected style, different anger profile; generate one test per character **only upon explicit user action** (do not spend Codex image allowance in unattended automated tests).
- PR must report exactly what passed, what was not tested and any current provider limitation.

## Not in scope

- No automatic real-photo→master conversion wizard yet.
- No new pose/gesture editor, masks or pixel-lock implementation in this task.
- No overhaul of Electron toolchain.
- No fabricated progress percentage or generated results.

**Definition of Done:** new project-level art direction can be assigned to multiple characters while each retains its own identity and expression performance; Create prompt reliably reflects both; pre-existing Ada files and approvals are preserved.
