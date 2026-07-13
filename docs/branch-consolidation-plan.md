# Branch Consolidation Plan

Date: 2026-07-13

## Current Status

The original expected branch sequence has changed. Current GitHub evidence shows:

- PR #17, `goal/sprint-validation` into `codex-foundation`, is merged at `96630a2`.
- PR #18, `goal/sprint-2-validation-review` into `codex-foundation`, is merged at `04d21e8`.
- `origin/codex-foundation` is `04d21e8`.
- Local `codex-foundation` is stale at `b88c417`.
- Current branch `fix/functions-emulator-startup-investigation` is `c287dbc`.
- Current branch is ahead of `origin/codex-foundation` by 26 commits and behind it by 2 merge commits.

## Required Recommended Order

This is the exact sequence originally required for safe consolidation. Current evidence shows steps 1 through 6 are already complete on GitHub, but they are preserved here as the canonical order:

1. Review and merge PR #17.
2. Verify Sprint 1 merge commit.
3. Retarget PR #18 only after PR #17 lands.
4. Verify PR #18 contains only Sprint 2 work.
5. Review and merge PR #18.
6. Verify Sprint 2 merge commit.
7. Create new corrected release tags using new names rather than moving old tags.
8. Recalculate current branch diff against updated codex-foundation.
9. Create one consolidation PR for post-Sprint-2 work.
10. Start future goals from updated codex-foundation.

## Current-Step Plan

Because PR #17 and PR #18 are already merged, the next safe branch action is to prepare a post-Sprint-2 consolidation PR. Do not run these commands until the human owner approves branch work.

### 1. Refresh The Local Base

```powershell
git fetch origin --prune --tags
git switch codex-foundation
git pull --ff-only origin codex-foundation
git log -1 --oneline
```

Expected base after refresh:

```text
04d21e8 Merge pull request #18 from gar2lew/goal/sprint-2-validation-review
```

### 2. Create A Consolidation Branch

```powershell
git switch -c goal/post-sprint-2-consolidation origin/codex-foundation
```

### 3. Apply Post-Sprint-2 Work

Use the current branch range after Sprint 2:

```powershell
git rev-list --reverse origin/goal/sprint-2-validation-review..origin/fix/functions-emulator-startup-investigation
```

Then cherry-pick carefully:

```powershell
git cherry-pick <oldest-post-sprint-2-commit>
```

Repeat commit by commit, or use a reviewed script only after the commit list is inspected. Stop on conflicts and do not force through app, package, or generated-file conflicts.

### 4. Recalculate Diff Against Updated Base

```powershell
git diff --stat origin/codex-foundation...HEAD
git diff --name-status origin/codex-foundation...HEAD
git log --oneline origin/codex-foundation..HEAD
```

The intended consolidation surface is post-Sprint-2 work only, including:

- repository intelligence and operating docs
- dependency remediation planning and selected remediation commits
- v1.0 release candidate docs
- UAT execution and live tracking docs
- UAT lead import/date/limit fix
- Functions emulator startup investigation and fix
- AI handoff pack
- live UAT note state
- this repository cleanup audit

### 5. Run Full Validation Before PR

Because the current branch contains app, package, script, and test changes, run the full gate:

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

### 6. Create One Consolidation PR

Do not execute until validation is complete and the human owner approves pushing:

```powershell
git push -u origin goal/post-sprint-2-consolidation
gh pr create --base codex-foundation --head goal/post-sprint-2-consolidation --title "Post-Sprint-2 consolidation" --body-file docs/repository-cleanup-audit.md
```

## Branch Hygiene Candidates

After consolidation lands, these local branches can be reviewed for deletion because they are merged into `origin/codex-foundation`:

```powershell
git branch --merged origin/codex-foundation
```

Do not delete automatically. Confirm each branch with the owner first, especially branches with no upstream or branches tied to another worktree.

Branches requiring caution:

- `release-smsf-ui` is checked out in `C:\dev\ASG_LEADS_WEBAPP\asg_crm_react_smsf_release`.
- `stable-post-hardening` is both ahead and behind its upstream.
- `codex-foundation` local branch is stale and should be fast-forwarded, not deleted as a first action.
- Stashes exist and should not be dropped during branch hygiene.

## Risks

- Cherry-picking 26 commits can create conflicts because `origin/codex-foundation` contains merge commits that the current branch does not.
- The current branch includes app code and package changes, so docs-only validation is not enough for a consolidation PR.
- Using the stale local `codex-foundation` branch would recreate the old topology problem.
- Moving old release tags would rewrite shared release evidence. Use new corrected tag names instead.

## Recommended Next Goal

Reach Goal: Post-Sprint-2 Consolidation PR Preparation
