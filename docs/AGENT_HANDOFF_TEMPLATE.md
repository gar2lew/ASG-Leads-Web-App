# Agent Handoff Template

Use this template when another coding agent needs to continue ASG CRM work.

## Goal

Reach Goal:

Objective:

Non-goals:

## Required Reading Order

1. `AGENTS.md`
2. `HANDOFF.md`
3. `PROJECT_STATE.md`
4. Relevant docs for the goal
5. Relevant source files

## Stage 0 Preflight

Record:

```powershell
git status --short
git branch --show-current
git log --oneline -5
git tag --sort=-creatordate --list "savepoint-*"
```

If the working tree is dirty, stop and report the files unless the human owner has explicitly identified them as safe to ignore.

## Branch And Savepoint

Branch:

Savepoint:

Rollback:

```powershell
git reset --hard <savepoint>
```

## Current State

- Current branch:
- Latest commit:
- Working tree:
- Current version:
- Current milestone:
- Open PRs:
- Known blockers:

## Safe Scope

Safe:

-

Not safe:

- Deploys
- Pushes
- Merges
- Production Firebase changes
- Firestore rules changes
- Emulator config changes unless explicitly requested
- Migrations
- Salestrail live sync
- Phone backfill writes
- Secret changes
- Broad dependency upgrades

## Investigation Notes

Evidence gathered:

-

Root cause hypothesis:

-

Uncertainty:

-

## Changes Made

Files changed:

-

Reason:

-

## Validation

Required validation:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run test:emulator:preflight
npm run test:emulator:rules
npm run test:emulator:firestore-smoke
npm run test:emulator:callables-dry-run
cd functions
npm run build
npm run test:settings-admin
cd ..
git diff --check
```

Results:

-

Skipped or blocked:

-

## Commit

Commit message:

Commit hash:

## Final Notes

Remaining risks:

-

Recommended next action:

-
