# Internal Production Readiness Go/No-Go Report

Date: 2026-07-06
Branch: `goal/internal-production-readiness`
Savepoint: `savepoint-before-internal-production-readiness`

## Objective

Review ASG CRM internal production readiness across deployment, backup, recovery, monitoring, user guides, admin guides, permissions, security, and validation.

This report is documentation only. It does not deploy, push, modify Firebase resources, run migrations, run Salestrail live sync, run phone backfill writes, or touch production data.

## Executive Decision

| Release question | Decision | Reason |
| --- | --- | --- |
| Is the branch ready for internal human review? | Go | Local validation passed and the release process is documented well enough for review. |
| Is the product ready for staff UAT rehearsal? | Conditional Go | Staff and admin guides exist, but UAT must still be run and signed off. |
| Is the product ready for unrestricted production deployment? | No-Go | Active production blockers remain in Firebase safety, permissions, callable auth review, staff UAT, backup evidence, and release approval. |
| Is any Firebase deploy approved by this report? | No-Go | This report is not a deployment approval. `.firebaserc` points to production-like `amplify-leads-2026`. |

Recommendation: **Do not deploy yet. Proceed with a controlled internal readiness review and staff UAT rehearsal only.**

## Evidence Reviewed

### Process and release documents

- `AGENTS.md`
- `.codex/memory.md`
- `.codex/architecture.md`
- `.codex/decisions.md`
- `docs/ENGINEERING_HANDBOOK.md`
- `docs/CODEX_PLAYBOOK.md`
- `docs/RELEASE_PROCESS.md`
- `docs/SECURITY_GUIDELINES.md`
- `docs/VERSION_PLAN_V1.md`
- `docs/SPRINTS.md`
- `PROJECT_STATE.md`
- `docs/PRODUCT_RELEASES.md`
- `docs/KNOWN_ISSUES.md`
- `docs/RISK_REGISTER.md`
- `DEPLOYMENT.md`

### Technical surfaces

- `package.json`
- `.firebaserc`
- `firebase.json`
- `deploy.ps1`
- `firestore.rules`
- `functions/src/index.ts`
- `src/components/SystemHealthPanel.tsx`
- `src/components/SystemSettingsPanel.tsx`
- `src/components/SettingsHistoryPanel.tsx`
- `src/generated/releaseMetadata.ts`

### User and admin guidance

- `docs/ASG-CRM-User-Manual.md`
- `docs/ADMIN_BOOKLET.html`
- `src/pages/KnowledgeBase.tsx`

## Readiness Matrix

| Area | Current state | Decision | Required before production |
| --- | --- | --- | --- |
| Deployment | `deploy.ps1` provides guarded local deployment with environment checks, Firebase project checks, rollback tag creation, validation, release metadata, logs, and dry-run mode. `npm run deploy` still exists as hosting-only deploy. | Conditional | Use only a release-manager-approved command plan. Confirm branch, merge commit, tag, `.firebaserc`, deploy surface, and explicit approval before any Firebase command. |
| Backup | Documentation recognises backup/export requirements before migrations and data-changing work. No verified Firestore export or Storage backup evidence was found in this audit. | No-Go | Create and rehearse a backup/export runbook for Firestore and Storage before any data migration, phone backfill write, or full production rollout. |
| Recovery | Git rollback, deploy rollback tags, settings rollback, deploy logs, and surface-specific rollback concepts exist. Recovery has not been proven end to end for hosting, functions, rules, indexes, and data. | Conditional | Run a non-production rollback rehearsal. Define owner, time target, known-good release reference, and communication plan. |
| Monitoring | In-app System Health, release metadata, error handling, notifications, and deploy logs exist. External monitoring, alert ownership, and production incident rhythm are not fully defined. | Conditional | Define first-week monitoring checklist for login, lead saves, call logging, Firestore errors, Functions errors, notifications, and support escalation. |
| User guides | Staff manual covers roles, leads, deals, client hub, call logging, training, reports, notifications, offline mode, troubleshooting, and glossary. | Conditional | Staff UAT must confirm guide accuracy against current UI and workflows. |
| Admin guides | Admin booklet and user manual cover admin settings, system health, settings history, permissions, audit concepts, and data structures. Some auth wording is older than the current anonymous Firebase Auth plus PIN model. | Conditional | Refresh admin guide wording around auth model, Firebase production safety, and risky controls before release sign-off. |
| Permissions | Role and permission concepts are documented. App uses PIN, Firebase anonymous auth, custom claims, roles, regions, and page permissions. | No-Go | Review role matrix with staff. Close or explicitly accept broad Firestore operational collection access before production approval. |
| Security | Security guidelines are strong. `salestrailCalls` direct client reads and writes are denied. Settings/audit paths are increasingly callable-authoritative. | No-Go | Resolve or formally risk-accept callable auth gaps and broad Firestore rules. Confirm no secrets are committed and live integration actions remain approval-gated. |
| Validation | Local validation passed in this audit. Emulator checks were not rerun during this specific report, but existing scripts and recent baseline are documented. | Conditional | Run the full v1.0 validation checklist, including emulator commands, on the exact release candidate before Go. |

