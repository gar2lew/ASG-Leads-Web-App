# Functions Runtime Dependency Remediation Plan

Date: 2026-07-07
Branch: `plan/functions-runtime-dependency-remediation`
Savepoint: `savepoint-before-functions-runtime-dependency-remediation-plan`

## Objective

Plan a safe remediation path for Firebase Functions runtime dependency advisories without changing Functions packages in this goal.

## Scope

- Review `functions/npm audit` findings.
- Identify direct and transitive advisory sources.
- Identify runtime exposure across deployed Functions exports.
- Define the safest remediation order.
- Define validation, rollback, and release timing.

## Non-Goals

- Do not change `functions/package.json`.
- Do not change `functions/package-lock.json`.
- Do not run `npm install` in `functions`.
- Do not deploy Functions.
- Do not change Firebase config, Firestore rules, project selection, production data, migrations, Salestrail live sync, or phone backfill writes.

## Current Functions Dependency State

Observed from `functions/package.json`, `npm audit`, `npm outdated`, and `npm ls` on 2026-07-07.

| Package | Current | Wanted | Latest | Role |
| --- | --- | --- | --- | --- |
| `firebase-admin` | `13.7.0` | `13.10.0` | `14.1.0` | Direct Functions runtime dependency |
| `firebase-functions` | `6.6.0` | `6.6.0` | `7.2.5` | Direct Functions runtime dependency |
| `typescript` | `5.9.3` | `5.9.3` | `6.0.3` | Functions build tooling |

Important package metadata:

- `firebase-admin@14.1.0` requires Node `>=22`.
- This Functions package declares Node `22`, so the latest Admin SDK major line matches the declared runtime engine.
- `firebase-functions@7.2.5` peers on `firebase-admin` `^11.10.0 || ^12.0.0 || ^13.0.0`, so it does not currently advertise Firebase Admin SDK 14 as a peer-compatible line.
- This means Admin SDK and Functions SDK upgrade sequencing must be deliberate rather than bundled blindly.

## Audit Summary

`cd functions && npm audit` reports 16 advisories:

| Severity | Count |
| --- | ---: |
| Critical | 0 |
| High | 3 |
| Moderate | 12 |
| Low | 1 |

## Advisory Source Map

| Advisory source | Severity | Direct or transitive | Current path | Runtime exposure | Fix signal |
| --- | --- | --- | --- | --- | --- |
| `firebase-admin` | Moderate | Direct | `functions` to `firebase-admin@13.7.0` to `@google-cloud/firestore@7.11.6` | All server-authoritative Firestore, Auth, and Storage usage | npm suggests `firebase-admin@14.1.0`, semver-major from declared `^13.0.2` |
| `@grpc/grpc-js` | High | Transitive | `firebase-admin` to `@google-cloud/firestore` to `google-gax` to `@grpc/grpc-js@1.14.3` | Firestore transport used by deployed callables and scheduled jobs | Patch requires dependency graph refresh, likely through Admin SDK update |
| `form-data` | High | Transitive | `firebase-admin` to `@google-cloud/storage` to `retry-request` to `@types/request` to `form-data@2.5.5` | Storage and Google request helper surface, most relevant to document and DocuSign paths | Patch requires dependency graph refresh, likely through Admin SDK or Google package updates |
| `fast-xml-builder` | High | Transitive | `firebase-admin` to `@google-cloud/storage` to `fast-xml-parser` to `fast-xml-builder@1.1.4` | Storage XML parsing surface, most relevant to document and DocuSign paths | Patch requires dependency graph refresh |
| `google-gax` | Moderate | Transitive | `firebase-admin` to `@google-cloud/firestore` to `google-gax@4.6.1` | Firestore transport | npm links remediation to `firebase-admin@14.1.0` |
| `@google-cloud/firestore` | Moderate | Transitive | `firebase-admin` optional dependency | Firestore Admin SDK path for most backend work | npm links remediation to `firebase-admin@14.1.0` |
| `@google-cloud/storage` | Moderate | Transitive | `firebase-admin` optional dependency | Storage Admin SDK path for document workflows | Fix available, but should not be forced separately without Admin SDK compatibility proof |
| `firebase-functions` ecosystem | Moderate | Direct runtime package is outdated | `firebase-functions@6.6.0`, latest `7.2.5` | All callable, request, scheduled, and Firestore-trigger wrappers | Separate compatibility review required because peer metadata does not include Admin SDK 14 |

