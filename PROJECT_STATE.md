# ASG CRM Project State

Last updated: 6 July 2026

## Current Branch Context

- Current working branch for this documentation goal: `docs/operational-documentation-layer`.
- Parent context: Sprint 2 validation branch with Master Architect documentation committed locally.
- Sprint 1 PR: `#17`, open draft at last check, targeting `codex-foundation`.
- Sprint 2 PR: `#18`, open draft at last check, stacked on Sprint 1.

## Current Product State

- Sprint 1 is locally validated and review-ready, but not confirmed merged by this file.
- Sprint 2 is locally validated and review-ready, but not confirmed merged by this file.
- v1.0 Internal Production Release is planned, not production-ready.
- Salestrail remains dry-run-first and approval-gated.
- Production Firebase deploys, Functions deploys, rules deploys, migrations, phone backfill writes, and live Salestrail sync remain blocked without explicit approval.

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

1. Complete and review the operational documentation layer.
2. Merge Sprint 1 before Sprint 2, or keep Sprint 2 as a stacked review.
3. Verify release tags after actual merges.
4. Plan v1.0 Internal Production Release.
5. Complete staff UAT before production rollout.
6. Keep Firebase and data actions approval-gated.

## Current Blockers

- Sprint 1 and Sprint 2 are review-ready but not confirmed merged by this file.
- v1.0 requires staff UAT and release go/no-go.
- Salestrail needs a no-network mock seam before broader executable dry-run coverage.
- Dependency audit vulnerabilities need targeted review.
- Existing release tags need verification against merged commits.

## Next Recommended Goal

Reach Goal: v1.0 Internal Production Release Planning

Objective:

- Turn `docs/VERSION_PLAN_V1.md` into an executable release checklist with staff UAT owners, Firebase surface approvals, rollback owner, and go/no-go criteria.

Non-goals:

- No deploy.
- No production Firebase writes.
- No migrations.
- No live Salestrail sync.
