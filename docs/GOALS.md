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

## Current Goal: Operational Documentation Layer

- Objective: establish the living operational documentation layer for known issues, pending decisions, ideas, backlog, product releases, version planning, documentation discovery, and project state.
- Scope: documentation and process files only.
- Non-goals: app source changes, dependency installs, Firebase config changes, deploys, migrations, production data changes.
- Branch name: `docs/operational-documentation-layer`.
- Savepoint tag: `savepoint-before-operational-documentation-layer`.
- Expected deliverables: `PROJECT_STATE.md`, `docs/KNOWN_ISSUES.md`, `docs/DECISIONS_PENDING.md`, `docs/IDEAS.md`, `docs/FEATURE_BACKLOG.md`, `docs/PRODUCT_RELEASES.md`, `docs/VERSION_PLAN_V1.md`, and `docs/DOCUMENTATION_INDEX.md`.
- Validation commands: `git diff --check`, documentation dash character check, and documentation-only status check.
- Rollback command: `git switch docs/operational-documentation-layer; git reset --hard savepoint-before-operational-documentation-layer`.
- Quality gate: docs are practical, version-based, safety-aware, and do not claim production readiness without merge, tag, validation, and approval evidence.
- Exit criteria: docs committed with `docs: add operational documentation layer`.

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
| Operational documentation layer | 19 | `docs/operational-documentation-layer` | In progress |
| v1.0 release planning | 21 | `goal/v1-internal-production-release-planning` | Proposed |
| ASG-X discovery | 25 | `goal/asg-x-discovery` | Future |
