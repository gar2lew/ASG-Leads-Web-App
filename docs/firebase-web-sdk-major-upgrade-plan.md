# Firebase Web SDK Major Upgrade Plan

Date: 2026-07-07
Branch: `plan/firebase-web-sdk-major-upgrade`
Savepoint: `savepoint-before-firebase-web-sdk-major-upgrade-plan`

## Objective

Plan a safe future upgrade of the root ASG CRM Firebase web SDK from resolved `firebase@10.14.1` to the safest current major version that removes the remaining Firebase `undici` advisory surface.

This is a planning document only. No package files, Firebase config, Firestore rules, production data, migrations, Salestrail sync, phone backfill writes, or deploy commands were changed or run in this goal.

## Current Package Position

| Package | Current project state | Current npm metadata checked |
| --- | --- | --- |
| Root `firebase` range | `^10.8.0` in `package.json` | Latest npm package is `firebase@12.15.0` |
| Root resolved Firebase SDK | `firebase@10.14.1` in `package-lock.json` | Firebase 10.14.1 is the final stable 10.x line found in npm metadata |
| Rules test package | `@firebase/rules-unit-testing@^3.0.4` | Latest `@firebase/rules-unit-testing@5.0.1` peers on `firebase@^12.0.0` |
| Current risk path | Firebase 10 subpackages exact-pin `undici@6.19.7` | Firebase 12 metadata no longer lists `undici` in the reviewed Auth, Firestore, Functions, and Storage subpackages |

Reference sources checked:

- Firebase JavaScript SDK release notes: https://firebase.google.com/support/release-notes/js
- Firebase npm package metadata: https://www.npmjs.com/package/firebase
- Local npm metadata command: `npm view firebase version engines dependencies --json`
- Local npm metadata command: `npm view @firebase/rules-unit-testing version peerDependencies dependencies --json`

## Recommendation

Target `firebase@12.15.0` and matching `@firebase/rules-unit-testing@5.0.1` in a future implementation branch.

Do not upgrade to Firebase 11 as an intermediate step unless Firebase 12 validation reveals a specific blocker. Firebase 12 is the current major line, it removes the reviewed `undici` package paths, and the rules testing peer dependency has a current Firebase 12-compatible release.

## v1.0 Timing Recommendation

Run this upgrade after v1.0 unless the release owner decides the remaining Firebase `undici` advisory blocks v1.0.

Reasoning:

- The current browser build did not contain `undici` in `dist/assets`.
- The remaining `undici` exposure is Node, audit, local tooling, and emulator package surface rather than confirmed shipped browser runtime.
- Firebase 12 is a major dependency upgrade across auth, Firestore, Functions, Storage, messaging, rules-unit-testing, and emulator tests.
- v1.0 is already a release candidate with staff UAT, backup/recovery rehearsal, PR merge state, and production approval still outstanding.
- A major SDK upgrade before v1.0 would expand regression risk in login, lead reads/writes, offline cache, callable Functions, Storage document workflows, and emulator harnesses.

If v1.0 must ship with no high root audit advisories, this plan should become a blocking pre-v1.0 implementation goal with full manual smoke testing and human release approval.

## Firebase Usage Inventory

Primary Firebase web setup:

- `src/lib/firebase.ts`
  - `initializeApp`
  - `initializeFirestore`
  - `persistentLocalCache`
  - `getStorage`
  - `getAuth`
  - `signInAnonymously`
  - `onAuthStateChanged`
  - `getFunctions`

Auth surfaces:

- `src/lib/firebase.ts`
- `src/hooks/useFirebaseAuthUser.ts`
- `src/pages/Admin.tsx`
- `scripts/test-callable-emulator-dry-run-harness.cjs`

Firestore surfaces:

- `src/hooks/useFirebase.ts`
- `src/hooks/useAppSettings.ts`
- `src/hooks/useClientNotes.ts`
- `src/hooks/useDashboard.ts`
- `src/hooks/useDailyStats.ts`
- `src/hooks/useTrainingLibrary.ts`
- `src/hooks/useOfflineQueue.ts`
- `src/pages/Leads.tsx`
- `src/pages/ClientProfilePage.tsx`
- `src/pages/DealDashboard.tsx`
- `src/pages/DealPipeline.tsx`
- `src/pages/PIA.tsx`
- `src/pages/SMSF.tsx`
- `src/pages/ReportsDashboard.tsx`
- `src/pages/TeamChat.tsx`
- `src/pages/TrainingHub.tsx`
- `src/components/LeadSidebar.tsx`
- `src/components/SystemSettingsPanel.tsx`
- `src/components/SettingsHistoryPanel.tsx`
- `src/components/OADocumentEditor/*`
- `src/components/client/FinancialReportsTab.tsx`
- `src/services/learningService.ts`
- `src/services/userProfileService.ts`
- `scripts/test-emulator-firestore-smoke.cjs`
- `scripts/test-firestore-rules-harness.cjs`

Functions callable surfaces:

- `src/App.tsx`
- `src/lib/settingsService.ts`
- `src/hooks/useDocuSign.ts`
- `src/pages/SMSF.tsx`
- `src/components/SystemSettingsPanel.tsx`
- `scripts/test-callable-emulator-dry-run-harness.cjs`

Storage surfaces:

- `src/lib/storage.ts`
- `src/lib/piaReports.ts`
- document upload, lead file, PIA, PDF and form workflows that call those helpers

Messaging surface:

- `src/hooks/useNotifications.ts`
- Dynamic import of `firebase/messaging`
- Service worker: `public/firebase-messaging-sw.js`

