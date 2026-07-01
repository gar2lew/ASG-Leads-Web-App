# Deployment Reconciliation — 8 Orphaned Functions

**Date**: 2026-06-17
**Risk Level**: **CRITICAL** — deploying current `feature/salestrail-epic1` branch would DELETE production auth.

---

## Current vs Deployed: `functions/src/index.ts` Export Diff

### Exports in deployed (`9f03c02`) but MISSING from current branch

```
export { verifyPin, setPin, changePin, verifyBackupPassword } from "./auth/verifyPin";
export { migrateAuthFields } from "./migrateAuthFields";
export {
  createLeadSnapshotCallable,
  restoreLeadSnapshotCallable,
  deleteLeadSnapshotCallable,
} from "./leadSnapshots";
// export { aggregateDailyStatsOptimized as aggregateDailyStats } from "./aggregateStats"; (commented out)
```

### Exports in deployed (`9f03c02`) AND present in current branch

```
export { onDailyStatsWritten } from "./notifications";
export { createDocuSignEnvelope, docusignWebhook, resendDocuSignEnvelope, voidDocuSignEnvelope, syncEnvelopeStatus };
export * from "./smsfFinancials";
export { followUpEngine } from "./followups";
export { appendAuditEvent } from "./audit";
export { updateAppSettingsCallable, rollbackAppSettingsCallable } from "./settingsAdmin";
```

### Exports ADDED by current branch (not in deployed)

```
export { backfillPhoneNormalization } from "./phoneMigration";
export { syncSalestrailCallsCallable, getSalestrailConfig, updateSalestrailConfig, resetSalestrailSyncLock } from "./salestrail";
```

---

## What Happens If We Deploy From Current Branch

| Effect | Severity |
|--------|----------|
| `verifyPin` deleted | **CRITICAL** — No rep can log in |
| `setPin` deleted | **CRITICAL** — New reps cannot set PIN |
| `changePin` deleted | **HIGH** — Reps cannot change PIN |
| `verifyBackupPassword` deleted | **HIGH** — PIN recovery broken |
| `createLeadSnapshotCallable` deleted | **MEDIUM** — No lead backups before imports |
| `restoreLeadSnapshotCallable` deleted | **MEDIUM** — Cannot restore backed-up leads |
| `deleteLeadSnapshotCallable` deleted | **LOW** — Old snapshots become orphans |
| `migrateAuthFields` deleted | **LOW** — If migration already complete |
| New Salestrail functions added | **OK** — These are additive |
| `backfillPhoneNormalization` added | **OK** — Already deployed, works |
| `docusign.ts` diverged | **MEDIUM** — 10 lines differ between branches |

---

## Reconciliation Plan

### Step 1: Import missing source files

```bash
git checkout stable-post-hardening -- \
  functions/src/auth/verifyPin.ts \
  functions/src/leadSnapshots.ts \
  functions/src/migrateAuthFields.ts \
  functions/src/aggregateStats.ts
```

### Step 2: Merge `index.ts` exports

Add the deployed exports alongside the new ones:

```typescript
// ── Auth ──
export { verifyPin, setPin, changePin, verifyBackupPassword } from "./auth/verifyPin";

// ── Auth Migration ──
export { migrateAuthFields } from "./migrateAuthFields";

// ── Lead Snapshots ──
export {
  createLeadSnapshotCallable,
  restoreLeadSnapshotCallable,
  deleteLeadSnapshotCallable,
} from "./leadSnapshots";
```

### Step 3: Resolve docusign.ts divergence

The deployed `docusign.ts` differs from the current branch by 10 lines. Review the diff and merge:

```bash
git diff e94766b..9f03c02 -- functions/src/docusign.ts
```

Likely changes: the deployed version may have had the lazy `getJwt()` fix from the earlier session. The current branch's `docusign.ts` is from the original commit without that fix.

### Step 4: Resolve aggregateStats.ts

The current `index.ts` has the inline `aggregateDailyStats` function (lines 138-260). The deployed branch has `aggregateStats.ts` (171 lines, optimized Phase 6 version). Both can coexist — the deployed one is commented out. No action needed for v1; consider activating when composite indexes are ready.

### Step 5: Rebuild

```bash
cd functions && npm run build
```

### Step 6: Deploy all functions (not scoped)

```bash
firebase deploy --only functions
```

This ensures all 8 existing functions are preserved + the new Salestrail functions are added.

---

## Verify Post-Reconciliation

After merge, the `functions/src/index.ts` exports should be:

```
BEFORE (deployed):  8 auth/snapshot/migration + ~10 operational
AFTER (reconciled): 8 auth/snapshot/migration + ~10 operational + 5 phone/salestrail
```

Total: ~23 functions.

---

## Alternative: Keep Deployed Functions + Deploy New Ones Selectively

If merging source files is too risky, deploy ONLY the new functions:

```bash
firebase deploy --only functions:syncSalestrailCallsCallable,functions:getSalestrailConfig,functions:updateSalestrailConfig,functions:resetSalestrailSyncLock
```

This leaves all 8 existing functions untouched in production and adds only the 4 Salestrail callables. No risk of accidentally deleting auth.

**This is the recommended approach for the Epic 1 deploy.** The source reconciliation can happen on a follow-up branch after verifying all files merge cleanly.

---

## Final Verdict

| Function | Keep? | How |
|----------|-------|-----|
| `verifyPin` | **YES** | Scoped deploy skips it — untouched |
| `setPin` | **YES** | Scoped deploy skips it — untouched |
| `changePin` | **YES** | Scoped deploy skips it — untouched |
| `verifyBackupPassword` | **YES** | Scoped deploy skips it — untouched |
| `createLeadSnapshotCallable` | **YES** | Scoped deploy skips it — untouched |
| `restoreLeadSnapshotCallable` | **YES** | Scoped deploy skips it — untouched |
| `deleteLeadSnapshotCallable` | **YES** | Scoped deploy skips it — untouched |
| `migrateAuthFields` | **YES** | Scoped deploy skips it — untouched |
