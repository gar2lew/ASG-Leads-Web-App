# Sales Rep UAT Test Plan

Release: v1.0 Internal Production Release
Role: Sales Representative
Environment: Approved UAT environment only

## Safety Rules

- Use approved UAT test data only.
- Do not use production Firebase data unless explicitly approved for UAT.
- Do not run live Salestrail sync.
- Do not run phone normalisation with `dryRun:false`.
- Do not run migrations.
- Do not deploy.

## REP-001 Login

| Field | Detail |
| --- | --- |
| Objective | Confirm a rep can log in and land in the correct daily workspace. |
| Preconditions | Rep test account exists with approved PIN or recovery details. Browser and device are recorded. |
| Steps | 1. Open the CRM. 2. Select the rep profile. 3. Enter the PIN. 4. Confirm user name, role, region, and navigation. 5. Refresh the browser. |
| Expected Result | Rep signs in without error, sees rep-appropriate navigation, and session restore works after refresh. |
| Pass/Fail |  |
| Notes |  |

## REP-002 Dashboard

| Field | Detail |
| --- | --- |
| Objective | Confirm the rep can identify what to do next from Dashboard or My Dashboard. |
| Preconditions | Test account has leads in new, callback, follow-up, booked, and stale states. |
| Steps | 1. Open Dashboard. 2. Review daily priorities. 3. Review counts, targets, alerts, and next-action cues. 4. Open the next lead or queue from the dashboard. |
| Expected Result | Rep can identify the next useful action within two minutes and labels are understandable. |
| Pass/Fail |  |
| Notes |  |

## REP-003 Lead Management

| Field | Detail |
| --- | --- |
| Objective | Confirm a rep can open, review, and safely update a lead. |
| Preconditions | Test lead is safe to edit and assigned or visible to the rep. |
| Steps | 1. Open Leads. 2. Select a test lead. 3. Review contact, status, property, activity, and next action. 4. Update one safe editable field. 5. Save or observe autosave. 6. Reopen the lead. |
| Expected Result | Lead context is clear, edited value persists, and no unrelated fields change. |
| Pass/Fail |  |
| Notes |  |

## REP-004 Searching

| Field | Detail |
| --- | --- |
| Objective | Confirm a rep can find leads quickly. |
| Preconditions | Test leads include different names, suburbs, phone values, and statuses. |
| Steps | 1. Search by name. 2. Search by partial phone. 3. Filter by status. 4. Clear filters. 5. Open a result and return to the list. |
| Expected Result | Search results are accurate, filter state is understandable, and return flow is not disorienting. |
| Pass/Fail |  |
| Notes |  |

## REP-005 Notes

| Field | Detail |
| --- | --- |
| Objective | Confirm a rep can add and review lead notes. |
| Preconditions | Test lead has existing note history or is safe to add a note to. |
| Steps | 1. Open the lead notes area. 2. Add a UAT note. 3. Save. 4. Confirm author and timestamp. 5. Refresh or reopen the lead. |
| Expected Result | Note persists, is readable, and clearly shows author and timestamp. |
| Pass/Fail |  |
| Notes |  |

## REP-006 Appointments

| Field | Detail |
| --- | --- |
| Objective | Confirm a rep can create and verify an appointment. |
| Preconditions | Test lead is safe to link to an appointment. |
| Steps | 1. Open the appointment action from the lead or Calendar. 2. Create an appointment with date, time, rep, service type, and note. 3. Save. 4. Confirm the appointment appears in Calendar. 5. Confirm it is visible from the lead. |
| Expected Result | Appointment is saved once, linked to the correct lead, and date/time are clear. |
| Pass/Fail |  |
| Notes |  |

## REP-007 Documents

| Field | Detail |
| --- | --- |
| Objective | Confirm a rep can find lead or client documents without confusion. |
| Preconditions | Test lead or linked client has at least one safe document or document placeholder. |
| Steps | 1. Open the lead or client document area. 2. Review document labels. 3. Open or preview an approved test document if available. 4. Return to the lead. |
| Expected Result | Documents are discoverable, labels are clear, and navigation back to the lead is easy. |
| Pass/Fail |  |
| Notes |  |

## REP-008 Reports

| Field | Detail |
| --- | --- |
| Objective | Confirm a rep can understand personal performance and activity reporting where available. |
| Preconditions | Test account has known activity counts. |
| Steps | 1. Open rep dashboard or reports available to the role. 2. Review calls, appointments, booked leads, and follow-up indicators. 3. Compare against known test activity. |
| Expected Result | Rep-facing metrics are understandable and do not expose manager-only data. |
| Pass/Fail |  |
| Notes |  |

## REP-009 Salestrail

| Field | Detail |
| --- | --- |
| Objective | Confirm rep-facing Salestrail information is understandable if visible. |
| Preconditions | Use mocked, dry-run, or approved test call records only. No live sync. |
| Steps | 1. Open a lead with call history. 2. Review Salestrail or call timeline labels if present. 3. Confirm imported and manual calls are distinguishable. |
| Expected Result | Rep can understand call history without running sync or needing admin controls. |
| Pass/Fail |  |
| Notes |  |

## REP-010 Settings

| Field | Detail |
| --- | --- |
| Objective | Confirm a rep can review personal settings without seeing admin-only controls. |
| Preconditions | Rep account has access to personal settings. |
| Steps | 1. Open My Settings. 2. Review profile, region, notification, and preference controls. 3. Change one safe preference if approved. 4. Save and refresh. |
| Expected Result | Personal settings are clear, safe changes persist, and admin controls are not visible. |
| Pass/Fail |  |
| Notes |  |

## REP-011 Logout

| Field | Detail |
| --- | --- |
| Objective | Confirm a rep can safely end the session. |
| Preconditions | Rep is signed in. |
| Steps | 1. Use the logout control. 2. Confirm the login screen appears. 3. Refresh the browser. |
| Expected Result | Session ends clearly and protected CRM content is no longer visible. |
| Pass/Fail |  |
| Notes |  |
