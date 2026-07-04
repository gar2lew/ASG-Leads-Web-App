# Codex Playbook

## Session Start

1. Read `AGENTS.md`.
2. Run `git status --short`.
3. Run `git branch --show-current`.
4. If the task is substantial, read `.codex/memory.md`, `.codex/architecture.md`, `.codex/known-issues.md`, and `.codex/decisions.md`.
5. Confirm whether the task is audit-only, docs-only, code, Firebase, data, integration, or release work.

## Safe Work Pattern

```powershell
git status --short
git branch --show-current
git switch -c goal/<goal-name>
git tag savepoint-before-<goal-name>
```

Then:

1. Make a small change.
2. Validate locally.
3. Inspect diff.
4. Commit only intended files.
5. Report verification and rollback.

## Stop Conditions

Stop and report if:

- The working tree is dirty before branch setup.
- A command would deploy.
- A command would write production Firebase data.
- A command would expose secrets.
- A command would run live Salestrail sync.
- A command would run phone normalisation with `dryRun:false`.
- A command would run a live migration.
- A requested change conflicts with the prime directive.

## Prompt Templates

### Reach Goal

```text
Reach goal: <goal name>.
Objective:
Scope:
Non-goals:
Branch:
Savepoint:
Deliverables:
Validation:
Rollback:
Do not deploy or write production data.
```

### Continue Goal

```text
Continue goal: <goal name>.
Read AGENTS.md and the relevant docs.
Check branch, status, latest commits, and current blockers.
Continue from the existing branch without restarting.
Report what changed and what remains.
```

### Audit Only

```text
Audit only. Do not modify files.
Inspect:
Report findings by severity with file references.
Include validation gaps and safe next actions.
```

### Safe Cleanup

```text
Perform safe cleanup only.
Do not delete branches, stashes, data, generated assets, or config without approval.
List cleanup candidates first.
Wait for approval before destructive steps.
```

### UI Redesign

```text
Plan a UI redesign for <workflow>.
Do not edit app code yet.
Identify current screens, user tasks, accessibility risks, responsive states, validation plan, and rollback.
```

### Firebase/Data Change Proposal

```text
Prepare a Firebase/data change proposal.
Do not deploy.
Do not write production data.
Include emulator plan, backup/export plan, affected collections, rules impact, validation, rollback, and approval gates.
```

### Integration Work

```text
Plan integration work for <vendor/system>.
Use mocks or sandbox first.
Do not call live APIs unless explicitly approved.
Define secrets by name only.
Include dry-run, reconciliation, and rollback.
```

### Testing

```text
Prepare and run safe tests for <scope>.
List existing scripts first.
Do not install dependencies unless needed.
Do not use production data.
Report pass/fail, logs summary, and missing coverage.
```

### Production Readiness

```text
Assess production readiness for <release>.
Do not deploy.
Check branch, status, build, tests, Firebase risk, migration risk, rollback, open PRs, and blockers.
Return a go/no-go recommendation.
```

## Reporting Format

Final reports should include:

- Branch and HEAD.
- Files changed.
- Commands run.
- Pass/fail results.
- Known gaps.
- Commit hash if committed.
- Rollback command.
- Recommended next prompt.
