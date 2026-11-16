# Task 02 — Create workspace

Implemented on `feat/task-02-create-workspace`, continuing the existing Electron/React application. No worktree, second app, new runtime dependency or private portrait asset.

## Working vertical slice

- Image-first Create view: persisted character/family/variant selection, approved locked master, independent vocal action and optional intensity. Original-resolution previews, checkerboard, fit/native zoom, dimensions and mismatch warning; Inspect handoff.
- Deterministic reference-image/identity-lock prompt, editable working text, separate automatic base, supplementary instructions and explicit keep/reset when the selection changes.
- Real main-process clipboard and exact allowlisted external `https://chatgpt.com/` opening, on click only. Verified master reveal in the OS file manager; the user attaches the actual image in the browser.
- Real PNG/WebP result import through drop or native dialog; decode, size validation, immutable bytes and SHA-256 provenance. Reject retains the result; explicit replace creates a new attempt and keeps history. Existing approval API immediately makes the result available under Expressions.
- Immutable saved prompt revisions, attempts and linked results survive restart. Schema v1 reads do not write; first explicit save creates an exclusive byte-exact v1 backup before v2 migration. Conflicting backups and external changes fail safely.
- Narrow typed preload, validated sender/frame/input, no renderer file paths or unrestricted external network. The dev navigation exception allows only the exact trusted Vite entry URL to prevent the earlier startup black window; packaged navigation stays blocked.

## Official ChatGPT integration decision — checked 2026-11-16

1. **ChatGPT login implemented: no.** General official browser-based sign-in exists, but it cannot unlock the requested image feature on the documented plan route. The unavailable provider returns an explicit authentication status instead of opening an unusable login flow or retaining unnecessary credentials.
2. **Direct image generation/editing with ChatGPT Plus allowance: no.** The official [Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations) explicitly list image generation as unsupported, including the direct API and Codex app-server routes. Image *inputs* for compatible models do not establish image output/editing rights. This is the concrete blocker for edits using the master as a reference.
3. **Permissions/endpoints researched; none requested by Laceframe.** [Registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in) documents identity scopes `openid profile email` separately from plan scopes `offline_access resource.invoke chatgpt.tokens.use.direct`, PKCE and resource `https://api.openai.com/v1`. [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) documents `GET /v1/models` and `POST /v1/responses` using OAuth bearer tokens. These do not override the image-generation limitation or authorize using an Images endpoint with that token.
4. **Limits and cost:** no cookies, browser-session extraction, undocumented endpoints, OAuth credentials, API keys, automatic paid calls or retries. Laceframe cannot display account-specific allowance because it has no authorized plan connection. A user may generate externally in ChatGPT under that service's own availability and limits. The [Help Center](https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites) distinguishes sign-in from optional plan permission and possible explicitly allowed credits; it is not an image API permission.
5. **Missing for a fully in-app flow:** official plan-backed image-generation/edit support with reference images must become available. Then add the real browser OAuth flow, verified tokens and OS-protected credential storage, capability/model discovery, explicit submit/cancel/status handling and validated returned-image ingestion. No separately billed provider is enabled without a separate user decision.

The requested [Cookbook article](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt) was also reviewed. Its text-rewrite example demonstrates identity plus optional plan sharing; it does not demonstrate an image-capable permission.

## Provider behavior

`ImageGenerationProvider` declares `authenticate`, `getCapabilities`, `generateImage`, `editImage`, `cancelGeneration`, `getGenerationResult` plus validated manual prepare/import hooks. All binary paths stay internal to the main process.

- `manual-import`: no authentication needed, real result ingestion/retrieval; automatic generation/editing/cancellation explicitly fail because no generator runs.
- `chatgpt-plan`: shown as unavailable with a concrete reason. Image capabilities are false; authentication is unavailable; operations fail explicitly without network activity or fabricated jobs/results.

Only manual attempts can currently be saved. A future provider must deliberately extend the schema and dispatch rules, preserving validation rather than trusting an arbitrary renderer-supplied provider ID.

## Validation

Commands actually executed on Linux:

- `npm run typecheck` — passed.
- `npm run lint` — passed, zero warnings.
- `npm test` — passed, 50 tests across 2 files (27 existing and 23 Create/provider/migration tests).
- `npm run build` — passed, packaged Linux x64 application.
- `npm run test:desktop` — passed. Existing Master Lock, editable emotion library, PNG candidates, WebP master, sender/protocol restrictions and restart are covered alongside Create prompts, clipboard, browser URL rejection, real result drops, replacement history, approval/rejection, Inspect and small-window overflow checks. Screenshots in ignored `artifacts/`.
- `npm run start -- -- --remote-debugging-port=9232` and `npm run test:dev` — passed; verified first load before any test reload and exact-URL renderer navigation with the normal Chromium sandbox enabled. VA-API initialization warning was present while the UI rendered successfully.

Two initial desktop runs exposed an ambiguous test locator and a wrong fixture label. The second also exposed a real UI bug where an empty attempt matched a legacy asset with no attempt ID; that bug was fixed and is covered by the empty-result assertion. The final full desktop run passed. Unit tests use synthetic images and temporary projects. Desktop smoke substitutes only OS dialogs and external shell actions; IPC, clipboard, storage, image decoding, renderer and review are real. No live authentication or AI generation was tested or claimed.

## Remaining scope

- Windows/macOS execution, signing and installers remain unvalidated.
- No automatic identity preservation guarantee: approve only after comparing the actual images.
- Motion is Task 03; no animation synthesis or playback added here.
- Existing Task 01 packaging limitation (missing system `zip` for `npm run make`) is unchanged; the unpacked Linux application is the tested artifact.
