# Foundation Audit

Date: 2026-07-04
Branch: `goal/foundation-audit`
Savepoint tag: `savepoint-before-foundation-audit`
Baseline commit: `8579975 docs: add ASG CRM engineering handbook`

## Objective

Assess the merged ASG CRM foundation for release risk, maintainability risk, Firebase safety, validation gaps, and bloat before any refactoring or feature work begins.

## Scope

- Client TypeScript, build, lint, and targeted validation scripts.
- Functions TypeScript, build, and settings-admin validation.
- Firebase configuration, security rules, deployed function entry points, migration tooling, and admin-only operations.
- Documentation, naming, feature bloat, and maintainability signals.

## Non-goals

- No application code changes.
- No file deletion.
- No refactoring.
- No Firebase configuration or security rule changes.
- No deployment, migration, Salestrail live sync, phone backfill writes, or production data access.

## Files and Areas Reviewed

- `AGENTS.md`
- `docs/CODEX_PLAYBOOK.md`
- `docs/ENGINEERING_HANDBOOK.md`
- `.codex/memory.md`
- `.codex/architecture.md`
- `.codex/known-issues.md`
- `.codex/decisions.md`
- `package.json`
- `functions/package.json`
- `.firebaserc`
- `firebase.json`
- `firestore.rules`
- `firestore.indexes.json`
- `functions/src/index.ts`
- `functions/src/auth/verifyPin.ts`
- `functions/src/settingsAdmin.ts`
- `functions/src/salestrail.ts`
- `functions/src/salestrailSync.ts`
- `functions/src/phoneMigration.ts`
- `functions/src/migrateAuthFields.ts`
- `scripts/firebase-leads-sheet-migration.mjs`
- `src/components/SystemSettingsPanel.tsx`
- `src/hooks/useFirebase.ts`
- `src/lib/firebase.ts`
- `src/data/knowledgeBase.ts`
- Major client pages, shared components, hooks, and scripts by size and validation output.

## Validation Results

| Command | Result | Notes |
| --- | --- | --- |
| `git branch --show-current` | Pass | Current branch was `goal/foundation-audit`. |
| `git status --short` | Pass at start | Working tree was clean before audit branch work. |
| `npx tsc --noEmit` | Pass | Client TypeScript completed with no reported errors. |
| `npx tsc --noEmit -p functions\tsconfig.json` | Pass | Functions TypeScript completed with no reported errors. |
| `npm run build` | Pass with warning | Vite build completed. Large chunk warnings remain, including chunks over 500 kB. Build regenerated `src/generated/releaseMetadata.ts`, which was restored because this goal is docs-only. |
| `cd functions && npm run build` | Pass | Functions build completed with `tsc`. |
| `npm run lint` | Fail | ESLint fails with errors and warnings. It also scans the nested mirror path `asg_crm_react\...`, which likely inflates findings. |
| `npm run typecheck` | Fail | Missing script in root `package.json`. |
| `npm test` | Fail | Missing script in root `package.json`. |
| `npm run test:auth-boundaries` | Pass | Auth boundary script completed. |
| `npm run test:workflow-state` | Fail | `scripts/test-workflow-state.cjs:57` expected `callback`, actual `booked`. |
| `npm run test:region-identity` | Fail | `scripts/test-region-identity.cjs:38` expects the region workspace control to live with the sidebar brand. |
| `npm run test:observability` | Pass | Observability script completed. |
| `npm run test:release-metadata` | Pass | Release metadata foundation checks passed. |
| `cd functions && npm run test:settings-admin` | Pass | Functions build and settings-admin test completed. |

## Executive Summary

The foundation is TypeScript-clean and buildable, including Firebase Functions. That is a strong baseline. The repository is not yet ready for broad refactoring or production release work because lint is failing, two targeted guardrail tests fail, standard handbook scripts are missing, and production-sensitive Firebase and migration surfaces are present in the same codebase as admin UI controls.

The highest risks are operational, not compilation-related:

- Firebase default project is production-like: `amplify-leads-2026`.
- Root scripts include deploy-capable commands.
- Admin UI can invoke Salestrail live sync and phone normalisation live backfill paths.
- Firestore rules deny direct `salestrailCalls` client access, but many operational collections allow broad app read/write access via `canUseOperationalApp()`.
- A large Firebase leads migration script can import, full-replace, and normalise live data when enabled with flags.
- Functions entry point still uses top-level `admin.initializeApp()` and `admin.firestore()`, which conflicts with the project memory rule that functions should prefer lazy initialisation.

## Strong Areas

