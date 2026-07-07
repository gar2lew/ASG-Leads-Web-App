# Internal Changelog

This changelog tracks engineering process and internal operating changes. Product-facing release notes belong elsewhere.

## 2026-07-06

- Added Master Architect documentation as the product and engineering north star.
- Added operational documentation layer for known issues, pending decisions, ideas, feature backlog, product releases, v1.0 planning, documentation discovery, and current project state.
- Updated roadmap and goals to prefer version-based planning from v1.0 onward.
- Documented release-tag verification risk because release tags exist while Sprint 1 and Sprint 2 PRs still require merge confirmation.
- Added AI foundation data audit covering lead timeline, history, notes, calls, appointments, status history, documents, tasks, and recommendations.
- Added internal production readiness Go/No-Go report.
- Added staff UAT plan with scripts, checklists, feedback forms, issue tracking, and success criteria.
- Prepared v1.0 release candidate docs for release notes, known issues, upgrade guide, deployment checklist, rollback checklist, and final risk assessment.
- Ran weekly maintenance validation and added `docs/WEEKLY_HEALTH_REPORT.md`.
- Updated project state and risk register with dependency advisory counts, UAT status, open PRs, stale branch notes, and production deployment blockers.
- Added dependency security review and staged remediation plan for root and Functions audit advisories.
- Updated project state, risk register, and known issues to track dependency remediation as an active release blocker.
- Updated `jspdf` from `4.2.0` to `4.2.1` to remove the direct critical app runtime PDF advisory.
- Added PDF workflow validation checklist for commissions, Document Centre, form filler, O&A, and reporting PDF entry points.
- Updated transitive optional `dompurify` under `jspdf` from `3.3.3` to `3.4.11` through the lockfile to remove the remaining PDF sanitisation advisory.
- Updated the root Firebase Firestore transitive `@grpc/grpc-js` lockfile entry from `1.9.15` to `1.9.16`.
- Confirmed no same-major Firebase 10.x SDK update is available beyond the installed `firebase@10.14.1`.
- Deferred Firebase `undici` remediation because Firebase 10.14.1 pins `undici@6.19.7` exactly and an override needs separate compatibility approval.
- Reduced root `npm audit` from 27 to 26 advisories and high severity from 5 to 4.
- Reviewed Firebase `undici` compatibility and confirmed no safe Firebase 10 patch path exists.
- Classified the `undici` advisory as not found in the built browser bundle but still present for Node, audit, local tooling, and emulator surfaces.
- Deferred `undici` overrides because they would force exact Firebase dependency declarations; recommended a separate Firebase 11 or 12 upgrade compatibility goal.
- Added Firebase web SDK major upgrade plan targeting Firebase 12 and matching rules-unit-testing migration.
- Added Firebase web SDK upgrade risk register covering auth, Firestore, Functions, Storage, messaging, emulator tests, bundle output, audit, and release timing.
- Recommended post-v1.0 timing for the Firebase 12 upgrade unless release ownership blocks v1.0 on the remaining `undici` advisory.

## 2026-07-04

- Established the validation baseline on `fix/validation-baseline`.
- Added root `typecheck`, `test`, and `lint:report` scripts.
- Scoped root linting to source-of-truth `src` and `functions/src` paths, excluding the nested mirror.
- Restored passing workflow-state and region-identity guardrail tests by updating stale fixtures and sidebar expectations.
- Cleared blocking ESLint errors while leaving warning-level type and hook dependency cleanup for later targeted work.
- Added emulator validation baseline scripts and documentation.
- Added Firestore emulator smoke test scaffolding for demo-project direct-read denial checks.
- Documented Java and explicit emulator config blockers for full emulator execution.
- Added explicit Firestore emulator config and authenticated rules harness scaffolding.
- Added Windows Java setup documentation for Firebase emulator validation.
- Added callable emulator dry-run harness scaffolding for PIN, settings/admin, phone dry-run, and Salestrail dry-run source contract checks.
- Added explicit Auth and Functions emulator ports for callable validation.
- Added emulator harness execution report showing non-emulator validation passes and emulator startup remains blocked because Java is not visible on PATH.
- Fixed callable emulator host detection and verified emulator preflight, rules, Firestore smoke, and callable dry-run harness execution.
- Fixed Functions Admin SDK timestamp compatibility and restored executable emulator coverage for PIN setup/change and settings/admin mutation callables.
- Performed safe cleanup of low-risk lint warnings and stale deployment copy without changing Firebase rules, config, project selection, or CRM workflow behaviour.
- Added UI audit planning for the next documentation-only workflow audit goal.
- Added ASG CRM Engineering Handbook structure.
- Added Codex operating playbook and prompt templates.
- Added roadmap, goal structure, development standards, git strategy, UI guidelines, testing standard, release process, security guidelines, architecture summary, decision log, and risk register.
- Updated `AGENTS.md` as the root Codex operating contract.

## Entry Template

```text
## YYYY-MM-DD

- Change:
- Reason:
- Validation:
- Follow-up:
```
