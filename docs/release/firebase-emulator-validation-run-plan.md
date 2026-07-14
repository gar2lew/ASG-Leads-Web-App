# Firebase Emulator Validation Run Plan

Status: draft run plan derived from `docs/release/firebase-emulator-validation-checklist.md`.

This plan is emulator-only. It must not deploy, read production data, write production data, call the live Salestrail API, run live Salestrail sync, run Firebase migration scripts, or run phone normalization with live writes.

## Objective

Validate the merged `codex-foundation` Firebase release surface in an isolated emulator project using synthetic data:

- Callable authentication and role boundaries.
- PIN setup and PIN verification behavior.
- Settings/admin callable behavior.
- Phone normalization dry-run behavior.
- Salestrail dry-run behavior with mocked responses only.
- Firestore rules for `salestrailCalls`, leads, client notes, users, profiles, settings, and audit collections.
- Evidence that no production Firebase project, production data, live vendor endpoint, deploy path, migration, or live write path was used.

## Hard Stops

Stop immediately if any of these conditions occur:

- A command targets `amplify-leads-2026` instead of a demo/local emulator project.
- A command includes `firebase deploy`, `firebase functions:delete`, `npm run deploy`, `npm run release:deploy`, or `npm run release:dry-run`.
- Any production `.env`, service account, export, backup, or credential file is required.
- Any Salestrail test would call the live Salestrail API.
- Any phone normalization test would run against production data or use `dryRun: false` outside a disposable emulator fixture.
- Any migration script would run against live Firebase data.
- Any output would print secrets, PINs, password values, tokens, or customer data.

## Run Owner Inputs

Record these before execution:

- [ ] Operator:
- [ ] Date/time:
- [ ] Local branch:
- [ ] Local HEAD:
- [ ] Checklist version or commit:
- [ ] Emulator project ID, expected: `demo-asg-crm-emulator`
- [ ] Evidence folder or notes location:

## Phase 0: Repo And Safety Preflight

Purpose: prove the run starts from the intended code and has no accidental production path.

Commands:

```powershell
git branch --show-current
git status --short
git log --oneline -5
Get-Content .firebaserc
Get-Content firebase.json
```

Pass criteria:

- [ ] Branch is `codex-foundation` or an isolated validation branch created from `codex-foundation`.
- [ ] Working tree is clean, or any local harness changes are explicitly documented and not committed unless separately requested.
- [ ] `.firebaserc` default project is recognized as production-like: `amplify-leads-2026`.
- [ ] Run notes explicitly state that emulator commands must override project targeting with `--project demo-asg-crm-emulator`.
- [ ] No deploy, migration, live Salestrail, or live backfill command is executed.

## Phase 1: Local Build Readiness

Purpose: ensure the emulator run is testing compilable client and function code.

Commands:

```powershell
npx tsc --noEmit
npx tsc --noEmit -p functions\tsconfig.json
npm run build
cd functions
npm run build
cd ..
```

Pass criteria:

- [ ] Client TypeScript passes.
- [ ] Functions TypeScript passes.
- [ ] Client build passes.
- [ ] Functions build passes.

Notes:

- These commands are local build checks only.
- Do not run `npm run deploy`, `npm run release:deploy`, or `npm run release:dry-run`.

## Phase 2: Emulator Boot

Purpose: start only local Firebase emulators against a demo project ID.

Command:

```powershell
firebase emulators:start --project demo-asg-crm-emulator --only auth,firestore,functions
```

Pass criteria:

- [ ] Auth emulator starts.
- [ ] Firestore emulator starts.
- [ ] Functions emulator starts.
- [ ] Logs show `demo-asg-crm-emulator`, not `amplify-leads-2026`, as the emulator project.
- [ ] No production Firebase resource is contacted.

Environment expectations for harnesses:

- [ ] `FIRESTORE_EMULATOR_HOST` points to the local Firestore emulator.
- [ ] `FIREBASE_AUTH_EMULATOR_HOST` points to the local Auth emulator.
- [ ] Functions calls use the local Functions emulator origin.
- [ ] Test client SDKs call `connectFirestoreEmulator`, `connectAuthEmulator`, and `connectFunctionsEmulator`.

## Phase 3: Synthetic Fixture Seed

Purpose: create only fake data needed for checklist validation.

Seed through emulator admin setup only:

