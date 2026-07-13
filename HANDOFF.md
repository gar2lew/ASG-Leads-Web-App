# ASG CRM AI Agent Handoff

Last updated: 2026-07-13

## 1. Current Repository State

| Item | Current value |
| --- | --- |
| Current branch | `goal/post-sprint-2-consolidation` |
| Source branch | `fix/functions-emulator-startup-investigation` at `b6fdb5a` |
| Refreshed base | `origin/codex-foundation` at `04d21e8` |
| Working tree status | Clean after post-Sprint-2 cherry-pick application before final docs updates |
| Latest savepoint | `savepoint-before-post-sprint-2-commit-application` |
| Source savepoint | `savepoint-before-post-sprint-2-consolidation` |
| Open PRs | PR #17 and PR #18 were verified through GitHub CLI as merged into `codex-foundation` on 2026-07-13 |
| Remote base | `origin/codex-foundation` is `04d21e8`, PR #18 merge commit |
| Local base caution | Local `codex-foundation` was fast-forwarded to `04d21e8` before creating the consolidation branch |
| Current version | `1.0.0` |
| Current milestone | Post-Sprint-2 consolidation and v1.0 UAT execution readiness |

## 1B. Post-Sprint-2 Consolidation

Current consolidation document:

- `docs/post-sprint-2-consolidation-report.md`

Key facts:

- 27 post-Sprint-2 commits were applied in order.
- No cherry-pick conflicts occurred.
- Sprint 1 and Sprint 2 commits were excluded because they are already present through PR #17 and PR #18.
- The consolidation tree matched `origin/fix/functions-emulator-startup-investigation` before final consolidation documentation updates.
- `UAT.md`, `handoff.json`, UAT files, dependency remediation, Quick Pull fix, emulator investigation, AI handoff files, and repository cleanup audit files are preserved.
- Validation initially stopped at `npm.cmd run test:emulator:callables-dry-run` because stale ignored `functions/lib` output caused the Functions emulator backend specification timeout and callable requests returned `functions/not-found`. After `cd functions && npm.cmd run build`, callable dry-run passed.

## 1A. Repository Cleanup Audit

Current audit documents:

- `docs/repository-cleanup-audit.md`
- `docs/branch-consolidation-plan.md`
- `docs/release-tag-correction-plan.md`

Key facts:

- PR #17 merged at `96630a2`.
- PR #18 merged at `04d21e8`.
- Current branch is ahead of `origin/codex-foundation` by 26 commits and behind by 2 merge commits.
- `UAT.md` is tracked and committed as useful live-UAT source evidence.
- Existing release tags are historical but misleading for Sprint merge evidence; use new corrected tag names after approval.

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

- Proceed to the next recommended goal: **Reach Goal: Post-Sprint-2 Consolidation PR Preparation**. Refresh local `codex-foundation`, prepare one consolidation branch from the updated base, validate fully, and prepare one PR.
- After consolidation is planned, conduct live staff UAT with real staff testers, capture outcomes in `docs/UAT/UAT_RESULTS.md`, triage issues in `docs/UAT/UAT_TRIAGE.md`, and update `docs/UAT/UAT_SUMMARY.md`.
- Clean up orphaned compiled files in `functions/lib/` (`aggregateStats.js`, `leadSnapshots.js`, `migrateAuthFields.js`) in a separate approved hygiene goal. These are remnants of refactored code and are never loaded at startup. Recommend deleting their `.ts` sources and rebuilding.
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
4. Do not continue if the working tree is dirty, except for explicitly acknowledged human-owned files.
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
4. Run `git status --short` and classify any changed or untracked files before work.
5. If still failing, refer to `docs/functions-emulator-startup-investigation.md` for detailed findings.

## 11. Exact Next Recommended Goal

Reach Goal: Review Post-Sprint-2 Consolidation PR

Objective:

- Review the prepared `goal/post-sprint-2-consolidation` branch.
- Confirm validation results.
- Approve or revise the prepared PR body.
- Push and create the PR only after explicit human approval.

Non-goals:

- No deploy.
- No push until explicitly approved.
- No release tag movement.
- No branch deletion.
- No production Firebase changes.
