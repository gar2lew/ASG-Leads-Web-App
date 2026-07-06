# Product Releases

## Purpose

This file tracks ASG CRM product history and future version-based release planning.

It separates local validation, review readiness, merge status, tag status, and production readiness. Do not mark a release production-ready unless it is merged, tagged, validated, and approved.

## Release Naming Rules

- Use semantic product versions for planned product releases: `v1.0`, `v1.1`, `v1.2`.
- Use Git tags for reviewed stable milestones: `release/<release-name>`.
- Do not force-move existing release tags without explicit approval.
- If a tag points to the wrong commit, prefer a corrected tag name such as `release/sprint-1-stable-v2`.
- Record whether a release is local-only, review-ready, merged, tagged, or production-ready.

## Completed Releases

| Release | Status | Evidence | Notes |
| --- | --- | --- | --- |
| v0.8 Engineering Foundation | Review-ready, locally validated | `docs/sprint-1-report.md`, `docs/sprint-1-review-pr.md`, Sprint 1 validation commands | PR #17 is open draft at time of this documentation. Existing release tags need human verification before being treated as release evidence. |
| v0.9 Staff Experience | Review-ready, locally validated | `docs/sprint-2-report.md`, `docs/sprint-2-review-pr.md`, Sprint 2 validation commands | PR #18 is open draft and stacked on Sprint 1 at time of this documentation. Existing release tags need human verification before being treated as release evidence. |

## Planned Releases

| Version | Name | Objective | Status |
| --- | --- | --- | --- |
| v1.0 | Internal Production Release | Establish safe internal production use with UAT, rollback, release checklist, and staff onboarding. | Planned |
| v1.1 | Salestrail | Add trusted Salestrail call history with safe dry-run, matching, reconciliation, and review workflows. | Planned |
| v1.2 | Reporting | Upgrade reporting definitions, manager rhythm, exports, and aggregation strategy. | Planned |
| v1.3 | AI Assistant | Add approved AI assistance such as lead summaries and manager summaries. | Proposed |
| v1.4 | Document Centre | Build document workflow and document status surfaces. | Proposed |
| v1.5 | Client Timeline | Improve client timeline, appointment, document, note, and deal context. | Proposed |
| v2.0 | ASG-X Online | Define and build the online-only ASG-X platform path. | Future discovery |

## Release Quality Gates

Every release must have:

- Scope and out-of-scope definition.
- Typecheck pass.
- Lint pass.
- Tests pass.
- Build pass.
- Emulator checks pass where Firebase or callable surfaces are relevant.
- Functions build pass where Functions could be affected.
- Risk register updated.
- Changelog updated.
- Known issues reviewed.
- Pending decisions reviewed.
- Rollback plan.
- Human review.
- Explicit approval for production Firebase, migrations, live Salestrail sync, phone backfill writes, and deploys.

## Release Template

```text
Version:
Name:
Objective:
Scope:
Out of scope:
User groups:
Validation:
Firebase/data impact:
Risks:
Known issues:
Decisions:
Rollback:
UAT status:
Merge status:
Tag:
Production approval:
Post-release monitoring:
```
