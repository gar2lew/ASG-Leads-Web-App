# Staff UAT Plan

Date: 2026-07-06
Branch: `goal/staff-uat`
Savepoint: `savepoint-before-staff-uat`

## Objective

Prepare user acceptance testing for ASG CRM v1.0 internal production readiness.

This plan is documentation only. It does not approve deployment, production Firebase changes, production data writes, live Salestrail sync, phone backfill writes, migrations, or destructive cleanup.

## UAT Scope

Staff UAT validates that real ASG users can complete daily CRM work safely and confidently.

Included:

- Login and PIN recovery flow.
- Rep daily workflow.
- Lead list and lead detail workflow.
- Call logging, notes, callbacks, follow-ups, and appointments.
- Client and deal review.
- Manager reporting workflow.
- Admin roster, settings, system health, and safe controls review.
- Mobile lead workflow smoke test.
- User guide and admin guide accuracy.

Excluded:

- Firebase deploy.
- Firestore rules or index deploy.
- Functions deploy.
- Production data migration.
- Live Salestrail sync.
- Phone normalisation with `dryRun:false`.
- Full production launch approval.
- Broad redesign or business logic changes.

## UAT Entry Criteria

Do not start UAT until all entry criteria are met.

| Criteria | Owner | Status |
| --- | --- | --- |
| Release candidate branch or commit is identified. | Release Manager | Pending |
| Working tree is clean before validation. | Engineering | Pending |
| Core validation has passed on the candidate. | Engineering | Pending |
| Emulator validation has passed where Firebase surfaces are in scope. | Engineering | Pending |
| UAT testers are assigned for rep, manager, admin, and director roles. | Product Owner | Pending |
| Test environment and data source are approved. | Release Manager | Pending |
| No live migration, Salestrail sync, phone backfill write, or deploy is included. | Release Manager | Pending |
| Staff know how to record issues and feedback. | Product Owner | Pending |

## UAT Roles

| Role | Recommended testers | Focus |
| --- | --- | --- |
| Rep | 2 staff members | Daily lead work, calls, notes, callbacks, mobile usability. |
| Manager | 1 staff member | Team visibility, reports, follow-up compliance, coaching view. |
| Admin | 1 staff member | Roster, permissions, settings, system health, risky controls. |
| Director | 1 reviewer | Business confidence, reporting, release sign-off. |
| Release Manager | 1 owner | Gatekeeping, issue severity, no-go decisions, rollback readiness. |

## UAT Data Rules

- Prefer emulator, staging, demo, or approved test data.
- Do not use production Firebase data for local testing.
- Do not create real customer commitments during UAT.
- Do not run live Salestrail sync.
- Do not run phone normalisation writes.
- Do not run migration scripts.
- Do not deploy Firebase surfaces.
- If testing in production-like data is explicitly approved later, record approval, owner, date, scope, and rollback plan before testing starts.

## Test Script Format

Each UAT script uses this structure:

| Field | Description |
| --- | --- |
| Script ID | Stable ID for issue references. |
| Role | Rep, Manager, Admin, Director, or Release Manager. |
| Goal | User outcome being tested. |
| Preconditions | Data, account, browser, or permission setup. |
| Steps | Human-readable actions. |
| Expected result | What must happen for pass. |
| Evidence | Screenshot, screen recording, notes, or issue ID. |
| Result | Pass, pass with issue, fail, blocked, or not run. |

## UAT Scripts

### UAT-001: Login And Session Start

Role: Rep, Manager, Admin

Goal: Confirm staff can sign in and land in the correct role-aware workspace.

Preconditions:

- Tester account exists.
- PIN or approved test credential is available.
- Browser cache state is noted.

Steps:

1. Open the CRM.
2. Select the tester profile.
3. Enter PIN.
4. Confirm the landing page.
5. Confirm user name, role, region, and available navigation.
6. Refresh the page and confirm session restoration.

Expected result:

- User signs in without error.
- Correct role and navigation are visible.
- User does not see unauthorised admin pages.
- Refresh does not lose the session unexpectedly.

### UAT-002: PIN Recovery

Role: Rep, Manager, Admin

Goal: Confirm PIN recovery wording and flow are understandable.

Preconditions:

- Use a test account only.
- Do not use or expose real backup passwords in notes.

Steps:

1. Start from login.
2. Choose forgotten PIN or recovery flow.
3. Follow prompts using approved test recovery details.
4. Set a new test PIN if the account is disposable.
5. Sign in with the new test PIN.

Expected result:

- Recovery flow is clear.
- Sensitive values are not shown after entry.
- Errors are understandable.
- User can complete recovery without admin intervention for the test account.

### UAT-003: Rep Daily Start

Role: Rep

