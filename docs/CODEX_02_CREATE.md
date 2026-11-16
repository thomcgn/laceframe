# Codex Task 02 — Create Workspace / Generation Workflow

> **Priority:** implement before Motion (now `docs/CODEX_03_MOTION.md`). This is a **real working image-generation preparation workflow** with manual import; not a claim that ChatGPT Plus provides an image-generation endpoint.
>
> **Read first:** `AGENTS.md`, `docs/MVP_PLAN.md`, `docs/CHARACTER_EXPRESSIONS.md`. Inspect the actual Task 01 source code and reuse the existing project, character, asset, IPC and approval architecture; do not scaffold a second app. Work on a single feature branch, no worktree, and open a PR. Do not rewrite existing user projects.

## Why

Current Task 01 forces users to go directly to Expressions and select PNGs. The intended UX is **Character master → expression preset → compose/edit character-locked prompt → generate/import image → inspect against master → approve as variant**. The first provider is manual import, keeping the UI usable immediately while avoiding unsafe or undocumented ChatGPT account automation. Build the UI so a future officially supported generation provider can return a real result into the same preview.

## Functional scope

### 1. Create workspace

- Add `Create` to left navigation; show a large two- or three-panel creative workspace consistent with Laceframe branding. Prioritize images, not long forms.
- Choose project, character and **approved immutable master version**; show its high-quality reference preview and metadata. Default to active character and latest approved master.
- Choose expression **family + editable variant**, optional intensity and vocal action. E.g. `angry / controlled / silent` and `angry / shouting / shouting`; **action is separate from emotion**.
- No hardcoded fixed four-state enum; use persisted families and variants from Task 01.
- Expandable advanced section for technical metadata/variant editing, keep primary path visually simple.
- Keep original canvas dimensions for `Portrait Artistic`; do not snap, quantize or downscale portrait.

### 2. Prompt composer

- Compose deterministic prompt from approved master identity lock + editing constraints + selected variant prompt + user supplementary instructions; always explicitly tell the user the model must use the *provided image* as reference, not simply a filename.
- Prompt is shown in editable multiline input; clearly distinguish auto-generated base text vs user's edits. Changes to options update prompt unless user has unsaved edits; offer explicit reset-to-preset and an understandable choice to retain edits (no silent data loss).
- Require master reference selection; if missing, disable appropriate actions with explanatory text.
- Provide working **Copy prompt** and **Open ChatGPT in external browser** (explicit user click). Do not scrape ChatGPT, inject cookies, automate web interface or present login as image generation.
- Store prompt revisions, selected variant, master ID+hash and generation attempt metadata in local project. Never overwrite a previous attempt or source image.

### 3. Provider boundary and capability model

Introduce a typed `ImageGenerationProvider` service abstraction with capability discovery, e.g.:

```ts
type GenerationCapability = {
  canGenerate: boolean;
  supportsReferenceImages: boolean;
  supportsEditingMasks: boolean;
};
type GenerationRequest = {
  projectId: string;
  characterId: string;
  masterId: string;
  masterSha256: string;
  variantId: string;
  action: 'silent' | 'speaking' | 'shouting';
  prompt: string;
  referenceAssetPath: string; // internal validated project reference only
};
type GenerationResult = {
  providerId: string;
  outputAssetPath: string;
  prompt: string;
  createdAt: string;
};
```

- Start with `manual-import` provider: its capability `canGenerate: false`, and it supports importing a returned image into the generation result slot.
- Expose "Generate" only when selected provider truly supports it; otherwise label user action "**Copy prompt & open ChatGPT**" and "**Import result**". Do not implement a fake AI-generated image.
- Plan a future provider that uses official, supported credentials/permissions and actual image-edit support; **do not** assume Sign in with ChatGPT/plan sharing supports image generation. Do not require API keys in this task.
- Renderer never accesses filesystem or external network directly outside the validated preload bridge; external URL open should be allowlisted (e.g. https://chatgpt.com/).

### 4. Result preview and approval

- User can drag PNG/WebP into dropzone or choose a file; show actual preview with alpha checkerboard, dimensions and zoom.
- Link each imported candidate to exact master, variant, prompt revision, providerId and timestamp; maintain provenance. No overwrites of original or previously imported assets.
- Show **Master / Candidate** side-by-side and optional difference/opacity overlay (reuse Inspect if possible); handle mismatched dimensions by warning rather than silently resizing.
- Actions: **Discard candidate** (do not delete original user files), **Replace candidate** with explicit warning (keep prior attempt in history), **Send to Inspect** or **Approve for expression** using existing Task 01 approval API.
- Approved candidate immediately appears in Expressions for active character and chosen variant, and persists after app restart. Avoid re-entering all variant information during import.
- Clear statuses: not generated, awaiting image import, candidate, approved, rejected, with accessible text/icon indicators.

### 5. Robust UX / constraints

- Provide status, actionable error messages, loading/progress only for actual operations.
- Working keyboard navigation and visible focus; small-window responsive layout; no horizontal overflow.
- No new dependency on Docker, Python, GPU, internet connection, ChatGPT auth or paid API.
- Import images only on explicit user action; do not publish Ada Voss master assets in public repository.
- Respect Electron security defaults `contextIsolation: true`, `nodeIntegration: false`, validated IPC; sanitize file names and ensure no path traversal or arbitrary URL opening.
- Keep cross-platform path semantics; no Linux-only dependencies in runtime code.

## Architecture direction

Prefer adapting existing Task 01 services rather than creating duplicate state:

```
src/renderer/views/CreateView.tsx
src/renderer/components/PromptComposer.tsx
src/renderer/components/MasterCandidateCompare.tsx
src/shared/generation.ts
src/main/services/generationAttempts.ts
src/main/services/providers/manualImport.ts
```

Paths are suggestions, not required exact existing structure. Keep generation attempts as versioned project data and migrate old project schema safely.

## Acceptance walkthrough

1. Launch app via `npm run start`, open an existing Ada Voss project.
2. Navigate to **Create**, select the approved neutral Master V1; preview is correct.
3. Select **Amüsiert → half-smile**. Composer includes master lock + exact variant prompt.
4. Edit supplementary instruction, copy prompt, open ChatGPT in normal external browser.
5. Import the resulting user-supplied image through the result dropzone; project stores immutable copy and provenance.
6. Compare source and candidate, approve; the image appears under Expressions without redundant form entry.
7. Switch to **Wütend → Anbrüllen**, with vocal action **shouting**. Prompt changes appropriately; previous attempt remains saved.
8. Restart app; character, attempts, prompts, approval status and imported image persist.
9. In offline/manual mode, there is **no enabled fake Generate button**. The UI explicitly labels manual mode and explains the current limitation.

## Tests / required validation

- Unit tests: template composition, master/variant/action separation, user edits and reset, variant changes, provider capabilities, attempt persistence and master provenance.
- Integration tests: secure asset import, candidate approval via existing service, reload, duplicate image import, invalid file, mismatched image dimensions, invalid external URL, rejected assets.
- Run `npm run lint`, `npm run typecheck`, `npm test`; run available desktop smoke tests. Report exact results (don't claim checks you did not run).

## Non-goals

- No direct ChatGPT Plus image generation until an officially supported image-capable integration is verified.
- No API-key billing integration in this milestone, no mock network AI endpoint.
- No animations/transitions yet: handled in `docs/CODEX_03_MOTION.md`.
- No full pixel-art engine, no forced portrait pixel snapping.

**Done = user can complete the whole Create → Prompt → external generation → import → compare → approve loop without digging through Expression forms.**