## Deployment Review

Strengths:

- Firebase deployment is documented in `DEPLOYMENT.md`.
- `deploy.ps1` checks local tools, Firebase login, project root files, default Firebase project, working tree state, branch, commit, release metadata, TypeScript, and build.
- Dry-run mode exists through `.\deploy.ps1 -DryRun` and `npm run release:dry-run`.
- Deploy logs are written under `scripts/deploy-logs/`.
- Firebase surfaces are explicit in `firebase.json`: hosting, functions, Firestore rules, and Firestore indexes.

Risks:

- `.firebaserc` default project is `amplify-leads-2026`, which is production-like.
- `deploy.ps1` deploys rules, indexes, hosting, and functions in one governed flow unless run with `-DryRun`.
- `npm run deploy` can still deploy hosting after a build.
- No deployment should run from this branch without explicit approval and a human release operator.

Deployment decision: **No-Go until explicit release approval.**

## Backup Review

Strengths:

- Release docs require backup/export before migrations and data-changing operations.
- Risk register correctly identifies phone backfill and Firebase lead migration as high or critical risks.

Gaps:

- No verified Firestore export command, Storage backup procedure, restore owner, restore test, or data retention target was found in this audit.
- Deploy rollback tags do not protect production Firestore data.
- Settings rollback covers app settings, not general CRM data.

Backup decision: **No-Go for any data-changing production action.**

Required backup checklist:

1. Confirm Firebase project.
2. Export Firestore before migration or backfill.
3. Confirm Firebase Storage backup or retention approach for uploaded files.
4. Record export location without exposing secrets.
5. Rehearse restore on disposable or non-production resources.
6. Assign recovery owner and approval owner.

## Recovery Review

Strengths:

- Git savepoints and release tags are used consistently.
- `deploy.ps1` creates `pre-deploy-YYYYMMDD-HHMMSS` tags.
- `docs/VERSION_PLAN_V1.md` includes merge revert and branch reset guidance.
- Settings history rollback exists through callable-controlled settings paths.

Gaps:

- Hosting rollback is described conceptually, but not proven as an operator runbook.
- Functions rollback requires either previous deploy artefact knowledge or corrective deploy.
- Firestore rules rollback requires deploying a prior rules file, which is production-impacting.
- Index rollback can be slow and should be treated as a planned change, not an emergency lever.
- Data recovery requires export and restore evidence.

Recovery decision: **Conditional Go for internal rehearsal, No-Go for production release until rollback is rehearsed.**

## Monitoring Review

Strengths:

- System Health panel covers Firestore status, online state, AI training activity, voice support, push notification permission, and offline queue status.
- Release metadata appears in admin settings.
- Deploy logs include command output and failure step.
- Error-handling and observability tests exist.

