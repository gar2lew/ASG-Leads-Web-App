# Refactor Risk Register

Date: 2026-07-04
Branch: `goal/foundation-audit`
Savepoint tag: `savepoint-before-foundation-audit`

## Purpose

Track refactor and stabilisation risks discovered during the Foundation Audit. This register should be reviewed before any cleanup, refactor, UI redesign, Firebase change, integration change, or release candidate.

## Risk Register

| ID | Risk | Area | Level | Evidence | Mitigation | Status |
| --- | --- | --- | --- | --- | --- | --- |
| R-001 | Production-like Firebase project is the default project. | Firebase release safety | Critical | `.firebaserc` default is `amplify-leads-2026`. | Require explicit target confirmation before any Firebase command that can deploy or write. Prefer emulator and demo projects for validation. | Open |
| R-002 | Deploy-capable scripts exist in root and Functions packages. | Release process | High | Root `deploy`, `release:deploy`, `release:dry-run`; Functions `deploy`. | Keep deploy commands blocked without explicit approval. Document scoped deploy surfaces. | Open |
| R-003 | Functions entry point uses top-level Admin SDK initialisation and Firestore reference. | Firebase Functions | High | `functions/src/index.ts` calls `admin.initializeApp()` and `admin.firestore()` at module top-level. | Refactor only after callable tests and emulator coverage exist. Align with lazy `getDb()` pattern. | Open |
| R-004 | Lint is failing and warnings are treated as errors. | Validation | High | `npm run lint` fails with ESLint errors and warnings. | Create `fix/validation-baseline` goal before refactoring. Resolve config, hook-order, stale disable, and nested mirror issues. | Open |
| R-005 | Standard handbook scripts are missing. | Validation | Medium | `npm run typecheck` and `npm test` both fail as missing scripts. | Add scripts or update standards to approved project-specific commands. | Open |
| R-006 | Workflow state guardrail test fails. | Workflow logic | High | `test:workflow-state` expected `callback`, actual `booked`. | Determine whether test is stale or behaviour regressed. Fix in a dedicated branch. | Open |
| R-007 | Region identity guardrail test fails. | Region and navigation UI | High | `test:region-identity` expects sidebar-brand placement that no longer matches `src/App.tsx`. | Review intended UX and update test or implementation in a dedicated branch. | Open |
| R-008 | Nested mirror may inflate lint and audit output. | Repository hygiene | Medium | Lint reports files under `asg_crm_react\asg_crm_react\...`. | Confirm mirror ownership. Exclude from tools or remove only with explicit approval. | Open |
| R-009 | Firestore rules allow broad operational collection read/write for authenticated app users. | Security rules | High | Many rules use `allow read, write: if canUseOperationalApp();`. | Add emulator rules tests by collection and role. Avoid rules deploy until access tests pass. | Open |
| R-010 | Salestrail live sync path exists in admin UI. | Integration and production data | Critical | `SystemSettingsPanel` invokes `syncSalestrailCallable({ dryRun: false })`. | Keep live sync blocked. Require secrets-by-name check, dry-run, mocked/emulator tests, direct read denial, and live reconciliation approval. | Open |
| R-011 | Phone normalisation live backfill path exists in admin UI. | Data migration | Critical | `SystemSettingsPanel` invokes phone backfill with `{ dryRun: false }`. | Dry-run first, count affected leads, review samples, backup/export, explicit approval, post-run reconciliation. | Open |
| R-012 | Firebase leads migration script can import, full-replace, and normalise live data. | Data migration | Critical | `firebase-leads-sheet-migration.mjs` supports `--import`, `--full-replace`, and `--normalize-live-to-booked`. | Require full migration runbook, backup/export, dry-run validation, duplicate validation, rollback plan, and explicit approval. | Open |
| R-013 | Stale deploy instructions exist in code-adjacent or in-app documentation. | Documentation and operator safety | Medium | `src/lib/firebase.ts` and `src/data/knowledgeBase.ts` mention direct Firebase deploy commands. | Align copy with release approval model in a docs/copy safety branch. | Open |
| R-014 | Large client chunks affect performance and release confidence. | Frontend performance | Medium | Vite reports chunks over 500 kB, including a main chunk over 1 MB. | Measure route usage, improve lazy loading, consider manual chunks after validation baseline. | Open |
| R-015 | Oversized files create high regression risk. | Maintainability | High | Admin, AI roleplay, Sheets sync, Deal dashboard, Map, Client profile, DataTable, and Firebase hook are very large. | Refactor in small slices only after tests and owner mapping exist. | Open |
| R-016 | Hook dependency and hook-order lint issues may mask runtime bugs. | React correctness | High | Lint reports conditional hooks in `useNetworkStatus` and many dependency issues. | Fix hook-order errors before UI refactor. Review dependency warnings by behaviour, not mechanically. | Open |
| R-017 | Dependency versions differ between root and Functions for Firebase Admin. | Dependency management | Medium | Root dev dependency has `firebase-admin ^14.1.0`; Functions dependency has `firebase-admin ^13.0.2`. | Confirm whether root Admin SDK is needed. Avoid version churn until Functions tests pass. | Open |
| R-018 | Release metadata generation causes docs-only build churn. | Release tooling | Low | `npm run build` updates `src/generated/releaseMetadata.ts`. | Restore generated metadata in docs-only goals. Consider documenting this side effect in release process. | Open |
| R-019 | Import and sync logic is concentrated in large UI surfaces. | Data integrity | High | `SheetsSyncModal` and migration scripts contain complex parsing and reconciliation paths. | Add fixture tests and separate planning from live writes before refactoring. | Open |
| R-020 | Error handling and operator messaging vary by surface. | Supportability | Medium | Lint and static review show broad console/error messaging patterns across UI and scripts. | Standardise error display after validation baseline. Do not hide migration or integration failures. | Open |

## Approval Gates Before Risky Work

### Before Refactoring

- Working tree clean.
- Goal branch and savepoint tag created.
- Validation baseline reviewed.
- Impacted files and owners identified.
- Rollback command documented.

### Before Firebase or Data Changes

- `.firebaserc` and active project confirmed.
- Emulator or disposable project validation completed.
- Security rules access tests pass.
- Backup/export plan documented when data can change.
- Explicit approval recorded for the exact command and target.

### Before Integration Work

- Dry-run or mocked tests pass.
- Secrets are checked by name only, never printed.
- Live write paths remain blocked until reconciliation criteria are defined.
- Direct client data access is denied where expected.

### Before Production Release

- TypeScript passes.
- Build passes.
- Lint passes or approved exceptions are documented.
- Targeted tests pass.
- Firebase deployment surface is scoped.
- Rollback plan is documented and rehearsed where practical.

## Current Blocked Tasks

- Firebase deploys.
- Firestore rules or indexes deploys.
- Functions deploys.
- Salestrail live sync.
- Phone normalisation with `dryRun:false`.
- Firebase leads migration import, full-replace, or live status normalisation.
- Broad UI redesign.
- Broad refactoring.
- Dependency removal.
- Nested mirror deletion.

## Recommended Review Cadence

- Review this register before every new goal.
- Close risks only when the mitigation has been implemented and validated.
- Add new risks whenever a goal discovers durable constraints, production safety issues, or fragile ownership boundaries.
