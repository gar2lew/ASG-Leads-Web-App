# Firebase Release Plan

Status: draft release-readiness plan only.

Target repository state reviewed:

- Branch: `codex-foundation`
- Expected HEAD: `b88c417 Merge pull request #12 from gar2lew/docs/final-planning-and-audit-notes`
- Firebase project in `.firebaserc`: `amplify-leads-2026`
- Firebase Hosting site in `firebase.json`: `amplify-leads-2026`

This target must be treated as production-like. This document does not approve any deploy, migration, sync, backfill, or production write.

## Current Gate

No Firebase release is currently approved.

Recent validation evidence:

- `npx tsc --noEmit` passed.
- `npx tsc --noEmit -p functions\tsconfig.json` passed.
- Previous `npm run build` passed.
- Previous `functions` build passed.

Remaining release blockers:

- Full production deploy impact has not been validated in emulator or scoped dry-run rehearsal.
- Firestore rules still preserve broad anonymous-auth-compatible operational access for many collections.
- Several exported callables remain unauthenticated or under-authorized.
- Salestrail production reconciliation previously failed: reported imported calls did not appear in `salestrailCalls`.
- Migration and backfill tooling can write or replace production data and require explicit operator approval.

## Firebase Configuration Reviewed

Files:

- `.firebaserc`
- `firebase.json`
- `firestore.rules`
- `firestore.indexes.json`
- `functions/src/index.ts`
- `functions/src/auth/verifyPin.ts`
- `functions/src/settingsAdmin.ts`
- `functions/src/phoneMigration.ts`
- `functions/src/salestrail.ts`
- `functions/src/salestrailSync.ts`
- `functions/src/smsfFinancials.ts`
- `scripts/firebase-leads-sheet-migration.mjs`
- `docs/migrations/leads-sheet-reset-final-runbook.md`
- `salestrail-post-import-audit.md`
- `salestrail-production-validation.md`

Firebase surfaces in `firebase.json`:

- Hosting: serves `dist` to site `amplify-leads-2026`.
- Functions: deploys source from `functions`.
- Firestore rules: deploys `firestore.rules`.
- Firestore indexes: deploys `firestore.indexes.json`.

## Deployable Function Exports

Exports currently present in `functions/src/index.ts`:

| Area | Export | Notes |
| --- | --- | --- |
| Notifications | `onDailyStatsWritten` | Firestore-triggered notification function. |
| DocuSign | `createDocuSignEnvelope` | Callable/exported from `docusign.ts`; requires separate integration validation. |
| DocuSign | `docusignWebhook` | HTTP webhook surface; hosting rewrite points `/docusignWebhook` to this function. |
| DocuSign | `resendDocuSignEnvelope` | Callable/exported from `docusign.ts`. |
| DocuSign | `voidDocuSignEnvelope` | Callable/exported from `docusign.ts`. |
| DocuSign | `syncEnvelopeStatus` | Callable/exported from `docusign.ts`. |
| SMSF financials | `saveSmsfFinancials` | Exported via wildcard; currently lacks `requireAuth(request)`. |
| SMSF financials | `getSmsfFinancials` | Exported via wildcard; currently lacks `requireAuth(request)`. |
| PIN/auth | `verifyPin` | Calls `requireAuth(request)`; supports plaintext PIN fallback until migration is complete. |
| PIN/auth | `setPin` | Calls `requireAuth(request)`; writes PIN hash and optional backup password hash. |
| PIN/auth | `changePin` | Calls `requireAuth(request)`; updates PIN hash. |
| PIN/auth | `verifyBackupPassword` | Calls `requireAuth(request)`; verifies backup password hash. |
| Follow-up | `followUpEngine` | Scheduled/operational follow-up function. |
| Audit | `appendAuditEvent` | Server-authoritative audit callable. |
| Settings/admin | `updateAppSettingsCallable` | Admin-only callable; writes `appSettings/config`, `settingsHistory`, and `auditLogs`. |
| Settings/admin | `rollbackAppSettingsCallable` | Admin-only callable; rollback path for settings. |
| Migration utility | `backfillPhoneNormalization` | Admin-only callable; supports `dryRun`; `dryRun:false` writes to `leads`. |
| Salestrail | `syncSalestrailCallsCallable` | Admin-only callable; uses `SALESTRAIL_API_USERNAME` and `SALESTRAIL_API_PASSWORD`; `dryRun:false` writes to `salestrailCalls` and settings/audit. |
| Salestrail | `getSalestrailConfig` | Authenticated callable; reads `appSettings/config.integrations.salestrail`. |
| Salestrail | `updateSalestrailConfig` | Admin-only callable; writes Salestrail config. |
| Salestrail | `resetSalestrailSyncLock` | Admin-only callable; writes Salestrail sync lock state. |
| Property insights | `getPropertyInsights` | Callable in `index.ts`; currently lacks `requireAuth(request)` and writes `properties`. |
| Daily stats | `aggregateDailyStats` | Scheduled function; reads broad collections and writes `dailyStats`. |
| Push notifications | `sendPushNotification` | Callable in `index.ts`; currently lacks `requireAuth(request)`/role checks. |
| Daily report | `sendDailyReportNotification` | Scheduled function; sends notifications to admin/manager reps. |
| Performance alerts | `triggerPerfAlert` | Callable in `index.ts`; currently lacks `requireAuth(request)`/role checks. |

