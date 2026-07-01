# Phone Normalisation — Migration Readiness Report

**Date**: 2026-06-16
**Recommendation**: **GO (conditional)** — proceed with live migration after dry-run validation

---

## Pre-Migration Checklist

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | 4 write-path fixes deployed | DONE | `AddLeadModal`, `App.tsx`, `Map.tsx`, `SheetsSyncModal` |
| 2 | `normalizeAUPhone` bug fixed (`6104` prefix) | DONE | `slice(2)` → `slice(3)` in both client and server |
| 3 | `phoneRaw` safety field added to Lead type | DONE | Original preserved during backfill |
| 4 | `backfillPhoneNormalization` callable deployed | PENDING | Build passes locally; deploy needed |
| 5 | Functions `tsc` — zero errors | DONE | |
| 6 | Client `tsc` — zero new errors | DONE | Pre-existing errors unrelated |
| 7 | Tests — 31 passed, 0 failures | DONE | 20 normalizeAUPhone tests + 11 loginUtils tests |
| 8 | Live dry-run executed | **BLOCKED** | Requires admin credentials (gcloud ADC or UI login) |
| 9 | Duplicate phone risk assessed | DONE | See duplicate-phone-report.md |
| 10 | Rollback plan documented | DONE | See below |

---

## Conditions for GO

1. **Live dry-run must be executed** before the live run. Run with `{ dryRun: true }` and verify:
   - `totalScanned` matches known lead count
   - `updated` count is non-zero and plausible (~40-60% of leads)
   - `skippedAlreadyNormalized` count is non-zero
   - `skippedEmptyPhone` + `skippedInvalidFormat` counts are reasonable
   - `errors` count is 0

2. **Backfill must be deployed** (`firebase deploy --only functions:backfillPhoneNormalization`)

3. **Off-hours execution recommended** (low Firestore write volume during backfill)

4. **Firestore backup exists** (gcloud firestore export — optional but recommended for >10k leads)

---

## Migration Execution

### Step 1: Deploy

```bash
cd functions && npm run build && firebase deploy --only functions:backfillPhoneNormalization
```

### Step 2: Dry-run (from Firebase Console > Functions > Testing, or browser console as admin)

```javascript
const result = await httpsCallable(functions, "backfillPhoneNormalization")({ dryRun: true });
console.log(result.data);
// Expected: { dryRun: true, totalScanned: N, updated: M, skippedAlreadyNormalized: X, ... }
```

### Step 3: Verify dry-run counts

| Field | Expected | Red Flag If |
|-------|----------|-------------|
| `totalScanned` | Matches leads collection size | Significantly off (batching/missing) |
| `updated` | 30-70% of totalScanned | 0% (nothing to do — all already normalized) or 100% (unlikely, check) |
| `skippedEmptyPhone` | 1-5% | >20% (data quality problem) |
| `skippedInvalidFormat` | 1-3% | >10% (unknown phone formats) |
| `errors` | 0 | Non-zero (batch write failures — investigate) |

### Step 4: Live run

```javascript
const result = await httpsCallable(functions, "backfillPhoneNormalization")({ dryRun: false });
console.log(result.data);
// If errors > 0, check errorDetails for specifics
```

### Step 5: Verify

- Spot-check 10 random leads — `phone` should be digits-only, 10 chars
- Spot-check leads that were updated — `phoneRaw` should contain the original value
- Run the dry-run again — `updated` should now be 0 (all normalized)

### Step 6: Confirm with audit log

The backfill writes a summary to `auditLogs` with `action: "backfill.phoneNormalization"`. Verify it exists and counts match.

---

## Rollback Plan

### If something goes wrong during migration:

**Option A: Restore `phone` from `phoneRaw`**

If `preserveRaw` was `true` (default), every updated lead has `phoneRaw` with the original value. A rollback callable can reverse the normalization:

```javascript
// For each lead where phoneRaw exists:
//   phone = phoneRaw
//   delete phoneRaw
```

This is not automated (would require a separate rollback callable), but the data is there.

**Option B: Firestore export restore**

If a full Firestore export was taken before migration, restore from it.

**Option C: Accept and move forward**

The normalized format is correct. If the only issue is minor formatting changes (e.g., spaces removed), accept the change. The phone numbers are functionally identical and the original is preserved.

---

## What This Migration Does NOT Do

- **Does NOT merge duplicate leads** — Two leads with different names but the same normalized phone remain two separate documents. A deduplication sweep is separate work.
- **Does NOT fix non-AU phones** — `"00112345678901"` stays as-is. These will never match Salestrail calls.
- **Does NOT retroactively fix past callHistory entries** — Call logs store rep ID + date, not phone numbers. Unaffected.
- **Does NOT touch the `reps.phone` field** — Only `leads.phone` is migrated. Rep phones are a different collection.

---

## Performance Estimate

| Lead Count | Read Cost | Write Cost | Duration (est.) |
|------------|-----------|------------|-----------------|
| 1,000 | 1,000 reads | ~550 writes (batched) | <5 seconds |
| 10,000 | 10,000 reads | ~5,500 writes | <30 seconds |
| 50,000 | 50,000 reads | ~27,000 writes | 2-3 minutes |
| 100,000 | 100,000 reads | ~55,000 writes | 5-10 minutes |

Firestore write costs at $0.18/100k writes. For 10k leads: ~$0.01.

---

## Final Recommendation: GO (CONDITIONAL)

**Go** once the live dry-run is executed and confirms:
- Zero errors
- Updated count is plausible (~40-60% of leads)
- No unexpected skip patterns

**Do NOT go** if:
- Live dry-run shows errors (`errors > 0`)
- Updated count is 0 (all phones already normalized — nothing to do)
- Lead count is unexpectedly high (100k+) without verifying Firestore write quotas
