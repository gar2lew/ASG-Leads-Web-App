# Functions Runtime Upgrade Risk Register

Date: 2026-07-07
Branch: `plan/functions-runtime-dependency-remediation`

## Purpose

Track risks for a future Firebase Functions runtime dependency remediation goal.

## Risks

| ID | Risk | Rating | Affected surface | Mitigation | Status |
| --- | --- | --- | --- | --- | --- |
| FRD-001 | `firebase-admin` major upgrade changes Firestore, Auth, Storage, FieldValue, Timestamp, or batch write behaviour. | High | PIN, settings/admin, phone normalisation, Salestrail, DocuSign, SMSF, reporting | Upgrade in an isolated branch, run full emulator validation, and check timestamp sentinels explicitly. | Open |
| FRD-002 | `firebase-functions` major upgrade changes callable, request, scheduler, or trigger wrapper behaviour. | High | All exported callables, request functions, scheduled jobs, Firestore triggers | Upgrade separately from Admin SDK unless release notes prove a required pairing. Run callable dry-run harness and Functions build. | Open |
| FRD-003 | `firebase-functions@7.2.5` peer metadata does not include `firebase-admin@14.x`. | High | Package resolution, emulator startup, deploy packaging | Do not combine Admin SDK 14 and Functions SDK 7 casually. Review release notes and npm peer output before implementation. | Open |
| FRD-004 | Callable auth context shape changes and weakens `requireAuth(request)` assumptions. | Critical | PIN, settings/admin, Salestrail, phone normalisation | Run auth boundary tests and callable dry-run coverage. Do not weaken auth checks to make tests pass. | Open |
| FRD-005 | Admin SDK timestamp compatibility regression returns after package changes. | High | PIN mutation, settings/admin mutation, audit history, Salestrail sync metadata | Re-run mutation callable emulator coverage and inspect all timestamp helper usage. | Open |
| FRD-006 | Salestrail callable tests accidentally reach the live Salestrail API. | Critical | Salestrail sync and settings | Keep source-contract and no-network checks until a mock seam exists. Do not provide real secrets to emulator tests. | Open |
| FRD-007 | Phone normalisation runs with `dryRun:false` during validation. | Critical | Leads collection | Keep validation dry-run only. Full writes require backup/export and explicit approval. | Open |
| FRD-008 | DocuSign document and webhook paths regress due to Storage or HTTP dependency changes. | High | DocuSign envelope, resend, void, sync, webhook | Build validation plus targeted manual or mocked checks before any Functions deploy. | Open |
| FRD-009 | SMSF financials secret handling or encryption behaviour changes. | High | SMSF financials callables | Do not print secrets. Validate build and callable contract without real secret disclosure. | Open |
| FRD-010 | Scheduled reporting or follow-up jobs compile but fail at runtime. | High | Daily stats, daily reports, follow-up engine, notification trigger | Add scheduler and trigger smoke plan before deploying Functions. | Open |
| FRD-011 | Broad audit fix changes unrelated runtime or tooling dependencies. | High | Entire repo | Do not run broad `npm audit fix` or `npm audit fix --force`. Limit package diffs to the approved target packages. | Open |
| FRD-012 | Functions deploy occurs before package remediation is validated and approved. | Critical | Production-like Firebase project `amplify-leads-2026` | Keep deploy blocked. Verify `.firebaserc` before any release work. | Open |
| FRD-013 | Lockfile churn hides unexpected dependency changes. | Medium | Reviewability and rollback | Review `git diff -- functions/package-lock.json` carefully in future implementation. Stage package files only when approved. | Open |
| FRD-014 | Emulator compatibility differs from deployed Firebase runtime. | Medium | Callable dry-run, scheduled jobs, triggers | Use emulator as baseline, then require release-manager review and staged deploy approval before production Functions deploy. | Open |
| FRD-015 | Node 22 runtime support is assumed but not validated after package changes. | High | All Functions | Confirm package engines, run Functions build, and validate emulator startup in the local Node 22 environment. | Open |

## Risk Review Gate

Do not begin a Functions runtime package implementation until:

- This risk register is reviewed.
- The target package versions are named.
- The validation checklist is accepted.
- Production Firebase deploy remains explicitly blocked.
- Salestrail live sync, phone write backfill, and migrations remain blocked.
