# ASG CRM Project State

Last updated: 6 July 2026

## Current Branch Context

- Current working branch for this maintenance goal: `goal/weekly-maintenance`.
- Savepoint for this goal: `savepoint-before-weekly-maintenance`.
- Parent context: v1.0 release candidate package completed on `goal/v1-release-candidate`.
- Sprint 1 PR: `#17`, open draft at this maintenance check, targeting `codex-foundation`.
- Sprint 2 PR: `#18`, open draft at this maintenance check, stacked on `goal/sprint-validation`.

## Current Product State

- The CRM is locally stabilised, documented, and release-candidate ready for human review.
- It is not production-ready because PR merge state, release tags, staff UAT, backup/recovery rehearsal, dependency advisories, and production Firebase approvals still require human confirmation.
- v1.0 Internal Production Release Candidate docs now exist in `docs/v1.0-release-notes.md`, `docs/v1.0-known-issues.md`, `docs/v1.0-upgrade-guide.md`, `docs/v1.0-deployment-checklist.md`, `docs/v1.0-rollback-checklist.md`, and `docs/v1.0-final-risk-assessment.md`.
- Salestrail remains dry-run-first and approval-gated.
- Production Firebase deploys, Functions deploys, rules deploys, migrations, phone backfill writes, and live Salestrail sync remain blocked without explicit approval.

## Repository Intelligence Layer

This goal adds the root repository intelligence layer:

- `PROJECT_HEALTH.md`: current health, biggest risks, biggest wins, critical workflows, and readiness view.
- `TECHNICAL_DEBT.md`: largest debt areas, largest components, highest-risk files, and recommended cleanup order.
- `CODE_OWNERSHIP.md`: ownership map, review gates, and critical workflow stewardship.
- `DEPENDENCY_MAP.md`: external dependencies, internal module map, deployable surfaces, and dependency risks.
- `PROJECT_STATE.md`: current state and pointers to the intelligence layer.

## Current Maintenance Layer

Weekly maintenance created:

- `docs/WEEKLY_HEALTH_REPORT.md`: validation results, dependency advisories, bundle size review, technical debt status, documentation freshness, stale branches, open PRs, and TODO/FIXME review.

Dependency security review created:

- `docs/dependency-security-review.md`: root and Functions audit findings, exposure assessment, direct and transitive dependency risk, and release recommendation.
- `docs/dependency-remediation-plan.md`: staged dependency remediation plan for PDF runtime, Firebase web SDK, Functions runtime, dev tooling, and audit closure.

PDF dependency remediation created:

- `docs/pdf-workflow-validation-checklist.md`: manual validation checklist for every `jspdf` PDF generation and export workflow.
- Root `jspdf` was updated from `4.2.0` to `4.2.1`, removing the direct `jspdf` audit advisory.
- Transitive optional `dompurify` under `jspdf` was updated from `3.3.3` to `3.4.11` through the lockfile, removing the remaining PDF sanitisation advisory.
- Root audit then reported 27 advisories, including 1 critical and 5 high.

Firebase web SDK dependency remediation created:

- Transitive `@grpc/grpc-js` under the root Firebase Firestore SDK path was updated from `1.9.15` to `1.9.16` through the lockfile.
- No direct `firebase` package update was available inside Firebase 10.x. The installed direct SDK remains `firebase@10.14.1`, which was the latest Firebase 10.x version checked during this goal.
- Firebase subpackages under `firebase@10.14.1` pin `undici@6.19.7` exactly, so the `undici` advisory remains deferred rather than forced through an override.
- Root audit now reports 26 advisories, including 1 critical and 4 high.

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

Weekly maintenance on `goal/weekly-maintenance` also passed:

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

Known validation notes:

- Vite still reports large Firebase and PDF vendor chunks.
- Callable emulator output still reports the `firebase-functions` outdated SDK advisory.
- Emulator tests use `demo-asg-crm-emulator`.
- Root `npm audit` reports 26 advisories, including 1 critical and 4 high, after the direct `jspdf` update, transitive `dompurify` lockfile update, and Firebase Firestore `@grpc/grpc-js` lockfile patch.
- Functions `npm audit` reports 16 advisories, including 3 high.

## Active Operating Priorities

1. Complete staff UAT before production rollout.
2. Run targeted dependency remediation goals for Firebase SDKs, Functions runtime, and dev tooling.
3. Review and merge Sprint 1 before Sprint 2, or keep Sprint 2 as a stacked review.
4. Verify release tags after actual merges.
5. Keep Firebase and data actions approval-gated.
6. Close Salestrail, phone normalisation, migration, backup/recovery, and dependency audit risks before production release.

## Current Blockers

- Sprint 1 and Sprint 2 remain open draft PRs at this maintenance check.
- v1.0 requires staff UAT and release go/no-go.
- Salestrail needs a no-network mock seam before broader executable dry-run coverage.
- Dependency audit advisories have been reviewed. PDF runtime, transitive PDF sanitisation, and the Firebase Firestore `@grpc/grpc-js` transitive patch are complete, but Firebase `undici`, Functions, and tooling remediation remains open.
- Existing release tags need verification against merged commits.
- Backup and recovery rehearsal remains incomplete.
- Production Firebase remains blocked without explicit approval and release manager sign-off.

## Next Recommended Goal

Reach Goal: Staff UAT Execution

Objective:

- Execute `docs/staff-uat-plan.md`, capture feedback, triage issues, and update release readiness status.

Non-goals:

- No deploy.
- No production Firebase writes.
- No migrations.
- No live Salestrail sync.
