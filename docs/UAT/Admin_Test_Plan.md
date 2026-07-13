# Admin UAT Test Plan

Release: v1.0 Internal Production Release
Role: Admin
Environment: Approved UAT environment only

## Safety Rules

- Do not deploy.
- Do not change Firebase config, rules, indexes, or project selection.
- Do not run live Salestrail sync.
- Do not run phone normalisation with `dryRun:false`.
- Do not run migration scripts.
- Use test accounts and approved UAT data only.

## ADM-001 Login

| Field | Detail |
| --- | --- |
| Objective | Confirm admin can log in and reach admin workspace safely. |
| Preconditions | Admin test account exists with approved role and region access. |
| Steps | 1. Open CRM. 2. Select admin profile. 3. Enter PIN. 4. Confirm admin navigation and release metadata visibility. 5. Refresh browser. |
| Expected Result | Admin signs in, sees admin-appropriate controls, and session restore works. |
| Pass/Fail |  |
| Notes |  |

## ADM-002 Dashboard

| Field | Detail |
| --- | --- |
| Objective | Confirm admin can understand operational status and safety warnings. |
| Preconditions | Test data includes staff, leads, settings history, and release metadata. |
| Steps | 1. Open Dashboard or Admin. 2. Review health, alerts, release metadata, and system state. 3. Identify any risky controls. |
| Expected Result | Admin can understand system health without running unsafe actions. |
| Pass/Fail |  |
| Notes |  |

## ADM-003 Lead Management

| Field | Detail |
| --- | --- |
| Objective | Confirm admin can inspect and safely support lead workflows. |
| Preconditions | Admin has approved test data access. |
| Steps | 1. Open Leads. 2. Open a test lead. 3. Review status, assignment, notes, appointments, documents, and audit cues. 4. Make only approved test edits. |
| Expected Result | Admin can support staff while preserving data safety and understanding role impact. |
| Pass/Fail |  |
| Notes |  |

## ADM-004 Searching

| Field | Detail |
| --- | --- |
| Objective | Confirm admin can locate records for support and issue triage. |
| Preconditions | Test data includes known lead, rep, client, and appointment records. |
| Steps | 1. Search by lead name. 2. Search by phone. 3. Filter by status or rep. 4. Locate related client or appointment. |
| Expected Result | Admin can find support records quickly and safely. |
| Pass/Fail |  |
| Notes |  |

## ADM-005 Notes

| Field | Detail |
| --- | --- |
| Objective | Confirm admin can review notes and understand audit-sensitive history. |
| Preconditions | Test lead or client has notes from multiple roles. |
| Steps | 1. Open notes. 2. Review author, timestamp, and note content. 3. Add an admin UAT note if approved. 4. Confirm it persists. |
| Expected Result | Notes are readable and admin notes are clearly attributed. |
| Pass/Fail |  |
| Notes |  |

## ADM-006 Appointments

| Field | Detail |
| --- | --- |
| Objective | Confirm admin can inspect appointment configuration and linked records. |
| Preconditions | Test data includes appointments. |
| Steps | 1. Open Calendar. 2. Locate a test appointment. 3. Review linked lead or client. 4. Confirm status and notes are clear. |
| Expected Result | Admin can support appointment issues without accidental data damage. |
| Pass/Fail |  |
| Notes |  |

## ADM-007 Documents

| Field | Detail |
| --- | --- |
| Objective | Confirm admin can inspect document workflow surfaces safely. |
| Preconditions | Test documents or placeholders exist. |
| Steps | 1. Open Document Centre or a linked client/deal document area. 2. Review document labels and status. 3. Open approved test document if available. 4. Do not send live DocuSign envelopes unless separately approved. |
| Expected Result | Admin can understand document state and risky external-send actions are not accidental. |
| Pass/Fail |  |
| Notes |  |

## ADM-008 Reports

| Field | Detail |
| --- | --- |
| Objective | Confirm admin can review reports for support and validation. |
| Preconditions | Test report data exists. |
| Steps | 1. Open Reports. 2. Review daily summary and activity metrics. 3. Export only if approved for UAT. 4. Compare against known test data. |
| Expected Result | Admin can interpret reporting enough to support staff and release review. |
| Pass/Fail |  |
| Notes |  |

## ADM-009 Salestrail

| Field | Detail |
| --- | --- |
| Objective | Confirm Salestrail admin controls are understandable and safe. |
| Preconditions | No live credentials are required. Use mocked or dry-run-only state. |
| Steps | 1. Open Salestrail settings or admin area. 2. Confirm secret names are referenced only by name if visible. 3. Review dry-run wording. 4. Confirm live sync is not run. 5. Review lock reset wording if present. |
| Expected Result | Admin can identify safe dry-run controls and understands that live sync remains approval-gated. |
| Pass/Fail |  |
| Notes |  |

## ADM-010 Settings

| Field | Detail |
| --- | --- |
| Objective | Confirm admin settings are clear, auditable, and reversible. |
| Preconditions | Use test settings only if edits are approved. |
| Steps | 1. Open Admin settings. 2. Review users, roles, regions, app settings, and settings history. 3. Make one safe test-only setting change if approved. 4. Confirm audit/history entry. 5. Revert if required. |
| Expected Result | Admin understands setting impact, history is visible, and risky actions are clearly marked. |
| Pass/Fail |  |
| Notes |  |

## ADM-011 Logout

| Field | Detail |
| --- | --- |
| Objective | Confirm admin session can be ended safely. |
| Preconditions | Admin is signed in. |
| Steps | 1. Logout. 2. Confirm login screen appears. 3. Refresh. |
| Expected Result | Admin content is no longer visible after logout. |
| Pass/Fail |  |
| Notes |  |