Goal: Confirm a rep can understand what to do first.

Preconditions:

- Test rep has at least five leads across new, callback, follow-up, booked, and stale states.

Steps:

1. Sign in as a rep.
2. Open Dashboard or My Dashboard.
3. Identify today's priorities.
4. Open Inbox or lead queue.
5. Identify the next lead to work.
6. Confirm targets, alerts, and queue counts are understandable.

Expected result:

- Rep can identify the next best action within two minutes.
- Counts and labels are not confusing.
- Empty states are helpful if no tasks exist.

### UAT-004: Lead List Search And Filter

Role: Rep, Manager

Goal: Confirm staff can find the right leads quickly.

Preconditions:

- Test leads include multiple suburbs, statuses, reps, and call states.

Steps:

1. Open Leads.
2. Search by name.
3. Search by phone or partial phone.
4. Filter by status.
5. Filter by rep or region if available to the role.
6. Open a lead from the results.
7. Return to the list and confirm context is not disorienting.

Expected result:

- Search and filters return expected leads.
- Role-restricted views do not expose inappropriate records.
- Lead opening and return flow is clear.

### UAT-005: Lead Detail Update

Role: Rep

Goal: Confirm a rep can update a lead without losing work.

Preconditions:

- Test lead is safe to edit.

Steps:

1. Open a lead.
2. Review contact details and current status.
3. Update a normal editable field.
4. Add or update lead-level notes if appropriate.
5. Save or wait for autosave if the screen uses autosave.
6. Refresh or reopen the lead.

Expected result:

- Save state is visible.
- Edited data persists.
- Errors are visible if saving fails.
- No unrelated fields change.

### UAT-006: Log Call

Role: Rep

Goal: Confirm calls can be logged and appear in history and reporting surfaces.

Preconditions:

- Test lead is safe to call-log.

Steps:

1. Open a test lead.
2. Open Log Call.
3. Select a call outcome.
4. Add notes.
5. Save the call.
6. Confirm call appears in lead call history.
7. Confirm rep daily call count updates where visible.

Expected result:

- Call saves once.
- Notes and outcome are accurate.
- Call history ordering is understandable.
- Dashboard or report count updates as expected.

### UAT-007: Callback And Follow-Up

Role: Rep

Goal: Confirm scheduled work appears when expected.

Preconditions:

- Test lead is safe to update.

Steps:

1. Open a lead.
2. Set a callback date and time.
3. Save and close the lead.
4. Confirm the lead appears in callback or queue surfaces.
5. Set a follow-up date if available.
6. Confirm next action wording is understandable.

Expected result:

- Callback and follow-up values persist.
- Queue and next-action cues are clear.
- Overdue and due-today states are distinguishable.

### UAT-008: Notes

Role: Rep, Manager

Goal: Confirm staff can add and review notes in the right place.

Preconditions:

- Test lead or client has existing notes.

Steps:

1. Open lead detail or client profile.
2. Add a note.
3. Confirm author and timestamp appear.
4. Refresh or reopen the record.
5. Confirm note history remains readable.

Expected result:

- Note persists.
- Note source is understandable.
- Staff can tell current notes from historical notes.

### UAT-009: Appointment Creation

Role: Rep, Manager

Goal: Confirm staff can create and link appointments.

Preconditions:

- Test lead exists.
- Calendar service types are available.

Steps:

1. Open Calendar or appointment action from a lead.
2. Create an appointment linked to the lead.
3. Set date, time, rep, service type, and notes.
4. Save.
5. Confirm appointment appears in Calendar.
6. Confirm linked lead shows the appointment.

Expected result:

- Appointment saves and is linked to the correct lead.
- Time and date are clear.
- No duplicate appointment is created.

### UAT-010: Client And Deal Review

Role: Manager, Admin

Goal: Confirm managers can review client context and deal progress.

Preconditions:

- Test data includes at least one converted lead with deal context.

Steps:

1. Open Client Hub.
2. Find a client.
3. Review notes, appointments, documents, and deal status.
4. Open Deal Dashboard.
5. Review pipeline, stuck or chase list signals, and forecast context.

Expected result:

- Manager can understand the client and deal status without asking engineering.
- Notes, appointments, and documents are discoverable.
- Stuck or at-risk deal cues are understandable.

### UAT-011: Reporting Review

Role: Manager, Director

Goal: Confirm reporting is understandable and trusted enough for internal use.

Preconditions:

- Test data includes multiple reps and activity.

Steps:

1. Open Reports.
2. Review daily report.
3. Change date range or selected date.
4. Sort or filter report if available.
5. Export CSV if the release candidate includes export testing.
6. Compare visible metrics with known test activity.

Expected result:

