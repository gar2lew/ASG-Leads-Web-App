# Callable Emulator Dry Run Harness

Date: 2026-07-04
Branch: `test/callable-emulator-dry-run-harness`
Savepoint tag: `savepoint-before-callable-emulator-dry-run-harness`

## Objective

Add safe callable emulator coverage for high-risk backend actions before cleanup, refactor, UI redesign, Firebase data work, Salestrail work, or phone normalisation work.

## Safety Position

- No Firebase deploy was performed.
- No production Firebase data was read or written.
- `.firebaserc` was not changed.
- No Firestore rules were changed.
- No live Salestrail sync was run.
- No phone normalisation write run was executed.
- No migration script was run.
- No real secrets are required.
- Emulator commands use `demo-asg-crm-emulator`.

## Scripts

```powershell
npm run test:emulator:callables-dry-run
```

The command starts Auth, Firestore, and Functions emulators only:

```powershell
firebase emulators:exec --project demo-asg-crm-emulator --only auth,firestore,functions "node scripts/test-callable-emulator-dry-run-harness.cjs"
```

The harness refuses to run unless:

- `GCLOUD_PROJECT` is `demo-asg-crm-emulator`.
- `FIRESTORE_EMULATOR_HOST` is present.
- `FIREBASE_AUTH_EMULATOR_HOST` is present.
- the Functions emulator host is present.

## Emulator Config

`firebase.json` now has explicit local emulator ports for:

- Auth: `9099`
- Firestore: `8080`
- Functions: `5001`
- Emulator UI: `4000`

This is local emulator configuration only. It does not change hosting, deployed Functions, Firestore rules, indexes, project selection, or production resources.

## Callable Coverage Added

| Surface | Coverage | Production safety |
| --- | --- | --- |
| `verifyPin` | Uses an anonymous Auth emulator user, seeded admin rep, seeded plaintext PIN fallback, and verifies returned success and refreshed admin claim. | Emulator project only. |
| `setPin` | Seeds a setup rep, calls `setPin`, and confirms `isSetup` plus server-side `pinHash`. | Emulator project only. |
| `updateAppSettingsCallable` | Calls the settings admin update path with admin claims and confirms emulator `appSettings/config` changed. | Emulator project only. |
| `backfillPhoneNormalization` | Seeds a lead, calls `dryRun: true`, checks affected count, confirms lead data is unchanged, and confirms no audit log was written by the dry run. | Dry-run only, emulator project only. |
| `syncSalestrailCallsCallable` | Static source contract checks confirm auth, admin role, dry-run forwarding, skipped lock on dry-run, dry-run return before batch writes, and batch writes behind `!dryRun`. | The callable is not invoked because dry-run can still fetch the live API if emulator secrets are present. |

## Salestrail Remaining Gap

The Salestrail dry-run callable currently resolves `SALESTRAIL_API_USERNAME` and `SALESTRAIL_API_PASSWORD`, then fetches from the Salestrail API before it reaches the dry-run return path. That means a direct emulator invocation is not safe unless the API call is mocked or a no-network test seam is added.

Required next step before direct Salestrail callable emulator execution:

1. Add an approved mock seam for the Salestrail fetch path, or add an emulator-only test adapter that cannot reach the network.
2. Keep `syncSalestrailCallsCallable` admin-only.
3. Prove dry-run writes no `salestrailCalls` documents and no sync audit log.
4. Prove missing secrets return a safe error without writes.
5. Confirm direct client Firestore access to `salestrailCalls` remains denied through `npm run test:emulator:rules`.

## Java Status

The callable emulator command requires the Firebase Local Emulator Suite, so it requires Java on PATH. If Java is missing:

```powershell
npm run test:emulator:preflight
```

will report the blocker, and:

```powershell
npm run test:emulator:callables-dry-run
```

will fail before the harness starts.

Use Java 21 LTS where practical. Do not install Java automatically from Codex.

## Blocked Actions

- Do not deploy Functions while this harness is being validated.
- Do not run Salestrail live sync.
- Do not run phone normalisation with `dryRun:false`.
- Do not run migration scripts.
- Do not use production Firebase data as emulator fixtures.
