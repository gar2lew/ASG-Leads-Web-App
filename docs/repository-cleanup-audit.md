# Repository Cleanup Audit

Date: 2026-07-13

## Scope

This audit verifies the repository branch, PR, tag, and local cleanup state before further development. It is documentation-only. No merges, retargets, pushes, rebases, resets, branch deletions, release tag changes, app code changes, Firebase changes, deployments, migrations, Salestrail live sync, or phone backfill writes were performed.

## Stage 0 Preflight

| Check | Result |
| --- | --- |
| Current directory | `C:\dev\ASG_LEADS_WEBAPP\asg_crm_react` |
| Repo root | `C:\dev\ASG_LEADS_WEBAPP\asg_crm_react` |
| Current branch | `fix/functions-emulator-startup-investigation` |
| Upstream | `origin/fix/functions-emulator-startup-investigation` |
| Branch sync | `0 0` against upstream at preflight |
| Latest commit | `c287dbc docs: add live UAT notes` |
| Latest savepoint | `savepoint-before-functions-emulator-startup-investigation` |
| Remote | `https://github.com/gar2lew/ASG-Leads-Web-App.git` |
| GitHub CLI account | Authenticated as `gar2lew` |
| Working tree | Clean at preflight |
| Merge state | No `MERGE_HEAD` |
| Rebase state | No `rebase-merge` or `rebase-apply` |
| Conflicts | No unmerged paths |
| Build output | `dist/` and `functions/lib/` are ignored |
| Generated release metadata drift | None observed before docs edits |

## Current Branch Facts

- `fix/functions-emulator-startup-investigation` is pushed and tracking `origin/fix/functions-emulator-startup-investigation`.
- `HEAD` is `c287dbc`.
- The branch contains the post-Sprint-2 chain from `dbff8d2` through `c287dbc`.
- `origin/codex-foundation` is now `04d21e8`, the PR #18 merge commit.
- The local branch named `codex-foundation` is still `b88c417` and is behind `origin/codex-foundation` by 31 commits. Do not use the local branch as a base until it is fast-forwarded.

## PR Topology

| PR | Head | Base | State | Merge commit | Merged at |
| --- | --- | --- | --- | --- | --- |
| #17 | `goal/sprint-validation` | `codex-foundation` | Merged | `96630a2` | 2026-07-13 05:21:09 UTC |
| #18 | `goal/sprint-2-validation-review` | `codex-foundation` | Merged | `04d21e8` | 2026-07-13 05:22:43 UTC |

Earlier handoff text described PR #17 and PR #18 as open or stacked. Current GitHub and fetched remote evidence shows both are merged into `codex-foundation`.

## Branch Ancestry

| Comparison | Result |
| --- | --- |
| `origin/goal/sprint-validation` ancestor of `origin/codex-foundation` | Yes |
| `origin/goal/sprint-2-validation-review` ancestor of `origin/codex-foundation` | Yes |
| `origin/codex-foundation` ancestor of current branch | No |
| `origin/goal/sprint-2-validation-review` ancestor of current branch | Yes |
| `origin/codex-foundation...HEAD` | `2 26` |
| Commits on current branch not on `origin/codex-foundation` | 26 |
| Commits on `origin/codex-foundation` not on current branch | 2 |
| Merge base of current branch and `origin/codex-foundation` | `9e53dc3 docs: add sprint 2 validation review` |

The two commits missing from the current branch are the merge commits:

```text
04d21e8 Merge pull request #18 from gar2lew/goal/sprint-2-validation-review
96630a2 Merge pull request #17 from gar2lew/goal/sprint-validation
```

The 26 commits on the current branch after Sprint 2 are:

```text
c287dbc docs: add live UAT notes
c76b183 docs: add structured handoff state
9685bb9 fix: resolve functions emulator startup timeout
c748967 docs: add AI agent handoff pack
14ab8c5 docs: investigate functions emulator startup
788f5a4 fix: resolve UAT lead import date and limit issue
2e1fa1e docs: prepare live staff UAT tracking
ba75791 docs: add chief engineer status review
64cc34d docs: create v1.0 UAT execution pack
a1e4807 docs: plan functions runtime dependency remediation
9ed8606 docs: plan firebase web sdk major upgrade
ba72061 docs: review firebase undici compatibility risk
f3e9e6f fix: remediate firebase web sdk dependency risk
d0f15ec docs: review dompurify transitive pdf risk
b157a73 fix: remediate pdf dependency risk
cce63e8 docs: add dependency security review
0b21fc6 docs: weekly maintenance report
2d835e5 docs: prepare v1.0 release candidate
c352d61 docs: add staff uat plan
df16ef0 docs: add internal production readiness report
c458800 docs: add AI foundation data audit
6314aba refactor: modernise shared component primitives
bc77688 docs: add Firestore architecture review
18f8deb docs: add repository intelligence reports
f5c9cf4 docs: add operational documentation layer
dbff8d2 docs: add master architect guide
```

