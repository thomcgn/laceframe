# Native Codex ImageGen — implementation and validation

Date: 2026-11-16. Existing branch `feat/task-02-create-workspace`; no worktree, main commit or new application/runtime dependency.

## Implemented behavior

`CodexImageGenerationProvider` starts the installed `codex app-server --listen stdio://` as a child process in a temporary job directory. It uses the existing managed Codex ChatGPT login, selects the built-in OpenAI provider and removes API-key environment variables. Laceframe never reads/copies tokens or cookies, implements OAuth itself, or calls an HTTP generation endpoint.

Every image operation performs `initialize` → `initialized` → `account/read` (`refreshToken:false`) → `experimentalFeature/list`. Account type must be `chatgpt`; `image_generation` must be enabled. Otherwise no `turn/start` is sent. A separately invoked availability check runs the same preflight without an image turn. The default model comes from `model/list`.

An explicit **Mit Masterreferenz generieren** click saves a new immutable attempt and full prompt revision, creates an ephemeral thread and passes the actual approved master through the documented `localImage` input to `turn/start`. The full working Character-Lock prompt and structured emotion/variant/vocal-action context are supplied together. The reference is a SHA-256-verified read-only temporary copy; the project original is never used as a writable target. No portrait downscale or 64×64 conversion.

A completed `imageGeneration` item must contain a `savedPath` and no failure, followed by a successfully completed turn. The path must be an absolute normalized PNG/WebP directly under `$CODEX_HOME/generated_images/<this-thread-id>/`; traversal, other threads, URLs, symlinks, non-files and oversized/invalid images fail. Bounded bytes are checked again before existing project staging, native decoding, content-addressed copying and candidate creation. Provenance links the result to the exact attempt, prompt revision, master ID/hash, variant and action. Approve/reject and Expressions use the existing workflow.

Only one image job can run. Main-process IPC rejects project changes while it owns the project; the UI disables project controls and provides **Generierung abbrechen** outside the disabled fieldset. Interrupt/termination, timeout, protocol/process failures, missing image results and attempted tool retries produce honest failure/cancel status; no request is automatically resubmitted by Laceframe. A final atomic import already in progress is allowed to finish instead of falsely reporting a completed import as cancelled. App quit waits for shutdown. Temporary reference files are removed; Codex's generated originals remain untouched.

The child runs with read-only agent sandbox, shell execution, apps, hooks and multi-agent features disabled. It is instructed to use only the built-in image tool once; interactive tool requests are rejected and unexpected command/file/MCP/agent activity aborts the job. No raw child diagnostics, model reasoning, account email, tokens or returned filesystem paths are forwarded to the renderer. Preload adds only typed check/start/status/cancel operations with existing trusted sender/frame and input checks.

## Exactly one controlled live reference edit

The existing isolated probe was adapted once to add the official `localImage` input. No private character portrait was used. Source: the previously generated green sprout in an orange terracotta pot on black. Instruction: change **only the pot to blue**, preserve plant/framing/style/background/canvas, use built-in ImageGen once, save separately. No API-key fallback or shell drawing/resizing.

- Existing account: managed `chatgpt`, plan `plus`; installed CLI `0.162.0-alpha.17.2`.
- Live turn completed successfully with `imageGeneration.status=completed`, `failure=null` and a distinct `savedPath`.
- Source SHA-256 before/after: `9b8a0d12d9721a07114bdf9c91f5c4166418cc113fcdf1510d5ef777cb22b52d` — unchanged.
- Result SHA-256: `f3d9626603aabec75eb082715400f2b4a5f5dd66c87e57f855862b67dc2bfe59`.
- Source and actual result: **1254×1254 PNG**. No resizing.
- Visual inspection confirms the blue pot and retained sprout/composition/style. This establishes **reference-supported editing works in this installation**. It does not establish pixel-exact preservation outside an edit mask or character identity fidelity on Ada Voss.
- Prompt, protocol metadata and copied result are outside git under `/tmp/laceframe-imagegen-probe-6odv_k07/reference-prompt.txt`, `reference-result.json`, `reference-blue-pot.png`. Original saved by Codex under its generated-images directory. No artwork was committed.

The production provider's real `check()` was also executed with the installed CLI after implementation (using a temporary pinned TS runner); it returned **ready** with the existing ChatGPT login and ImageGen active. It made no image request. No second live reference edit or paid API call was made.

## Automated validation

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm test` — passed: **78 tests in 3 files**, including 28 native-provider/process/path/controller tests and all 50 existing tests.
- `npm run build` — passed, packaged Linux x64 application.
- `npm run test:desktop` — passed: existing Master Lock, manual Create, emotion library, image drops, review, provenance, secure IPC/preload and close/relaunch/reopen.
- `npm run start -- -- --remote-debugging-port=9232` and `npm run test:dev` — passed: first-load React/preload and exact-URL dev navigation; normal sandbox enabled.
- `npm run test:desktop:native` — passed: packaged UI selects native provider, starts the actual process/protocol client, imports/approves the candidate, handles failed generation and cancellation, prevents project changes during a job, and disables image submission when not signed in.

The native test server under `tests/support/` is an explicitly labelled deterministic protocol double, injected through the smoke test's temporary PATH only. It supplies synthetic PNGs for reproducible success/error tests; it is never selected by production code or used as a fallback. The real live reference test is distinct from these fixture tests. The native UI smoke initially had a setup race (drop before character creation completed); the test now waits for the character heading. Four initial unit assertions incorrectly assumed a SIGTERM handler always ran before normal stdin EOF exit; the lifecycle fixture now records actual exit. Final results above refer to corrected runs.

Unit coverage includes missing executable, unauthenticated/API-key account rejection before turn start, disabled feature, RPC/process/protocol failure, image/turn failure, missing/multiple results, timeout/retry rejection, cancellation/concurrency, native result provenance and approval/reopen, invalid/traversing/outside/wrong-thread/symlinked/non-image paths. No tokens or unrestricted filesystem interfaces were added to preload.

## Limits

- Tested on Linux with this installed Alpha CLI. Other CLI versions/accounts may lack the feature or compatible protocol; runtime checks fail closed. Windows/macOS execution and packaging remain unvalidated. The CLI must be on the app's PATH; installation/sign-in remain in the official Codex CLI (`codex login`). Laceframe does not install or log in automatically.
- Native image usage consumes Codex allowance; the app does not promise unlimited/free usage or inspect billing. No separately billed API-key provider is implemented.
- Laceframe sends one image turn and requests one image operation, with no application retry loop; it stops on reported retry/error events. Internal transport behavior of the installed official CLI is outside Laceframe's implementation.
- Current job progress/failure status is in memory. Saved attempts, immutable prompts and imported/reviewed candidates persist; a failed or cancelled attempt has no fabricated result. No pending job resumes or retries on restart.
- No masks/compositing or pixel-lock guarantee. Mismatched result dimensions are warned about, preserved and left for manual review.
- The native Codex login route differs from the separate Sign-in-with-ChatGPT/Responses plan route. Local integration success does not authorize a commercial/hosted relay; follow the official App Server usage limits.

## Official documentation checked

- [App Server](https://learn.chatgpt.com/docs/app-server): stdio protocol, lifecycle, auth modes, local image input and versioned schema export.
- [Image generation](https://learn.chatgpt.com/docs/image-generation): built-in skill, references and Codex allowance.
- [Advanced configuration](https://learn.chatgpt.com/docs/config-file/config-advanced): provider configuration and boundaries. Laceframe does not invent an image HTTP endpoint or register a custom provider to bypass native account restrictions.