Emulator and test surfaces:

- `scripts/test-emulator-preflight.cjs`
- `scripts/test-emulator-firestore-smoke.cjs`
- `scripts/test-firestore-rules-harness.cjs`
- `scripts/test-callable-emulator-dry-run-harness.cjs`
- Root scripts:
  - `npm run test:emulator:preflight`
  - `npm run test:emulator:rules`
  - `npm run test:emulator:firestore-smoke`
  - `npm run test:emulator:callables-dry-run`

Risky live-data scripts:

- `src/scripts/backfillRegion.ts`
- `scripts/firebase-leads-sheet-migration.mjs`

These must not be run against production as part of the future SDK upgrade.

## Affected Areas

| Area | Upgrade impact |
| --- | --- |
| Auth | Anonymous sign-in, PIN login, custom-claim refresh, `onAuthStateChanged`, admin password reset, emulator Auth connection. |
| Firestore | Persistent local cache, live listeners, query constraints, batched writes, timestamp handling, count queries, offline queue behaviour, rules harness. |
| Functions | Callable invocation, callable error mapping, emulator host connection, PIN/settings/Salestrail/phone dry-run callables. |
| Storage | Upload, download URL, delete, blob retrieval, document workflows, PIA report storage. |
| Messaging | Dynamic import, browser support detection, service worker compatibility, token retrieval. |
| Tests | Rules-unit-testing peer must move with Firebase 12. Emulator harness imports must still work under ESM/CJS boundaries. |
| Build | Vite bundling and manual chunks may change. Firebase vendor chunk size should be compared before and after. |

## Compatibility Risks

1. `@firebase/rules-unit-testing` must be upgraded with Firebase 12 because the current `3.0.4` package peers on Firebase 10.
2. Persistent local cache initialisation may have changed behaviour or warnings between Firebase 10 and 12.
3. Callable Functions client error shapes may differ enough to affect PIN, settings, Salestrail dry-run and phone dry-run harnesses.
4. Auth emulator and anonymous sign-in timing may affect session restoration and PIN claim refresh.
5. Firestore query validation may become stricter for existing compound query patterns.
6. Vite may select different Firebase browser exports and alter chunk output.
7. Messaging support checks may change for unsupported browsers.
8. Root audit may improve for `undici`, but other transitive advisories may appear after the upgrade.
9. Existing release metadata generation during build can create generated drift and must be inspected after validation.

## Future Implementation Plan

1. Create branch `security/firebase-web-sdk-major-upgrade`.
2. Create tag `savepoint-before-firebase-web-sdk-major-upgrade`.
3. Confirm clean tree.
4. Update only root Firebase web SDK dependencies:
   - `firebase` to `12.15.0` or the current reviewed Firebase 12 patch at implementation time.
   - `@firebase/rules-unit-testing` to a Firebase 12-compatible version, currently `5.0.1`.
5. Do not change Functions Admin SDK in the same goal.
6. Run `npm install` only in the implementation goal.
7. Inspect `package-lock.json` for removed `undici` paths.
8. Run automated validation.
9. Run manual smoke checks listed below.
10. Update dependency docs with audit results.
11. Commit only package files and documentation required for the upgrade.

## Required Automated Validation

```powershell
npm audit
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

Expected audit result:

- The Firebase `undici` advisory should disappear from the root audit.
- Any new advisories introduced by Firebase 12 must be documented before merge.

## Required Manual Smoke Checks

Use emulator or non-production data only unless production release approval is explicitly granted.

1. App starts without Firebase initialisation errors.
2. Anonymous Auth session starts.
3. PIN verify flow works.
4. PIN set and change flows work in emulator.
5. Lead list loads and filters by region.
6. Lead detail updates preserve current workflow behaviour.
7. App settings load and settings/admin callables work in emulator.
8. Firestore listeners update dashboard, leads, client notes and settings views.
9. Storage upload/download helpers still work in a safe test bucket or emulator-supported path.
10. Messaging unsupported-browser paths remain non-breaking.
11. Callable dry-run harness confirms Salestrail live API path is not invoked.
12. Phone normalisation dry-run remains read-only.

## Rollback Strategy

Rollback future implementation branch:

```powershell
git switch security/firebase-web-sdk-major-upgrade
git reset --hard savepoint-before-firebase-web-sdk-major-upgrade
```

If already merged, prefer a revert commit rather than force-moving history:

```powershell
git switch codex-foundation
git revert <merge-commit>
```

Operational rollback:

- Do not deploy a Firebase 12 build until all validation passes and human approval is recorded.
- If a preview or local build fails, abandon the branch and keep v1.0 release work on the existing Firebase 10 baseline.
- If a production deployment has happened after explicit approval and Firebase 12 causes runtime issues, redeploy the last approved hosting build and do not deploy Functions or rules unless the release owner approves.

## Open Approval Gates

- Release owner must decide whether Firebase 12 upgrade is required before v1.0.
- Engineering must approve whether Firebase 12 and rules-unit-testing 5 move together.
- QA must approve manual smoke evidence for auth, Firestore, Functions, Storage, and emulator paths.
- Release manager must confirm no production Firebase deploy happens from the upgrade branch without explicit go/no-go.

## Exit Criteria For Future Upgrade

- Root audit no longer reports Firebase `undici` paths.
- Typecheck, lint, test, build, emulator suite, callable dry-run, Functions build and settings/admin tests pass.
- Manual smoke checks are recorded.
- No Firebase config, rules, project selection, production data, migration, Salestrail live sync or phone backfill writes were changed without approval.
- Risk register, known issues, project state and changelog are updated with actual results.
