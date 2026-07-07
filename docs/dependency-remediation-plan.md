# Dependency Remediation Plan

Date: 2026-07-06
Branch: `security/dependency-review`

## Objective

Remediate dependency advisories safely, one risk surface at a time, without broad automated fixes or unreviewed dependency churn.

## Non-Goals

- Do not run `npm audit fix --force`.
- Do not run broad `npm audit fix` inside release preparation.
- Do not deploy.
- Do not change Firebase project selection, rules, indexes, Functions exports, or production data.
- Do not run migrations, live Salestrail sync, or phone backfill writes.

## Remediation Principles

1. Separate runtime dependencies from dev tooling.
2. Prefer patch or minor updates inside the current major version where available.
3. Treat semver-major updates as planned upgrade goals.
4. Validate both root app and Functions after every dependency change.
5. Keep package changes separate from UI, workflow, Firebase rules, and release documentation work.
6. Never accept an audit fix that downgrades a Firebase package without explicit review.

## Stage 0 - Review Only

Status: complete in this goal.

Deliverables:

- `docs/dependency-security-review.md`
- `docs/dependency-remediation-plan.md`
- Updated project state, risk register, changelog, and known issues.

Validation:

- Root audit reviewed.
- Functions audit reviewed.
- Dependency paths reviewed.
- No package files changed.

## Stage 1 - PDF Runtime Remediation

Target:

- `jspdf`
- `dompurify` transitive path

Status: in progress on `security/pdf-dependency-remediation`.

Current result:

- `jspdf` updated from `4.2.0` to `4.2.1`, the smallest same-major patched version available from npm on 2026-07-06.
- The direct `jspdf` audit advisory no longer appears after the update.
- The root audit total reduced from 29 advisories to 28 advisories, with critical count reduced from 2 to 1.
- `dompurify@3.3.3` remained as a transitive moderate advisory under `jspdf` after the direct `jspdf` update.
- The DOMPurify transitive review updated the lockfile-only optional dependency to `dompurify@3.4.11`, which is inside `jspdf@4.2.1`'s declared `^3.3.1` optional dependency range.
- The root audit total reduced again from 28 advisories to 27 advisories, with moderate count reduced from 21 to 20.
- No `package.json` override was required and no PDF business logic was changed.
- Manual PDF validation is tracked in `docs/pdf-workflow-validation-checklist.md`.

Why first:

- `jspdf` is direct app runtime and has critical advisories.
- ASG CRM uses document and PDF workflows that may include CRM lead, client, and document data.

Proposed approach:

1. Create branch `security/pdf-dependency-remediation`.
2. Create tag `savepoint-before-pdf-dependency-remediation`.
3. Check available `jspdf` patched version and changelog.
4. Apply the smallest compatible update.
5. Validate PDF export, document centre, offer/acceptance document flows, and any print/download actions.
6. Run full validation.

Required validation:

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

Rollback:

```powershell
git switch security/pdf-dependency-remediation
git reset --hard savepoint-before-pdf-dependency-remediation
```

## Stage 2 - Firebase Web SDK Remediation

Target:

- Root `firebase`
- Transitive `undici`
- Transitive `@grpc/grpc-js` under Firebase paths

Status: partially complete on `security/firebase-web-sdk-remediation`.

Current result:

- Direct root Firebase SDK remains `firebase@10.14.1`.
- No same-major Firebase 10.x update was available during this goal because `10.14.1` was the latest Firebase 10.x version checked.
- Transitive `@grpc/grpc-js` under the root Firebase Firestore SDK path was updated from `1.9.15` to `1.9.16` through `package-lock.json`.
- The `@grpc/grpc-js` patch was allowed by Firestore's declared `~1.9.0` dependency range and did not require a direct root dependency.
- Root audit reduced from 27 advisories to 26 advisories, with high severity reduced from 5 to 4.
- Transitive `undici@6.19.7` remains under Firebase Auth, Firestore, Functions, and Storage because Firebase 10.14.1 pins that dependency exactly.
- Do not force an `undici` override without a separate Firebase compatibility review and emulator validation plan.

Undici compatibility review result:

- Reviewed on `security/firebase-undici-compatibility-review`.
- No package change was made.
- `undici@6.19.7` is exact-pinned by Firebase 10.14.1 Auth, Auth Compat, Firestore, Functions, and Storage packages.
- No stable Firebase 10.x patch or minor update exists beyond `10.14.1`.
- Firebase 11 and 12 package metadata removes the reviewed `undici` dependency paths, but those are semver-major Firebase web SDK upgrades and must be planned separately.
- The current Vite browser build did not contain `undici`, so direct browser bundle reachability was not found.
- Node, local tooling, audit, and emulator surfaces remain affected because the package is installed and used by Firebase node export conditions.
- `undici` overrides are not approved in this stage because they would override exact Firebase dependency declarations and change Firebase's Node/emulator transport surface outside the published Firebase 10 compatibility set.

Why separate:

- Firebase touches authentication, Firestore listeners, callable Functions, Storage, emulator tests, and app startup.

Proposed approach:

