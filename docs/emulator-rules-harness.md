# Emulator Rules Harness

Date: 2026-07-04
Branch: `fix/emulator-tooling-java-and-rules-harness`
Savepoint tag: `savepoint-before-emulator-tooling-java-and-rules-harness`

## Objective

Make Firebase emulator validation runnable and useful before cleanup, refactor, UI redesign, Firebase rules changes, callable changes, Salestrail work, phone normalisation work, or migration work.

## Safety Position

- No Firebase deploy was performed.
- No production Firebase data was read or written.
- `.firebaserc` was not changed.
- Firestore rules were not weakened or changed.
- No Salestrail live sync was run.
- No phone normalisation backfill was run.
- No migration script was run.
- Emulator commands use `demo-asg-crm-emulator`.

## Java Setup Status

Current local status:

- `java -version` fails because Java is not on PATH.
- `npm run test:emulator:firestore-smoke` is blocked by missing Java.
- `npm run test:emulator:rules` is blocked by missing Java.

Official Firebase Local Emulator Suite documentation requires Node.js 16 or higher and Java JDK 11 or higher. Google Cloud Firestore emulator documentation also warns that Java 21 or later is required for upcoming Cloud CLI releases. For this repo, use Java 21 LTS where practical so the setup is forward-compatible.

Windows setup checklist:

1. Install a Java 21 JDK, for example Eclipse Temurin 21 from Adoptium or another approved JDK distribution.
2. Set `JAVA_HOME` to the JDK install directory, for example `C:\Program Files\Eclipse Adoptium\jdk-21...`.
3. Add `%JAVA_HOME%\bin` to the user or system `Path`.
4. Open a new terminal.
5. Run `java -version`.
6. Re-run:

```powershell
npm run test:emulator:preflight
npm run test:emulator:firestore-smoke
npm run test:emulator:rules
```

Do not install Java automatically from Codex. Human setup is required.

## Emulator Config Status

This goal added a minimal explicit `firebase.json` emulator block:

- Firestore emulator port: `8080`
- Emulator UI port: `4000`
- `singleProjectMode: true`

Risk assessment:

- This config is local emulator configuration only.
- It does not deploy by itself.
- It does not alter hosting, Functions, Firestore rules, Firestore indexes, or project selection.
- Emulator commands must still use `--project demo-asg-crm-emulator`.

## Rules Harness

Script:

```powershell
npm run test:emulator:rules
```

Implementation:

- Uses `@firebase/rules-unit-testing@3.0.4`, which is compatible with the repo's Firebase 10.x dependency.
- Loads `firestore.rules` directly into the Firestore emulator.
- Refuses to run without `FIRESTORE_EMULATOR_HOST`.
- Refuses to run against `amplify-leads-2026`.
- Uses synthetic users and synthetic documents only.

Representative roles:

- unauthenticated
- rep
- manager
- admin

Coverage added:

| Surface | Unauthenticated | Rep | Manager | Admin |
| --- | --- | --- | --- | --- |
| `leads` | read/write denied | read/write allowed | read/write allowed | read/write allowed |
| `salestrailCalls` | read/write denied | read/write denied | read denied | read/write denied |
| `settings` | write denied | read/write allowed | not separately asserted | not separately asserted |
| `appSettings/config` | read denied | read allowed, write denied | not separately asserted | not separately asserted |
| `settingsHistory` | not separately asserted | create denied | not separately asserted | read allowed |
| `auditLogs` | not separately asserted | read denied | read denied | read allowed, write/delete denied |

The harness intentionally documents current broad operational access for authenticated app users. It does not propose or apply a rules change.

## Callable Emulator Test Plan

Callable emulator tests are still missing. Add them only after Java is available and Firestore emulator tests run locally.

Required callable coverage:

| Callable surface | Required coverage | Live safety rule |
| --- | --- | --- |
| PIN verification | valid PIN, wrong PIN, inactive rep, region claims, plaintext fallback | Emulator or mocked only |
| PIN setup/change | auth required, role/ownership checks, hash written server-side | Emulator or mocked only |
| Backup password | valid and invalid password paths | Emulator or mocked only |
| Settings admin | update and rollback callables, audit writes, direct client writes denied | Emulator only |
| Salestrail dry-run | secrets checked by name only, dry-run returns planned counts, no writes | No live API calls |
| Phone normalisation dry-run | affected count and samples returned, no writes | Never `dryRun:false` |

Do not run live Salestrail sync, phone backfill writes, or migration scripts while building callable emulator tests.

## Validation Results

| Command | Result | Notes |
| --- | --- | --- |
| `npm run test:emulator:preflight` | Pass | Reports Firebase CLI available, Java missing, explicit emulator config present. |
| `npm run test:emulator:rules` | Blocked | Firestore emulator startup fails because Java is not on PATH. |
| `npm run test:emulator:firestore-smoke` | Blocked | Same Java blocker. |

## Sources

- Firebase Local Emulator Suite install docs: `https://firebase.google.com/docs/emulator-suite/install_and_configure`
- Google Cloud Firestore emulator docs: `https://docs.cloud.google.com/firestore/native/docs/emulator`
