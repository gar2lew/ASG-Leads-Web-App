# Emulator Harness Execution Report

Date: 2026-07-04
Branch: `test/emulator-harness-execution`
Savepoint tag: `savepoint-before-emulator-harness-execution`

## Objective

Run and debug the Firebase emulator harnesses after Java was expected to be installed.

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

Java is not visible to this terminal or the persisted Windows environment:

```text
java: The term 'java' is not recognized as a name of a cmdlet, function, script file, or executable program.
```

Additional checks found:

- `where.exe java` found no executable.
- Current `JAVA_HOME` is empty.
- Current `Path` does not contain a Java, JDK, Temurin, Adoptium, or Zulu path.
- Persisted user `JAVA_HOME` is empty.
- Persisted machine `JAVA_HOME` is empty.
- Persisted user and machine `Path` values do not contain a Java, JDK, Temurin, Adoptium, or Zulu path.

## Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npm run typecheck` | Pass | Client and Functions TypeScript validation passed. |
| `npm run lint` | Pass | Blocking ESLint check passed. |
| `npm run build` | Pass | Build passed with existing large chunk warnings. Release metadata was generated as a build side effect. |
| `npm test` | Pass | Root guardrail suite passed. |
| `npm run test:emulator:preflight` | Pass with blocker reported | Firebase CLI available, Java runtime missing, explicit emulator config present, production default remains `amplify-leads-2026`. |
| `npm run test:emulator:rules` | Blocked | Firebase CLI could not spawn `java -version`. Harness did not start. |
| `npm run test:emulator:firestore-smoke` | Blocked | Firebase CLI could not spawn `java -version`. Harness did not start. |
| `npm run test:emulator:callables-dry-run` | Blocked | Firebase CLI could not spawn `java -version`. Harness did not start. |
| `cd functions && npm run build` | Pass | Functions TypeScript build passed. |
| `cd functions && npm run test:settings-admin` | Pass | Functions settings/admin unit test passed. |

## Failures Fixed

No harness or test failures were fixed in this goal because the emulator commands failed before the emulator suite or harness scripts started. The failure is an environment prerequisite issue, not a proven harness defect.

## Current Blocker

Firebase emulator execution remains blocked until Java is installed and visible on PATH to this terminal. The expected next environment state is:

```powershell
java -version
where.exe java
npm run test:emulator:preflight
```

These commands should show a Java runtime, a resolved Java executable, and a preflight result that no longer reports Java missing.

## Remaining Emulator Work

After Java is visible:

1. Re-run `npm run test:emulator:rules`.
2. Re-run `npm run test:emulator:firestore-smoke`.
3. Re-run `npm run test:emulator:callables-dry-run`.
4. Fix only harness/test issues if those commands reach harness code and fail.
5. Do not change Firestore rules unless a failing test proves a clear rules defect. If that happens, document the proposed rules change first and stop.

## Release Risk

This branch does not prove emulator harness execution yet. It proves that the non-emulator validation baseline is healthy and that the remaining blocker is Java availability in the Windows environment.

Production Firebase deploys, Functions deploys, Firestore rules deploys, Salestrail live sync, phone normalisation writes, and migration runs remain blocked.