## Diff Surface

`git diff --stat origin/codex-foundation...HEAD` reports:

- 66 files changed.
- 8800 insertions.
- 114 deletions.
- Includes documentation, package scripts, Quick Pull import code, lead loading code, tests, and release state files.

This means the current branch is not a docs-only consolidation branch. It contains post-Sprint-2 app and test changes and needs a normal review PR after the base is corrected.

## UAT.md Classification

`UAT.md` is tracked and committed at `c287dbc docs: add live UAT notes`. It records `UAT-ISS-001` and is also reflected in:

- `PROJECT_STATE.md`
- `docs/RISK_REGISTER.md`
- `docs/UAT/UAT_RESULTS.md`
- `docs/UAT/UAT_TRIAGE.md`
- `docs/UAT/UAT_SUMMARY.md`
- `docs/UAT/UAT_CHANGELOG.md`

Classification: useful tracked live-UAT source note. Do not delete in this cleanup. It is not an untracked scratch file anymore.

## Stashes And Worktrees

Observed local stashes:

```text
stash@{0}: On docs/final-planning-and-audit-notes: remaining tracked leftovers after stash interruption
stash@{1}: On docs/final-planning-and-audit-notes: leftover dirty files after PR stack merge
stash@{2}: On codex-foundation: phone-normalization: full working tree snapshot 2026-06-16 (includes login refactor, saved views, lead reset, experimental scripts)
stash@{3}: autostash
```

Observed worktrees:

```text
C:/dev/ASG_LEADS_WEBAPP/asg_crm_react              c287dbc [fix/functions-emulator-startup-investigation]
C:/dev/ASG_LEADS_WEBAPP/asg_crm_react_smsf_release bffda7b [release-smsf-ui]
```

Do not drop stashes or delete the `release-smsf-ui` branch without explicit human approval.

## Stale Or Redundant Local Branches

Many local branches are already merged into `origin/codex-foundation`. These are candidates for later local branch hygiene only after the human owner confirms no local-only work is needed.

Examples from `git branch --merged origin/codex-foundation` include:

- `goal/sprint-validation`
- `goal/sprint-2-phase-0-planning`
- `goal/sprint-2-phase-1-workflow-audit`
- `goal/sprint-2-phase-2-navigation-flow`
- `goal/sprint-2-phase-3-lead-workbench`
- `goal/sprint-2-phase-4-settings-admin`
- `goal/sprint-2-phase-5-reporting-rhythm`
- `goal/ui-redesign`
- `goal/performance-optimisation`
- `fix/validation-baseline`
- `test/callable-emulator-dry-run-harness`
- `test/emulator-harness-execution`

Branches not merged into `origin/codex-foundation` include the current branch and post-Sprint-2 planning, UAT, dependency, and release-candidate branches. They should not be deleted.

## Safe Cleanup Result

No destructive cleanup was performed. Safe classifications only:

- Build output directories are ignored.
- No generated release metadata drift was present before docs edits.
- `UAT.md` is tracked and should be retained.
- Local `codex-foundation` is stale and should be fast-forwarded before future work.
- Release tags need correction by new tag names, not by moving existing tags.

## Validation Commands Run During Audit

```powershell
git status --short --branch
git rev-parse --show-toplevel
git branch --show-current
git rev-parse --abbrev-ref --symbolic-full-name '@{u}'
git rev-list --left-right --count '@{u}...HEAD'
git fetch origin --prune --tags
gh auth status
gh pr view 17 --json number,title,state,isDraft,baseRefName,headRefName,mergedAt,mergeCommit,url
gh pr view 18 --json number,title,state,isDraft,baseRefName,headRefName,mergedAt,mergeCommit,url
git log --graph --decorate --oneline --date-order --all -n 80
git merge-base origin/codex-foundation HEAD
git rev-list --left-right --count origin/codex-foundation...HEAD
git diff --stat origin/codex-foundation...HEAD
git for-each-ref refs/tags/release refs/tags/savepoint-before-* --format='%(refname:short)|%(objectname:short)|%(subject)|%(creatordate:iso8601)'
git ls-remote --tags origin
git stash list
git worktree list
```
