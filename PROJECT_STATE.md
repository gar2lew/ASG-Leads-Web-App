# ASG CRM Project State

Last updated: 8 July 2026

## Current Branch Context

- Current working branch for the AI handoff pack: `fix/functions-emulator-startup-investigation`.
- Current handoff commit before this goal: `14ab8c5 docs: investigate functions emulator startup`.
- Latest savepoint: `savepoint-before-functions-emulator-startup-investigation`.
- Pre-existing untracked file: `UAT.md`. Treat it as human-owned unless explicitly instructed otherwise.
- Previous UAT tracking branch: `goal/staff-uat-run-and-triage`.
- Savepoint for that goal: `savepoint-before-staff-uat-run-and-triage`.
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

Firebase undici compatibility review created:

- No package files were changed.
- `undici@6.19.7` remains installed through exact Firebase 10.14.1 subpackage declarations.
- Direct browser bundle reachability was not found in built `dist/assets` files during the review.
- Node, audit, local tooling, and emulator surfaces remain affected because Firebase node export conditions can use the installed package.
- Firebase 11 and 12 remove the reviewed `undici` dependency paths, but they are semver-major Firebase web SDK upgrades and need a separate compatibility goal.
- `undici` override was deferred because it would force exact Firebase dependency declarations outside the published Firebase 10 compatibility set.

Firebase web SDK major upgrade planning created:

- `docs/firebase-web-sdk-major-upgrade-plan.md`: plan for a future Firebase 12 web SDK migration.
- `docs/firebase-web-sdk-upgrade-risk-register.md`: risk register for auth, Firestore, Functions, Storage, messaging, emulator, audit, build, and release impacts.
- Current npm metadata identifies `firebase@12.15.0` and `@firebase/rules-unit-testing@5.0.1` as the future target package pair.
- Recommendation is post-v1.0 unless the release owner decides the remaining Firebase `undici` advisory blocks v1.0.
- No package files were changed during planning.

Functions runtime dependency remediation planning created:

- `docs/functions-runtime-dependency-remediation-plan.md`: plan for future Firebase Functions runtime dependency remediation.
- `docs/functions-runtime-upgrade-risk-register.md`: risk register for Admin SDK, Functions SDK, callable, scheduled job, Storage, emulator, and deploy impacts.
- Current Functions direct runtime packages remain unchanged: `firebase-admin@13.7.0` and `firebase-functions@6.6.0`.
- Functions `npm audit` still reports 16 advisories, including 3 high.
- High Functions advisories are transitive runtime paths through `@grpc/grpc-js`, `form-data`, and `fast-xml-builder`.
- Recommendation is post-v1.0 unless the release owner decides unresolved Functions advisories block v1.0 or a Functions deploy is required before v1.0.
- No Functions package files were changed during planning.

Functions emulator startup investigation created and independently verified:

- `docs/functions-emulator-startup-investigation.md`: investigation report for the reported Functions emulator backend specification timeout and callable `functions/not-found` failure mode.
- Current evidence shows compiled Functions user code loads quickly (216ms) and exposes 26 exports.
- Independent verification by successor agent (Z Code) on 2026-07-08 confirmed all validations pass with compatible Java 21 and Firebase CLI tooling.
- Root cause confirmed as toolchain/environment timing, not user-code blocking imports.
- No Firestore rules, emulator configuration, app code, or Functions code was changed during the investigation.
- `npm run test:emulator:callables-dry-run` passed with compatible Java 21 and Firebase CLI tooling.

AI agent handoff pack prepared:

- `HANDOFF.md`: current repo state, blocker summary, safe next actions, unsafe actions, required validation, rollback instructions, known good validations, and known failing validation context.
- `docs/AGENT_HANDOFF_TEMPLATE.md`: reusable handoff template for future agents.
- `docs/Z_CODE_DEEPSEEK_HANDOFF_RULES.md`: explicit rules for Z Code, DeepSeek, or another coding agent.
- The exact next recommended goal for a fresh external agent remains `Reach Goal: Functions Emulator Startup Investigation` if that agent is taking over from the reported emulator timeout state.

Staff UAT execution pack created:

- `docs/UAT/Sales_Rep_Test_Plan.md`: sales rep role script for login, dashboard, lead work, search, notes, appointments, documents, reports, Salestrail visibility, settings, and logout.
- `docs/UAT/Manager_Test_Plan.md`: manager role script for team workflow, reporting, lead review, Salestrail context, settings, and logout.
- `docs/UAT/Admin_Test_Plan.md`: admin role script for safe settings, roster, system health, Salestrail controls, document workflow, reports, and blocked actions.
- `docs/UAT/Director_Test_Plan.md`: director review script for dashboard, pipeline, reports, release posture, Salestrail decision context, and sign-off confidence.
- `docs/UAT/UAT_Checklist.md`: role coverage checklist, issue severity matrix, and v1.0 exit criteria.
- `docs/UAT/Issue_Report_Template.md`: standard defect and feedback capture template.
- `docs/UAT/Signoff_Form.md`: tester, product owner, and release manager signoff form.
- `docs/UAT/Test_Data_Guide.md`: safe test account, lead, activity, document, Salestrail, and phone normalisation data guide.