1. Create branch `security/firebase-web-sdk-remediation`.
2. Review Firebase release notes for the target version.
3. Update within the safest compatible version range.
4. Validate login, PIN callable paths, lead reads/writes in emulator, app settings access, and Storage import boundaries.
5. Confirm emulator project remains `demo-asg-crm-emulator`.

Required validation:

- Full root validation.
- Full emulator suite.
- Manual smoke review of login, lead list, lead details, settings, and document workflows if app code behaviour changes.

Next safe path:

1. Create a dedicated Firebase 11 or 12 upgrade branch.
2. Review Firebase migration notes and peer dependencies, including `@firebase/rules-unit-testing`.
3. Upgrade only Firebase web SDK and matching test tooling dependencies needed for compatibility.
4. Run full validation, emulator suite, callable dry-run, and manual smoke checks for login, leads, settings, Storage/document workflows, and offline cache behaviour.
5. Do not deploy until human review accepts the major SDK upgrade risk.

Major upgrade planning result:

- Planning completed on `plan/firebase-web-sdk-major-upgrade`.
- Current npm metadata identifies `firebase@12.15.0` as the safest current target major for the future implementation branch.
- Current npm metadata identifies `@firebase/rules-unit-testing@5.0.1` as the matching test package line because it peers on `firebase@^12.0.0`.
- Planning docs:
  - `docs/firebase-web-sdk-major-upgrade-plan.md`
  - `docs/firebase-web-sdk-upgrade-risk-register.md`
- Recommendation: run after v1.0 unless the release owner decides the deferred Firebase `undici` advisory blocks v1.0.
- No package files were changed during planning.

## Stage 3 - Functions Runtime Remediation

Target:

- `functions/firebase-admin`
- Transitive `@grpc/grpc-js`
- Transitive `form-data`
- Transitive `fast-xml-builder`
- Google Cloud library paths

Why separate:

- This affects deployable Firebase Functions and server-authoritative callables.

Proposed approach:

1. Create branch `security/functions-dependency-remediation`.
2. Review Firebase Admin SDK and Firebase Functions SDK compatibility for Node 22.
3. Apply the smallest compatible Admin SDK update.
4. If `firebase-functions` update is needed, plan it separately and confirm callable signatures.
5. Run callable emulator dry-run and settings/admin tests.
6. Do not deploy Functions without explicit approval.

Required validation:

```powershell
npm run typecheck
npm run test:emulator:callables-dry-run
cd functions
npm run build
npm run test:settings-admin
cd ..
```

Additional checks:

- `setPin`
- `changePin`
- settings/admin mutation callables
- phone normalisation dry-run only
- Salestrail source-contract checks only

## Stage 4 - Dev Tooling Remediation

Target:

- `vite`
- `vitest`
- `postcss`
- `flatted`
- `picomatch`
- Babel tooling paths

Why later:

- Vite and Vitest fixes are semver-major.
- Tooling changes can affect build, test execution, emulator commands, and generated release metadata.

Proposed approach:

1. Create branch `security/tooling-dependency-remediation`.
2. Start with patch-level `postcss` if available and compatible.
3. Plan Vite and Vitest major upgrades together only if the plugin and test runner migration is understood.
4. Update scripts and tests only where compatibility requires it.
5. Keep production app behaviour unchanged.

Required validation:

- Full root validation.
- Full emulator suite.
- Functions build and settings/admin test.
- Verify `npm run build` still generates expected chunks and release metadata.

## Stage 5 - Audit Closure

Target:

- Re-run root `npm audit`.
- Re-run Functions `npm audit`.
- Update `docs/RISK_REGISTER.md`, `docs/KNOWN_ISSUES.md`, `PROJECT_STATE.md`, and release docs.

Exit criteria:

- Critical and high runtime advisories are remediated or explicitly risk-accepted.
- Dev-tooling advisories are remediated or controlled with local-only exposure notes.
- Validation passes after every package change.
- Human release owner confirms whether remaining advisories block production.

## Safe Fixes Identified

The direct `jspdf` fix was applied in `security/pdf-dependency-remediation` by updating to `4.2.1`.

Potential low-risk candidates for isolated remediation:

- Patch-level `postcss` update, if it remains within the current major version and validation passes.
- Patch or minor Firebase SDK updates, if release notes confirm compatibility and emulator validation passes.

These are candidates only, not approvals.

## Risky Fixes Deferred

| Fix | Reason deferred |
| --- | --- |
| `vitest@4.1.10` | Semver-major test runner upgrade from `1.6.1`; may require harness changes. |
| `vite@8.1.3` | Semver-major build tool upgrade from resolved `5.4.21`; may affect React plugin, build output, dev server, and emulator-adjacent scripts. |
| `firebase-admin` automated root fix to `10.3.0` | Audit suggests a semver-major version that is not an obvious forward update for the root package. Needs manual review. |
| Functions `firebase-admin@14.1.0` | Semver-major from Functions declared `^13.0.2`; affects deployable backend runtime. |
| Broad `npm audit fix` | Could combine runtime, tooling, Firebase, and Functions changes in one hard-to-review diff. |

## Production Release Gate

Before production release, complete one of these:

1. Remediate critical and high runtime advisories with full validation.
2. Obtain explicit release-owner risk acceptance with compensating controls and a dated remediation deadline.

Production Firebase deploys remain blocked until the normal release approval process is completed.
