# Known Issues

## Purpose

This file tracks current ASG CRM technical and product issues that are known, accepted, deferred, or scheduled for later work.

It is not a bug tracker replacement. It is the durable operating view for issues that must not be forgotten between Codex sessions, sprint reviews, and release planning.

## How To Use This File

- Add issues when they are confirmed by validation, review, user feedback, or release planning.
- Keep issue statements factual and specific to ASG CRM.
- Link each issue to a backlog item, risk, sprint report, or decision where possible.
- Do not close an issue unless validation evidence exists.
- Do not hide release blockers here. Release blockers must also appear in `docs/RISK_REGISTER.md` or the relevant release plan.

## Current Known Issues

| ID | Issue | Impact | Owner | Status | Target |
| --- | --- | --- | --- | --- | --- |
| KI-001 | Remaining Vite large chunk warnings. | Build output still warns about large chunks. | Engineering | Active | Bundle Optimisation |
| KI-002 | Firebase and PDF vendor chunks remain large. | Initial and route-specific load performance still needs focused review. | Engineering | Active | Bundle Optimisation |
| KI-003 | Existing `firebase-functions` outdated emulator advisory. | Emulator output warns about the Functions SDK version. | Engineering | Active | Dependency Audit |
| KI-004 | Salestrail no-network mock seam still required. | Salestrail coverage cannot fully execute live-API-adjacent paths safely. | Engineering | Active | Salestrail Mock Seam |
| KI-005 | Salestrail dry-run direct callable execution remains limited. | Dry-run source contracts exist, but live API network paths are still guarded. | Engineering | Active | Salestrail v1.1 |
| KI-006 | Production Firebase actions remain approval-gated. | Hosting, Functions, rules, indexes, and data changes require explicit release approval. | Release Manager | Active | v1.0 |
| KI-007 | Phone backfill writes remain blocked without approval. | `dryRun:false` phone normalisation can update many lead records. | Release Manager | Active | v1.0 or later |
| KI-008 | Live migrations remain blocked without approval. | Migration scripts can affect live lead data and must use runbooks. | Release Manager | Active | v1.0 or later |
| KI-009 | Dependency audit vulnerabilities require targeted remediation. | Root audit reports 26 advisories including 1 critical and 4 high after `jspdf`, transitive `dompurify`, and Firebase Firestore `@grpc/grpc-js` remediation. Functions audit reports 16 advisories including 3 high. | Engineering | Active | Dependency Remediation |
| KI-010 | Full staff UAT is still required before production rollout. | Local validation does not prove staff workflow acceptance. | Product Owner | Active | v1.0 |
| KI-011 | Firebase web SDK major upgrade requires a controlled migration plan. | Firebase 12 should remove the reviewed Firebase `undici` path, but it affects auth, Firestore, Functions, Storage, messaging, emulator tests, and bundle output. | Engineering | Active | Post-v1.0 or release-owner decision |
| KI-012 | Functions runtime dependency remediation needs a controlled backend upgrade plan. | `firebase-admin@14.1.0` is the audit-indicated Admin SDK remediation path, but it is semver-major and `firebase-functions@7.2.5` should be evaluated separately because callable, scheduled, trigger, emulator, and peer compatibility can change. | Engineering | Active | Post-v1.0 or release-owner decision |

## Build And Performance Warnings

- Vite still reports large chunk warnings after Sprint 1 and Sprint 2.
- Firebase and PDF vendor bundles remain above the default warning threshold.
- Sprint 1 split heavy vendor chunks, but did not fully optimise PDF, Firebase, map, report export, or document-centre loading.
- Bundle optimisation must stay separate from product workflow changes unless the change is clearly low-risk.

## Emulator And Tooling Limitations

- The emulator harnesses now run locally when Java and Firebase CLI are available.
- `firebase-functions` still emits an outdated SDK advisory during callable emulator execution.
- Firestore rules tests intentionally log permission denied messages for negative checks.
- Long-running shells can miss newly installed Java until the terminal is refreshed.
- Salestrail live-API-adjacent callable paths need a no-network mock seam before broader executable coverage.

## Firebase And Data Safety Concerns

- `.firebaserc` uses `amplify-leads-2026` as the default project, which is production-like.
- Production deploys remain blocked without explicit approval.
- Firestore rules, indexes, Functions exports, migration scripts, phone backfill writes, and Salestrail live sync must remain approval-gated.
- Tests should use emulator-only project IDs such as `demo-asg-crm-emulator`.
- Production data must not be used casually for local validation.

## Salestrail Limitations

- Salestrail should remain dry-run-first.
- Direct live sync must not run without explicit approval and reconciliation.
- A no-network mock seam is required before treating Salestrail callable coverage as complete.
- Unmatched call review is not yet a full product workflow.
- Call timeline presentation is planned but not complete.

## Reporting Limitations

- Reporting is still partly client-side and may need more server aggregation as data grows.
- Daily reporting depends on either live CRM activity or aggregated `dailyStats` records.
- Metric definitions need staff review before v1.0 production rollout.
- Report exports require visual and data accuracy checks before release.

## UI And Workflow Limitations

- Sprint 2 improved orientation and workflow cues, but full staff UAT is still required.
- Some large operational screens remain complex, including Admin, Lead Details, Reports, and DataTable surfaces.
- Shared UI primitives exist, but adoption is not complete across all screens.
- Mobile supports key workflows but not every admin or reporting workflow.

## Dependency And Audit Notes

- Dependency audit vulnerabilities have been reviewed in `docs/dependency-security-review.md`.
- Broad dependency updates should not be mixed into release preparation.
- Direct `jspdf`, transitive `dompurify`, and Firebase Firestore `@grpc/grpc-js` advisories have been remediated.
- Firebase web SDK `undici` risk remains deferred because Firebase 10.14.1 pins `undici@6.19.7` exactly and no safe Firebase 10 patch path exists.
- The reviewed browser build did not contain `undici`, but Node, audit, local tooling, and emulator surfaces still install it through Firebase 10 package metadata.
- Do not force an `undici` override without explicit approval because it would override exact Firebase dependency declarations.
- Firebase major upgrade planning now recommends `firebase@12.15.0` with `@firebase/rules-unit-testing@5.0.1` in a dedicated branch after v1.0 unless the release owner blocks v1.0 on the advisory.
- Firebase Functions SDK and Admin SDK updates now have a planning document in `docs/functions-runtime-dependency-remediation-plan.md`.
- Do not combine `firebase-admin` and `firebase-functions` major updates casually. Evaluate them separately unless release notes prove a required package pair.
- Audit fixes must not weaken tests or change production data behaviour casually.

## Issue Lifecycle

| Status | Meaning |
| --- | --- |
| New | Captured but not yet triaged. |
| Active | Confirmed and being tracked. |
| Accepted | Known and accepted for a defined period. |
| Scheduled | Assigned to a goal, sprint, or release. |
| Mitigated | Risk reduced, but still worth monitoring. |
| Closed | Fixed or no longer relevant with validation evidence. |

## Template For New Known Issues

```text
ID:
Title:
Date identified:
Source:
Area:
Impact:
Evidence:
Mitigation:
Owner:
Status:
Target release:
Related docs:
```