Chief engineer status review created:

- `docs/chief-engineer-status-review.md`: current project state, version, release milestone, release posture, blockers, and next recommended goal.
- Current version target is `v1.0`.
- Current release milestone is v1.0 UAT execution readiness.
- Production posture is No-Go.
- Release-candidate posture is Needs Review.
- Single highest-value next goal is `Reach Goal: Staff UAT Run And Triage`.

Staff UAT live tracking prepared:

- `docs/UAT/UAT_RESULTS.md`: live role result capture for Sales Representative, Manager, Admin, and Director testing.
- `docs/UAT/UAT_TRIAGE.md`: issue register, severity matrix, and Chief Engineer blocker linkage.
- `docs/UAT/UAT_CHANGELOG.md`: UAT-driven change log for real tester feedback and triaged fixes.
- `docs/UAT/UAT_SUMMARY.md`: release readiness checklist and final UAT summary template.
- No live UAT results have been recorded yet.
- Current UAT summary remains No-Go until staff testing and sign-off are complete.

UAT lead import and date remediation in progress:

- `UAT-ISS-001` records the first real UAT issue: no leads visible initially, Quick Pull importing leads with missing dates, and Quick Pull appearing to stop at 100 leads.
- Engineering found that the lead list path could hide legacy records when metadata used by the UI query was missing, and Quick Pull built its duplicate index from the 100-lead UI window instead of the full paged lead index.
- The remediation keeps production data untouched, preserves workflow behaviour, uses legacy-compatible lead loading, preserves valid imported lead dates, applies a clear fallback date for missing or invalid source dates, and reports imported, updated, skipped, failed, fallback date, invalid date, and possible limit counts.
- Full requested validation passed for the engineering fix. Staff retest and release sign-off remain required before this issue can be closed for v1.0.

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
- Chief engineer status review used documentation review and `gh pr list`; it did not rerun the full validation baseline.
- Staff UAT live tracking preparation used documentation review and `git diff --check`; it did not execute live staff UAT or record user feedback.

## Active Operating Priorities

1. Execute the staff UAT pack before production rollout.
2. Run targeted dependency remediation goals for Firebase SDKs, Functions runtime, and dev tooling.
3. Review and merge Sprint 1 before Sprint 2, or keep Sprint 2 as a stacked review.
4. Verify release tags after actual merges.
5. Keep Firebase and data actions approval-gated.
6. Close Salestrail, phone normalisation, migration, backup/recovery, and dependency audit risks before production release.

## Current Blockers

- Sprint 1 and Sprint 2 remain open draft PRs at this maintenance check.
- v1.0 requires execution of the UAT pack, completion of UAT tracking, and release go/no-go.
- Current production decision is No-Go until UAT signoff, merge and tag verification, backup/recovery rehearsal, Firebase approval, and risk acceptance are complete.
- `UAT-ISS-001` requires staff retest before v1.0 readiness can improve.
- A reported Functions emulator startup timeout can cause callable dry-run failures with `functions/not-found` if callable endpoints never register. The investigation confirmed the root cause is toolchain/environment timing (not user-code blocking imports) and that all emulator checks pass with compatible Java 21+ and Firebase CLI 15 tooling. See `docs/functions-emulator-startup-investigation.md` for details.
- Salestrail needs a no-network mock seam before broader executable dry-run coverage.
- Dependency audit advisories have been reviewed. PDF runtime, transitive PDF sanitisation, and the Firebase Firestore `@grpc/grpc-js` transitive patch are complete. Firebase `undici` is reviewed and has a Firebase 12 upgrade plan. Functions runtime remediation now has a backend package plan. Functions package changes and tooling remediation remain open.
- Existing release tags need verification against merged commits.
- Backup and recovery rehearsal remains incomplete.
- Production Firebase remains blocked without explicit approval and release manager sign-off.

## Next Recommended Goal

Reach Goal: Functions Emulator Startup Investigation

Objective:

- Reproduce the reported Functions emulator backend specification timeout and callable `functions/not-found` failure in the successor agent environment, confirm or refine the startup investigation evidence, and apply only a minimal safe startup fix if the root cause is clearly identified.

Non-goals:

- No deploy.
- No push.
- No production Firebase writes.
- No Firestore rules changes.
- No emulator configuration changes unless explicitly approved.
- No migrations.
- No live Salestrail sync.
- No phone backfill writes.

Next product goal after emulator confidence:

Reach Goal: Conduct Live Staff UAT

Objective:

- Run the role-specific UAT scripts with real staff testers, capture outcomes in `docs/UAT/UAT_RESULTS.md`, triage issues in `docs/UAT/UAT_TRIAGE.md`, and update `docs/UAT/UAT_SUMMARY.md`.

Non-goals:

- No deploy.
- No production Firebase writes.
- No migrations.
- No live Salestrail sync.