Gaps:

- No external incident dashboard, alert schedule, on-call owner, or post-release monitoring owner was confirmed.
- Functions error monitoring depends on Firebase console review unless a formal process is added.
- Staff feedback loop and first-week triage cadence are not fully documented.

Monitoring decision: **Conditional Go for UAT, No-Go for unattended production use.**

Recommended launch monitoring:

- Login and PIN failures.
- Lead save failures.
- Call logging failures.
- Callback and follow-up queue behaviour.
- Firestore permission errors.
- Functions errors.
- Notification delivery.
- Offline queue failed writes.
- Release metadata in admin settings.
- Staff-reported workflow blockers.

## User Guide Review

Strengths:

- `docs/ASG-CRM-User-Manual.md` is broad and practical.
- It covers roles, daily workflows, call logging, lead updates, deals, clients, reports, notifications, offline mode, troubleshooting, and glossary.
- It gives staff a clear operating model for daily CRM work.

Gaps:

- UAT has not yet confirmed the guide against the current UI after Sprint 1, Sprint 2, Salestrail readiness, AI foundation, and recent component work.
- Some workflow names may need final alignment with the current navigation and page labels.

User guide decision: **Conditional Go for staff UAT.**

## Admin Guide Review

Strengths:

- `docs/ADMIN_BOOKLET.html` documents architecture, Firestore collections, lead notes, appointments, admin settings, status system, and troubleshooting concepts.
- Admin surfaces in the app include system controls, settings history, release metadata, and health checks.

Gaps:

- The admin booklet says the auth model is "PIN-based session login (not Firebase Auth)", while current project docs describe anonymous Firebase Auth plus PIN verification and custom claims.
- The guide should better distinguish safe dry-run controls from live Salestrail sync, phone normalisation writes, migrations, and Firebase deploys.

Admin guide decision: **Conditional Go after wording refresh.**

## Permissions Review

Strengths:

- Security docs define roles, claims, regions, active status, and server-authoritative expectations.
- Settings/admin work has moved sensitive settings history and rollback paths toward callables.
- `salestrailCalls` is blocked from direct client reads and writes.

Gaps:

- Firestore rules still allow broad operational access for authenticated app users across several collections.
- Anonymous Firebase Auth remains part of the compatibility model.
- Some exported callables are documented as requiring further auth review.
- Page permissions and Firestore permissions are not fully equivalent.

Permissions decision: **No-Go for full production approval until explicitly accepted or remediated.**

## Security Review

Strengths:

- Security guidelines are practical and specific.
- Secrets are referenced by name only, including `SALESTRAIL_API_USERNAME` and `SALESTRAIL_API_PASSWORD`.
- Salestrail, phone backfill, migrations, Firebase deploys, and production writes are approval-gated in docs.
- Emulator-only project IDs are documented for local validation.

Blockers:

- Active risk R-002: some exported callables lack `requireAuth(request)` or role checks.
- Active risk R-003: Firestore rules remain broad for operational collections.
- Active risk R-006: Firebase lead migration tooling can replace live lead data.
- Active risk R-012: Salestrail dry-run callable cannot be safely invoked in emulator while it can still reach live API if secrets are present.

Security decision: **No-Go for production deployment until the release owner explicitly remediates or risk-accepts blockers.**

## Validation Results From This Audit

Commands run:

| Command | Result | Notes |
| --- | --- | --- |
| `npm run typecheck` | Passed | App and Functions TypeScript passed. |
| `npm run lint` | Passed | Blocking lint passed with `--quiet`. |
| `npm test` | Passed | Auth boundaries, workflow state, region identity, observability, and release metadata checks passed. |
| `npm run build` | Passed | Build passed. Known large chunk warnings remain for Firebase and PDF vendor bundles. |
| `cd functions; npm run build` | Passed | Functions TypeScript build passed. |
| `cd functions; npm run test:settings-admin` | Passed | Settings admin test passed after Functions build. |

