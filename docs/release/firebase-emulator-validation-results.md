# Firebase Emulator Validation Results

Status: emulator validation attempted; blocked before rules/callable execution.

Date: 2026-07-01

## Safety Boundary

This was an emulator-only validation attempt. No Firebase deploy was run, no production data was read or written, no live Salestrail sync was run, no live Salestrail API was called, no phone normalization with `dryRun:false` was run, and no Firebase lead migration script was run.

Production-like Firebase project identified in local config:

- `.firebaserc` default: `amplify-leads-2026`
- `firebase.json` hosting site: `amplify-leads-2026`

Intended emulator project:

- `demo-asg-crm-emulator`

## Starting State

- Starting branch: `codex-foundation`
- Starting HEAD: `b88c417 Merge pull request #12 from gar2lew/docs/final-planning-and-audit-notes`
- Starting working tree: clean

Open PRs at inspection time:

- PR #15: `docs: add Firebase emulator validation checklist`
- PR #14: `docs: add Firebase release plan`
- PR #13: `docs: add appointment pack integration plan`

## Docs Read

The release docs were not present on local `codex-foundation` at the start of execution.

Read sources:

- `docs/release/firebase-release-plan.md` from `origin/docs/firebase-release-plan`
- `docs/release/firebase-emulator-validation-checklist.md` from PR #15 branch `codex/docs/firebase-emulator-validation-checklist`
- `docs/release/firebase-emulator-validation-run-plan.md` from PR #15 branch `codex/docs/firebase-emulator-validation-checklist`

PR #15 was checked out locally for docs/test context only. It was not merged.

## Commands Run

Repository state and docs access:

```powershell
git branch --show-current
git status --short
git fetch origin
gh pr list --state open
git log --oneline -10
gh pr checkout 15
git branch --show-current
git status --short
Get-ChildItem docs\release
git show origin/docs/firebase-release-plan:docs/release/firebase-release-plan.md
Get-Content docs\release\firebase-emulator-validation-checklist.md
Get-Content docs\release\firebase-emulator-validation-run-plan.md
```

Tooling/config inspection:

```powershell
firebase --version
firebase emulators:start --help
firebase emulators:exec --help
npm run
cd functions
npm run
cd ..
Get-ChildItem
Get-ChildItem functions
Get-ChildItem scripts
Get-ChildItem src
Get-Content firebase.json
Get-Content .firebaserc
Get-Content firestore.rules
Get-Content firestore.indexes.json
Get-Content functions\src\index.ts
rg -n "@firebase/rules-unit-testing|firebase-functions-test|connectFirestoreEmulator|connectAuthEmulator|connectFunctionsEmulator|firebase emulators:start|emulators:start|emulators:exec|FIRESTORE_EMULATOR_HOST|FIREBASE_AUTH_EMULATOR_HOST|SALESTRAIL_API|backfillPhoneNormalization|dryRun|verifyPin|updateAppSettingsCallable" package.json package-lock.json functions/package.json functions/package-lock.json firebase.json scripts functions src docs\release -g "!node_modules/**" -g "!functions/node_modules/**" -g "!functions/lib/**" -g "!dist/**"
rg --files -g "*emulator*" -g "*rules*" -g "*firebase*" -g "*test*" -g "!node_modules/**" -g "!functions/node_modules/**" -g "!functions/lib/**" -g "!dist/**"
```

Local validation:

```powershell
npx tsc --noEmit
npx tsc --noEmit -p functions\tsconfig.json
npm run build
git diff -- src\generated\releaseMetadata.ts
git restore -- src/generated/releaseMetadata.ts
npm run build
```

The second `npm run build` in the list above was run from `functions`.

Firebase project confirmation and emulator smoke:

```powershell
firebase projects:list
firebase use
firebase emulators:exec --project demo-asg-crm-emulator "echo Emulator boot smoke test"
```

Local/static tests:

```powershell
npm run test:auth-boundaries
npm run test:workflow-state
npm run test:region-identity
npm run test:observability
npm run test:release-metadata
cd functions
npm run test:settings-admin
cd ..
npx vitest run src\lib\__tests__\utils.test.ts src\lib\sheetsSyncIndex.test.ts
```

## Tooling Inventory

Firebase CLI:

- `firebase --version`: `15.20.0`

