# ASG CRM Project State

Last updated: 6 July 2026

## Current Branch Context

- Current working branch for this documentation goal: `docs/repository-intelligence`.
- Savepoint for this goal: `savepoint-before-repository-intelligence`.
- Parent context: operational documentation layer completed on `docs/operational-documentation-layer`.
- Sprint 1 PR: `#17`, open draft at last documented check, targeting `codex-foundation`.
- Sprint 2 PR: `#18`, open draft at last documented check, stacked behind Sprint 1.

## Current Product State

- The CRM is locally stabilised, documented, and review-ready for the Sprint 1 and Sprint 2 stacked PR sequence.
- It is not yet documented as production-ready because PR merge state, release tags, staff UAT, and production Firebase approvals still require human confirmation.
- v1.0 Internal Production Release is planned through `docs/VERSION_PLAN_V1.md`.
- Salestrail remains dry-run-first and approval-gated.
- Production Firebase deploys, Functions deploys, rules deploys, migrations, phone backfill writes, and live Salestrail sync remain blocked without explicit approval.

## Repository Intelligence Layer

This goal adds the root repository intelligence layer:

- `PROJECT_HEALTH.md`: current health, biggest risks, biggest wins, critical workflows, and readiness view.
- `TECHNICAL_DEBT.md`: largest debt areas, largest components, highest-risk files, and recommended cleanup order.
- `CODE_OWNERSHIP.md`: ownership map, review gates, and critical workflow stewardship.
- `DEPENDENCY_MAP.md`: external dependencies, internal module map, deployable surfaces, and dependency risks.
- `PROJECT_STATE.md`: current state and pointers to the intelligence layer.

## Release Tags

Observed release tags exist locally and/or remotely:

- `release/sprint-1-stable`
- `release/sprint-1-stable-v2`
- `release/sprint-2-staff-workflow`

These tags require human verification against merged PR commits before they are treated as production readiness evidence.

## Validation Baseline

Recent Sprint 2 validation reported passing:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:emulator:preflight`
- `npm run test:emulator:rules`
- `npm run test:emulator:firestore-smoke`
- `npm run test:emulator:callables-dry-run`
- `cd functions && npm run build`
- `cd functions && npm run test:settings-admin`
- `git diff --check`

Known validation notes:

- Vite still reports large Firebase and PDF vendor chunks.
- Callable emulator output still reports the `firebase-functions` outdated SDK advisory.
- Emulator tests use `demo-asg-crm-emulator`.

## Active Operating Priorities

1. Review and merge Sprint 1 before Sprint 2, or keep Sprint 2 as a stacked review.
2. Verify release tags after actual merges.
3. Complete staff UAT before production rollout.
4. Keep Firebase and data actions approval-gated.
5. Close Salestrail, phone normalisation, migration, and dependency audit risks before production release.
6. Use the repository intelligence layer to select the next goal.

## Current Blockers

- Sprint 1 and Sprint 2 are review-ready but not confirmed merged by this file.
- v1.0 requires staff UAT and release go/no-go.
- Salestrail needs a no-network mock seam before broader executable dry-run coverage.
- Dependency audit vulnerabilities need targeted review.
- Existing release tags need verification against merged commits.
- Production Firebase remains blocked without explicit approval and release manager sign-off.

## Next Recommended Goal

Reach Goal: v1.0 Internal Production Release Planning

Objective:

- Turn `docs/VERSION_PLAN_V1.md` into an executable release checklist with staff UAT owners, Firebase surface approvals, rollback owner, and go/no-go criteria.

Non-goals:

- No deploy.
- No production Firebase writes.
- No migrations.
- No live Salestrail sync.
