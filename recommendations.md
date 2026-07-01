# Salestrail Post-Import Recommendations

## Priority 0: Reconcile The Missing Production Documents

The reported sync result says 89 calls were imported, but production Firestore currently has 0 `salestrailCalls` documents and no `salestrail.sync` audit log entries.

Immediate checks:

1. Confirm where the 89-count result was generated: production callable, local emulator, function shell, dry-run, or another Firebase project.
2. Confirm the callable response was from `amplify-leads-2026` and not a stale browser/session result.
3. Re-run a dry-run first and record the returned `batchId`, `fetchedCount`, and date window.
4. Re-run the live sync only after confirming the target project and date window.
5. Immediately after the live sync, verify the root `salestrailCalls` document count and latest `auditLogs` record.

## Priority 1: Add A Post-Write Reconciliation Guard

The sync should not return success solely from API fetch and batch write intent. After batch commit, perform a read-back reconciliation for the batch.

Recommended guard:

- Count documents where `importBatchId == batchId`.
- Compare that count to `importedCount + updatedCount` for the current run.
- If the count is lower than expected, return `success: false` with a clear reconciliation error.
- Store the reconciliation count in `lastSyncVerifiedCount`.

## Priority 2: Make Sync State Easier To Audit

Current config says `lastSyncStatus: "success"` and `lastSyncCallCount: 0`. That correctly reflects the live config, but it conflicts with the reported 89-result.

Recommended fields:

- `lastSyncFetchedCount`
- `lastSyncImportedCount`
- `lastSyncUpdatedCount`
- `lastSyncSkippedCount`
- `lastSyncErrorCount`
- `lastSyncVerifiedCount`
- `lastSyncCompletedAt`

Also clear `syncStartedAt` and `syncBatchId` on successful release, or add explicit `lastSyncBatchId` so operators can distinguish active lock state from completed sync metadata.

## Priority 3: Ensure Audit Logs Are Queryable

The implementation writes `auditLogs` with `action: "salestrail.sync"`, but production currently has no matching records.

Recommended follow-up:

- Confirm `writeAuditLog()` is reached on live sync.
- Confirm audit-log writes are not swallowed or skipped on errors.
- Add an index for `auditLogs(action, timestamp desc)` if operators need recent Salestrail sync history by action.

## Priority 4: Preserve The Caller/Callee Mapping, But Verify With Samples

The implemented caller/callee mapping is sound:

- Inbound: external number is caller, rep phone is callee.
- Outbound: rep phone is caller, external number is callee.
- Matching should be on caller for inbound and callee for outbound.

Once documents exist, sample at least 10 imported calls:

- 5 inbound
- 5 outbound
- Any calls involving two known rep phones

For each sample, compare `rawPayload.inbound`, `rawPayload.number`, `rawPayload.userPhone`, `callerNumber`, `calleeNumber`, and `matchedOn`.

## Priority 5: Review Matching Inputs Before Scaling

The matching engine queries leads by `phone` and reps by `phone` using normalized call numbers. This assumes existing `leads.phone` and `reps.phone` are already normalized to the same format.

Recommended checks before the next production sync:

- Count leads with non-normalized `phone` values.
- Count reps with missing or non-normalized `phone` values.
- Confirm Salestrail `userEmail` maps to CRM reps for `assignedRepId`.
- Decide how to handle duplicate lead phone matches; current code chooses the first matching lead returned by Firestore.

## Priority 6: Keep Firestore Access Callable-Only

The current Firestore rule denies direct reads and writes to `salestrailCalls`, which is appropriate for call records.

Do not open direct client reads for audit convenience. Add an admin-only audit callable or local admin script if recurring audits are needed.

## Recommended Next Action

Treat the current state as an import reconciliation incident, not a data-quality pass.

The next live sync should be run with an operator watching:

1. returned sync result
2. `salestrailCalls` count
3. `appSettings/config.integrations.salestrail`
4. `auditLogs` write
5. sampled caller/callee mappings