Available root scripts:

- `dev`
- `prebuild`
- `build`
- `test:auth-boundaries`
- `test:workflow-state`
- `test:region-identity`
- `test:observability`
- `test:release-metadata`
- `release:metadata`
- `release:deploy`
- `release:dry-run`
- `preview`
- `lint`
- `deploy`

Available functions scripts:

- `build`
- `test:settings-admin`
- `serve`
- `deploy`

Existing emulator command:

- `cd functions && npm run serve`
- Expands to `npm run build && firebase emulators:start --only functions`

Missing emulator command:

- No root script exists for `firebase emulators:exec --project demo-asg-crm-emulator --only auth,firestore,functions ...`

Firebase emulator config:

- `firebase.json` has hosting, Firestore rules/indexes, and functions source.
- `firebase.json` does not define an `emulators` section or local emulator ports.

## Dependency Status

Dependency install was not run.

Reason:

- Root `node_modules` existed.
- `functions/node_modules` existed.
- Existing dependencies were sufficient for local typecheck/build/static tests.

## Typecheck And Build Results

Passed:

- `npx tsc --noEmit`
- `npx tsc --noEmit -p functions\tsconfig.json`
- Root `npm run build`
- `cd functions && npm run build`

Build generated a tracked release metadata change in `src/generated/releaseMetadata.ts`, updating commit/time metadata. The generated file was inspected and restored with:

```powershell
git restore -- src/generated/releaseMetadata.ts
```

No other tracked build output remained modified.

## Emulator Boot Result

Command:

```powershell
firebase emulators:exec --project demo-asg-crm-emulator "echo Emulator boot smoke test"
```

Result: failed before emulator validation could start.

Observed error:

```text
Error: Could not spawn `java -version`. Please make sure Java is installed and on your system PATH.
```

Impact:

- Firestore/Auth/Functions emulator validation could not execute.
- No emulator fixture seed was run.
- No Firestore rules emulator tests were run.
- No callable emulator tests were run.

## Firestore Rules Validation Result

Status: not executed.

Reason:

- Emulator boot failed because Java was unavailable on `PATH`.
- No Firestore rules test harness exists in the repo.

Static/source evidence:

- `firestore.rules` contains `match /salestrailCalls/{callId} { allow read, write: if false; }`.
- Existing `npm run test:auth-boundaries` passed and statically checks several rules/auth boundaries.

Coverage gap:

- No `@firebase/rules-unit-testing` dependency.
- No persona matrix rules tests.
- No scripted assertions for direct client `salestrailCalls` get/list/create/update/delete denial.
- No scripted rules tests for `leads`, `clientNotes`, `users`, `userProfiles`, `appSettings`, `settingsHistory`, `auditLogs`, `audit`, `smsfFinancials`, `dailyStats`, `sentAlerts`, or `properties`.

## Callable Auth Validation Result

Status: not executed in emulator.

Reason:

- Emulator boot failed because Java was unavailable on `PATH`.
- No callable emulator harness exists in the repo.

Static/source evidence:

- PIN/auth callables call `requireAuth(request)`.
- Settings/admin callables call `requireAuth(request)` and `requireMinimumRole(auth, "admin")`.
- `backfillPhoneNormalization` calls `requireAuth(request)` and `requireMinimumRole(auth, "admin")`.
- Salestrail admin callables call `requireAuth(request)` and admin checks where expected.

Release blockers still present:

- `getPropertyInsights` lacks `requireAuth(request)`.
- `sendPushNotification` lacks `requireAuth(request)`/role checks.
- `triggerPerfAlert` lacks `requireAuth(request)`/role checks.
- SMSF callables require auth review before any functions deploy.
- `functions/src/index.ts` initializes Admin/Firestore at module scope, conflicting with the repo lazy `getDb()` rule.

## PIN And Settings Validation Result

PIN callable behavior:

- Not executed in emulator.
- No synthetic Auth/Firestore fixture seed exists for PIN verification, PIN setup, backup password, wrong PIN, or rate-limit behavior.

Settings/admin callable behavior:

- Not executed in emulator.
- `cd functions && npm run test:settings-admin` passed for settings helper payload/history/audit builder logic.
- No emulator callable test currently proves non-admin denial or admin allowed writes to emulator `appSettings/config`.

## Phone Dry-Run Validation Result

