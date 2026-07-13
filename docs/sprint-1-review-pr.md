# Sprint 1 Review PR

Date: 5 July 2026

Source branch: `goal/sprint-validation`

Recommended merge target: `codex-foundation`

Recommended post-merge tag: `release/sprint-1-stable`

## PR Summary

This PR prepares Sprint 1: CRM Stabilisation for human review and merge. It brings together the Sprint 1 documentation, validation baseline, emulator safety baseline, shared UI foundation, scoped UI polish, and bundle chunking optimisation.

Sprint 1 is not a production release. It is a stabilisation and review checkpoint. Do not deploy from this PR without a separate production readiness approval.

## Work Completed

Foundation and safety work:

- Confirmed validation baselines and emulator harnesses are passing.
- Preserved Firebase production safety rules and avoided production data access.
- Kept live Salestrail sync, live phone backfill writes, migrations, deploys, pushes, and destructive cleanup out of scope.

Documentation and planning:

- Added UI audit and redesign planning documents.
- Added permanent design system documentation.
- Added design system adoption backlog.
- Added component audit and refactor planning documents.
- Added Sprint 1 validation report.

Shared UI foundation:

- Added shared primitives for buttons, cards, dialogs, form fields, badges, loading states, tables, and exports.
- Kept these primitives additive so existing CRM behaviour was not forced through a broad migration.

Scoped UI polish:

- Improved sidebar navigation touch targets and focus states.
- Polished Dashboard, Lead List, Lead Details, Reports, Admin, My Settings, System Controls, and Salestrail control surfaces.
- Improved responsive wrapping, spacing, keyboard focus visibility, and operational page framing.

Performance optimisation:

- Added Vite manual chunks for stable heavy dependency groups:
  - `vendor-react`
  - `vendor-firebase`
  - `vendor-pdf`
  - `vendor-maps`
  - `vendor-icons`
  - `vendor-state`
- Reduced the main app chunk from about `526 kB` to about `302.5 kB`.

## Validation Results

All Sprint Validation checks passed on `goal/sprint-validation`:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:emulator:preflight`
- `npm run test:emulator:rules`
- `npm run test:emulator:firestore-smoke`
- `npm run test:emulator:callables-dry-run`
- `cd functions && npm run build`
- `cd functions && npm run test:settings-admin`
- `git diff --check`

Validation notes:

- Firestore emulator tests include expected permission denied logs for negative access checks.
- Callable emulator dry-run tests used `demo-asg-crm-emulator` only.
- Client build regenerated `src/generated/releaseMetadata.ts`; it was restored before committing.

## Risks And Remaining Warnings

- Firebase and PDF vendor chunks still exceed `500 kB`. They are now isolated from the main app chunk, but further optimisation is still needed.
- The Functions emulator warns that `firebase-functions` is outdated. No dependency upgrade was attempted in Sprint 1.
- Shared UI primitives are additive and are not yet adopted across every page.
- Admin, Lead Details, and DataTable remain large operational components.
- Production Firebase deployment remains blocked until the Firebase release plan and approval gates are reviewed separately.
- Salestrail live sync, phone normalisation with `dryRun:false`, and migration scripts remain blocked without explicit approval.

## Rollback And Savepoints

Current review branch:

- `goal/sprint-validation`

Relevant savepoints:

- `savepoint-before-sprint-validation`
- `savepoint-before-performance-optimisation`
- `savepoint-before-ui-redesign`
- `savepoint-before-shared-component-refactor`
- `savepoint-before-component-audit`
- `savepoint-before-design-system`
- `savepoint-before-ui-audit-planning`

Rollback to the start of Sprint Validation:

```powershell
git switch goal/sprint-validation
git reset --hard savepoint-before-sprint-validation
```

Rollback to the start of UI Redesign:

```powershell
git switch goal/ui-redesign
git reset --hard savepoint-before-ui-redesign
```

Use destructive rollback only with explicit approval.

## Merge Recommendation

Recommended target branch: `codex-foundation`

Recommended review posture:

- Review as a stabilisation PR.
- Confirm no production Firebase config, rules, deployment scripts, migrations, secrets, or environment files were changed.
- Confirm UI changes are scoped to polish and preserve behaviour.
- Confirm validation commands remain green in reviewer environment.

After merge, create the stable sprint tag:

```powershell
git tag release/sprint-1-stable
```

Push the tag only after human approval.

## Recommended Next Sprint Options

1. Shared Component Adoption
2. Bundle Optimisation
3. Salestrail Mock Seam
4. Lead Management Polish

## PR Description Draft

Title:

```text
Sprint 1: CRM stabilisation review
```

Body:

```text
## Summary

Prepares Sprint 1 stabilisation work for review and merge into codex-foundation.

Includes:
- validation and emulator baseline confirmation
- UI audit, design system, and component audit documentation
- additive shared UI primitives
- scoped UI polish across navigation, dashboard, leads, lead details, reports, admin, settings, and Salestrail controls
- Vite vendor chunk splitting to reduce main app chunk size

## Validation

- npm run typecheck
- npm run lint
- npm test
- npm run build
- npm run test:emulator:preflight
- npm run test:emulator:rules
- npm run test:emulator:firestore-smoke
- npm run test:emulator:callables-dry-run
- cd functions && npm run build
- cd functions && npm run test:settings-admin
- git diff --check

## Risks

- Firebase and PDF vendor chunks remain large.
- firebase-functions emulator warning remains.
- Shared UI primitives are additive and still need broader adoption.
- Production deploy remains blocked pending separate release approval.

## Post-merge

Recommended tag after approved merge: release/sprint-1-stable
```
