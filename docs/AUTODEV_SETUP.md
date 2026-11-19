# LaceFrame Autodev Controller - Setup Documentation

## Overview

The Autodev Controller implements autonomous development driven by GitHub Issues. It fetches approved issues, orchestrates Builder and Reviewer sessions, runs quality gates, and manages the complete implementation lifecycle.

## Prerequisites

### Required Tools
- **Git** - Version control
- **GitHub CLI (gh)** - Authenticated with repo access
- **Node.js** >= 22.13.0
- **npm** - Package manager
- **Kilo CLI** - For agent orchestration

### GitHub Repository Setup
1. Repository: `thomcgn/laceframe`
2. Branch: `develop` (working branch)
3. Branch protection: `main` protected, `develop` unprotected for direct pushes
4. Labels created (see Configuration)

### GitHub CLI Authentication
```bash
gh auth login
# Select GitHub.com, HTTPS, authenticate with token
# Token needs: repo, read:org, workflow permissions
```

### Kilo Agents
Two agents must be configured in `.kilo/agents/`:
- `laceframe-builder.md` - Primary implementation agent
- `laceframe-reviewer.md` - Independent review agent (subagent mode)

## Configuration

### Labels
Create these labels in the GitHub repository:
```bash
gh label create "autodev:approved" --description "Authorized for autonomous implementation" --color "0E8A16"
gh label create "autodev:in-progress" --description "Currently being implemented" --color "FBCA04"
gh label create "autodev:review" --description "Awaiting independent review" --color "D93F0B"
gh label create "autodev:blocked" --description "Requires intervention" --color "B60205"
gh label create "autodev:implemented" --description "Successfully pushed and verified" --color "5319E7"
```

### Config File
Location: `.autodev-config.json` (project root)

Key settings:
- `repo`: GitHub repository (owner/name)
- `branch`: Working branch (develop)
- `maxReviewIterations`: Maximum review cycles (default: 3)
- `qualityGates`: Commands to run (typecheck, test, lint)

## Issue Format

Issues must contain these sections:

```markdown
# Issue Title

## Goal and Scope
Description of what to implement.

## Acceptance Criteria
- Criterion 1
- Criterion 2

## Priority
high | medium | low

## Dependencies
#123, #124

## Required Validation
npm run check:smoke -- creator
npm run check:smoke -- master

## Relevant Files or Subsystems
src/renderer/components/Studio.tsx
src/shared/domain.ts
```

## Running the Controller

### Dry Run (Recommended First)
```bash
npx tsx src/autodev/controller.ts --dry-run
# Or using the CLI entry point
npm run autodev -- --dry-run
```

### Production Run
```bash
npm run autodev
```

### With Custom Config
```bash
AUTODEV_CONFIG=/path/to/config.json npm run autodev
```

## Controller Workflow

```
GitHub Issue (autodev:approved)
    ↓
Controller selects highest priority unblocked issue
    ↓
Updates labels: autodev:in-progress
    ↓
Starts Builder session (laceframe-builder agent)
    ↓
Builder implements, runs tests
    ↓
Controller runs quality gates (typecheck, test, lint)
    ↓
Starts Reviewer session (laceframe-reviewer agent)
    ↓
Reviewer writes report to docs/reviews/LATEST_REVIEW.md
    ↓
Controller reads report
    ↓
PASS → Commit → Push → Verify remote → Close issue → Next issue
FAIL → Return findings to Builder (max 3 iterations)
NEEDS_REVIEW → Run more tests → Re-review (max 3 iterations)
```

## State Persistence

Controller state saved to `.autodev-state.json`:
- Current issue being processed
- Review iteration count
- Processed/failed issue history
- Last run timestamp

Logs saved to `logs/autodev/autodev-YYYY-MM-DD.log`

## Learning Reports

After each completed issue, a learning report is generated at:
`docs/learning/issue-{number}-learning.md`

## Safety Features

- **Clean working tree required** before starting
- **No force push** ever
- **No branch creation** - works on develop only
- **Max 3 review iterations** per issue
- **Remote commit verification** before closing issue
- **Dry-run mode** for testing
- **Bounded retries** with backoff for API errors
- **Graceful stop** on SIGINT/SIGTERM

## Troubleshooting

### "Working tree not clean"
Commit or stash changes before running.

### "Not on develop branch"
```bash
git checkout develop
```

### "GitHub CLI not authenticated"
```bash
gh auth login
```

### "Failed to fetch from origin"
Check network and authentication.

### Review report not found
Check `docs/reviews/LATEST_REVIEW.md` permissions and reviewer agent.

### Push rejected (branch protection)
If develop becomes protected, controller will report BLOCKED. Do not bypass.

## Adding Package Scripts

Add to `package.json`:
```json
{
  "scripts": {
    "autodev": "tsx src/autodev/controller.ts",
    "autodev:dry": "tsx src/autodev/controller.ts --dry-run"
  }
}
```

## Monitoring

Watch logs:
```bash
tail -f logs/autodev/autodev-$(date +%F).log
```

Check state:
```bash
cat .autodev-state.json
```

## Integration with CI

The controller runs locally. For CI integration, use `workflow_dispatch`:
```bash
gh workflow run quality.yml --ref develop -f profile=dev
```

## Extending

### Custom Quality Gates
Add to config:
```json
"qualityGates": ["typecheck", "test", "lint", "custom-script"]
```

### Custom Smoke Tests
```json
"smokeTests": ["creator", "master", "color"]
```

### Additional Labels
Modify label names in config to match repository.

## Security

- No secrets in code or logs
- GitHub token only via gh CLI
- No automatic PR creation
- No main branch modifications
- Read-only access to issue bodies

## Support

For issues with the controller itself, create a GitHub Issue with label `autodev:controller`.