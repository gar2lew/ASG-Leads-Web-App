# Firebase Emulator Validation Checklist

Status: draft validation checklist for `codex-foundation` after the stacked PR merge.

This checklist is for local Firebase emulator validation only. It must not deploy, modify production Firebase resources, call the live Salestrail API, run live phone normalization, run migration scripts, or read/write production data.

## Scope

Validate the merged `codex-foundation` Firebase surfaces with synthetic emulator data:

- Callable auth boundaries.
- PIN setup and PIN verification callables.
- Settings/admin callables.
- Phone normalization dry-run behavior.
- Salestrail dry-run behavior with mocked API responses.
- Firestore rules for `salestrailCalls`, leads, clients, users, and app settings.
- Confirmation that no production data, deploy, migration, or live integration path is used.

## Preflight

- [ ] Confirm the working branch is `codex-foundation` or an isolated branch created from `codex-foundation`.
- [ ] Confirm the working tree is clean before validation.
- [ ] Confirm `.firebaserc` still targets `amplify-leads-2026`, and treat that target as production-like.
- [ ] Do not run `firebase deploy`, `firebase functions:delete`, migration scripts, live Salestrail sync, or phone backfill commands.
- [ ] Use only Firebase emulators for Auth, Firestore, and Functions.
- [ ] Use synthetic seed data only. Do not export, import, copy, or query production data.
- [ ] Do not use a production service account or production `.env` file.
- [ ] Set emulator environment explicitly, such as `FIRESTORE_EMULATOR_HOST`, before running any local callable/rules tests.
- [ ] Keep Salestrail credentials mocked or emulator-only. Do not verify secret values and do not print secret values.

Suggested local-only emulator surface:

```powershell
firebase emulators:start --only auth,firestore,functions
```

## Test Personas

- [ ] Unauthenticated request with no Firebase Auth context.
- [ ] Anonymous Firebase Auth user without custom claims.
- [ ] Active rep with `repId`, `role: "rep"`, `region`, `allowedRegions`, and `active: true`.
- [ ] Active manager with manager claims.
- [ ] Active admin with admin claims.
- [ ] Active director with director claims.
- [ ] Inactive user with otherwise valid claims.
- [ ] User attempting access outside `allowedRegions`.

## Synthetic Fixtures

- [ ] `reps/{repId}` documents for active and inactive reps.
- [ ] PIN fixtures with bcrypt `pinHash`.
- [ ] PIN fallback fixture with plaintext `pin`, preserving the current migration compatibility behavior.
- [ ] Backup password hash fixture for backup password verification.
- [ ] `leads/{leadId}` documents across Brisbane and Perth.
- [ ] Lead phone fixtures covering normalized, unnormalized, empty, duplicate, and invalid phone values.
- [ ] `clientNotes/{noteId}` documents for read/create/update/delete rules tests.
- [ ] `appSettings/config` with `dealSettings`, `trainingSettings`, `aiSettings`, `featureFlags`, and `integrations.salestrail`.
- [ ] `settings/{docId}`, `settingsHistory/{docId}`, `auditLogs/{docId}`, and `audit/{docId}` documents.
- [ ] `users/{uid}/dashboard`, `users/{uid}/repSettings`, and `users/{uid}/dailyHistory` documents.
- [ ] `userProfiles/{uid}` documents.
- [ ] `salestrailCalls/{callId}` documents seeded directly through emulator admin setup only, then tested through client rules.

## Callable Auth Boundaries

- [ ] Unauthenticated calls are rejected for `verifyPin`.
- [ ] Unauthenticated calls are rejected for `setPin`.
- [ ] Unauthenticated calls are rejected for `changePin`.
- [ ] Unauthenticated calls are rejected for `verifyBackupPassword`.
- [ ] Unauthenticated calls are rejected for `updateAppSettingsCallable`.
- [ ] Unauthenticated calls are rejected for `rollbackAppSettingsCallable`.
- [ ] Unauthenticated calls are rejected for `backfillPhoneNormalization`.
- [ ] Unauthenticated calls are rejected for `syncSalestrailCallsCallable`.
- [ ] Unauthenticated calls are rejected for `getSalestrailConfig`.
- [ ] Unauthenticated calls are rejected for `updateSalestrailConfig`.
- [ ] Unauthenticated calls are rejected for `resetSalestrailSyncLock`.
- [ ] Rep users are rejected from admin-only callables.
- [ ] Manager users are rejected from admin-only callables unless the callable explicitly allows manager access.
- [ ] Admin users can call admin-only callables in emulator with synthetic data.
- [ ] Inactive users are rejected by callables that require active authenticated identity.
- [ ] Out-of-region users cannot operate on data outside their allowed region where region checks apply.

Known release-risk checks:

