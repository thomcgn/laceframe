# UX-01 navigation and responsibilities

Baseline inspected before implementation: merged PR #12 (`04ce37f`) plus cutout fix PR #13 (now also merged) (`d5fcb33`). Branch `feat/ux-01-studio-workflow` was created from #13 and fast-forwarded to its merge on `origin/main` (`02ba87b`) during validation. The UX PR targets `main`. No second checkout/worktree, main commit, project migration or image-generation backend is needed. The staged VS Code settings are preserved.

| Workspace | Owns | Explicit handoff |
| --- | --- | --- |
| Characters | Figure names, identity sources, locked master versions | Character/master IDs → Studio or Library |
| Art Direction | Existing StyleLibrary: profiles, current/historical rules, references, default and character assignments | Selected style ID; return to the retained Studio draft |
| Studio | One project/character context; separate Master and Expression operations, structured prompt builder | Candidate ID → Library; selected master ID → another Expression |
| Library | Master, master candidate, expression and quality-derivative selection, registered comparison, review, cutout, export | Character/master IDs → Studio; no second Inspect navigation |
| Motion | Explicit future milestone after Style Intelligence | No simulated editor or analyzer |

Baseline problems: Create mutates a project-default style through a second selector while also offering character style assignment; style editing is hidden below result/prompt drawers. Creator is nested under Characters and requires a workspace detour to create a style. Selecting an expression history item replaces the working prompt/settings. Character-keyed components unmount on figure changes, losing drafts; only the expression prompt has a discard warning. Creator's settings are not included in project-change guards. Saved automatic prompts force expert-style conflict resolution after harmless setting edits. The complete technical prompt is the only common editor. Library/Inspect only expose expressions, so historical masters, creator candidates and quality derivatives need separate paths.

Implementation boundaries: retain image bytes/provenance and all existing typed IPC/provider operations. Keep visited character/mode editors mounted during navigation and generation; UI-only context must never rewrite a saved attempt. Separate history inspection from explicit adoption. Automatic/supplement modes track current structured settings; Expert Override retains manual text and exposes revision conflicts. Explain generation prerequisites adjacent to the main action. Style editing and manual import remain local; automatic tests use only the labelled Codex fixture.