- [ ] Active `rep`, `manager`, `admin`, and `director` auth users with custom claims.
- [ ] Inactive auth user with otherwise valid claims.
- [ ] Anonymous auth persona.
- [ ] `reps/{repId}` documents with active/inactive states.
- [ ] PIN fixtures with bcrypt `pinHash`.
- [ ] Plaintext PIN fallback fixture for current migration compatibility.
- [ ] Backup password hash fixture.
- [ ] Brisbane and Perth `leads/{leadId}` documents.
- [ ] Lead phone fixtures: normalized, unnormalized, empty, invalid, duplicate, and Google-Sheets-dropped-leading-zero examples.
- [ ] `clientNotes/{noteId}` documents.
- [ ] `appSettings/config` with synthetic settings and `integrations.salestrail`.
- [ ] `settings`, `settingsHistory`, `auditLogs`, and `audit` fixture documents.
- [ ] `users/{uid}/dashboard`, `users/{uid}/repSettings`, and `users/{uid}/dailyHistory` fixture documents.
- [ ] `userProfiles/{uid}` fixture documents.
- [ ] `salestrailCalls/{callId}` fixture documents inserted only through emulator admin setup.

Pass criteria:

- [ ] Fixture IDs are synthetic and contain no customer data.
- [ ] No production export or backup is imported.
- [ ] No service account credential is required.
- [ ] Seeded `salestrailCalls` documents are used only to test client-rule denial.

## Phase 4: Firestore Rules Validation

Purpose: prove direct client access matches the current rules contract.

Run with client SDKs connected to emulators only.

Required assertions:

- [ ] `salestrailCalls` direct `get`, `list`, `create`, `update`, and `delete` are denied for unauthenticated users.
- [ ] `salestrailCalls` direct `get`, `list`, `create`, `update`, and `delete` are denied for anonymous users.
- [ ] `salestrailCalls` direct `get`, `list`, `create`, `update`, and `delete` are denied for reps, managers, admins, and directors.
- [ ] Unauthenticated users are denied direct access to `leads`.
- [ ] Anonymous operational users have current compatibility access to `leads` as defined by `canUseOperationalApp()`.
- [ ] Authenticated operational users have current compatibility read/write access to `leads`.
- [ ] `clientNotes` access matches current authenticated read/create/update/delete expectations.
- [ ] Owner-only `users/{uid}` subcollection access is allowed for the owner and denied for other users.
- [ ] Owner-only `userProfiles/{uid}` access is allowed for the owner and denied for other users.
- [ ] `appSettings/config` direct reads are allowed for authenticated operational users.
- [ ] `appSettings/config` direct writes are denied for anonymous, rep, manager, admin, and director personas.
- [ ] `settingsHistory`, `auditLogs`, and `audit` direct writes are denied.
- [ ] `auditLogs` and `audit` reads are limited to elevated personas.
- [ ] `smsfFinancials` access is limited to elevated personas.
- [ ] `dailyStats`, `sentAlerts`, and `properties` direct client writes are denied.

Evidence to record:

- [ ] Rules test command or harness name.
- [ ] Persona matrix used.
- [ ] Pass/fail table by collection and operation.
- [ ] Any mismatch between current compatibility rules and desired future security posture.

## Phase 5: Callable Auth Boundary Validation

Purpose: prove callable access is enforced before behavior tests.

Run all callable calls against the local Functions emulator only.

Required rejection assertions:

- [ ] Unauthenticated calls reject for `verifyPin`, `setPin`, `changePin`, and `verifyBackupPassword`.
- [ ] Unauthenticated calls reject for `updateAppSettingsCallable` and `rollbackAppSettingsCallable`.
- [ ] Unauthenticated calls reject for `backfillPhoneNormalization`.
- [ ] Unauthenticated calls reject for `syncSalestrailCallsCallable`, `getSalestrailConfig`, `updateSalestrailConfig`, and `resetSalestrailSyncLock`.
- [ ] Rep users reject for admin-only settings, Salestrail update/sync/reset, and phone normalization callables.
- [ ] Manager users reject for admin-only callables unless the callable intentionally permits manager access.
- [ ] Inactive users reject where active identity is required.

Known release-risk review items:

- [ ] `getPropertyInsights` callable auth enforcement is reviewed before any functions deployment.
- [ ] `sendPushNotification` callable auth enforcement is reviewed before any functions deployment.
- [ ] `triggerPerfAlert` callable auth enforcement is reviewed before any functions deployment.
- [ ] SMSF callable auth enforcement is reviewed before any functions deployment.

## Phase 6: PIN Callable Behavior

Purpose: validate login and PIN-management behavior with synthetic reps only.

Required assertions:

- [ ] `verifyPin` succeeds for an active rep with a valid hashed PIN.
- [ ] `verifyPin` succeeds for the documented plaintext PIN fallback fixture.
- [ ] `verifyPin` rejects invalid PINs.
- [ ] `verifyPin` rejects missing, inactive, or unknown reps.
- [ ] `verifyPin` applies rate-limit behavior after repeated failed attempts.
- [ ] `verifyPin` sets expected emulator Auth custom claims on success.
- [ ] `setPin` writes a bcrypt PIN hash for a valid setup request.
- [ ] `setPin` rejects malformed or weak PIN values.
- [ ] `setPin` requires valid backup-password proof when replacing an existing PIN and backup credentials exist.
- [ ] `changePin` requires the current PIN and rejects the old PIN after change.
- [ ] `verifyBackupPassword` succeeds for the valid synthetic backup fixture.
- [ ] `verifyBackupPassword` rejects invalid or missing backup-password state.