Important function-release concern: `functions/src/index.ts` calls `admin.initializeApp()` and creates `const db = admin.firestore()` at module scope. This is an existing pattern in the current export surface, but it conflicts with the repository rule that functions should use lazy `getDb()` patterns.

## What Each Firebase Command Would Release

These commands are listed only to define blast radius. Do not run them without explicit approval.

| Command | What would go live | Primary risk |
| --- | --- | --- |
| `firebase deploy --only hosting` | Current `dist` output, SPA rewrites, static `/pia/**` and `/smsf/**`, and `/docusignWebhook` rewrite configuration. | Low-to-medium if build is verified; can expose UI for features whose backend/rules are not ready. |
| `firebase deploy --only functions` | Entire current functions export surface from `functions/src/index.ts`, including auth/PIN, settings/admin, Salestrail, phone backfill, scheduled jobs, DocuSign, SMSF financials, and unauthenticated legacy callables. | High; deploy can add, update, or remove Cloud Functions and affect login, auth, notifications, migrations, and integrations. |
| `firebase deploy --only firestore:rules` | Firestore rule set from `firestore.rules`, including callable-only `salestrailCalls` and broad operational compatibility rules. | High; can allow/deny production reads and writes immediately. |
| `firebase deploy --only firestore:indexes` | All composite indexes in `firestore.indexes.json`, including Salestrail indexes. | Medium; generally additive but index build delays can break newly released queries until built. |
| `firebase deploy` | Hosting, functions, Firestore rules, and Firestore indexes together. | Critical; combines all production blast radius surfaces and should not be used for this stack. |

## Risk Table