- Client TypeScript and Functions TypeScript pass.
- Client and Functions production builds pass.
- Salestrail call records are protected from direct client Firestore reads and writes by `firestore.rules`.
- Auth boundary, observability, release metadata, and settings-admin validation scripts exist and pass.
- Migration tooling includes dry-run defaults and explicit flags for destructive modes.
- The new handbook and playbook establish good safety posture for branch work, savepoints, rollback, Firebase approvals, and documentation-first goals.

## Blockers Before Foundation Refactoring

1. Fix or quarantine lint failures.
   - Lint currently fails with hook-order errors, unused disable directives, missing ESLint rule configuration, prefer-const issues, no-useless-escape issues, and many warnings under `--max-warnings 0`.
   - The nested mirror path appears in lint output. Confirm whether the nested `asg_crm_react/` copy should be excluded from lint and audit scans.

2. Restore targeted guardrail tests.
   - `test:workflow-state` fails because a workflow status expectation no longer matches actual behaviour.
   - `test:region-identity` fails because the expected sidebar-brand placement no longer matches `src/App.tsx`.

3. Add or deliberately document missing standard scripts.
   - Handbook standard commands include `npm run typecheck` and `npm test`.
   - Root `package.json` does not currently define either script.

4. Freeze production-sensitive operations until emulator and approval gates pass.
   - No Firebase deploy.
   - No Salestrail live sync.
   - No phone normalisation write backfill.
   - No Firebase leads migration import, full-replace, or live status normalisation.

## TypeScript and Build Findings

- TypeScript is currently clean for client and Functions.
- Build passes, but build output shows substantial bundle size warnings.
- Build runs `scripts/write-release-metadata.cjs` and updates `src/generated/releaseMetadata.ts` with the current commit, timestamp, and Firebase project ID. This is expected for release metadata, but it creates churn during audit and should be handled carefully in docs-only goals.

## Lint and Test Findings

Representative lint blockers:

- `src/hooks/useNetworkStatus.ts` has conditional React Hook calls.
- `src/components/KnowledgeLayout.tsx` references `react/no-danger`, but that ESLint rule is not available in the configured plugins.
- `src/hooks/useAIGuidance.ts` has lexical declarations inside case blocks.
- Several files have unused eslint-disable comments.
- Multiple files have no-useless-escape, prefer-const, and no-extra-boolean-cast issues.
- Many warnings are treated as failures because lint uses `--max-warnings 0`.

Targeted test blockers:

- Workflow state test expects `callback` but receives `booked`.
- Region identity test expects a specific `App.tsx` placement pattern that no longer exists.

## Firebase and Production Safety Findings

- `.firebaserc` default project is `amplify-leads-2026`, which must be treated as production-like.
- `firebase.json` deploys hosting from `dist`, Functions from `functions`, Firestore rules from `firestore.rules`, and Firestore indexes from `firestore.indexes.json`.
- `firebase.json` also rewrites `/docusignWebhook` to the `docusignWebhook` function.
- Root `package.json` includes `deploy: npm run build && firebase deploy --only hosting`.
- Functions `package.json` includes `deploy: firebase deploy --only functions`.
- Root release scripts can invoke `deploy.ps1`.
- These deploy-capable scripts are useful but should remain blocked without explicit approval and target confirmation.

## Function Entry Point Findings

The Functions surface is deployable and production-sensitive. The current index exports include auth/PIN, settings/admin, Salestrail, phone migration, DocuSign, stats, backup, notification, and follow-up surfaces.

Key risk:

- `functions/src/index.ts` calls `admin.initializeApp()` and `admin.firestore()` at module top-level.
- Project memory says not to call `admin.initializeApp()` or `admin.firestore()` at module top-level and to prefer lazy `getDb()` patterns.
- Some newer modules such as Salestrail, phone migration, and PIN verification use lazy initialisation patterns.
- This inconsistency should be resolved only after Functions callable tests and emulator validation are in place.

## Security Rule Findings

- `firestore.rules` correctly denies direct client read/write access to `salestrailCalls`.
- Many operational collections use broad `allow read, write: if canUseOperationalApp();`.
- This may be acceptable for the current anonymous-auth-plus-claims model, but it increases blast radius if a custom claim or client path is wrong.
- Before any production rules deployment, emulator tests should confirm expected access for leads, clients, users, app settings, Salestrail, audit logs, and admin-only paths.

## Migration and Import Findings

`scripts/firebase-leads-sheet-migration.mjs` is powerful and risky:

- Default mode is dry-run.
- It supports Firestore import, full-replace, backup-only, and live status normalisation modes.
- It requires `GOOGLE_APPLICATION_CREDENTIALS` for live Admin SDK use.
- It includes explicit confirmation flags for destructive modes.

