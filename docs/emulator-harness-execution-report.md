# Emulator Harness Execution Report

Date: 2026-07-04
Branch: `fix/functions-admin-timestamp-compatibility`
Savepoint tag: `savepoint-before-functions-admin-timestamp-compatibility`

## Objective

Fix the Functions Admin SDK timestamp compatibility issue discovered during callable emulator testing, then restore executable emulator coverage for affected callables.

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
| `npm run test:emulator:callables-dry-run` | Pass | Callable harness passed with executable coverage for `verifyPin`, `setPin`, `changePin`, settings update/rollback, and phone normalisation dry-run. |
| `cd functions && npm run build` | Pass | Functions TypeScript build passed. |
| `cd functions && npm run test:settings-admin` | Pass | Functions settings/admin unit test passed. |

## Failures Fixed

- Fixed the callable harness so it no longer requires `FUNCTIONS_EMULATOR_HOST` from Firebase CLI.
- The harness now falls back to the explicit Functions emulator port in `firebase.json`.
- Updated the harness to use the modular Firebase Admin API for emulator seeding, matching the installed Admin SDK package shape.
- Added a Functions `firestoreCompat` helper that uses modular `firebase-admin/firestore` exports for `FieldValue.serverTimestamp()`, `Timestamp.now()`, and `Timestamp.fromDate()`.
- Replaced incompatible namespace timestamp usage in Functions source while preserving existing lazy Firestore initialisation, auth checks, role checks, and business logic.
- Restored executable callable emulator coverage for `setPin`, `changePin`, `updateAppSettingsCallable`, and `rollbackAppSettingsCallable`.

## Current Blocker

No emulator startup blocker remains when Java is visible to the shell.

The `admin.firestore.FieldValue.serverTimestamp()` compatibility issue is fixed for known Functions source call sites.

Salestrail dry-run remains source-contract-only because the dry-run path can still reach the live API when secrets are present. It needs an approved no-network mock seam before direct executable emulator coverage.

## Remaining Emulator Work

1. Keep Salestrail dry-run behind source contracts until an approved no-network mock seam exists.
2. Add executable emulator coverage for `verifyBackupPassword`.
3. Run emulator suites sequentially to avoid hub port collisions.

## Release Risk

This branch proves the emulator rules, Firestore smoke, and callable dry-run harnesses can execute against `demo-asg-crm-emulator`.

Release risk remains around callable surfaces outside this harness, including known unauthenticated callables documented in the risk register and Salestrail live API behaviour.

Production Firebase deploys, Functions deploys, Firestore rules deploys, Salestrail live sync, phone normalisation writes, and migration runs remain blocked.
