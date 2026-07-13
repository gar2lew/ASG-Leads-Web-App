# UAT Test Data Guide

Release: v1.0 Internal Production Release

## Purpose

Define safe test data needed for staff UAT without using production data casually or running blocked Firebase, Salestrail, migration, or phone backfill actions.

## Data Safety Rules

- Prefer emulator, staging, demo, or explicitly approved test data.
- Do not use production Firebase data for local validation.
- Do not create real customer commitments during UAT.
- Do not run live Salestrail sync.
- Do not run phone normalisation with `dryRun:false`.
- Do not run Firebase lead migration scripts.
- Do not deploy Firebase surfaces.
- Do not print or record secrets.
- Record the environment and candidate commit before testing starts.

## Required Test Accounts

| Role | Required Account Setup | Notes |
| --- | --- | --- |
| Sales Rep | Active rep, assigned region, standard rep navigation, test PIN. | Should have assigned leads and personal settings access. |
| Manager | Active manager, team visibility, reporting access, test PIN. | Should view multiple reps and team activity. |
| Admin | Active admin, admin navigation, settings access, test PIN. | Should use test-only settings changes if any edits are approved. |
| Director | Director or director-review account, reporting and release review access, test PIN. | Should focus on business visibility and go/no-go confidence. |

## Required Lead Test Data

Create or identify approved test leads with:

- New lead.
- Callback due today.
- Future callback.
- Overdue follow-up.
- Booked appointment.
- Stale lead.
- Lead with notes.
- Lead with call history.
- Lead with linked client or deal if available.
- Lead with document or document placeholder.
- Lead in each active region if regional access is in scope.

## Required Activity Data

| Data Type | Minimum Example | Used By |
| --- | --- | --- |
| Notes | At least two notes from different roles. | Rep, manager, admin, director notes tests. |
| Calls | At least one manual call log and one mocked or dry-run Salestrail call if available. | Call history and Salestrail review. |
| Appointments | At least one future and one past appointment. | Calendar and reporting tests. |
| Documents | At least one safe test document or placeholder. | Document Centre and lead/client document tests. |
| Reports | Known counts for leads, calls, appointments, and status changes. | Manager and director reporting tests. |
| Settings history | At least one safe historical settings entry if available. | Admin settings review. |

## Salestrail Test Data

Salestrail UAT must be dry-run-first.

Allowed:

- Mocked call records.
- Previously approved dry-run output.
- Static source-contract review.
- Test call records in emulator or approved non-production data.

Blocked:

- Live Salestrail sync.
- Real Salestrail credentials in documents.
- Reconciliation against production data unless separately approved.
- Live writes to `salestrailCalls`.

## Phone Normalisation Test Data

Allowed:

- Dry-run review only.
- Small approved sample of test leads.
- Before and after samples recorded without exposing private customer data.

Blocked:

- `dryRun:false`.
- Production lead write mode.
- Bulk backfill without backup/export and explicit approval.

## Document Test Data

Use:

- Test PDF.
- Test client or deal.
- Test document placeholder.
- Non-sensitive sample names and addresses.

Do not use:

- Real customer identity documents.
- Real signed documents.
- Real DocuSign envelope send unless separately approved.

## Data Reset Notes

Before UAT starts, record:

```text
Environment:
Candidate commit:
Test data owner:
Approved data source:
Reset approach:
Known records:
Blocked actions confirmed:
```

After UAT ends, record:

```text
Records changed:
Issues raised:
Data reset completed:
Data reset owner:
Residual data risk:
```