Status: not executed.

Reason:

- Emulator boot failed.
- No synthetic lead fixture seed exists.
- No callable emulator harness exists.

Safety confirmation:

- `backfillPhoneNormalization` was not invoked.
- `dryRun:false` was not run.

## Salestrail Mock/Dry-Run Validation Result

Status: not executed.

Reason:

- Emulator boot failed.
- No Salestrail mock/stub harness exists.
- Current Salestrail dry-run path still depends on the Salestrail API call path before returning dry-run counts, so it must not be run without a mock/stub.

Safety confirmation:

- `syncSalestrailCallsCallable` was not invoked.
- No live Salestrail API request was made.
- No Salestrail secret values were read or printed.

## Local/Static Test Results

Passed:

- `npm run test:auth-boundaries`
- `npm run test:observability`
- `npm run test:release-metadata`
- `cd functions && npm run test:settings-admin`
- `npx vitest run src\lib\__tests__\utils.test.ts src\lib\sheetsSyncIndex.test.ts`
  - 2 test files passed.
  - 22 tests passed.

Failed:

- `npm run test:workflow-state`
  - Failure: expected next action type `callback`, actual `booked`.
  - Location: `scripts/test-workflow-state.cjs:57`.
- `npm run test:region-identity`
  - Failure: expected `App.tsx` to contain `const sidebarBrand = (`.
  - Location: `scripts/test-region-identity.cjs:38`.

## Missing Harnesses And Test Gaps

Required before the emulator validation checklist can be completed:

- Java installed and available on `PATH` for Firebase emulators.
- Root emulator script or documented command using `--project demo-asg-crm-emulator`.
- `firebase.json` emulator port/config section, if stable ports are desired.
- Firestore rules test harness.
- `@firebase/rules-unit-testing` dependency or equivalent.
- Auth/Firestore emulator synthetic fixture seed.
- Callable emulator test harness.
- `firebase-functions-test` or an equivalent local callable invocation strategy.
- PIN fixtures for hashed PIN, plaintext fallback, wrong PIN, backup password, rate-limit behavior, inactive reps, and custom claims.
- Settings/admin fixtures for admin/non-admin role testing.
- Phone dry-run fixtures with normalized, unnormalized, empty, invalid, duplicate, and Google-Sheets-dropped-leading-zero phone values.
- Salestrail mock/stub layer that prevents live API calls.
- Salestrail dry-run tests proving no writes to `salestrailCalls`, `auditLogs`, or `appSettings/config` sync-lock fields.
- Client emulator wiring via `connectFirestoreEmulator`, `connectAuthEmulator`, and `connectFunctionsEmulator`, or a separate test client that does this explicitly.

## Files Modified Or Restored

Modified during validation:

- `src/generated/releaseMetadata.ts` was generated by `npm run build`.

Restored:

- `src/generated/releaseMetadata.ts` was restored after inspection.

Results report created:

- `docs/release/firebase-emulator-validation-results.md`

## Remaining Blockers Before Production Deployment

- Emulator cannot start until Java is installed and available on `PATH`.
- Firestore rules are not validated with emulator/persona tests.
- Callable auth boundaries are not validated in emulator.
- PIN behavior is not validated in emulator.
- Settings/admin callable behavior is not validated in emulator.
- Phone normalization dry-run is not validated in emulator.
- Salestrail dry-run is not validated with a mock/stub.
- Existing local/static tests have two failures:
  - `test:workflow-state`
  - `test:region-identity`
- Existing release blockers remain for unauthenticated or under-authorized callable exports.
- Functions deploy remains blocked until callable auth gaps and function export risk are resolved.
- Firestore rules deploy remains blocked until rules emulator tests pass.
- Salestrail live sync remains blocked.
- Phone normalization `dryRun:false` remains blocked.
- Firebase lead migration scripts remain blocked.

## Final Safety Confirmation

- No Firebase deploy was run.
- No production Firebase resource was modified.
- No production data was read, exported, imported, or written.
- No live Salestrail API request was made.
- No live Salestrail sync was run.
- No phone backfill was run against production.
- No phone normalization with `dryRun:false` was run.
- No Firebase lead migration script was run.
- No stash operation was performed.
- No branch deletion was performed.
- No force push was performed.
- No destructive cleanup was performed.
