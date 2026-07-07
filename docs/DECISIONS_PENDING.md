# Decisions Pending

## Purpose

This file tracks open product, architecture, workflow, data, AI, integration, and release decisions that should not be forgotten.

Pending decisions are not approvals. They are prompts for deliberate review before work proceeds.

## Decision Lifecycle

| Status | Meaning |
| --- | --- |
| Proposed | Decision has been raised but not yet reviewed. |
| In review | Actively being discussed or researched. |
| Blocked | Waiting on validation, user feedback, vendor access, or release status. |
| Decided | Outcome has been recorded in `docs/DECISION_LOG.md`. |
| Superseded | No longer relevant because the product direction changed. |

## Pending Decisions

| ID | Decision | Area | Status | Target |
| --- | --- | --- | --- | --- |
| DP-001 | Whether to prioritise v1.0 Internal Production Release or Salestrail first. | Release | Proposed | Sprint planning |
| DP-002 | Whether Salestrail call matching should be automatic, admin-reviewed, or mixed. | Salestrail | Proposed | v1.1 |
| DP-003 | Whether AI lead summaries should be generated on demand or stored. | AI | Proposed | v1.3 |
| DP-004 | Whether reporting should remain client-side or move more aggregation to Functions. | Reporting | Proposed | v1.2 |
| DP-005 | Whether ASG-X should share the CRM backend or become a separate app/backend. | Architecture | Proposed | v2.0 discovery |
| DP-006 | Whether the CRM should remain PWA-first or later become a native/mobile wrapper. | Product | Proposed | Future mobile planning |
| DP-007 | How strict role visibility should be between reps, managers and directors. | Security | Proposed | v1.0 |
| DP-008 | Whether to force-move old incorrect release tags or create corrected v2 tags only. | Release | Proposed | Release governance |
| DP-009 | Whether the Firebase web SDK major upgrade should block v1.0 or run immediately after v1.0. | Dependency security | Proposed | v1.0 go/no-go |
| DP-010 | Whether Functions runtime dependency remediation should block v1.0 or run immediately after v1.0. | Dependency security | Proposed | v1.0 go/no-go |

## Product Decisions

- Define whether v1.0 prioritises internal production hardening before Salestrail product expansion.
- Decide how much staff UAT is required before calling v1.0 production-ready.
- Decide which user groups must approve workflow changes: reps, managers, admins, or directors.

## Technical Decisions

- Decide whether reporting and dashboard aggregations should remain client-side for v1.0.
- Decide the bundle budget and whether vendor chunk warnings are acceptable for internal production.
- Decide how aggressively shared UI primitives should replace older page-specific UI.

## Data And Firebase Decisions

- Decide whether any v1.0 release needs Firestore rules changes or whether rules changes remain a later security goal.
- Decide the required backup/export process before any live migration or backfill.
- Decide whether phone normalisation becomes mandatory before Salestrail v1.1.
- Decide whether the remaining Firebase `undici` advisory is accepted for v1.0 with documented mitigation, or whether Firebase 12 upgrade becomes a pre-v1.0 blocker.
- Decide whether unresolved Functions runtime advisories are accepted for v1.0 with documented mitigation, or whether Admin SDK and Functions SDK remediation becomes a pre-v1.0 blocker.

## Salestrail Decisions

- Decide whether call matching is fully automatic, fully admin-reviewed, or mixed.
- Decide how unmatched calls are surfaced to admins.
- Decide whether imported Salestrail calls become part of the lead timeline, a separate timeline, or both.
- Decide whether Salestrail dry-run must reconcile counts before every live sync.

## Reporting Decisions

- Decide which reports are operational daily rhythm and which are management review.
- Decide whether daily reports should depend on scheduled Functions aggregation before v1.0.
- Decide final metric definitions for calls, appointments, booked, settled, missed, and stale leads.

## AI And Automation Decisions

- Decide whether AI lead summaries are stored or generated on demand.
- Decide whether AI next-action suggestions are advisory only or can update workflow fields after staff approval.
- Decide whether manager daily summaries are generated automatically or requested manually.

## Release Decisions

- Decide if Sprint 1 and Sprint 2 tags are release-quality tags or review milestones.
- Decide the v1.0 release owner and go/no-go authority.
- Decide whether corrected tags use v2 suffixes instead of force-moving existing tags.

## Decision Template

```text
ID:
Decision:
Date raised:
Owner:
Context:
Options:
Recommendation:
Risks:
Validation required:
Approval required:
Status:
Outcome:
Related docs:
```
