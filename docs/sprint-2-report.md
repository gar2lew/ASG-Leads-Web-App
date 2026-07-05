# Sprint 2 Report: Staff Experience and Workflow

Date: 5 July 2026

Branch: `goal/sprint-2-validation-review`

Base context: Sprint 2 was continued from the validated Sprint 1 branch because Sprint 1 review work was present there and not on `codex-foundation` at the start of this run.

## Summary

Sprint 2 improved staff workflow, usability, and consistency without changing production Firebase resources, Firestore rules, migrations, Salestrail live sync, phone backfill writes, deployments, or business logic.

The sprint focused on making the CRM feel more like a staff workbench:

- Clearer page purpose in the app topbar.
- Dashboard quick actions that match common staff movement.
- Better lead queue context and next-step guidance.
- Clearer distinction between personal settings, routine admin work, and governed production-sensitive controls.
- Reporting pages that separate daily action queues from performance review.
- Sprint 2 planning, audit, validation, and review documentation.

## Completed Phases

| Phase | Branch | Savepoint | Commit | Result |
| --- | --- | --- | --- | --- |
| Phase 0: Sprint 2 Planning | `goal/sprint-2-phase-0-planning` | `savepoint-before-sprint-2-phase-0-planning` | `8c7491f` | Created `docs/SPRINTS.md`. |
| Phase 1: Workflow Audit | `goal/sprint-2-phase-1-workflow-audit` | `savepoint-before-sprint-2-phase-1-workflow-audit` | `8fcfffd` | Created staff workflow audit and improvement plan. |
| Phase 2: Navigation Flow | `goal/sprint-2-phase-2-navigation-flow` | `savepoint-before-sprint-2-phase-2-navigation-flow` | `89bcf61` | Improved topbar orientation and dashboard quick movement. |
| Phase 3: Lead Workbench | `goal/sprint-2-phase-3-lead-workbench` | `savepoint-before-sprint-2-phase-3-lead-workbench` | `8d9841f` | Added queue context and lead next-step guidance. |
| Phase 4: Settings/Admin | `goal/sprint-2-phase-4-settings-admin` | `savepoint-before-sprint-2-phase-4-settings-admin` | `594b67a` | Clarified personal settings, routine admin, and governed controls. |
| Phase 5: Reporting Rhythm | `goal/sprint-2-phase-5-reporting-rhythm` | `savepoint-before-sprint-2-phase-5-reporting-rhythm` | `4c4846c` | Added reporting context and daily rhythm cues. |
| Phase 6: Validation Review | `goal/sprint-2-validation-review` | `savepoint-before-sprint-2-validation-review` | Pending at report creation | Created Sprint 2 closeout docs. |

## Files Changed

Documentation:

- `docs/SPRINTS.md`
- `docs/sprint-2-staff-workflow-audit.md`
- `docs/sprint-2-workflow-improvement-plan.md`
- `docs/sprint-2-report.md`
- `docs/sprint-2-review-pr.md`

Application UI:

- `src/App.tsx`
- `src/lib/navigationConfig.ts`
- `src/pages/Dashboard.tsx`
- `src/pages/Leads.tsx`
- `src/components/LeadSidebar.tsx`
- `src/pages/Admin.tsx`
- `src/components/SystemSettingsPanel.tsx`
- `src/components/RepSettingsPanel.tsx`
- `src/pages/ReportsDashboard.tsx`
- `src/components/DailyReportDashboard.tsx`

## Validation Results

Final Sprint 2 validation passed:

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm test` | Passed |
| `npm run build` | Passed |
| `npm run test:emulator:preflight` | Passed |
| `npm run test:emulator:rules` | Passed |
| `npm run test:emulator:firestore-smoke` | Passed |
| `npm run test:emulator:callables-dry-run` | Passed |
| `cd functions && npm run build` | Passed |
| `cd functions && npm run test:settings-admin` | Passed |
| `git diff --check` | Passed |

## Validation Notes

- `npm run build` still reports existing large chunk warnings for Firebase and PDF bundles.
- The callable emulator command still reports that `firebase-functions` is outdated. This is an advisory warning, not a Sprint 2 blocker.
- Emulator validation used `demo-asg-crm-emulator`.
- No production Firebase deployment, migration, live Salestrail sync, live phone backfill, or production data write was run.

## UX Improvements

- Topbar now shows a concise purpose statement for the current page.
- Dashboard quick actions now include Leads, Clients, Calendar, DQ Import, Work Queue, Callbacks, Map, Lead Stats, Reports, and Documents.
- Lead queue banners now show the active queue, lead count, and suggested work rhythm.
- Lead details now show the current next step near the header.
- Admin now explains the active tab and separates routine settings from governed controls.
- Salestrail live sync is visually distinguished from dry-run.
- My Settings is clearly marked as personal profile only.
- Reports now show review window, intended use, and active filter scope.
- Daily Report now clarifies live versus aggregated data mode.

## Remaining Issues

- Large bundle warnings remain and should stay on the bundle optimisation track.
- Sprint 2 did not perform browser visual QA. A local visual pass is recommended before review.
- Sprint 2 did not change business logic, Firestore rules, Functions exports, migrations, or Firebase config.
- Sprint 1 and Sprint 2 should be reviewed in branch order before merge if Sprint 1 is still not merged.

## Rollback

Rollback this Sprint 2 validation branch:

```powershell
git switch goal/sprint-2-validation-review
git reset --hard savepoint-before-sprint-2-validation-review
```

Rollback to the pre-Sprint 2 planning point:

```powershell
git switch goal/sprint-2-phase-0-planning
git reset --hard savepoint-before-sprint-2-phase-0-planning
```

## Recommended Next Work

Recommended next sprint options:

1. Shared Component Adoption
2. Bundle Optimisation
3. Salestrail Mock Seam
4. Lead Management Polish

Recommended immediate next action:

- Review Sprint 2 visually on desktop and mobile.
- Create a draft review PR after confirming the correct merge base and target branch.
