# Post-Sprint-2 Consolidation PR Review

Date: 2026-07-13

## Review Scope

This review covers the existing branch diff only:

```text
origin/codex-foundation...HEAD
```

No consolidation was recreated, no commits were cherry-picked, no branch was replaced, and no release tag was changed during this review.

## Branch State Reviewed

| Item | Value |
| --- | --- |
| Current branch | `goal/post-sprint-2-consolidation` |
| Base branch | `origin/codex-foundation` |
| Base commit | `04d21e8` |
| Consolidation commit before review | `09262db docs: finalise post sprint 2 consolidation` |
| Commits ahead of base before review | `28` |
| Diff size before review | `70 files changed, 9635 insertions, 114 deletions` |

## Review Classification

Overall classification: **Amber**

Rationale:

- The branch is suitable for a draft PR and human review.
- No Red issue was found that requires discarding or recreating the consolidation branch.
- The branch is not production-ready because staff UAT, backup and recovery, release tag correction, dependency risk acceptance, and explicit Firebase approval remain open.
- The diff includes app code and dependency lockfile changes, so it must be reviewed as an engineering PR, not a documentation-only PR.

## Green Findings

- Current branch matched the requested branch: `goal/post-sprint-2-consolidation`.
- The working tree was clean before PR review documentation started.
- The base matched the requested `origin/codex-foundation` commit `04d21e8`.
- The known consolidation commit `09262db docs: finalise post sprint 2 consolidation` was present at HEAD before review work.
- The consolidation report documents applied commits, excluded Sprint 1 and Sprint 2 commits, comparison results, validation, and rollback instructions.
- Quick Pull import changes preserve source dates where valid, use a clear fallback for missing or invalid dates, and report rows read, added, updated, skipped, failed, fallback dates, invalid dates, and possible 100-row source limits.
- Lead loading includes a legacy Brisbane fallback path without writing production data.
- Functions emulator startup investigation documents the dependency graph, timing evidence, blocking-module review, and toolchain root cause.
- Full validation had already passed on the consolidation branch after rebuilding ignored Functions output.

## Amber Findings

- Production release remains No-Go until staff UAT is executed and signed off.
- Backup and recovery rehearsal evidence is still missing.
- Existing release tags remain misleading until corrected with new approved tag names.
- Root and Functions dependency audit advisories remain active risks after targeted remediation.
- Firestore and callable auth risks remain active and require remediation or formal risk acceptance before production Functions or rules deployment.
- Emulator validation depends on Java 21 or newer, Firebase CLI availability, and current ignored `functions/lib` output.
- The branch includes app code and dependency lockfile changes, so reviewers should inspect behaviour and package changes, not only the new documentation.

## Red Findings

None found in this review.

## Validation Status Before Push

Required validation was rerun before push as part of the PR preparation task:

| Command | Result |
| --- | --- |
| `npm.cmd run typecheck` | Passed |
| `npm.cmd run lint` | Passed |
| `npm.cmd test` | Passed |
| `npm.cmd run build` | Passed with known large chunk warnings |
| Generated release metadata check | Build regenerated metadata and it was restored before commit |
| `npm.cmd run test:emulator:preflight` | Passed with Firebase CLI 15.23.0 and Java available |
| `npm.cmd run test:emulator:rules` | Passed |
| `npm.cmd run test:emulator:firestore-smoke` | Passed |
| `npm.cmd run test:emulator:callables-dry-run` | Passed, callable functions registered successfully |
| `cd functions && npm.cmd run build` | Passed |
| `cd functions && npm.cmd run test:settings-admin` | Passed |
| `git diff --check` | Passed |
| `git status` | Intended review documentation and state files only before commit |

Notes:

- Emulator checks used the demo project `demo-asg-crm-emulator`.
- Firebase CLI was resolved from the local cached Firebase Tools 15.23.0 shim for emulator commands.
- The callable dry-run still reports the known `firebase-functions` SDK advisory and metadata lookup warning, but the harness completed successfully.

## PR Recommendation

Create a draft PR only.

| Field | Value |
| --- | --- |
| Title | `v1.0 hardening, UAT preparation and lead import fixes` |
| Base | `codex-foundation` |
| Head | `goal/post-sprint-2-consolidation` |
| Draft | Yes |

The PR should not be merged, marked ready, deployed, or treated as production approval.

## Remaining Amber Risks

1. Staff UAT and signoff remain incomplete.
2. Backup and recovery rehearsal remains incomplete.
3. Corrected release tag evidence remains incomplete.
4. Dependency audit risk requires acceptance or follow-up remediation.
5. Firebase production deployment remains blocked without explicit approval.
6. Firestore rules and callable auth risks remain active before production deployment.
7. Emulator validation remains sensitive to local Java, Firebase CLI, Node, and ignored Functions build output state.
