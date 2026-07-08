# ASG CRM AI Agent Handoff

Last updated: 2026-07-08

## 1. Current Repository State

| Item | Current value |
| --- | --- |
| Current branch | `fix/functions-emulator-startup-investigation` |
| Latest commit | `14ab8c5 docs: investigate functions emulator startup` (pending new commit) |
| Working tree status | Modified tracked files + two pre-existing untracked files: `UAT.md`, `handoff.json`. Do not absorb unless the human owner asks. |
| Latest savepoint | `savepoint-before-functions-emulator-startup-investigation` |
| Open PRs | `gh pr list` could not be verified locally because GitHub CLI is not authenticated. Latest project docs still list draft PR `#17` for Sprint 1 and draft PR `#18` for Sprint 2 as open at the last maintenance check. Verify before relying on this. |
| Current version | `1.0.0` |
| Current milestone | v1.0 UAT execution readiness and release candidate review |

## 2. Current Blocker (Resolved)

The Functions emulator startup timeout was independently verified by a successor agent (Z Code) on 2026-07-08.

**Verdict: The timeout is a toolchain/environment issue, not a user-code problem.**

Evidence:
- Functions user code loads in ~216ms (all 26 exports).
- No module cycles, top-level await, network calls during import, or blocking singleton creation found.
- `npm run test:emulator:callables-dry-run` passes with compatible Java 21+ and Firebase CLI 15.
- The previous investigation report (`docs/functions-emulator-startup-investigation.md`) has been updated with the full validation results.

The timeout can occur on machines with:
- Missing Java 21+ runtime
- Missing or cold Firebase CLI resolution
- Shell profile errors (e.g., `fnm` errors in elevated PowerShell)
- Node version mismatch (Functions requests Node 22; host Node 24 works but shows a warning)

## 3. What Is Safe To Do Next

Safe next actions:

- Proceed to the next recommended goal: **Reach Goal: Conduct Live Staff UAT** — run the role-specific UAT scripts with real staff testers, capture outcomes in `docs/UAT/UAT_RESULTS.md`, triage issues in `docs/UAT/UAT_TRIAGE.md`, and update `docs/UAT/UAT_SUMMARY.md`.
- Clean up orphaned compiled files in `functions/lib/` (`aggregateStats.js`, `leadSnapshots.js`, `migrateAuthFields.js`) — these are remnants of refactored code and are never loaded at startup. Recommend deleting their `.ts` sources and rebuilding.
- Proceed with v1.0 release candidate review.

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
- Change Functions behaviour.

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

**Reach Goal: Conduct Live Staff UAT**

Objective:
- Run the role-specific UAT scripts with real staff testers.
- Capture outcomes in `docs/UAT/UAT_RESULTS.md`.
- Triage issues in `docs/UAT/UAT_TRIAGE.md`.
- Update `docs/UAT/UAT_SUMMARY.md` with release readiness assessment.

Non-goals:
- No deploy.
- No production Firebase writes.
- No migrations.
- No live Salestrail sync.

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

All validations passed on 2026-07-08 on Windows 10 x64 with Node v24.18.0, Java 21.0.11, Firebase CLI 15.22.4:

| Command | Result |
| --- | ---:|
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm test` | Passed |
| `npm run build` | Passed |
| `npm run test:emulator:preflight` | Passed |
| `npm run test:emulator:rules` | Passed |
| `npm run test:emulator:firestore-smoke` | Passed |
| `npm run test:emulator:callables-dry-run` | Passed (~32s total, 26 functions loaded) |
| `cd functions && npm run build` | Passed |
| `cd functions && npm run test:settings-admin` | Passed |
| `git diff --check` | Passed |

Notes:

- Emulator checks used `demo-asg-crm-emulator`.
- Firebase Tools 15 required Java 21 or newer.
- A host Node 24 warning appeared while Functions requested Node 22.
- The `firebase-functions` outdated SDK advisory remains a known warning.
- Vite still reports large Firebase and PDF chunks during build.

## 10. Current Known Failing Validation

No known failing validation at this point. The Functions emulator startup timeout was found to be environment/toolchain-dependent and does not reproduce with compatible Java 21+, Firebase CLI, and Node 22+.

If emulator validation fails in your environment:

1. Run `npm run test:emulator:preflight` first to identify missing requirements.
2. Confirm Java 21+ is on `PATH` and `JAVA_HOME` is set.
3. Confirm Firebase CLI 15+ is installed locally.
4. Run `git status --short` — untracked file `UAT.md` is human-owned.
5. If still failing, refer to `docs/functions-emulator-startup-investigation.md` for detailed findings.