- [ ] `getPropertyInsights` is reviewed as a callable with no `requireAuth(request)` call before any functions deployment.
- [ ] `sendPushNotification` is reviewed as a callable with no `requireAuth(request)` call before any functions deployment.
- [ ] `triggerPerfAlert` is reviewed as a callable with no `requireAuth(request)` call before any functions deployment.
- [ ] SMSF callables are reviewed for auth enforcement before any functions deployment.

## PIN Callables

- [ ] `verifyPin` succeeds for an active rep with a valid hashed PIN.
- [ ] `verifyPin` succeeds for the documented plaintext PIN fallback fixture until the migration is complete.
- [ ] `verifyPin` rejects invalid PINs.
- [ ] `verifyPin` rejects missing, inactive, or unknown reps.
- [ ] `verifyPin` applies rate-limit behavior after repeated failed attempts.
- [ ] `verifyPin` sets the expected custom claims in emulator Auth on success.
- [ ] `setPin` writes a bcrypt PIN hash for a valid setup request.
- [ ] `setPin` rejects malformed or weak PIN values.
- [ ] `setPin` requires a valid backup password when replacing an existing PIN and backup credentials exist.
- [ ] `changePin` requires the current PIN.
- [ ] `changePin` updates the PIN hash and rejects the old PIN afterward.
- [ ] `verifyBackupPassword` succeeds with the valid backup password fixture.
- [ ] `verifyBackupPassword` rejects invalid backup passwords and missing backup password state.
- [ ] PIN callables do not print PINs, backup passwords, hashes, or tokens.

## Settings/Admin Callables

- [ ] `updateAppSettingsCallable` rejects unauthenticated users.
- [ ] `updateAppSettingsCallable` rejects reps and non-admin personas.
- [ ] `updateAppSettingsCallable` accepts an admin update to an allowed section and allowed field.
- [ ] `updateAppSettingsCallable` rejects unsupported sections.
- [ ] `updateAppSettingsCallable` rejects unsupported fields inside otherwise allowed sections.
- [ ] `updateAppSettingsCallable` writes the expected `appSettings/config` update in emulator.
- [ ] `updateAppSettingsCallable` writes expected synthetic `settingsHistory` and `auditLogs` entries.
- [ ] `rollbackAppSettingsCallable` rejects unauthenticated users.
- [ ] `rollbackAppSettingsCallable` rejects reps and non-admin personas.
- [ ] `rollbackAppSettingsCallable` accepts an admin rollback using valid synthetic history.
- [ ] `rollbackAppSettingsCallable` writes expected synthetic rollback history and audit entries.
- [ ] Settings/admin callables do not expose secret values, especially Salestrail credentials.

## Phone Normalization Dry Run

- [ ] `backfillPhoneNormalization` rejects unauthenticated users.
- [ ] `backfillPhoneNormalization` rejects reps and non-admin personas.
- [ ] `backfillPhoneNormalization` accepts an admin request with `dryRun: true`.
- [ ] Dry-run returns total scanned lead count using synthetic leads.
- [ ] Dry-run returns affected lead count.
- [ ] Dry-run returns representative before/after samples.
- [ ] Dry-run identifies already-normalized, empty, invalid, and changed phone values correctly.
- [ ] Dry-run does not update any `leads` document.
- [ ] Dry-run does not write audit entries.
- [ ] No `dryRun: false` phone normalization is executed outside an explicitly isolated emulator test with synthetic data and separate approval.

## Salestrail Dry Run

- [ ] `SALESTRAIL_API_USERNAME` exists by name in the code path without printing or validating the value.
- [ ] `SALESTRAIL_API_PASSWORD` exists by name in the code path without printing or validating the value.
- [ ] Salestrail API responses are mocked or stubbed. Do not call the live Salestrail API.
- [ ] `syncSalestrailCallsCallable` rejects unauthenticated users.
- [ ] `syncSalestrailCallsCallable` rejects reps and non-admin personas.
- [ ] `syncSalestrailCallsCallable` accepts an admin request with `dryRun: true` using mocked responses.
- [ ] Dry-run returns a `wouldImportCount` or equivalent imported-count preview from mocked responses.
- [ ] Dry-run does not create, update, or delete `salestrailCalls` documents.
- [ ] Dry-run does not write audit entries.
- [ ] Dry-run does not activate or leave behind a sync lock in `appSettings/config`.
- [ ] Dry-run handles missing mocked credentials as an error without leaking values.
- [ ] Dry-run handles mocked Salestrail API failures without writes.
- [ ] Frontend Salestrail actions are verified to use callables only, with no direct Firestore reads from `salestrailCalls`.

## Firestore Rules

### salestrailCalls

- [ ] Direct client `get` is denied for unauthenticated users.
- [ ] Direct client `list` is denied for unauthenticated users.
- [ ] Direct client `create`, `update`, and `delete` are denied for unauthenticated users.
- [ ] Direct client `get` and `list` are denied for anonymous users.
- [ ] Direct client `create`, `update`, and `delete` are denied for anonymous users.
- [ ] Direct client `get` and `list` are denied for reps, managers, admins, and directors.
- [ ] Direct client `create`, `update`, and `delete` are denied for reps, managers, admins, and directors.
- [ ] Any allowed Salestrail data access is callable-only.