| Surface | What would change | Risk level | Required validation before deploy | Rollback approach | Deployment currently allowed |
| --- | --- | --- | --- | --- | --- |
| Hosting | Publishes current `dist` app and hosting rewrites. | Medium | Clean branch; `npm ci` if needed; `npx tsc --noEmit`; `npm run build`; smoke test login, dashboard, leads, admin settings, Salestrail UI hidden/disabled as appropriate; confirm generated release metadata. | Re-deploy last known-good hosting build or rollback via Firebase Hosting release history. | No. Candidate only after Stages 1-3. |
| Functions | Deploys all functions exported by `functions/src/index.ts`. | High | `cd functions && npm ci` if needed; `npm run build`; callable auth tests for every exported callable; emulator/mocked tests for Salestrail; verify no function deletion compared with production; verify secrets exist by name; review top-level Admin usage. | Prefer scoped function redeploy of previous known-good function set; otherwise revert commit and redeploy functions. Document any functions that would be removed before deploy. | No. Blocked until Stage 4. |
| Firestore rules | Deploys `firestore.rules`. | High | Firebase emulator rules tests for anonymous session, custom-claim roles, appSettings/config write denial, audit/settingsHistory write denial, SMSF access, Salestrail direct read/write denial, and operational compatibility collections. | Re-deploy previous known-good rules file. Keep a timestamped rules snapshot before any deploy. | No. Blocked until Stage 5. |
| Firestore indexes | Deploys all composite indexes, including `salestrailCalls` indexes. | Medium | Confirm query requirements; run emulator or local query tests; deploy indexes before UI/features requiring them; wait until Firebase reports indexes built. | Remove bad index definitions in a follow-up deploy only after confirming no production query depends on them. Index rollback is slower than code rollback. | No. Blocked until Stage 5. |
| Migration scripts | `scripts/firebase-leads-sheet-migration.mjs` can import or full-replace `leads` when run with write flags. | Critical | Full runbook checklist; service account/project/sheet confirmation; `node --check`; duplicate test script; dry-run reports; unmatched lead review; backup/export plan; operator sign-off. | Restore from migration backup/export; do not improvise related collection deletes or restores. | No. Must remain blocked without explicit migration approval. |
| Phone normalization backfill | `backfillPhoneNormalization` can rewrite `leads.phone` and write `phoneRaw` plus audit log when `dryRun:false`. | High | Deploy/function availability confirmed; dry-run only first; affected count; sample before/after review; backup/export plan; explicit approval for `dryRun:false`; post-run reconciliation. | Prefer restore from export/backup. If `phoneRaw` was preserved, design a reviewed rollback path before execution. | No. Dry-run only after approval; live run blocked. |
| Salestrail sync/integration | Salestrail callables can fetch vendor data and write `salestrailCalls`, app settings, and audit logs when `dryRun:false`. | High | Secrets by name; mocked/emulator callable tests; dry-run proves no writes; direct client Firestore reads denied; frontend callable-only; controlled live test reconciles returned counts to Firestore docs and audit/settings state. | Disable integration config; reset stale lock only with approval; delete bad imported docs only through reviewed remediation plan. | No. Blocked until Stages 6-7. |

## Staged Release Proposal

### Stage 0: No Deploy, Documentation Only

Goal: capture release intent and risk boundaries without changing Firebase.

Allowed:

- Docs-only PRs.
- Local read-only inspection.
- GitHub draft PR review.

Blocked:

- All Firebase deploys.
- Salestrail live sync.
- Phone backfill.
- Leads migration scripts against production.
- Production data writes.

Exit criteria:

- This plan reviewed.
- Release owner confirms target environment and intended first deploy surface.

### Stage 1: Local Or Disposable Worktree Validation

Goal: prove the merged source can build without disturbing the release branch.

Required checks:

- Clean disposable worktree from `codex-foundation`.
- `npm ci` at root if dependencies are missing.
- `npx tsc --noEmit`.
- `npm run build`.
- `cd functions && npm ci` if needed.
- `cd functions && npm run build`.
- `npm run lint` or document any existing lint baseline.
- Run available targeted scripts:
  - `npm run test:auth-boundaries`
  - `npm run test:workflow-state`
  - `npm run test:region-identity`
  - `npm run test:observability`
  - `npm run test:release-metadata`
  - `cd functions && npm run test:settings-admin`

Notes:

- Root `npm run build` writes `dist` and release metadata.
- Functions build writes `functions/lib`.
- Restore generated metadata after validation if it changes.

Exit criteria:

- Validation output recorded.
- Generated files reviewed and not accidentally committed unless intended.

### Stage 2: Emulator Validation

Goal: validate rules and callable behavior without production writes.

Required coverage:

- Firestore rules emulator tests for:
  - `salestrailCalls` direct client read/write denied.
  - `appSettings/config` direct client writes denied.
  - `settingsHistory`, `auditLogs`, and `audit` client writes denied.
  - SMSF financials denied to non-elevated sessions.
  - Operational compatibility collections still work for current anonymous-auth flows where intentionally preserved.
- Callable tests or mocks for:
  - PIN/auth callables.
  - Settings/admin callables.
  - Salestrail dry-run path.
  - Phone normalization dry-run path.
  - Unauthenticated rejection for every callable that must be protected.

Exit criteria:

- Emulator test evidence stored outside customer data.
- No secrets printed or committed.
- Any callable without `requireAuth(request)` is either fixed or explicitly documented as a deploy blocker.

