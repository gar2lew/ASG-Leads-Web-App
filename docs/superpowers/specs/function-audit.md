# Function Audit — Deployed vs Source Reconciliation

**Date**: 2026-06-17
**Branch**: `feature/salestrail-epic1` (HEAD: `89d2b5b`)
**Deployed source**: `stable-post-hardening` (HEAD: `9f03c02`)

---

## Summary

Firebase reports 8 deployed functions that are not present in the current source tree. These functions were deployed from branch `stable-post-hardening` which is **ahead** of the current branch lineage.

### Branch Lineage

```
main ──→ codex-foundation (e94766b) ──→ phone-normalization-release (89d2b5b) ──→ feature/salestrail-epic1 (89d2b5b)
                                                                                        ↑ CURRENT BRANCH

stable-post-hardening (9f03c02)  ← DEPLOYED, NOT in current lineage
```

The `stable-post-hardening` branch contains 6 additional server source files not present in `feature/salestrail-epic1`.

---

## Per-Function Analysis

### Group 1: Auth PIN Functions (CRITICAL — production login)

| Function | File | Deployed Commit | Current Branch | Status |
|----------|------|----------------|----------------|--------|
| `verifyPin` | `functions/src/auth/verifyPin.ts` | `9f03c02` (378 lines) | **MISSING** | Would be DELETED if deployed |
| `setPin` | `functions/src/auth/verifyPin.ts` | `9f03c02` | **MISSING** | Would be DELETED if deployed |
| `changePin` | `functions/src/auth/verifyPin.ts` | `9f03c02` | **MISSING** | Would be DELETED if deployed |
| `verifyBackupPassword` | `functions/src/auth/verifyPin.ts` | `9f03c02` | **MISSING** | Would be DELETED if deployed |

**Impact**: These are the core authentication PIN system. All reps use `verifyPin` to log in. `setPin` is used for first-time PIN setup. `changePin` for PIN rotation. `verifyBackupPassword` for PIN recovery. Deleting these would **break all login functionality**.

**Action**: **MUST BE PRESERVED.** Import into current branch before deploy.

### Group 2: Lead Snapshots (Admin tooling)

| Function | File | Deployed Commit | Current Branch | Status |
|----------|------|----------------|----------------|--------|
| `createLeadSnapshotCallable` | `functions/src/leadSnapshots.ts` | `9f03c02` (365 lines) | **MISSING** | Would be DELETED |
| `restoreLeadSnapshotCallable` | `functions/src/leadSnapshots.ts` | `9f03c02` | **MISSING** | Would be DELETED |
| `deleteLeadSnapshotCallable` | `functions/src/leadSnapshots.ts` | `9f03c02` | **MISSING** | Would be DELETED |

**Impact**: Admin-only lead backup/restore tools. Used for pre-import safety snapshots and bulk operations. Loss is non-fatal to daily operations but removes a safety net.

**Action**: **SHOULD BE PRESERVED.** Import into current branch.

### Group 3: Auth Migration (One-time utility)

| Function | File | Deployed Commit | Current Branch | Status |
|----------|------|----------------|----------------|--------|
| `migrateAuthFields` | `functions/src/migrateAuthFields.ts` | `9f03c02` (122 lines) | **MISSING** | Would be DELETED |

**Impact**: One-time migration to hash plaintext PINs/passwords with bcrypt. May have already been run in production. AGENTS.md says: "Do not import `migrateAuthFields.ts` into `index.ts`. It is deployed separately." This suggests it was deliberately a separate deployment.

**Action**: **MAY BE SAFE TO DROP.** If the migration has been fully completed and verified in production, this function is no longer needed. However, dropping it requires manual confirmation that the migration is complete. If there are still leads with plaintext `pin` fields, this function is required for them to log in.

---

## Additional Missing Source Files

Beyond the 8 functions, `stable-post-hardening` has these additional files not in the current branch:

| File | Lines | Impact |
|------|-------|--------|
| `functions/src/auth/verifyPin.ts` | 378 | Auth PIN — covered above |
| `functions/src/leadSnapshots.ts` | 365 | Snapshot tooling — covered above |
| `functions/src/migrateAuthFields.ts` | 122 | Migration utility — covered above |
| `functions/src/aggregateStats.ts` | 171 | Optimized stats (Phase 6) — exported separately |

The `aggregateStats.ts` file has a replacement note in the current `index.ts`:
```
// Replace the original aggregateDailyStats export with the optimized version
// export { aggregateDailyStatsOptimized as aggregateDailyStats } from "./aggregateStats";
```

This is a planned but not-yet-activated optimization. The current inline `aggregateDailyStats` in `index.ts` is the active version. Both should coexist.

---

## Root Cause

The `codex-foundation` branch (parent of all current work) was created from a commit that **predates** the `stable-post-hardening` deploy. The auth functions, lead snapshots, and migration were added in `stable-post-hardening` but never merged back into `codex-foundation` or its descendants.

```diff
Between e94766b (HEAD) and 9f03c02 (deployed):
 functions/src/aggregateStats.ts    | 171 ++  (new)
 functions/src/auth/verifyPin.ts    | 378 ++  (new)
 functions/src/docusign.ts          |  10 +- (modified)
 functions/src/index.ts             |  40 +- (modified — added exports)
 functions/src/leadSnapshots.ts     | 365 ++  (new)
 functions/src/migrateAuthFields.ts | 122 ++  (new)
```

---

## Recommendations

### Immediate (Before Any Deploy)

1. **Checkout the 6 missing files from `stable-post-hardening` into the current branch**:
   ```bash
   git checkout stable-post-hardening -- functions/src/auth/verifyPin.ts \
     functions/src/leadSnapshots.ts functions/src/migrateAuthFields.ts \
     functions/src/aggregateStats.ts
   ```

2. **Merge the `index.ts` export changes** — the deployed `index.ts` has additional `export` lines that the current branch is missing.

3. **Rebuild and verify**: `cd functions && npm run build`

### Per-Function Decision

| Function | Verdict | Reasoning |
|----------|---------|-----------|
| `verifyPin` | **KEEP** | Production auth — required |
| `setPin` | **KEEP** | Production auth — required |
| `changePin` | **KEEP** | Production auth — required |
| `verifyBackupPassword` | **KEEP** | Production auth — required |
| `createLeadSnapshotCallable` | **KEEP** | Admin safety tool |
| `restoreLeadSnapshotCallable` | **KEEP** | Admin safety tool |
| `deleteLeadSnapshotCallable` | **KEEP** | Admin safety tool |
| `migrateAuthFields` | **KEEP (for now)** | Verify migration complete before removing |

### Long-term

- Merge `stable-post-hardening` → `codex-foundation` to align the branch lineages
- After confirming auth migration is complete, `migrateAuthFields` can be deprecated
- Consider deploying `aggregateStats.ts` optimized version if indexes are deployed
