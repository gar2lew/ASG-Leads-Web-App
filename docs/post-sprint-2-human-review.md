# Post-Sprint-2 Human Review

Date: 2026-07-13
PR: https://github.com/gar2lew/ASG-Leads-Web-App/pull/19
Base: `codex-foundation`
Head: `goal/post-sprint-2-consolidation`

## Summary

PR #19 is ready to move from Draft to Ready for Review.

Review classification: **Green for Ready for Review**.

Merge and production classification: **Amber**.

No Red issues were found. The PR is coherent, validation passed, GitHub reports the branch as mergeable with clean state, and no unresolved PR comments or review threads exist. The PR must not be merged until the Amber release blockers are closed or formally accepted.

## Preflight

| Check | Result |
| --- | --- |
| PR #19 state | Open draft before this review |
| Base branch | `codex-foundation` |
| Head branch | `goal/post-sprint-2-consolidation` |
| Base commit | `04d21e8` |
| Head commit before human-review report | `d57dbf5` |
| Local branch matches remote head | Yes, `HEAD...origin/goal/post-sprint-2-consolidation` was `0 0` |
| Working tree before review edits | Clean |
| New base commits invalidating review | None found after `git fetch`; `origin/codex-foundation` remained `04d21e8` |
| PR comments | None |
| PR review threads | None |
| PR reviews | None |
| Conflicts | None, GitHub `mergeable` was `MERGEABLE` and `mergeStateStatus` was `CLEAN` |

## Changed File Summary

Before this human-review report commit, PR #19 contained:

| Metric | Count |
| --- | ---: |
| Commits | 29 |
| Files changed | 71 |
| Additions | 9812 |
| Deletions | 114 |

Main file groups:

- Operational and release documentation.
- UAT planning, tracking, and live issue intake.
- Project state, handoff, risk, changelog, and repository cleanup docs.
- Quick Pull lead import fix and targeted helper test.
- Small shared UI primitive refinement.
- Root package dependency remediation.

## Key Application Changes

- `src/hooks/useFirebase.ts` now supports legacy Brisbane lead records where `region` is missing, merges lead groups by ID, and sorts display leads by `updatedAt`, `createdAt`, then `leadDate`.
- `src/App.tsx` Quick Pull now builds its duplicate index from the full paged lead index instead of the 100-lead dashboard window.
- Quick Pull now preserves valid source lead dates, uses the current Perth date as a fallback for missing or invalid dates, and reports fallback and invalid-date counts.
- Quick Pull import summary now reports rows read, added, updated, skipped, failed, fallback date counts, and possible 100-row source-limit detection.
- `src/lib/quickPullImport.ts` centralises date parsing, status normalisation, column matching, and summary formatting.
- `src/lib/sheetsSyncIndex.ts` includes `region` in the sync index so Quick Pull can scope duplicate checks correctly.

## Dependency Changes

- `jspdf` updated from `4.2.0` to `4.2.1`.
- Optional transitive `dompurify` under `jspdf` updated from `3.3.3` to `3.4.11` in `package-lock.json`.
- Transitive `@grpc/grpc-js` under the Firebase Firestore SDK path updated from `1.9.15` to `1.9.16` in `package-lock.json`.
- Remaining dependency advisories are documented as Amber risks and are not hidden by the PR.

## UAT Changes

- `UAT.md` records `UAT-ISS-001` for initial lead loading, missing Quick Pull dates, and apparent 100-row limit behaviour.
- `docs/UAT/*` adds role-specific plans, issue templates, signoff forms, test data guidance, results tracking, triage, summary, and changelog.
- UAT tracking explicitly says live staff UAT has not been completed and signoff remains pending.
- `UAT-ISS-001` is marked remediated with validation passed, pending staff retest.

## Commit-Level Review

| Commit | Classification | Review note |
| --- | --- | --- |
| `3822eb7 docs: add master architect guide` | documentation | Coherent architecture guide. |
| `866d3a0 docs: add operational documentation layer` | documentation, operational state | Broad docs layer, explained by PR scope. |
| `e880ac0 docs: add repository intelligence reports` | documentation, operational state | Broad docs layer, explained by PR scope. |
| `b8ac188 docs: add Firestore architecture review` | documentation | No rules or indexes changed. |
| `405944d refactor: modernise shared component primitives` | application code, documentation | Mixed but coherent: Button and EmptyState accessibility polish plus component modernisation doc. |
| `aa9d425 docs: add AI foundation data audit` | documentation | Documentation only. |
| `91e2445 docs: add internal production readiness report` | documentation, operational state | Documents No-Go production posture. |
| `a0dc3fe docs: add staff uat plan` | documentation, UAT | Documentation only. |
| `34c940b docs: prepare v1.0 release candidate` | documentation, operational state | Broad release-doc commit, explained by PR scope. |
| `ad35272 docs: weekly maintenance report` | documentation, operational state | Documents validation and risk state. |
| `1f006a6 docs: add dependency security review` | documentation, dependency | Documents audit state. |
| `957b5ed fix: remediate pdf dependency risk` | dependency | Targeted package and lockfile change. |
| `9e2b027 docs: review dompurify transitive pdf risk` | documentation, dependency | Documents transitive PDF risk. |
| `9332502 fix: remediate firebase web sdk dependency risk` | dependency | Targeted lockfile-only transitive patch. |
| `64f7dc0 docs: review firebase undici compatibility risk` | documentation, dependency | Documents deferred Firebase risk. |
| `72449ef docs: plan firebase web sdk major upgrade` | documentation, dependency | Planning only. |
| `cb46efc docs: plan functions runtime dependency remediation` | documentation, dependency | Planning only. |
| `733cc2b docs: create v1.0 UAT execution pack` | documentation, UAT | Documentation only. |
| `dcaa6dc docs: add chief engineer status review` | documentation, operational state | Documentation only. |
| `22f0258 docs: prepare live staff UAT tracking` | documentation, UAT | Documentation only. |
| `8743788 fix: resolve UAT lead import date and limit issue` | application code, test, UAT | Targeted app fix with helper test and UAT docs. |
| `64e39f5 docs: investigate functions emulator startup` | documentation, Functions | Investigation only. |
| `7fbcb57 docs: add AI agent handoff pack` | documentation, operational state | Documentation only. |
| `20fe13c fix: resolve functions emulator startup timeout` | documentation, operational state | No Functions code change; documents verified toolchain root cause and validation. |
| `7779745 docs: add structured handoff state` | documentation, operational state | Adds `handoff.json`. |
| `d07ea47 docs: add live UAT notes` | documentation, UAT | Adds tracked UAT issue note. |
| `93d7ad7 docs: audit repository branches and release state` | documentation, operational state | Repository cleanup audit. |
| `09262db docs: finalise post sprint 2 consolidation` | documentation, operational state | Consolidation report. |
| `d57dbf5 docs: prepare post sprint 2 consolidation review` | documentation, operational state | Draft PR review report and state updates. |

