# Release Tag Correction Plan

Date: 2026-07-13

## Current Release Tag Audit

| Tag | Local target | Remote target | Type | Target commit subject | Assessment |
| --- | --- | --- | --- | --- | --- |
| `release/sprint-1-stable` | `b88c417` | `b88c417` | lightweight commit tag | `Merge pull request #12 from gar2lew/docs/final-planning-and-audit-notes` | Pre-Sprint-1. Misleading if treated as Sprint 1 merged release evidence. |
| `release/sprint-1-stable-v2` | tag object `65ce0de`, commit `9e53dc3` | tag object `65ce0de`, commit `9e53dc3` | annotated tag | `docs: add sprint 2 validation review` | Points to Sprint 2 branch tip, not Sprint 1 merge commit. Misleading. |
| `release/sprint-2-staff-workflow` | tag object `59f0e9d`, commit `9e53dc3` | tag object `59f0e9d`, commit `9e53dc3` | annotated tag | `docs: add sprint 2 validation review` | Points to Sprint 2 branch tip, not PR #18 merge commit. Misleading as merge evidence. |

Remote tag listing returned release tags only. No remote savepoint tags were returned by the filtered remote tag audit. Local savepoint tags are numerous and should remain local unless the owner explicitly wants them published.

## Correct Merge Commits

| Release checkpoint | Correct commit | Evidence |
| --- | --- | --- |
| Sprint 1 merged into `codex-foundation` | `96630a2` | PR #17 merge commit |
| Sprint 2 merged into `codex-foundation` | `04d21e8` | PR #18 merge commit |

## Policy

- Do not delete, move, or force-update existing release tags in this cleanup.
- Preserve existing tags as historical evidence, even if misleading.
- Create new corrected tag names after owner approval.
- Push corrected tags only after the target commits are independently confirmed.

## Recommended Corrected Tag Names

Use new names that make the correction explicit:

```text
release/sprint-1-stable-after-pr17
release/sprint-2-staff-workflow-after-pr18
```

Alternative timestamped names if the owner prefers immutable chronology:

```text
release/2026-07-13-sprint-1-stable-after-pr17
release/2026-07-13-sprint-2-staff-workflow-after-pr18
```

## Exact Commands To Run Later

Do not run these commands until the human owner approves tag correction.

### Verify Targets

```powershell
git fetch origin --prune --tags
git log -1 --oneline 96630a2
git log -1 --oneline 04d21e8
git merge-base --is-ancestor origin/goal/sprint-validation 96630a2
git merge-base --is-ancestor origin/goal/sprint-2-validation-review 04d21e8
```

### Create Corrected Tags Locally

```powershell
git tag -a release/sprint-1-stable-after-pr17 96630a2 -m "Sprint 1 stable after PR #17 merge"
git tag -a release/sprint-2-staff-workflow-after-pr18 04d21e8 -m "Sprint 2 staff workflow after PR #18 merge"
```

### Verify Corrected Tags

```powershell
git show --no-patch --decorate release/sprint-1-stable-after-pr17
git show --no-patch --decorate release/sprint-2-staff-workflow-after-pr18
git for-each-ref refs/tags/release --format="%(refname:short)|%(objecttype)|%(objectname:short)|%(subject)"
```

### Push Corrected Tags After Approval

```powershell
git push origin refs/tags/release/sprint-1-stable-after-pr17
git push origin refs/tags/release/sprint-2-staff-workflow-after-pr18
```

## Do Not Run

These commands are intentionally not recommended:

```powershell
git tag -f release/sprint-1-stable-v2 96630a2
git tag -f release/sprint-2-staff-workflow 04d21e8
git push --force origin refs/tags/release/sprint-1-stable-v2
git push --force origin refs/tags/release/sprint-2-staff-workflow
git push origin :refs/tags/release/sprint-1-stable-v2
git push origin :refs/tags/release/sprint-2-staff-workflow
```

## Risk Assessment

- Existing release tags may be referenced in notes, chat history, or local checklists. Moving them would make older evidence ambiguous.
- Creating new corrected tags is low risk because it adds evidence without rewriting history.
- Corrected tags should be created only after the local `codex-foundation` branch is refreshed or the commands explicitly target `origin/codex-foundation` and known merge commit hashes.
- Release readiness still depends on UAT signoff, backup/recovery rehearsal, dependency risk acceptance, and explicit Firebase approval.
