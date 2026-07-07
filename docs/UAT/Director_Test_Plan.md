# Director UAT Test Plan

Release: v1.0 Internal Production Release
Role: Director
Environment: Approved UAT environment only

## Safety Rules

- Director UAT is review and sign-off focused.
- Do not deploy.
- Do not approve production Firebase action inside this test script unless a separate release approval process is held.
- Do not run live Salestrail sync, migrations, or phone backfill writes.

## DIR-001 Login

| Field | Detail |
| --- | --- |
| Objective | Confirm director can log in and access executive review surfaces. |
| Preconditions | Director or director-review test account exists. |
| Steps | 1. Open CRM. 2. Select director profile. 3. Enter PIN. 4. Confirm available navigation. 5. Refresh browser. |
| Expected Result | Director signs in and sees business review surfaces without unnecessary operational clutter. |
| Pass/Fail |  |
| Notes |  |

## DIR-002 Dashboard

| Field | Detail |
| --- | --- |
| Objective | Confirm dashboard gives confidence in business state. |
| Preconditions | Test data includes team activity, lead status, appointments, and reports. |
| Steps | 1. Open Dashboard. 2. Review key metrics and alerts. 3. Identify business priorities. 4. Note any unclear labels or missing context. |
| Expected Result | Director can understand current business position and areas needing attention. |
| Pass/Fail |  |
| Notes |  |

## DIR-003 Lead Management

| Field | Detail |
| --- | --- |
| Objective | Confirm director can review lead pipeline health without changing staff workflow. |
| Preconditions | Test data includes leads across statuses and reps. |
| Steps | 1. Open Leads or pipeline view. 2. Review status distribution. 3. Open one lead. 4. Review timeline, notes, appointments, and status. |
| Expected Result | Director can understand lead quality and progress without making operational changes. |
| Pass/Fail |  |
| Notes |  |

## DIR-004 Searching

| Field | Detail |
| --- | --- |
| Objective | Confirm director can locate business records for review. |
| Preconditions | Known test lead, client, or rep activity exists. |
| Steps | 1. Search for a known lead or client. 2. Filter by status or rep if available. 3. Open and return to previous view. |
| Expected Result | Search supports executive review without confusion. |
| Pass/Fail |  |
| Notes |  |

## DIR-005 Notes

| Field | Detail |
| --- | --- |
| Objective | Confirm director can understand record history and staff notes. |
| Preconditions | Test lead or client has note history. |
| Steps | 1. Open lead or client notes. 2. Review author, timestamp, and note order. 3. Add a director UAT note only if approved. |
| Expected Result | Notes provide useful business context and are clearly attributed. |
| Pass/Fail |  |
| Notes |  |

## DIR-006 Appointments

| Field | Detail |
| --- | --- |
| Objective | Confirm director can review appointment volume and quality. |
| Preconditions | Test appointments exist. |
| Steps | 1. Open Calendar or reports. 2. Review upcoming and recent appointments. 3. Open a linked lead if needed. |
| Expected Result | Director can understand appointment rhythm and linked lead context. |
| Pass/Fail |  |
| Notes |  |

## DIR-007 Documents

| Field | Detail |
| --- | --- |
| Objective | Confirm director can understand document workflow readiness. |
| Preconditions | Test client, deal, or document records exist. |
| Steps | 1. Open Document Centre, client, or deal document area. 2. Review document status labels. 3. Note any confusing workflow or compliance gaps. |
| Expected Result | Director has confidence that document surfaces are usable for internal release or knows what remains blocked. |
| Pass/Fail |  |
| Notes |  |

## DIR-008 Reports

| Field | Detail |
| --- | --- |
| Objective | Confirm reporting answers core business questions for v1.0. |
| Preconditions | Test data includes multiple reps, leads, calls, appointments, and conversions. |
| Steps | 1. Open Reports. 2. Review manager and director dashboards if available. 3. Review daily summary, conversion metrics, pipeline, compliance, and staff activity. 4. Identify any metric that is unclear or not trusted. |
| Expected Result | Reports are understandable enough for internal release and any metric gaps are logged. |
| Pass/Fail |  |
| Notes |  |

## DIR-009 Salestrail

| Field | Detail |
| --- | --- |
| Objective | Confirm director understands Salestrail release posture. |
| Preconditions | Salestrail remains dry-run-first and live sync blocked. |
| Steps | 1. Review any visible Salestrail reporting or call history. 2. Confirm live sync is not required for v1.0 approval. 3. Record whether Salestrail should block or move to v1.1. |
| Expected Result | Director understands Salestrail is not a fully approved live integration unless separately signed off. |
| Pass/Fail |  |
| Notes |  |

## DIR-010 Settings

| Field | Detail |
| --- | --- |
| Objective | Confirm director can review release controls, risk posture, and admin boundaries. |
| Preconditions | Release docs and admin settings are available. |
| Steps | 1. Review Admin or settings surfaces available to director. 2. Review risk warnings and release metadata. 3. Confirm production actions remain approval-gated. |
| Expected Result | Director can make an informed go/no-go decision without unsafe system changes. |
| Pass/Fail |  |
| Notes |  |

## DIR-011 Logout

| Field | Detail |
| --- | --- |
| Objective | Confirm director session can be ended safely. |
| Preconditions | Director is signed in. |
| Steps | 1. Logout. 2. Confirm login screen appears. 3. Refresh. |
| Expected Result | Director content is no longer visible after logout. |
| Pass/Fail |  |
| Notes |  |
