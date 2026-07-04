# Emulator Harness Execution Report

Date: 2026-07-04
Branch: `test/emulator-harness-execution`
Savepoint tag: `savepoint-before-emulator-harness-execution`

## Objective

Run and debug the Firebase emulator harnesses after Java was installed and the callable harness exposed a Functions emulator host detection failure.

## Safety Position

- No Firebase deploy was performed.
- No production Firebase data was read or written.
- No Firestore rules were changed.
- No Firebase project selection was changed.
- No live Salestrail sync was run.
- No phone normalisation backfill write was run.
- No migration script was run.
- No secrets were printed, requested, written, or committed.

## Environment Findings

Firebase CLI is available:

```text
15.20.0
```

Java is installed in the persisted Windows environment:

```text
openjdk version "21.0.11" 2026-04-21 LTS
OpenJDK Runtime Environment Temurin-21.0.11+10
```

Codex shell note:

- The long-running Codex process still had a stale `Path`.
- Emulator commands were run after refreshing `JAVA_HOME` and prepending `%JAVA_HOME%\bin` inside the command environment.
- `npm run test:emulator:preflight` then reported Java runtime available.

## Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npm run typecheck` | Pass | Client and Functions TypeScript validation passed. |
| `npm run lint` | Pass | Blocking ESLint check passed. |
| `npm run build` | Pass | Build passed with existing large chunk warnings. Release metadata was generated as a build side effect. |
| `npm test` | Pass | Root guardrail suite passed. |
| `npm run test:emulator:preflight` | Pass | Firebase CLI available, Java runtime available, explicit emulator config present, production default remains `amplify-leads-2026`. |
| `npm run test:emulator:rules` | Pass | Authenticated Firestore rules harness passed against `demo-asg-crm-emulator`. Expected permission-denied logs were emitted for denied writes. |
| `npm run test:emulator:firestore-smoke` | Pass | Firestore smoke checks passed when run by itself. A parallel run collided with the rules emulator hub port, so emulator suites should run sequentially. |
| `npm run test:emulator:callables-dry-run` | Pass | Callable harness passed after Functions emulator host detection was fixed. |
| `cd functions && npm run build` | Pass | Functions TypeScript build passed. |
| `cd functions && npm run test:settings-admin` | Pass | Functions settings/admin unit test passed. |

## Failures Fixed

- Fixed the callable harness so it no longer requires `FUNCTIONS_EMULATOR_HOST` from Firebase CLI.
- The harness now falls back to the explicit Functions emulator port in `firebase.json`.
- Updated the harness to use the modular Firebase Admin API for emulator seeding, matching the installed Admin SDK package shape.
- Kept executable callable coverage on `verifyPin` and `backfillPhoneNormalization` dry-run.
- Kept PIN setup/change/backup and settings/admin callables as source auth/role contract checks because executable mutation paths hit a server timestamp compatibility issue that requires a separate production-code decision.

## Current Blocker

No emulator startup blocker remains when Java is visible to the shell.

The remaining callable limitation is:

```text
admin.firestore.FieldValue.serverTimestamp() is undefined inside the Functions emulator runtime for mutation callables that use the current namespace Admin import path.
```

Observed affected executable paths during diagnosis:

- `setPin`
- `updateAppSettingsCallable`

This goal did not change production Functions code. The issue should be handled in a separate targeted Functions Admin SDK compatibility goal.

## Remaining Emulator Work

1. Add a separate targeted fix for Functions Admin SDK `FieldValue.serverTimestamp()` compatibility.
2. Restore executable emulator coverage for `setPin`, `changePin`, and settings/admin mutation callables after that fix.
3. Keep Salestrail dry-run behind source contracts until an approved no-network mock seam exists.
4. Run emulator suites sequentially to avoid hub port collisions.

## Release Risk

This branch proves the emulator rules, Firestore smoke, and callable dry-run harnesses can execute against `demo-asg-crm-emulator`.

Release risk remains around callable mutation paths that use `admin.firestore.FieldValue.serverTimestamp()` until the Functions Admin SDK compatibility issue is fixed and executable callable coverage is restored.

Production Firebase deploys, Functions deploys, Firestore rules deploys, Salestrail live sync, phone normalisation writes, and migration runs remain blocked.
