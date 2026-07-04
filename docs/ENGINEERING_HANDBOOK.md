# ASG CRM Engineering Handbook

## Purpose

This handbook defines how ASG CRM engineering work is planned, validated, documented, and rolled back. It is written for Codex sessions, human reviewers, and release operators working on the React and Firebase CRM.

## Prime Directive

- Stability first. Keep login, leads, clients, deals, reports, admin settings, and Firebase resources safe.
- Reversibility first. Start goals from a clean branch and savepoint tag.
- No direct work on `main`.
- No destructive changes without explicit approval.
- No production Firebase, security, migration, or deployment change without explicit approval.
- Documentation can move quickly. Production data and security surfaces move slowly.

## Operating Model

Every substantial change is a goal. A goal has a branch, a savepoint tag, scoped deliverables, validation commands, quality gates, and a rollback command.

Default sequence:

1. Confirm branch and status.
2. Create a goal branch.
3. Create a savepoint tag.
4. Make a small, scoped change.
5. Validate.
6. Document results.
7. Commit.
8. Report rollback.

## Required Goal Definition

Each goal must define:

- Objective: what outcome is required.
- Scope: files, workflows, and systems included.
- Non-goals: what must not change.
- Branch name: usually `goal/<goal-name>`.
- Savepoint tag: usually `savepoint-before-<goal-name>`.
- Expected deliverables: docs, code, tests, or reports.
- Validation commands: exact commands to run.
- Rollback command: how to return to the savepoint.
- Quality gate: what must pass before merge.
- Exit criteria: when the goal is complete.

## Recommended CRM Goal Sequence

1. Stage 0 - Environment and Codex Setup
2. Stage 1 - Repository Standards
3. Stage 2 - AGENTS.md Operating Contract
4. Stage 3 - Development Rules and Safety
5. Stage 4 - Roadmap and Goals
6. Stage 5 - Baseline Audit and Savepoints
7. Stage 6 - Foundation Audit
8. Stage 7 - Architecture Review
9. Stage 8 - Technical Debt Audit
10. Stage 9 - Safe Refactoring
11. Stage 10 - Performance Optimisation
12. Stage 11 - UI/UX Redesign
13. Stage 12 - Lead Management Upgrade
14. Stage 13 - Google Sheets/Firebase Import Stability
15. Stage 14 - Salestrail Integration
16. Stage 15 - Reporting Upgrade
17. Stage 16 - Admin Settings
18. Stage 17 - Security Review
19. Stage 18 - Testing and QA
20. Stage 19 - Documentation
21. Stage 20 - Beta Release
22. Stage 21 - Production Readiness
23. Stage 22 - Deployment
24. Stage 23 - Post-Deployment Review
25. Stage 24 - Continuous Improvement
26. Stage 25 - ASG-X Online Platform

## Quality Gates

- Before coding: clean tree, branch created, savepoint tag created, scope understood.
- Before refactoring: tests identified, current behaviour documented, rollback path known.
- Before UI redesign: target workflows listed, screenshots or acceptance states defined, accessibility and responsive behaviour included.
- Before Firebase/data changes: emulator plan, backup or export plan, explicit approval, no production writes by default.
- Before integration work: mock or sandbox path, secrets by name only, no live vendor writes until approved.
- Before production release: build, typecheck, relevant tests, release notes, rollback owner, and explicit approval.

## Standard Validation

Use the strongest practical subset:

```powershell
npm install
npm run typecheck
npm run lint
npm test
npm run build
npx tsc --noEmit
npx tsc --noEmit -p functions\tsconfig.json
cd functions
npm run build
cd ..
```

If a script does not exist, record that it is missing and run the available equivalent.

## Rollback Basics

Rollback to the savepoint:

```powershell
git switch <target-branch>
git reset --hard <savepoint-tag>
```

Use destructive rollback only with explicit approval. For normal Codex work, prefer creating a new corrective commit or abandoning the failed branch.

Delete a failed local branch after switching away:

```powershell
git switch codex-foundation
git branch -D <failed-branch>
```

Recover from a failed merge:

```powershell
git merge --abort
git status --short
```

Return to baseline:

```powershell
git switch codex-foundation
git status --short
```
