# ASG CRM Goals

## Goal Template

Use this structure for every substantial goal:

```text
Goal:
Objective:
Scope:
Non-goals:
Branch name:
Savepoint tag:
Expected deliverables:
Validation commands:
Rollback command:
Quality gate:
Exit criteria:
```

## Current Goal: Engineering Handbook Setup

- Objective: establish the ASG CRM engineering handbook and Codex operating structure.
- Scope: documentation and process files only.
- Non-goals: app source changes, dependency installs, Firebase config changes, deploys, migrations, production data changes.
- Branch name: `goal/engineering-handbook-setup`.
- Savepoint tag: `savepoint-before-engineering-handbook-setup`.
- Expected deliverables: `AGENTS.md` plus handbook docs under `docs/`.
- Validation commands: status check, documentation search checks, cached diff check.
- Rollback command: `git switch codex-foundation; git branch -D goal/engineering-handbook-setup`.
- Quality gate: docs contain the required safety model, goal structure, roadmap, validation, rollback, and prompt templates.
- Exit criteria: docs committed with `docs: add ASG CRM engineering handbook`.

## Goal Backlog

| Goal | Stage | Branch | Status |
| --- | --- | --- | --- |
| Engineering handbook setup | 0 to 4 | `goal/engineering-handbook-setup` | In progress |
| Baseline validation audit | 5 | `goal/baseline-validation-audit` | Proposed |
| Firebase emulator harness | 18 | `goal/firebase-emulator-harness` | Proposed |
| Callable auth hardening | 17 | `goal/callable-auth-hardening` | Proposed |
| Firestore rules tightening plan | 17 | `goal/firestore-rules-tightening` | Proposed |
| Salestrail emulator dry-run tests | 14 | `goal/salestrail-emulator-tests` | Proposed |
| Phone normalisation dry-run validation | 13 | `goal/phone-normalisation-validation` | Proposed |
| UI workflow audit | 11 | `goal/ui-workflow-audit` | Proposed |
| ASG-X discovery | 25 | `goal/asg-x-discovery` | Future |