Broad commits:

- `866d3a0`, `e880ac0`, and `34c940b` are broad documentation commits, but they are coherent with the PR's release and operational hardening scope.
- `405944d` is a mixed documentation and application-code commit, but the application changes are limited to shared primitive accessibility and EmptyState button consistency.
- `8743788` is mixed app, test, and UAT documentation, but all changes are directly tied to `UAT-ISS-001`.

No change was found that is materially unexplained by the PR body or supporting reports.

## Sensitive Surface Review

| Surface | Result |
| --- | --- |
| Firebase config | No PR changes found |
| Firestore rules | No PR changes found |
| Firestore indexes | No PR changes found |
| Generated release metadata | Build side effect restored; no PR change |
| `dist/` | Ignored build output only |
| `functions/lib/` | Ignored build output only |
| Secrets or production credential files | No secret values found; docs reference secret names only |
| Production Firebase | No deploys, writes, migrations, Salestrail live sync, or phone backfill writes run |

## Validation Results

| Command | Result |
| --- | --- |
| `npm.cmd run typecheck` | Passed |
| `npm.cmd run lint` | Passed |
| `npm.cmd test` | Passed |
| `npm.cmd run build` | Passed with known large chunk warnings |
| Generated release metadata check | Build regenerated metadata and it was restored |
| `npm.cmd run test:emulator:preflight` | Passed with Firebase CLI and Java available |
| `npm.cmd run test:emulator:rules` | Passed |
| `npm.cmd run test:emulator:firestore-smoke` | Passed |
| `npm.cmd run test:emulator:callables-dry-run` | Passed, all expected functions registered |
| `cd functions && npm.cmd run build` | Passed |
| `cd functions && npm.cmd run test:settings-admin` | Passed |
| `git diff --check` | Passed |
| `git status` | Clean before report edits |

Known validation warnings:

- Vite reports large Firebase and PDF chunks.
- Callable emulator reports the known `firebase-functions` SDK advisory.
- Callable emulator reports a non-blocking metadata lookup warning.
- Firestore emulator rules tests print expected permission-denied output for negative cases.

## Green, Amber, Red Assessment

Green:

- Safe to mark PR #19 Ready for Review.
- PR is open, coherent, conflict-free, and fully validated.
- No unresolved comments or review threads exist.
- No Firebase rules, indexes, config, generated metadata, `dist/`, or `functions/lib` changes are included.

Amber:

- Live staff UAT and signoff remain incomplete.
- Backup and recovery rehearsal remains incomplete.
- Dependency risk acceptance remains incomplete.
- Corrected release tag evidence remains incomplete.
- Production Firebase approval is missing.
- Firestore rules and callable auth risks remain active before any production deployment.
- Emulator execution remains toolchain-sensitive.

Red:

- None found.

## Merge Blockers

The PR can be marked Ready for Review, but should not merge until these are resolved or explicitly accepted:

1. Staff UAT execution and signoff.
2. Staff retest of `UAT-ISS-001`.
3. Backup and recovery rehearsal evidence.
4. Dependency risk acceptance or follow-up remediation decision.
5. Corrected release tag evidence using new tag names.
6. Explicit Firebase approval for any production deployment surface.
7. Release owner decision on remaining auth, callable, and Firestore rules risks.

## Review Checklist

| Item | Result |
| --- | --- |
| PR is open and draft before review | Pass |
| Base and head are correct | Pass |
| Local branch matches remote head | Pass |
| Base has not advanced | Pass |
| No unresolved PR comments | Pass |
| No merge conflicts | Pass |
| Quick Pull date and limit fix reviewed | Pass |
| Import result reporting reviewed | Pass |
| Package changes reviewed | Pass |
| UAT docs reviewed | Pass |
| Handoff and state docs reviewed | Pass |
| Firebase config/rules/indexes unchanged | Pass |
| Generated metadata restored | Pass |
| Secrets scan did not find secret values | Pass |
| Validation passed | Pass |

## Rollback Strategy

Return the consolidation branch to the clean base before applied commits:

```powershell
git reset --hard savepoint-before-post-sprint-2-commit-application
```

Return to the source branch:

```powershell
git switch fix/functions-emulator-startup-investigation
```

Revert this human-review documentation commit only:

```powershell
git revert <human-review-commit>
```

Do not run destructive rollback commands without explicit human approval.

## Recommendation

Mark PR #19 Ready for Review.

Do not merge it yet. Keep it open for human review and resolve or formally accept the Amber merge blockers before merge, release tagging, deployment, migrations, Salestrail live sync, or phone backfill writes.