- Metrics are understandable.
- Staff can tell live data from aggregated or missing data.
- CSV export, if tested, matches visible report values.

### UAT-012: Admin Roster And Permissions Review

Role: Admin

Goal: Confirm admin can review users and permissions without unsafe changes.

Preconditions:

- Use test accounts only for any edit.

Steps:

1. Open Admin.
2. Review rep roster.
3. Inspect role, active status, region, and page permissions.
4. Make a safe test-only permission change if approved for UAT.
5. Confirm the UI explains the impact.
6. Revert the test-only change if one was made.

Expected result:

- Admin can understand who has access.
- Permission labels are clear.
- Sensitive changes are not easy to perform accidentally.

### UAT-013: Admin Settings And System Health

Role: Admin, Release Manager

Goal: Confirm admin can inspect settings and health without running risky actions.

Preconditions:

- No live Salestrail sync, phone backfill write, migration, or deploy is allowed.

Steps:

1. Open Admin or System Settings.
2. Review release metadata.
3. Review System Health panel.
4. Review Settings History.
5. Locate Salestrail controls and phone normalisation controls.
6. Confirm dry-run and live action wording is clear.
7. Do not run live actions.

Expected result:

- Release metadata is visible.
- Health states are understandable.
- Risky controls are clearly marked.
- Tester can explain what must not be clicked without approval.

### UAT-014: Training And Scripts

Role: Rep, Manager

Goal: Confirm training and script workflows are usable for staff.

Preconditions:

- Training feature is enabled for the test role if in scope.

Steps:

1. Open Training.
2. Start a safe test session.
3. Select script and difficulty.
4. Complete a short session or exit safely.
5. Confirm session state and feedback are understandable.
6. Review scripts or knowledge base guidance.

Expected result:

- Staff can start and understand training.
- Browser permission prompts are understandable.
- Exiting a test session does not create confusing records.

### UAT-015: Offline And Recovery Messaging

Role: Rep

Goal: Confirm offline messaging is clear and staff know what to do.

Preconditions:

- Use approved test data only.
- Do not intentionally create unrecoverable failed writes.

Steps:

1. Review offline mode guidance in the user manual.
2. If safe in the test environment, disconnect network briefly.
3. Observe offline indicator.
4. Reconnect.
5. Confirm sync state is understandable.

Expected result:

- Offline and reconnect states are visible.
- Staff understand whether data is saved, queued, or failed.

### UAT-016: Mobile Lead Workflow Smoke Test

Role: Rep

Goal: Confirm key lead work is usable on a phone-sized viewport.

Preconditions:

- Use phone browser or desktop responsive mode.

Steps:

1. Sign in.
2. Open Dashboard or Inbox.
3. Open Leads.
4. Open a lead detail.
5. Review next action, notes, call history, and appointment cues.
6. Add a safe note or log a safe test call if approved.

Expected result:

- No critical controls are hidden or overlapping.
- Text is readable.
- Primary actions are reachable.
- Staff can complete one lead workflow without desktop-only assumptions.

### UAT-017: User Guide Accuracy

Role: Rep, Manager, Admin

Goal: Confirm staff documentation matches the product.

Preconditions:

- User manual and admin booklet are available to testers.

Steps:

1. Pick three common tasks from the user guide.
2. Follow the guide exactly.
3. Record any mismatch between the guide and the UI.
4. Confirm whether glossary and role descriptions are understandable.

Expected result:

- Guide instructions are accurate enough for onboarding.
- Any outdated labels or missing steps are logged as documentation issues.

## UAT Checklist

| Area | Required result | Owner | Status |
| --- | --- | --- | --- |
| Login | Rep, manager, and admin can sign in. | Product Owner | Pending |
| Session restore | Refresh does not unexpectedly lose active session. | Product Owner | Pending |
| Role visibility | Users see only expected pages and controls. | Release Manager | Pending |
| Lead list | Search, filters, and open-lead flow are usable. | Rep tester | Pending |
| Lead detail | Staff can update safe test data and understand save state. | Rep tester | Pending |
| Calls | Call log saves and appears in history. | Rep tester | Pending |
| Notes | Notes save with clear author and timestamp. | Rep tester | Pending |
| Callback | Callback state appears in queue or lead cues. | Rep tester | Pending |
| Follow-up | Follow-up state appears in queue or next action. | Rep tester | Pending |
| Appointments | Appointment can be created and linked to a test lead. | Rep tester | Pending |
| Clients | Manager can review client context. | Manager tester | Pending |
| Deals | Manager can understand pipeline and chase list. | Manager tester | Pending |
| Reports | Manager and director can interpret metrics. | Manager tester | Pending |
| Admin roster | Admin can review users and permissions. | Admin tester | Pending |
| Settings | Admin can review settings without unsafe live actions. | Admin tester | Pending |
| System health | Release manager can interpret health and release metadata. | Release Manager | Pending |
| Risky controls | Testers understand not to run live Salestrail, migrations, backfill, or deploy. | Release Manager | Pending |
| Mobile | Rep can complete one lead workflow on mobile. | Rep tester | Pending |
| User guide | Staff guide matches current workflow. | Product Owner | Pending |
| Admin guide | Admin guide matches current auth and safety model. | Product Owner | Pending |

