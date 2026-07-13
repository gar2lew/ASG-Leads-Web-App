# v1.0 UAT Triage

Release: v1.0 Internal Production Release
Status: UAT issue remediation in progress
Prepared: 2026-07-07

## Triage Rules

- Create one issue row per defect, confusion point, documentation mismatch, or improvement request.
- Do not downgrade Critical or High issues to make the release pass.
- Link issues back to the role and test case that found them.
- Production deploy, live Salestrail sync, phone write backfill, and migrations remain blocked by default.

## Triage Matrix

| Severity | Definition | Release Impact | Response Target |
| --- | --- | --- | --- |
| Critical | Blocks login, core lead work, data safety, security, permissions, or release approval. | No-Go until fixed or formally accepted by release owner with explicit rationale. | Same business day triage. |
| High | Blocks a major staff workflow or creates material risk of incorrect CRM records. | No-Go unless workaround is approved, documented, and retested. | Triage before release decision. |
| Medium | Causes repeated confusion, slows staff, affects mobile usability, or reduces confidence. | Can proceed only with tracked issue and accepted workaround or backlog item. | Triage before go/no-go meeting. |
| Low | Cosmetic, minor wording, minor layout, or isolated preference issue. | Can proceed if tracked. | Triage into backlog. |

## Issue Register

| ID | Description | Reproduction steps | Expected behaviour | Actual behaviour | Severity | Owner | Status | Target version |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| UAT-ISS-001 | Initial lead list was empty. Quick Pull imported leads with missing dates and appeared to stop at 100 leads. | Open the CRM during staff UAT, observe no leads visible initially, run Quick Pull, then review imported leads and import totals. | CRM should load the current working lead set where possible. Quick Pull should not depend on the 100-lead UI window, should preserve valid lead dates, should use a clear fallback for missing or invalid dates, and should report imported, updated, skipped, failed, fallback date, and possible limit counts. | No leads appeared initially. Quick Pull was required, imported some leads without dates, and appeared to stop at 100 leads. | High | Engineering | Remediated with validation passed, pending staff retest | v1.0 |

## Critical Issues

| ID | Description | Owner | Status | Target version | Release decision |
| --- | --- | --- | --- | --- | --- |
| None recorded |  |  |  |  |  |

## High Issues

| ID | Description | Owner | Status | Target version | Workaround |
| --- | --- | --- | --- | --- | --- |
| UAT-ISS-001 | Initial lead list empty and Quick Pull date/limit behaviour unreliable. | Engineering | Remediated with validation passed, pending staff retest | v1.0 | Manual Quick Pull remains available, but the branch now loads legacy-compatible leads and reports Quick Pull results clearly. |

## Medium Issues

| ID | Description | Owner | Status | Target version | Backlog link |
| --- | --- | --- | --- | --- | --- |
| None recorded |  |  |  |  |  |

## Low Issues

| ID | Description | Owner | Status | Target version | Backlog link |
| --- | --- | --- | --- | --- | --- |
| None recorded |  |  |  |  |  |

## Blocker Linkage From Chief Engineer Review

| Chief Engineer blocker | Required UAT outcome | Tracking file | Current status |
| --- | --- | --- | --- |
| Staff UAT has not been executed or signed off. | All required role scripts completed or formally marked not applicable, with sign-off captured. | `docs/UAT/UAT_RESULTS.md`, `docs/UAT/UAT_SUMMARY.md` | Pending |
| Sprint PR merge state and release tags require human verification. | UAT identifies candidate commit and records whether review is against a merged or stacked branch. | `docs/UAT/UAT_SUMMARY.md` | Pending |
| Backup and recovery rehearsal remains incomplete. | UAT release readiness confirms rehearsal is either complete or remains a No-Go blocker. | `docs/UAT/UAT_SUMMARY.md` | Pending |
| Production Firebase deploys remain approval-gated. | UAT confirms no deploy was required or performed, and any deployment need is escalated to release approval. | `docs/UAT/UAT_RESULTS.md`, `docs/UAT/UAT_SUMMARY.md` | Pending |
| Broad Firestore rules and callable auth risks remain documented. | UAT records whether staff workflows can proceed with accepted risk or whether a security fix is required before release. | `docs/UAT/UAT_TRIAGE.md`, `docs/UAT/UAT_SUMMARY.md` | Pending |
| Dependency audit advisories remain open. | UAT records whether advisories are accepted for v1.0, deferred, or become release blockers due to UAT findings. | `docs/UAT/UAT_SUMMARY.md` | Pending |
| Salestrail live sync, migrations, and phone write backfill remain blocked. | UAT confirms blocked actions were not run and any need for them becomes a release decision, not a test action. | `docs/UAT/UAT_RESULTS.md`, `docs/UAT/UAT_SUMMARY.md` | Pending |

## Triage Decision Log

| Date | Issue ID | Decision | Owner | Notes |
| --- | --- | --- | --- | --- |
| 2026-07-07 | UAT-ISS-001 | Treat as High severity because it blocks staff confidence in lead availability and can create material risk of incorrect lead dates. | Engineering | Fix the import/load path first, then require staff retest before release sign-off. |