### Leads And Clients

- [ ] Unauthenticated users are denied direct access to `leads`.
- [ ] Anonymous operational users have current compatibility access to `leads` as defined by `canUseOperationalApp()`.
- [ ] Authenticated operational users have expected current compatibility read/write access to `leads`.
- [ ] Region-specific lead behavior is separately validated in callables and UI flows where rules do not enforce final region isolation.
- [ ] Unauthenticated users are denied direct access to `clientNotes`.
- [ ] Authenticated users can read `clientNotes`.
- [ ] Authenticated users can create valid `clientNotes` with required fields.
- [ ] `clientNotes` updates preserve immutable fields required by the rules.
- [ ] `clientNotes` deletes match the current expected authenticated behavior.

### Users And Profiles

- [ ] Unauthenticated users are denied access to `users/{uid}/dashboard`.
- [ ] Anonymous users are denied owner-only `users/{uid}/dashboard` access.
- [ ] Authenticated non-anonymous users can access their own `users/{uid}/dashboard` documents.
- [ ] Authenticated users are denied access to another user's `users/{uid}/dashboard` documents.
- [ ] Repeat owner and cross-owner checks for `users/{uid}/repSettings`.
- [ ] Repeat owner and cross-owner checks for `users/{uid}/dailyHistory`.
- [ ] Repeat owner and cross-owner checks for `userProfiles/{uid}`.

### App Settings And Admin Logs

- [ ] Unauthenticated users are denied direct reads from `appSettings`.
- [ ] Authenticated operational users can read `appSettings/config`.
- [ ] Direct client writes to `appSettings/config` are denied for anonymous, rep, manager, admin, and director personas.
- [ ] Direct client writes to non-`config` `appSettings` documents match current compatibility rules.
- [ ] `settings/{docId}` read/write access matches current compatibility rules.
- [ ] `settingsHistory` reads require authenticated non-anonymous users.
- [ ] Direct client writes to `settingsHistory` are denied.
- [ ] `auditLogs` reads are limited to elevated personas.
- [ ] Direct client writes to `auditLogs` are denied.
- [ ] `audit` reads are limited to elevated personas.
- [ ] Direct client writes to `audit` are denied.

### Other Production-Sensitive Collections

- [ ] `smsfFinancials` access is limited to elevated personas.
- [ ] `dailyStats` direct client writes are denied.
- [ ] `sentAlerts` direct client writes are denied.
- [ ] `properties` direct client writes are denied.

## No Production Data Access Evidence

Record validation evidence without secrets:

- [ ] Emulator command and emulator ports used.
- [ ] Test command or manual test harness used.
- [ ] Synthetic fixture manifest or seed script name.
- [ ] Confirmation that no production service account was used.
- [ ] Confirmation that no production `.env` or credential file was used.
- [ ] Confirmation that no `firebase deploy` command was run.
- [ ] Confirmation that no migration script was run.
- [ ] Confirmation that no live Salestrail API request was made.
- [ ] Confirmation that no phone backfill with `dryRun: false` was run.
- [ ] Callable test results.
- [ ] Firestore rules test results.
- [ ] Known failures and release blockers.

## Acceptance Criteria

The emulator validation gate is considered passed only when:

- [ ] All protected callables reject unauthenticated requests.
- [ ] Admin-only callables reject non-admin personas.
- [ ] PIN setup, verification, backup password, and rate-limit behavior pass with synthetic data.
- [ ] Settings/admin callable update and rollback behavior pass with synthetic data.
- [ ] Phone normalization dry-run returns accurate counts and samples without writes.
- [ ] Salestrail dry-run uses mocked responses and performs no Firestore writes.
- [ ] Direct client access to `salestrailCalls` is denied for every persona.
- [ ] Expected current access for `leads`, `clientNotes`, `users`, `userProfiles`, `appSettings`, and settings/audit collections is documented by passing rules tests.
- [ ] Known callable auth gaps are either fixed in a later PR or explicitly treated as functions-deploy blockers.
- [ ] No production data, production Firebase resource, live Salestrail endpoint, deploy command, migration, or live backfill path was used.

## Tasks That Remain Blocked

- [ ] Firebase deploys of any surface.
- [ ] Production Functions deployment.
- [ ] Production Firestore rules deployment.
- [ ] Production Firestore indexes deployment.
- [ ] Live Salestrail sync.
- [ ] Live Salestrail reconciliation.
- [ ] Phone normalization with `dryRun: false`.
- [ ] Firebase leads migration scripts.
- [ ] Any full-replace migration mode.
- [ ] Any production data write.