## Feedback Form

Use one form per tester.

```text
Tester name:
Role tested:
Date:
Browser and device:
Environment or candidate:

Overall result:
Pass / Pass with issues / Fail / Blocked

Tasks completed:

Tasks not completed:

What felt clear:

What felt confusing:

What slowed you down:

What felt risky:

Any wording or guide mismatch:

Any mobile issues:

Any accessibility issues:

Top three improvements before launch:
1.
2.
3.

Would you be comfortable using this CRM for daily work?
Yes / Yes with support / No

Reason:
```

## Issue Tracking

Create one issue entry per defect, confusion point, or documentation mismatch.

```text
Issue ID:
Reported by:
Date:
Role:
Script ID:
Page or workflow:
Severity:
Category:
Summary:
Steps to reproduce:
Expected result:
Actual result:
Evidence:
Business impact:
Suggested fix:
Owner:
Status:
Resolution:
Retest result:
```

## Severity Rules

| Severity | Meaning | Release impact |
| --- | --- | --- |
| Critical | Blocks login, data safety, security, permissions, production approval, or core lead work. | No-Go until fixed or formally accepted by release owner. |
| High | Blocks a major staff workflow or risks incorrect CRM records. | No-Go unless workaround is approved and documented. |
| Medium | Causes repeated confusion, slow workflow, reporting doubt, or mobile friction. | Can proceed only if accepted for internal release and backlog item exists. |
| Low | Cosmetic, wording, or minor usability issue. | Can proceed if tracked. |

## Issue Categories

- Login
- Permissions
- Leads
- Calls
- Notes
- Appointments
- Clients
- Deals
- Reports
- Admin
- Settings
- System health
- Mobile
- Accessibility
- Documentation
- Performance
- Security
- Data safety

## Success Criteria

UAT passes only when all success criteria are met.

| Criteria | Required outcome |
| --- | --- |
| Critical workflows | Login, lead work, call logging, notes, callbacks, appointments, reporting, and admin review pass. |
| Role confidence | Rep, manager, admin, and director testers can explain their key workflows. |
| Safety | No tester runs live Salestrail sync, phone backfill write, migration, deploy, or unapproved production data action. |
| Data confidence | Test data changes are understandable, reversible, and limited to approved UAT scope. |
| Permissions | No tester sees obviously unauthorised pages or controls for their role. |
| Guides | User and admin guide mismatches are logged and no critical guide gap remains. |
| Mobile | One core rep lead workflow passes on mobile or has an accepted workaround. |
| Issues | Zero unresolved Critical issues and zero unresolved High issues without approved workaround. |
| Release evidence | Test results, feedback forms, and issue list are stored with the release package. |

## UAT Exit Decision

| Decision | Conditions |
| --- | --- |
| Go | All success criteria pass, no unresolved Critical or High issues, release owner signs off. |
| Conditional Go | Medium or Low issues remain, workarounds are documented, release owner accepts risk. |
| No-Go | Any Critical issue remains, any High issue lacks workaround, or risky production action is required. |

## Sign-Off

| Role | Name | Decision | Date | Notes |
| --- | --- | --- | --- | --- |
| Rep tester 1 |  | Pending |  |  |
| Rep tester 2 |  | Pending |  |  |
| Manager tester |  | Pending |  |  |
| Admin tester |  | Pending |  |  |
| Director reviewer |  | Pending |  |  |
| Product Owner |  | Pending |  |  |
| Release Manager |  | Pending |  |  |

## UAT Final Report Template

```text
Release candidate:
UAT date range:
Testers:
Scripts run:
Scripts passed:
Scripts failed:
Scripts blocked:

Critical issues:
High issues:
Medium issues:
Low issues:

Accepted workarounds:

Guide updates required:

Release recommendation:
Go / Conditional Go / No-Go

Approver:
Approval date:
```

## Blocked Actions During UAT

The following remain blocked unless separately approved in writing:

- Firebase deploy.
- Functions deploy.
- Firestore rules deploy.
- Firestore indexes deploy.
- Live Salestrail sync.
- Phone normalisation with `dryRun:false`.
- Firebase lead migration scripts.
- Production data writes outside approved UAT scope.
- Destructive cleanup.
- Branch deletion.
- Force push.
