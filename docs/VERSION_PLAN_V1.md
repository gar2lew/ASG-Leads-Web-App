# Version Plan: v1.0 Internal Production Release

## Purpose

This document defines the practical release plan for ASG CRM v1.0 Internal Production Release.

v1.0 is not a public launch. It is the first controlled internal production release candidate for ASG staff use.

## Release Objective

Prepare ASG CRM for safe internal production use by staff with clear workflows, validation evidence, release controls, rollback instructions, staff onboarding, and Firebase/data safety gates.

## What v1.0 Means

v1.0 means:

- Internal staff can use the CRM for daily lead, callback, appointment, client, report, and admin workflows.
- Release managers understand what is safe to deploy and what remains blocked.
- Staff UAT has been completed and documented.
- Rollback and support paths are known.
- Production Firebase changes remain explicit and approved.

v1.0 does not mean:

- Public client portal launch.
- ASG-X launch.
- Fully complete Salestrail product workflow.
- Broad AI automation.
- Unapproved data migrations.

## Included Scope

- Staff onboarding documentation.
- Production rollout checklist.
- Backup and rollback process.
- Lead Workbench final polish.
- Manager daily reporting rhythm.
- Known issues review.
- Pending decisions review.
- Risk register review.
- Release notes.
- Firebase deploy surface plan.
- Staff UAT.

## Out Of Scope

- Live Salestrail sync without approval.
- Phone backfill writes without approval.
- Live Firebase lead migrations without approval.
- Firestore rules changes unless explicitly planned and validated.
- Functions deploy unless explicitly approved.
- Client portal.
- Broker portal.
- ASG-X.
- Native mobile wrapper.
- AI stored summaries or automated record updates.

## User Groups

- Reps: daily lead work, call logging, follow-ups, appointments, personal settings.
- Managers: team workload, daily reporting, coaching signals, follow-up compliance.
- Admins: roster, settings, imports, sync tools, system safety controls.
- Directors: business visibility, release confidence, reporting review.

## Required Documentation

- `docs/RELEASE_PROCESS.md`
- `docs/firebase-release-plan.md`
- `docs/firebase-emulator-validation-checklist.md`
- `docs/sprint-1-report.md`
- `docs/sprint-2-report.md`
- `docs/KNOWN_ISSUES.md`
- `docs/DECISIONS_PENDING.md`
- `docs/RISK_REGISTER.md`
- `docs/CHANGELOG_INTERNAL.md`
- `docs/FEATURE_BACKLOG.md`
- `docs/PRODUCT_RELEASES.md`
- Staff onboarding guide or user manual update.
- `docs/UAT/Sales_Rep_Test_Plan.md`
- `docs/UAT/Manager_Test_Plan.md`
- `docs/UAT/Admin_Test_Plan.md`
- `docs/UAT/Director_Test_Plan.md`
- `docs/UAT/UAT_Checklist.md`
- `docs/UAT/Issue_Report_Template.md`
- `docs/UAT/Signoff_Form.md`
- `docs/UAT/Test_Data_Guide.md`

## Required Validation

Run before v1.0 go/no-go:

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

## Required Staff Review

Staff UAT must cover:

- Rep daily start.
- Call next lead.
- Log call.
- Add note.
- Set callback.
- Set follow-up.
- Create appointment.
- Review client.
- Manager daily report review.
- Admin roster change.
- Admin settings review.
- System Controls safety review without running live actions.
- Mobile lead workflow smoke test.

## Required Deployment Checks

- Confirm active branch.
- Confirm merge status.
- Confirm clean working tree.
- Confirm release tag target.
- Inspect `.firebaserc`.
- Confirm Firebase target project.
- Confirm deploy surface.
- Confirm no migrations or live sync commands are included.
- Confirm rollback command.
- Confirm release owner and approval.

## Firebase And Data Safety Checks

- No production Firebase deploy without explicit approval.
- No Functions deploy without explicit approval.
- No Firestore rules or indexes deploy without explicit approval.
- No live Salestrail sync without explicit approval.
- No phone normalisation `dryRun:false` without explicit approval.
- No Firebase lead migration full run without explicit approval.
- Backup/export plan required before data-changing work.
- Emulator validation required for rules and callable paths.

## Rollback Plan

Release rollback must include:

```powershell
git switch codex-foundation
git log --oneline -10
```

If reverting a merge is safer than resetting shared history:

```powershell
git revert -m 1 <merge-commit>
```

If using a local rollback before merge:

```powershell
git switch <release-branch>
git reset --hard <savepoint-tag>
```

Firebase rollback must be planned by surface before any deploy:

- Hosting rollback to previous known-good release.
- Functions rollback to previous deployed version or corrective deploy.
- Firestore rules rollback to previous rules file.
- Index changes reviewed before deploy because rollback can be slow.
- Data migrations require export and restore runbook.

## UAT Checklist

The executable UAT pack lives in `docs/UAT/` and is the source of truth for staff testing.

| Area | Check | Owner | Status |
| --- | --- | --- | --- |
| Login | Staff can sign in and verify access. | Product | Pending |
| Leads | Rep can work the lead queue. | Product | Pending |
| Lead Details | Rep can update status, notes, callback, and follow-up. | Product | Pending |
| Calendar | Staff can review and create appointments. | Product | Pending |
| Clients | Manager can review client context. | Product | Pending |
| Reports | Manager can use daily and performance reports. | Product | Pending |
| Admin | Admin can review roster and safe settings. | Product | Pending |
| System Controls | Risky controls are understood and not run accidentally. | Release Manager | Pending |
| Mobile | Key rep workflows are usable on mobile. | Product | Pending |

## UAT Exit Criteria

v1.0 can proceed to release go/no-go only when:

- Sales rep, manager, admin, and director UAT scripts are run or formally marked not applicable by the release owner.
- Zero unresolved Critical issues remain.
- Zero unresolved High issues remain without approved workaround.
- Any Medium issues have accepted workarounds or backlog entries.
- Any documentation mismatch affecting core staff workflow is fixed or tracked before release.
- No production Firebase deploy, live Salestrail sync, migration, phone write backfill, or unapproved production data action occurred during UAT.
- Product owner and release manager sign off using `docs/UAT/Signoff_Form.md`.

## Go/No-Go Checklist

- Sprint 1 merged or explicitly included.
- Sprint 2 merged or explicitly included.
- Validation commands passed.
- Staff UAT passed.
- Known issues reviewed.
- Pending decisions reviewed.
- Risk register reviewed.
- Changelog updated.
- Rollback plan approved.
- Firebase deploy surface approved if deployment is included.
- No blocked migration, live sync, or phone backfill is included.
- Release owner approves go.

## Post-Release Monitoring

Monitor:

- Login failures.
- Lead saves.
- Call logging.
- Callback and follow-up behaviour.
- Admin settings updates.
- Firestore read/write errors.
- Function errors if Functions are deployed.
- Build metadata and release tag.
- Staff feedback.

## Future Releases After v1.0

- v1.1 Salestrail.
- v1.2 Reporting.
- v1.3 AI Assistant.
- v1.4 Document Centre.
- v1.5 Client Timeline.
- v2.0 ASG-X Online.
