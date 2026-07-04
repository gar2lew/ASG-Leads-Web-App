# Emulator Validation Baseline

Date: 2026-07-04
Branch: `goal/emulator-validation-baseline`
Savepoint tag: `savepoint-before-emulator-validation-baseline`

## Objective

Establish a safe Firebase emulator validation baseline before cleanup, refactor, UI redesign, Firebase rules work, callable work, Salestrail work, phone backfill work, or migration work.

## Safety Position

- No Firebase deploy was performed.
- No production Firebase data was read or written.
- No Firebase project selection was changed.
- No Firestore rules, indexes, or Firebase config were changed.
- No live Salestrail sync was run.
- No phone normalisation backfill was run.
- No migration script was run.
- Emulator commands must use `demo-asg-crm-emulator`.

## Existing Setup

| Area | Current state | Risk |
| --- | --- | --- |
| `.firebaserc` | Default project is `amplify-leads-2026`. | Production-like default requires explicit safety checks. |
| `firebase.json` | Hosting, Functions, Firestore rules, and indexes are configured. | Deploy surfaces are broad, but this goal does not deploy. |
| `firebase.json` emulators block | Present. | Firestore and UI ports are now explicit for repeatable local validation. |
| Root emulator scripts | Added in this goal. | Scripts are baseline only until Java is installed. |
| Functions emulator script | Existing `functions/package.json` has `serve`. | It does not specify a demo project in the script. Use with care. |
| Rules unit testing dependency | Missing. | Authenticated role and claim tests need a later harness. |
| Java runtime | Missing from PATH in this environment. | Firestore emulator startup is blocked. |
| Firebase CLI | Available, version `15.20.0`. | CLI is available for emulator work. |

## Scripts Added

| Script | Purpose |
| --- | --- |
| `npm run test:emulator:preflight` | Static safety and readiness audit for emulator validation. Does not start emulators. |
| `npm run test:emulator:firestore-smoke` | Starts the Firestore emulator with `--project demo-asg-crm-emulator` and checks unauthenticated direct access denial for `salestrailCalls` and `leads`. |

## Coverage Added

The preflight script checks:

- `firebase.json` points Firestore rules to `firestore.rules`.
- `firebase.json` points Firestore indexes to `firestore.indexes.json`.
- Functions source is `functions`.
- `.firebaserc` default remains documented as production-like.
- Emulator smoke script uses `demo-asg-crm-emulator`.
- Emulator smoke script does not target `amplify-leads-2026`.
- `salestrailCalls` direct client access is denied in rules.
- Broad `leads` operational access is visible and explicit.
- `appSettings` rule coverage exists.
- Firebase CLI and Java availability are reported.

The Firestore smoke script is ready to check, once Java is installed:

- `FIRESTORE_EMULATOR_HOST` is present.
- Production project ID is not used.
- Unauthenticated read from `salestrailCalls` is denied.
- Unauthenticated write to `salestrailCalls` is denied.
- Unauthenticated read from `leads` is denied.

## Blockers Found

1. Java is not available on PATH.
   - `java -version` failed.
   - Firestore emulator startup is blocked until Java is installed and visible to the shell.

2. Authenticated Firestore rules tests require Java before they can run.
   - A minimal explicit emulator config now exists.
   - Firestore and UI ports are documented in `firebase.json`.

3. Authenticated Firestore rules tests are not yet covered.
   - The repo does not include `@firebase/rules-unit-testing`.
   - Role, custom-claim, and authenticated anonymous-user rules checks need a dedicated test harness.

4. Callable emulator coverage is not yet implemented.
   - Existing callable checks are static or unit-style.
   - PIN, settings/admin, Salestrail dry-run, and phone normalisation dry-run callables still need emulator or mocked callable tests.

5. Functions emulator script does not force a demo project.
   - `functions/package.json` has `serve: npm run build && firebase emulators:start --only functions`.
   - Operators should use explicit demo project commands until this is safely standardised.

## Required Next Coverage

Before Firebase rules or callable changes:

- Add `@firebase/rules-unit-testing` or an approved equivalent.
- Add emulator rules tests for:
  - `salestrailCalls`
  - `leads`
  - `clientNotes`
  - `reps`
  - `users`
  - `userProfiles`
  - `appSettings`
  - `settingsHistory`
  - `auditLogs`
  - SMSF collections
- Add callable emulator or mocked callable tests for:
  - `verifyPin`
  - `setPin`
  - `changePin`
  - `verifyBackupPassword`
  - `updateAppSettingsCallable`
  - `rollbackAppSettingsCallable`
  - `backfillPhoneNormalization` with dry-run only
  - Salestrail dry-run paths only

## Safe Runbook

After Java is installed:

```powershell
npm run test:emulator:preflight
npm run test:emulator:firestore-smoke
```

Do not run:

```powershell
firebase deploy
firebase deploy --only functions
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

Do not run live migration, Salestrail sync, or phone backfill write commands.

## Baseline Decision

The repository now has a safe emulator preflight, a demo-project Firestore smoke command, explicit local emulator ports, and authenticated rules harness scaffolding. Full emulator validation is still blocked by Java availability and missing callable harnesses.

The next goal should install or approve the missing test harness pieces and add actual authenticated emulator coverage before any rules, callable, integration, migration, cleanup, refactor, or UI redesign work proceeds.

## Validation Results

| Command | Result | Notes |
| --- | --- | --- |
| `npm run test:emulator:preflight` | Pass | Firebase CLI available, Java missing, explicit `firebase.json` emulators block missing, demo project script confirmed. |
| `npm run test:emulator:firestore-smoke` | Blocked | Firestore emulator startup failed because Java is not installed or not on PATH. |