Safety criteria:

- [ ] Logs and evidence do not print PINs, backup passwords, hashes, tokens, or customer data.

## Phase 7: Settings/Admin Callable Behavior

Purpose: validate server-authoritative settings updates in emulator.

Required assertions:

- [ ] `updateAppSettingsCallable` rejects unauthenticated and non-admin personas.
- [ ] `updateAppSettingsCallable` accepts admin updates to allowed sections and fields.
- [ ] `updateAppSettingsCallable` rejects unsupported sections.
- [ ] `updateAppSettingsCallable` rejects unsupported fields inside allowed sections.
- [ ] Successful admin update writes expected emulator `appSettings/config` changes.
- [ ] Successful admin update writes expected emulator `settingsHistory` and `auditLogs` entries.
- [ ] `rollbackAppSettingsCallable` rejects unauthenticated and non-admin personas.
- [ ] `rollbackAppSettingsCallable` accepts admin rollback using valid synthetic history.
- [ ] Rollback writes expected emulator config, history, and audit entries.

Safety criteria:

- [ ] No Salestrail secret values are read, printed, or stored in run evidence.

## Phase 8: Phone Normalization Dry Run

Purpose: validate dry-run reporting without writes.

Callable payload:

```json
{ "dryRun": true }
```

Required assertions:

- [ ] `backfillPhoneNormalization` rejects unauthenticated and non-admin personas.
- [ ] Admin dry-run succeeds against synthetic emulator leads.
- [ ] Dry-run returns total scanned count.
- [ ] Dry-run returns affected count.
- [ ] Dry-run classifies normalized, unnormalized, empty, invalid, and changed values correctly.
- [ ] No `leads` document changes after dry-run.
- [ ] No audit entry is written after dry-run.

Blocked action:

- [ ] Do not run phone normalization with `dryRun: false` as part of this validation plan.

## Phase 9: Salestrail Dry Run

Purpose: validate Salestrail callable behavior without live vendor calls or Firestore writes.

Setup:

- [ ] Use mocked or stubbed Salestrail responses only.
- [ ] Use emulator-only placeholder secret values if the Functions emulator requires secret names.
- [ ] Do not validate, print, or retrieve production secret values.
- [ ] Do not call the live Salestrail API.

Callable payload:

```json
{ "dryRun": true, "debugWindowDays": 7 }
```

Required assertions:

- [ ] `SALESTRAIL_API_USERNAME` is referenced by name only.
- [ ] `SALESTRAIL_API_PASSWORD` is referenced by name only.
- [ ] `syncSalestrailCallsCallable` rejects unauthenticated and non-admin personas.
- [ ] Admin dry-run succeeds with mocked responses.
- [ ] Dry-run returns expected preview count from mocked response data.
- [ ] Dry-run creates no `salestrailCalls` documents.
- [ ] Dry-run updates no `salestrailCalls` documents.
- [ ] Dry-run deletes no `salestrailCalls` documents.
- [ ] Dry-run writes no audit entry.
- [ ] Dry-run does not leave a sync lock or status mutation in `appSettings/config`.
- [ ] Mocked API failure returns a controlled error without writes or secret leakage.
- [ ] Frontend Salestrail actions are verified to call Functions only and not read `salestrailCalls` directly.

Blocked action:

- [ ] Do not run live Salestrail sync or reconciliation as part of this validation plan.

## Phase 10: Evidence Review And Exit Criteria

Collect:

- [ ] Branch and HEAD.
- [ ] Build/typecheck output summaries.
- [ ] Emulator command and project ID.
- [ ] Fixture manifest.
- [ ] Rules test matrix.
- [ ] Callable test matrix.
- [ ] Phone dry-run before/after no-write proof.
- [ ] Salestrail dry-run no-write proof.
- [ ] Known failures and release blockers.

Pass criteria:

- [ ] Every checklist acceptance criterion has evidence.
- [ ] All production-safety confirmations are recorded.
- [ ] No hard stop occurred.
- [ ] Any callable auth gap remains a functions-deploy blocker until fixed or explicitly accepted.
- [ ] Any rules mismatch remains a rules-deploy blocker until fixed or explicitly accepted.

## Final Safety Confirmation

At the end of the run, record:

- [ ] No Firebase deploy was run.
- [ ] No Firebase production resource was modified.
- [ ] No production data was read, exported, imported, or written.
- [ ] No live Salestrail API request was made.
- [ ] No live Salestrail sync was run.
- [ ] No phone backfill was run against production.
- [ ] No phone normalization with `dryRun: false` was run as part of this plan.
- [ ] No Firebase migration script was run.
- [ ] No stash operation, branch deletion, force push, or destructive cleanup was performed.