This script should remain blocked from live execution until a dedicated migration goal provides:

- Backup/export proof.
- Dry-run report review.
- Duplicate handling validation.
- Rollback plan.
- Explicit written approval for the target project and mode.

## Salestrail Findings

Salestrail integration has meaningful guardrails but remains production-sensitive:

- `salestrailCalls` direct client access is denied by Firestore rules.
- Frontend actions should remain callable-only.
- Admin UI includes a live sync path using `{ dryRun: false }`.
- Dry-run and mocked/emulator callable validation must pass before any live test.
- A controlled live test must reconcile returned imported count to the actual `salestrailCalls` document count.

## Phone Normalisation Findings

Phone normalisation includes dry-run and live callable paths:

- Admin UI includes dry-run and `{ dryRun: false }` live backfill paths.
- Live write mode must remain blocked until count, samples, backup/export, explicit approval, and post-run reconciliation are complete.

## Performance and Bloat Findings

The codebase contains several very large files and large production chunks:

- `src/pages/Admin.tsx` is about 195 KB.
- `src/components/AIRoleplay.tsx` is about 116 KB.
- `src/components/SheetsSyncModal.tsx` is about 114 KB.
- `src/pages/DealDashboard.tsx` is about 105 KB.
- `src/pages/Map.tsx` is about 105 KB.
- `src/pages/ClientProfilePage.tsx` is about 103 KB.
- `src/components/DataTable.tsx` is about 100 KB.
- `src/hooks/useFirebase.ts` is about 78 KB.

Build output includes large chunks over 500 kB, including:

- Main app chunk over 1 MB before gzip.
- Document Centre chunk about 496 kB.
- PDF and map-related chunks that materially affect load performance.

The main risk is not just size. These files combine UI, workflow logic, integration calls, local state, and side effects, which makes refactoring and regression testing harder.

## Documentation Findings

- The new handbook and playbook are good foundations.
- Some in-app or code-adjacent documentation still references direct Firebase deploy commands.
- `src/lib/firebase.ts` prints a Firestore rules deployment suggestion in an error path.
- `src/data/knowledgeBase.ts` contains deployment command examples.
- These should be reviewed so user-facing and in-app documentation aligns with the stricter release approval model.

## Dependency Findings

No dependency installation or external dependency audit was performed. Static package review shows:

- `pdfjs-dist`, `jspdf`, `pdf-lib`, `@react-google-maps/api`, and `@googlemaps/markerclusterer` contribute to heavy feature areas and bundle risk.
- Root dev dependencies include `vitest`, but there is no root `npm test` script.
- Root dev dependencies include ESLint plugins, but `react/no-danger` is referenced without the corresponding plugin or rule availability.
- `firebase-admin` versions differ between root dev dependency and Functions dependency. Root uses `^14.1.0`; Functions uses `^13.0.2`.
- `protobufjs` is overridden to `7.6.4` in both root and Functions, which appears intentional and should remain documented.

## Naming and Structure Findings

- The nested mirror directory `asg_crm_react/asg_crm_react/` is a recurring source of audit and lint noise.
- Large feature files mix page, modal, domain, import, and persistence concerns.
- Naming across workflow states needs review because existing tests and actual behaviour disagree.
- Navigation remains page-key/tab based rather than route-component based, which is documented in project memory and should be preserved until an explicit routing goal.

## Foundation Readiness Decision

The codebase is ready for a documentation-led Foundation Audit close-out and a follow-up stabilisation goal.

The codebase is not ready for:

- Production release.
- Broad refactoring.
- UI redesign.
- Firebase deploy.
- Live Salestrail sync.
- Live phone backfill.
- Live Firebase leads migration.

## Recommended Next Goal

Recommended next goal: `fix/validation-baseline`

Objective:

- Restore the validation baseline without changing feature behaviour.
- Add missing standard scripts or update handbook commands to match project reality.
- Exclude or resolve nested mirror lint noise.
- Fix lint configuration blockers.
- Resolve the two failing targeted guardrail tests by either updating stale tests or fixing behaviour if the tests reveal real regressions.

Exit criteria:

- `npm run typecheck` exists and passes, or the handbook is updated with the approved project-specific replacement.
- `npm test` exists and passes, or the handbook is updated with the approved project-specific replacement.
- `npm run lint` passes or has an approved staged lint remediation plan with a temporary allowlist.
- `npm run test:workflow-state` passes.
- `npm run test:region-identity` passes.
- No Firebase deploy, production data write, migration, or live sync is performed.
