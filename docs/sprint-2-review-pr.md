# Sprint 2 Review PR

## Title

Sprint 2: Staff Experience and Workflow

## Recommended Target

Recommended target: `codex-foundation`, after Sprint 1 has been reviewed and merged.

If Sprint 1 is still pending, review this branch as stacked on top of `goal/sprint-validation`.

## Summary

This PR improves the CRM staff experience without changing business logic or production Firebase resources.

The work improves:

- Staff orientation in the topbar.
- Dashboard movement between common staff workflows.
- Lead queue context and next-step clarity.
- Settings and admin safety separation.
- Reporting and daily rhythm clarity.
- Sprint 2 documentation and validation evidence.

## Scope

Included:

- Documentation and Sprint 2 planning.
- Navigation and page-purpose metadata.
- Dashboard quick actions.
- Lead queue and sidebar guidance.
- Admin/settings copy and visual safety separation.
- Reporting context cards and daily report mode explanation.

Excluded:

- Firebase config changes.
- Firestore rules changes.
- Functions behaviour changes.
- Data migrations.
- Salestrail live sync.
- Phone backfill writes.
- Production deployments.
- Business logic redesign.

## Validation

Final validation passed:

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

Known warnings:

- App build still reports large chunks for Firebase/PDF bundles.
- Callable emulator run still reports an outdated `firebase-functions` advisory warning.

## Review Checklist

- Confirm Sprint 1 is merged or review this as a stacked branch.
- Check topbar page descriptions across desktop and mobile widths.
- Check Dashboard quick actions and horizontal scrolling on small screens.
- Check lead queue banners for callbacks, follow-ups, overdue callbacks, overdue follow-ups, no-contact leads, and actionable queue.
- Check Lead Sidebar header next-step wording.
- Check Admin tabs, System Controls, Salestrail dry-run/live distinction, and phone normalisation section.
- Check Reports Dashboard review window and active filter scope.
- Check Daily Report live versus aggregated data messaging.
- Confirm no Firebase deploy, migration, Salestrail live sync, phone backfill write, or production data write is included.

## Risks

- UI copy and spacing changed across high-use pages, so visual review is required.
- Dashboard and Reports bundles grew slightly due additional UI content. Existing large bundle warning remains.
- This sprint intentionally did not add browser screenshot verification.

## Rollback

Rollback the Sprint 2 validation branch:

```powershell
git switch goal/sprint-2-validation-review
git reset --hard savepoint-before-sprint-2-validation-review
```

Rollback the full Sprint 2 stack to the pre-planning savepoint:

```powershell
git switch goal/sprint-2-phase-0-planning
git reset --hard savepoint-before-sprint-2-phase-0-planning
```

## Post-Merge Recommendation

Create a stable tag after review and merge:

```powershell
git tag release/sprint-2-staff-workflow
```

## Recommended Next Sprint Options

1. Shared Component Adoption
2. Bundle Optimisation
3. Salestrail Mock Seam
4. Lead Management Polish