## Deployed Runtime Surface

The following exported or deployable Functions surfaces are affected by any backend runtime package update:

| Surface | Exports or modules | Exposure notes |
| --- | --- | --- |
| PIN and auth callables | `verifyPin`, `setPin`, `changePin`, `verifyBackupPassword`, `migrateAuthFields` | Auth boundary and Firestore read/write compatibility must remain unchanged. Plaintext PIN fallback remains intentionally preserved until migration is complete. |
| Settings and admin callables | `appendAuditEvent`, `updateAppSettingsCallable`, `rollbackAppSettingsCallable` | Server-authoritative admin writes and audit history require strict role checks and timestamp compatibility. |
| Phone normalisation callable | `backfillPhoneNormalization` | Must remain dry-run-first. `dryRun:false` remains blocked without explicit approval. |
| Salestrail callables | `syncSalestrailCallsCallable`, `getSalestrailConfig`, `updateSalestrailConfig`, `resetSalestrailSyncLock` | Dry-run and config paths must stay no-production-data and no-live-sync unless approved. Secret names must not be printed. |
| DocuSign callables and webhook | `createDocuSignEnvelope`, `resendDocuSignEnvelope`, `voidDocuSignEnvelope`, `syncEnvelopeStatus`, `docusignWebhook` | Uses HTTPS, Firestore, Storage, external API calls, and webhook handling. Storage dependency changes are especially relevant. |
| SMSF financials callables | `saveSmsfFinancials`, `getSmsfFinancials` | Uses secrets, Firestore, and encryption helpers. Must not expose secret values or weaken auth. |
| Scheduled and triggered reporting | `aggregateDailyStats`, `sendDailyReportNotification`, `followUpEngine`, `onDailyStatsWritten` | Scheduler and Firestore trigger compatibility must be checked in build and emulator where practical. |
| Notification callables | `sendPushNotification`, `triggerPerfAlert` | Existing auth hardening risks remain separate from dependency remediation. |
| Property insights placeholder | `getPropertyInsights` | Existing callable auth risk remains separate from dependency remediation. |

## Compatibility Risks By Package

### `firebase-admin`

Risk level: High.

Reasons:

- The audit remediation points to `firebase-admin@14.1.0`, a semver-major update.
- Firestore, Auth, Storage, FieldValue, Timestamp, batch writes, and emulator behaviour can all change.
- Previous emulator work found Admin SDK timestamp compatibility issues, so sentinel usage needs focused regression checks.

Expected validation:

- Functions TypeScript build.
- PIN callable emulator coverage for `setPin` and `changePin`.
- Settings/admin mutation tests.
- Callable dry-run harness.
- Firestore smoke and rules harness.
- Manual or automated check of DocuSign storage paths if package changes affect Storage.

### `firebase-functions`

Risk level: High.

Reasons:

- Latest available line is `7.2.5`, a semver-major update from `6.6.0`.
- It wraps all `onCall`, `onRequest`, `onSchedule`, and Firestore trigger exports.
- Callable request and emulator behaviour may change.
- Current `firebase-functions@7.2.5` peer metadata does not include `firebase-admin@14.x`, so upgrading both at once could create peer ambiguity.

Expected validation:

- Full Functions build.
- Callable dry-run harness startup.
- Emulator callable host detection.
- PIN, settings/admin, phone dry-run, and Salestrail source-contract tests.
- Scheduler and trigger compile checks.

## Recommended Remediation Path

1. Keep this goal documentation-only.
2. Create a dedicated implementation branch for Functions runtime packages.
3. Do not run broad `npm audit fix`.
4. Test `firebase-functions` and `firebase-admin` upgrades as separate commits at minimum, and preferably separate PRs unless peer compatibility forces a combined plan.
5. Start with `firebase-functions` only if the goal is to remove emulator SDK warnings and confirm wrapper compatibility.
6. Start with `firebase-admin` only if the goal is to remediate the current high runtime advisory paths.
7. Do not deploy Functions after package changes until human release approval is granted.

Recommended sequence:

| Step | Action | Reason |
| --- | --- | --- |
| 1 | Create `security/functions-runtime-dependency-remediation` | Keeps package changes isolated from planning and release docs. |
| 2 | Review Firebase release notes for Admin SDK 13.10.0, Admin SDK 14.1.0, and Functions SDK 7.2.5 | Confirms breaking changes before package edits. |
| 3 | Trial `firebase-admin@13.10.0` in a local branch if audit data shows same-major improvement | Same-major update may reduce some risk, but audit currently points to major `14.1.0`. |
| 4 | Trial `firebase-admin@14.1.0` only with full emulator and Functions validation | This is the likely path to address Admin SDK transitive advisories. |
| 5 | Trial `firebase-functions@7.2.5` separately | This removes SDK staleness risk but may not resolve the Admin SDK audit surface. |
| 6 | Resolve peer or emulator issues explicitly | Do not mask peer warnings or weaken tests. |
| 7 | Update docs and request review before any Functions deploy | Runtime package changes affect production callables. |

## Should `firebase-functions` Be Upgraded Separately?

Yes, by default.

Rationale:

- `firebase-admin` is the path npm audit names for the current Functions runtime advisories.
- `firebase-functions` controls callable and trigger wrappers, emulator behaviour, and deploy packaging.
- `firebase-functions@7.2.5` does not currently list `firebase-admin@14.x` in peer metadata, so the two packages should not be combined casually.
- Separate upgrade commits or branches make rollback and failure diagnosis cleaner.

Exception:

- If Firebase release notes or npm peer requirements prove that a specific Admin SDK and Functions SDK pair must move together, document that pairing first, then validate it as a single backend runtime upgrade.

## Emulator Compatibility Expectations

Expected risks:

- Callable emulator startup may change after `firebase-functions` upgrade.
- Callable request auth context shape must remain compatible with `requireAuth(request)`.
- Secret handling for `defineSecret` must not require real secrets during dry-run tests.
- Admin SDK Firestore emulator transport may change after `firebase-admin` upgrade.
- Scheduler and Firestore trigger wrappers may compile but still need emulator or manual release validation.

Required emulator checks for future implementation:

```powershell
npm run test:emulator:preflight
npm run test:emulator:rules
npm run test:emulator:firestore-smoke
npm run test:emulator:callables-dry-run
```

## Required Validation For Future Package Change

Run after every logical package-change commit:

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
npm audit
npm run build
npm run test:settings-admin
cd ..
git diff --check
```

Additional focused checks:

- Confirm PIN `setPin`, `changePin`, and `verifyPin` emulator paths still enforce auth.
- Confirm settings/admin mutations still require admin authority.
- Confirm phone normalisation remains dry-run-first and does not run with `dryRun:false`.
- Confirm Salestrail tests do not call the live API and do not require real secrets.
- Confirm DocuSign webhook and envelope code still builds and does not print secrets.
- Confirm SMSF financials callables still require secrets without exposing values.
- Confirm scheduled/reporting functions compile under the target SDK versions.

## Rollback Strategy

For this planning branch:

```powershell
git switch plan/functions-runtime-dependency-remediation
git reset --hard savepoint-before-functions-runtime-dependency-remediation-plan
```

For a future implementation branch:

```powershell
git switch security/functions-runtime-dependency-remediation
git reset --hard savepoint-before-functions-runtime-dependency-remediation
```

If a package-change branch has already been merged but not deployed:

```powershell
git revert <merge-commit>
```

If a package-change branch has been deployed:

- Stop and use the approved release rollback runbook.
- Do not redeploy Functions without explicit release approval.
- Verify Firebase project selection before any rollback deployment command.

## Release Timing Recommendation

Recommended timing: after v1.0 unless the release owner decides unresolved Functions advisories block v1.0 or a Functions deployment is required for v1.0.

Reasoning:

- The current v1.0 candidate is documentation and validation heavy, but production deployment remains blocked pending human go/no-go, staff UAT, backup/recovery rehearsal, and Firebase approval.
- Functions runtime upgrades affect all backend callables and scheduled jobs.
- If no Functions deployment is planned before v1.0, risk can be accepted temporarily with a dated remediation target.
- If a Functions deployment is planned before v1.0, remediate or explicitly accept the Functions runtime advisory risk before that deploy.

## Current Decision

No package changes are approved by this plan.

The safe next implementation goal is:

`Reach Goal: Functions Runtime Dependency Remediation`

with package changes isolated to `functions/package.json` and `functions/package-lock.json`, full emulator validation, and no Firebase deploy.