Build side effect:

- `npm run build` regenerated `src/generated/releaseMetadata.ts` with local production-style metadata for commit `c458800`.
- That generated drift was restored before this report was committed so the goal remains documentation-only.

Validation not run in this audit:

- `npm run test:emulator:preflight`
- `npm run test:emulator:rules`
- `npm run test:emulator:firestore-smoke`
- `npm run test:emulator:callables-dry-run`

Reason: this report focused on internal production readiness and ran the core local validation. The full v1.0 release gate still requires emulator validation on the exact release candidate.

## Production Blockers

| Blocker | Severity | Required action |
| --- | --- | --- |
| Production-like Firebase project is the default in `.firebaserc`. | Critical | Confirm deploy target and explicit approval before any Firebase command. |
| Staff UAT is not signed off. | Critical | Run and document UAT for reps, managers, admins, system controls, and mobile workflows. |
| Backup/export runbook is not verified. | Critical | Create and rehearse Firestore and Storage backup/restore procedure. |
| Broad Firestore operational collection access remains active. | Critical | Remediate, emulator-test, or explicitly risk-accept before release approval. |
| Callable auth gaps remain active risks. | Critical | Harden or formally risk-accept before Functions deploy. |
| Salestrail live paths remain approval-gated. | High | Keep dry-run-first, add no-network mock seam, reconcile counts before live sync. |
| Phone normalisation writes remain blocked. | High | Dry-run, sample review, backup/export, approval, and post-run reconciliation required. |
| Migration scripts remain blocked. | Critical | Full runbook, backup/export, dry-run validation, duplicate handling, rollback, and approval required. |
| Release tags and PR merge state need human verification. | Medium | Verify exact merge commits and tag targets before treating them as release evidence. |
| Large build chunks remain. | Medium | Accept for internal release or schedule bundle optimisation. |

## Go Criteria For Internal UAT

Internal UAT may proceed when:

- The release branch or candidate commit is identified.
- Staff guide and admin guide reviewers are assigned.
- No Firebase deploy is part of the UAT setup unless separately approved.
- Production data is not used for local testing.
- Risky System Controls are demonstrated without running live actions.
- UAT results are captured in a release checklist.

## Go Criteria For Production Deployment

Production deployment should not proceed until:

1. Sprint and feature PR merge state is verified.
2. Release tag target is verified.
3. Full validation passes on the exact release candidate, including emulator tests.
4. Staff UAT is signed off.
5. Backup/export and restore plan is approved.
6. Rollback plan is assigned and rehearsed.
7. Known issues are accepted or closed.
8. Critical security and permission risks are remediated or formally accepted.
9. Firebase deploy surfaces are explicitly approved one by one.
10. Salestrail live sync, phone backfill writes, and migrations remain excluded unless separately approved.

## No-Go Conditions

Stop the release if any of the following are true:

- Working tree is dirty before deployment.
- Branch or commit does not match the approved release candidate.
- `.firebaserc` target is not explicitly confirmed.
- Any required validation fails.
- Emulator rules or callable checks fail.
- Staff UAT fails without an accepted workaround.
- Backup or rollback owner is missing.
- Firebase deployment approval is missing.
- Migration, Salestrail live sync, or phone backfill write is included without explicit approval.
- Secrets are printed, exposed, or committed.

## Safe Next Actions

1. Run full v1.0 validation, including emulator checks, on the release candidate.
2. Refresh admin guide auth wording and risky-control language.
3. Create a backup and recovery runbook for Firestore and Storage.
4. Run staff UAT and record results.
5. Review callable auth and broad Firestore rules with a release owner.
6. Verify PR merge state and release tag targets.
7. Hold a human Go/No-Go review before any Firebase deploy command.

## Final Recommendation

ASG CRM is **not yet ready for unrestricted production deployment**.

It is ready for **controlled internal production readiness review and staff UAT rehearsal**, provided no deploy, migration, live sync, phone backfill write, or production Firebase change is included.
