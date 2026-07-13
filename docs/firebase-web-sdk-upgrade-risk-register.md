# Firebase Web SDK Upgrade Risk Register

Date: 2026-07-07
Scope: Future upgrade from root `firebase@10.14.1` to Firebase 12.

## Summary

The Firebase web SDK major upgrade is security-motivated by the remaining Firebase `undici` audit surface, but it is not a narrow patch. It affects login, Firestore reads and writes, callable Functions, Storage, messaging, emulator tests, bundle output and release confidence.

Recommended timing: after v1.0 unless the release owner refuses to accept the deferred `undici` risk.

## Risks

| ID | Risk | Area | Likelihood | Impact | Mitigation | Gate |
| --- | --- | --- | --- | --- | --- | --- |
| FWS-001 | Firebase 12 changes Auth timing or anonymous sign-in behaviour. | Auth | Medium | High | Test session restore, PIN verify, PIN setup, PIN change and custom-claim refresh in emulator. | Auth smoke complete |
| FWS-002 | Rules test package peer mismatch breaks emulator rules tests. | Tests | High | High | Upgrade `@firebase/rules-unit-testing` with Firebase and rerun rules harness. | Rules suite passing |
| FWS-003 | Firestore persistent local cache initialisation changes behaviour. | Firestore | Medium | High | Verify `persistentLocalCache()` startup, offline queue behaviour and listener recovery. | Local cache smoke complete |
| FWS-004 | Firestore query validation becomes stricter. | Firestore | Medium | High | Run typecheck, build, emulator rules, Firestore smoke and manual lead/report/listener checks. | Firestore smoke complete |
| FWS-005 | Callable Functions client errors or emulator connection behaviour changes. | Functions | Medium | High | Run callable dry-run harness and settings/admin tests. | Callable dry-run passing |
| FWS-006 | Salestrail dry-run source contract is accidentally bypassed during callable validation. | Salestrail | Low | Critical | Keep source-contract checks. Do not call live Salestrail API. | No live API evidence |
| FWS-007 | Phone normalisation dry-run becomes writable by mistake. | Backfill | Low | Critical | Confirm `dryRun:true` only and no lead/audit writes in harness. | Dry-run reconciliation |
| FWS-008 | Storage helper behaviour changes. | Storage | Medium | Medium | Test safe upload, download URL and delete flows outside production data. | Storage smoke complete |
| FWS-009 | Messaging dynamic import or service worker compatibility changes. | Messaging | Medium | Medium | Test supported and unsupported browser paths. Confirm failures are non-blocking. | Messaging smoke complete |
| FWS-010 | Vendor chunk size changes materially. | Build | High | Medium | Compare Vite chunk output before and after upgrade. | Bundle review complete |
| FWS-011 | Root audit introduces new Firebase 12 advisories. | Security | Medium | Medium | Run `npm audit` after upgrade and update dependency docs. | Audit reviewed |
| FWS-012 | Generated release metadata drifts during build validation. | Release | High | Low | Inspect and restore generated metadata when not intended. | Diff reviewed |
| FWS-013 | Future implementation accidentally includes Functions Admin SDK changes. | Backend | Medium | High | Stage only root package files and docs. Keep Functions package files out of scope. | Diff scoped |
| FWS-014 | Production Firebase project is used during validation. | Release safety | Low | Critical | Use demo emulator project and do not deploy. Inspect `.firebaserc` only if needed. | No production writes |
| FWS-015 | v1.0 release timeline absorbs a major SDK regression. | Release | Medium | High | Prefer post-v1.0 timing unless advisory acceptance is rejected. | Release owner decision |

## Blocked Actions

- Do not run `firebase deploy`.
- Do not modify Firebase config or Firestore rules.
- Do not change Functions Admin SDK in the same goal.
- Do not run migrations.
- Do not run Salestrail live sync.
- Do not run phone normalisation with `dryRun:false`.
- Do not use production data for validation.
- Do not force `undici` overrides without explicit approval.

## Required Evidence Before Merge

- Root package diff only includes planned Firebase web SDK and rules test package changes.
- `undici` path is gone from `npm explain undici` or is fully documented if retained.
- All automated validation passes.
- Manual smoke checks are recorded.
- Risk register and known issues are updated.
- Human release owner confirms timing relative to v1.0.

## Recommendation

Treat this as a controlled dependency migration, not a routine security patch.

The safest route is a dedicated post-v1.0 branch with Firebase 12 and matching rules-unit-testing updates, full emulator validation, and manual smoke evidence before any production approval.
