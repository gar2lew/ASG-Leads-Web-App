# Manager UAT Test Plan

Release: v1.0 Internal Production Release
Role: Manager
Environment: Approved UAT environment only

## Safety Rules

- Use approved UAT test data only.
- Do not run live Salestrail sync, migrations, phone backfill writes, or deploy commands.
- Do not approve production Firebase changes during UAT.

## MGR-001 Login

| Field | Detail |
| --- | --- |
| Objective | Confirm a manager can log in and see manager-appropriate navigation. |
| Preconditions | Manager test account exists with approved access. |
| Steps | 1. Open CRM. 2. Select manager profile. 3. Enter PIN. 4. Confirm role, region, and team navigation. 5. Refresh browser. |
| Expected Result | Manager signs in, sees team and reporting surfaces, and does not see director-only or unsafe admin controls unless assigned. |
| Pass/Fail |  |
| Notes |  |

## MGR-002 Dashboard

| Field | Detail |
| --- | --- |
| Objective | Confirm the manager can understand team workload and daily priorities. |
| Preconditions | Test data includes multiple reps and activity states. |
| Steps | 1. Open Dashboard. 2. Review team counts, follow-ups, stale leads, appointments, and alerts. 3. Identify one rep or lead needing attention. |
| Expected Result | Manager can identify team priorities without opening multiple unrelated screens. |
| Pass/Fail |  |
| Notes |  |

## MGR-003 Lead Management

| Field | Detail |
| --- | --- |
| Objective | Confirm manager can review lead context and coach staff without unsafe edits. |
| Preconditions | Test manager can view team leads. |
| Steps | 1. Open Leads. 2. Open a rep-owned lead. 3. Review status, notes, calls, appointments, and timeline. 4. Make a safe note if approved. |
| Expected Result | Manager can understand lead progress and role boundaries are clear. |
| Pass/Fail |  |
| Notes |  |

## MGR-004 Searching

| Field | Detail |
| --- | --- |
| Objective | Confirm manager can find leads by staff, status, region, and search terms. |
| Preconditions | Test data includes multiple reps and regions if applicable. |
| Steps | 1. Search by name. 2. Filter by status. 3. Filter or group by rep if available. 4. Review results. |
| Expected Result | Search and filters support team review without exposing unrelated restricted data. |
| Pass/Fail |  |
| Notes |  |

## MGR-005 Notes

| Field | Detail |
| --- | --- |
| Objective | Confirm manager can review and add appropriate notes. |
| Preconditions | Test lead has existing notes from at least one rep. |
| Steps | 1. Open lead or client notes. 2. Review note history. 3. Add a manager UAT note if approved. 4. Confirm author and timestamp. |
| Expected Result | Manager notes are clear, persisted, and distinguishable from rep notes. |
| Pass/Fail |  |
| Notes |  |

## MGR-006 Appointments

| Field | Detail |
| --- | --- |
| Objective | Confirm manager can review appointment load and appointment quality. |
| Preconditions | Test data includes appointments for multiple reps. |
| Steps | 1. Open Calendar. 2. Review appointments by date. 3. Open an appointment linked to a lead. 4. Confirm lead context is reachable. |
| Expected Result | Manager can inspect appointment quality and linked lead context. |
| Pass/Fail |  |
| Notes |  |

## MGR-007 Documents

| Field | Detail |
| --- | --- |
| Objective | Confirm manager can review relevant documents for a client or deal. |
| Preconditions | Test client or deal has safe document records. |
| Steps | 1. Open Client Hub or Deal Dashboard. 2. Locate documents. 3. Open or preview an approved test document if available. 4. Return to manager workflow. |
| Expected Result | Documents are discoverable and manager can return to the review context. |
| Pass/Fail |  |
| Notes |  |

## MGR-008 Reports

| Field | Detail |
| --- | --- |
| Objective | Confirm manager reporting supports daily coaching and performance review. |
| Preconditions | Test data includes multiple reps and known activity. |
| Steps | 1. Open Reports. 2. Review daily summary. 3. Review conversion or activity metrics. 4. Change date range. 5. Compare visible metrics to known test data. |
| Expected Result | Metrics are understandable, trusted, and useful for daily management. |
| Pass/Fail |  |
| Notes |  |

## MGR-009 Salestrail

| Field | Detail |
| --- | --- |
| Objective | Confirm manager can interpret Salestrail call history if visible. |
| Preconditions | Use only mocked, dry-run, or approved test call records. |
| Steps | 1. Open a lead with call history. 2. Review call timeline or Salestrail indicators. 3. Identify whether calls are matched, unmatched, imported, or manual if labels exist. |
| Expected Result | Manager can understand call activity without running live sync. |
| Pass/Fail |  |
| Notes |  |

## MGR-010 Settings

| Field | Detail |
| --- | --- |
| Objective | Confirm manager settings are role-appropriate. |
| Preconditions | Manager account is signed in. |
| Steps | 1. Open settings available to manager. 2. Review profile and notification controls. 3. Confirm admin-only settings are absent or read-only. |
| Expected Result | Manager can manage own preferences without unsafe admin powers. |
| Pass/Fail |  |
| Notes |  |

## MGR-011 Logout

| Field | Detail |
| --- | --- |
| Objective | Confirm manager can end session safely. |
| Preconditions | Manager is signed in. |
| Steps | 1. Logout. 2. Confirm login screen appears. 3. Refresh. |
| Expected Result | Manager session ends and protected content is no longer visible. |
| Pass/Fail |  |
| Notes |  |
