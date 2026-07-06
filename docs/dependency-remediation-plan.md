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

No dependency fix was applied in this review.

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
