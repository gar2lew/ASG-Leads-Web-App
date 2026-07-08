# ASG CRM AI Agent Handoff

Last updated: 2026-07-08

## 1. Current Repository State

| Item | Current value |
| --- | --- |
| Current branch | `fix/functions-emulator-startup-investigation` |
| Latest commit | `14ab8c5 docs: investigate functions emulator startup` |
| Working tree status | One pre-existing untracked file: `UAT.md`. Do not absorb it unless the human owner asks. |
| Latest savepoint | `savepoint-before-functions-emulator-startup-investigation` |
| Open PRs | `gh pr list` could not be verified locally because GitHub CLI is not authenticated. Latest project docs still list draft PR `#17` for Sprint 1 and draft PR `#18` for Sprint 2 as open at the last maintenance check. Verify before relying on this. |
| Current version | `1.0.0` |
| Current milestone | v1.0 UAT execution readiness and release candidate review |

## 2. Current Blocker

Reported blocker:

- Functions emulator startup timeout.
- Callable dry-run failure caused by `functions/not-found`.
- Expected result: `npm run test:emulator:callables-dry-run` starts Auth, Firestore, and Functions emulators, registers all callable functions, and completes the dry-run harness.
- Actual reported result: Functions emulator starts, fails to determine backend specification, and callable invocations can fail with `functions/not-found` because the callable endpoints never register.

Current local investigation evidence:

- `docs/functions-emulator-startup-investigation.md` records that compiled Functions user code loaded in about `234 ms` and exposed `26` exports.
- The emulator/toolchain startup path measured close to the Firebase CLI `10000 ms` backend-spec timeout.
- A later Codex validation passed when using temporary Java 21 and Firebase CLI tooling.
- A successor agent should still reproduce the reported blocker in its own environment before changing code.

## 3. What Is Safe To Do Next

Safe next actions:

- Investigate Functions emulator startup only.
- Document the Functions startup dependency graph.
- Identify slow or blocking top-level imports.
- Identify top-level Admin SDK initialisation risk.
- Identify startup environment issues such as Java version, Firebase CLI availability, Node version mismatch, and shell profile errors.
- Apply only the minimal safe startup fix if the root cause is clearly identified.
- Prefer documentation and measurement before code changes.

## 4. What Is Not Safe

Do not:

- Deploy.
- Push.
- Merge.
- Alter production Firebase.
- Alter Firestore rules.
- Alter emulator configuration.
- Run migrations.
- Run Salestrail live sync.
- Run phone backfill writes.
- Change secrets.
- Run broad dependency upgrades.
- Change application behaviour.
- Change Functions behaviour unless a minimal startup-only fix is clearly proven.

## 5. Required Validation

Run the strongest practical validation before handoff or completion:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run test:emulator:preflight
npm run test:emulator:rules
npm run test:emulator:firestore-smoke
npm run test:emulator:callables-dry-run
cd functions
npm run build
npm run test:settings-admin
cd ..
git diff --check
```

If PowerShell blocks `npm.ps1`, use `npm.cmd`.

If emulator validation cannot start:

- Confirm Java 21 or newer is available.
- Confirm Firebase CLI is available.
- Confirm the emulator project is `demo-asg-crm-emulator`.
- Do not point emulator checks at production.

## 6. Exact Next Recommended Goal

Reach Goal: Functions Emulator Startup Investigation

Objective:

- Investigate why Firebase Functions emulator backend discovery times out.
- Determine why callables can fail with `functions/not-found`.
- Document startup graph, startup timing, blocking modules, recommended fixes, and risk.
- Apply only a minimal safe fix if the root cause is clear.
- Validate with `npm run test:emulator:callables-dry-run`.

## 7. DeepSeek/Z Code Rules

For DeepSeek, Z Code, or any other coding agent:

1. Read `AGENTS.md` first.
2. Read `HANDOFF.md` second.
3. Read `PROJECT_STATE.md` third.
4. Do not continue if the working tree is dirty, except for explicitly acknowledged human-owned files such as the current untracked `UAT.md`.
5. Create a new branch before changes.
6. Create a savepoint before changes.
7. Make small commits.
8. Stop if a fix requires production config, secrets, deploys, migrations, or rules changes.
9. Report uncertainty instead of guessing.
10. Use demo emulator project IDs only.
11. Never print secrets.
12. Never run live Salestrail sync.
13. Never run phone backfill writes.
14. Never deploy without explicit human approval.

## 8. Rollback Instructions

For the current investigation branch:

```powershell
git reset --hard savepoint-before-functions-emulator-startup-investigation
```

For the UAT lead import/date fix branch:

```powershell
git reset --hard savepoint-before-uat-lead-import-date-limit
```

Do not run destructive rollback commands unless the human owner explicitly approves.

## 9. Current Known Good Validations

Known good validations recently recorded on the current code line:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:emulator:preflight`
- `npm run test:emulator:rules`
- `npm run test:emulator:firestore-smoke`
- `npm run test:emulator:callables-dry-run`
- `cd functions && npm run build`
- `cd functions && npm run test:settings-admin`
- `git diff --check`

Notes:

- Emulator checks used `demo-asg-crm-emulator`.
- Firebase Tools 15 required Java 21 or newer.
- A host Node 24 warning appeared while Functions requested Node 22.
- The `firebase-functions` outdated SDK advisory remains a known warning.
- Vite still reports large Firebase and PDF chunks during build.

## 10. Current Known Failing Validation

Reported failing validation to reproduce:

```powershell
npm run test:emulator:callables-dry-run
```

Reported failure mode:

- Functions emulator backend specification times out after `10000`.
- Callable harness may fail with `functions/not-found` because callables were not registered.

Current local evidence:

- The same validation passed after using compatible Java 21 and Firebase CLI tooling.
- Treat the failure as environment-sensitive until reproduced.
- Do not make code changes based only on the stale failure report.