### Stage 3: Hosting-Only Candidate, If Safe

Goal: release client UI only after confirming backend/rules dependencies.

Candidate command surface:

- `firebase deploy --only hosting`

Required validation:

- Stage 1 passed.
- Confirm hosting target is `amplify-leads-2026`.
- Confirm no UI path exposes unsafe Salestrail live sync or backfill actions to unauthorized users.
- Smoke test built app locally or in preview:
  - Login/PIN flow.
  - Dashboard.
  - Leads.
  - Admin settings page.
  - Salestrail panel safe disabled/dry-run behavior.
  - Phone normalization controls require admin and confirmation.

Rollback:

- Firebase Hosting release rollback or redeploy previous build.

Current status:

- Not approved.

### Stage 4: Functions Candidate, Only After Callable Tests

Goal: deploy functions only after preserving production auth and validating callable boundaries.

Candidate command surface:

- Prefer scoped function deploys over full functions deploys when possible.
- Avoid `firebase deploy --only functions` until production deployed-function parity is confirmed.

Required validation:

- `cd functions && npm run build`.
- Compare current exports with currently deployed production functions before deploy.
- Callable auth tests for every exported callable.
- Confirm PIN/auth functions are preserved:
  - `verifyPin`
  - `setPin`
  - `changePin`
  - `verifyBackupPassword`
- Confirm settings/admin callables:
  - `updateAppSettingsCallable`
  - `rollbackAppSettingsCallable`
  - `appendAuditEvent`
- Confirm Salestrail callables are protected and secrets are configured by name.
- Confirm phone backfill callable is admin-only and not triggered automatically.
- Resolve or explicitly block deployment for unauthenticated callables:
  - `getPropertyInsights`
  - `sendPushNotification`
  - `triggerPerfAlert`
  - `saveSmsfFinancials`
  - `getSmsfFinancials`

Rollback:

- Redeploy previous known-good functions.
- Prefer scoped rollback for affected functions.

Current status:

- Not approved.

### Stage 5: Firestore Rules And Index Candidate, Only After Access Tests

Goal: deploy security rules and indexes only with proof that current app flows still work and sensitive paths are protected.

Candidate command surfaces:

- `firebase deploy --only firestore:rules`
- `firebase deploy --only firestore:indexes`

Required validation:

- Emulator access tests pass.
- Confirm `salestrailCalls` direct browser reads/writes are denied.
- Confirm appSettings/config direct client writes are denied.
- Confirm callable-authoritative write paths have deployed functions before rules depend on them.
- Confirm index build order: deploy required indexes before releasing UI/function paths that query them.
- Confirm no broad wildcard rule was introduced.

Rollback:

- Re-deploy previous known-good rules.
- Index rollback must be planned carefully; index deletion/build lag can affect live queries.

Current status:

- Not approved.

### Stage 6: Controlled Salestrail Dry-Run

Goal: prove vendor API access and transformation without production writes.

Required gate:

- `SALESTRAIL_API_USERNAME` exists by name in Firebase Functions secrets.
- `SALESTRAIL_API_PASSWORD` exists by name in Firebase Functions secrets.
- Emulator or mocked callable tests pass.
- Dry-run path returns counts and does not write:
  - no `salestrailCalls` documents created
  - no `salestrail.sync` audit log created from dry-run
  - no sync lock left active
- Direct client Firestore reads/writes to `salestrailCalls` denied.
- Frontend actions call callables only; no direct `salestrailCalls` browser query.

Dry-run constraints:

- Use a limited debug window.
- Do not use full sync for first production dry-run.
- Do not print credentials, raw phone numbers, or sensitive payloads in logs or reports.

Current status:

- Not approved.

### Stage 7: Controlled Salestrail Live Reconciliation

Goal: perform a minimal live write and reconcile every count.

Required gate:

- Stage 6 passed.
- Explicit approval for `dryRun:false`.
- Integration config intentionally enabled.
- Small date window selected.
- Operator knows expected blast radius.

Required reconciliation:

- Callable returned `importedCount + updatedCount`.
- Actual root `salestrailCalls` document count increase matches returned imported/updated count expectations.
- `auditLogs` contains `action: "salestrail.sync"`.
- `appSettings/config.integrations.salestrail.lastSyncCallCount` matches committed writes.
- Sample imported document IDs match Salestrail `callId`.
- Direct client Firestore reads remain denied after import.

Current status:

- Blocked. Previous production audit found reported imported calls did not exist in production Firestore.

### Stage 8: Migration/Backfill Approvals, If Ever Needed

Goal: separate data-changing operations from app deploys.

Phone normalization gate:

- Dry-run only first.
- Record `totalScanned`, `updated`, `skippedAlreadyNormalized`, `skippedEmptyPhone`, `skippedInvalidFormat`, and errors.
- Review affected lead count.
- Review sample before/after phone transformations.
- Confirm backup/export plan.
- Explicit approval before `dryRun:false`.
- Post-run reconciliation:
  - affected count equals expected writes
  - no unexpected invalid format spike
  - audit log entry present
  - sample records preserve `phoneRaw` if requested

Firebase leads migration gate:

- Complete full runbook checklist in `docs/migrations/leads-sheet-reset-final-runbook.md`.
- Confirm backup/export.
- Run dry-run validation.
- Validate duplicate handling.
- Review unmatched existing leads.
- Confirm rollback plan.
- Explicit approval before `--full-replace`.
- No one actively editing CRM during reset window.
- Post-run count/status reconciliation.

Current status:

- Blocked. No migration or backfill is approved.

## Release Decision Checklist

Do not proceed with any deployment until every item for the relevant surface is checked.

General:

- [ ] Current branch and commit confirmed.
- [ ] Working tree clean.
- [ ] Target Firebase project confirmed as intended.
- [ ] No secrets staged or printed.
- [ ] Existing open PRs reviewed for release impact.
- [ ] Rollback owner and rollback command/surface identified.
- [ ] Operator has explicit approval for the target surface.

Hosting:

- [ ] `npx tsc --noEmit` passed.
- [ ] `npm run build` passed.
- [ ] Generated release metadata reviewed.
- [ ] Smoke tests passed.
- [ ] Backend/rules dependencies already deployed or not required.

Functions:

- [ ] `cd functions && npm run build` passed.
- [ ] Function export parity with production reviewed.
- [ ] Callable auth tests passed.
- [ ] Salestrail secrets exist if Salestrail functions are included.
- [ ] SMSF/property/notification callable auth gaps resolved or accepted as blockers.
- [ ] No migration/backfill callable will be invoked as part of deploy.

Firestore rules:

- [ ] Emulator rules tests passed.
- [ ] Direct `salestrailCalls` read/write denied.
- [ ] Callable-authoritative collections denied to direct client writes.
- [ ] Current app compatibility flows verified.

Firestore indexes:

- [ ] Query-to-index mapping reviewed.
- [ ] Index deploy staged before dependent features.
- [ ] Index build status checked before feature enablement.

Salestrail:

- [ ] `SALESTRAIL_API_USERNAME` exists by name.
- [ ] `SALESTRAIL_API_PASSWORD` exists by name.
- [ ] Emulator or mocked callable tests pass.
- [ ] Controlled dry-run works without writes.
- [ ] Controlled live test reconciles returned imported count to actual `salestrailCalls` document count.
- [ ] Direct client Firestore reads are denied.
- [ ] Frontend actions are callable-only.

Phone normalization:

- [ ] Dry-run only first.
- [ ] Affected lead count reviewed.
- [ ] Sample before/after reviewed.
- [ ] Backup/export plan approved.
- [ ] Explicit approval before `dryRun:false`.
- [ ] Post-run reconciliation planned.

Leads migration:

- [ ] Full runbook checklist completed.
- [ ] Backup/export ready.
- [ ] Dry-run validation complete.
- [ ] Duplicate handling validated.
- [ ] Rollback plan documented.
- [ ] Explicit approval before full-replace mode.

## Current Recommendation

Remain at Stage 0. Review this document and draft PR #13 only. Do not deploy Firebase, do not run Salestrail sync, do not run phone normalization backfill, and do not run Firebase leads migration until the relevant gates above are satisfied.
