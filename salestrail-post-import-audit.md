# Salestrail Post-Import Audit

Generated: 2026-06-22 03:47 UTC
Firebase project audited: `amplify-leads-2026`
Firestore database audited: `(default)`
Method: read-only Firestore REST audit using the locally authenticated Firebase CLI account after reauth.

## Executive Finding

The reported sync result was:

| Metric | Reported |
| --- | ---: |
| Fetched | 89 |
| Imported | 89 |
| Updated | 0 |
| Skipped | 0 |

The production Firestore audit does **not** show those imported call documents.

| Check | Production Result |
| --- | ---: |
| Root `salestrailCalls` documents | 0 |
| Collection-group `salestrailCalls` documents | 0 |
| Root collection ID present | No |
| `salestrail.sync` audit log entries | 0 |
| Firestore databases in project | 1, `(default)` |
| `appSettings/config.integrations.salestrail.lastSyncCallCount` | 0 |
| `appSettings/config.integrations.salestrail.lastSyncStatus` | `success` |
| `appSettings/config.integrations.salestrail.lastSyncAt` | 2026-06-17 08:57:24 UTC |
| `appSettings/config.integrations.salestrail.syncBatchId` | `sync-1781687572943-470qg1` |

This is a high-priority environment/result mismatch. Either the 89-call result came from a different environment, a dry-run/output path that did not persist documents, an emulator/local run, or the production write path did not commit despite returning success.

## 1. Total Documents In `salestrailCalls`

Total documents found in production: **0**.

Validation performed:

- Read root collection path: `salestrailCalls`
- Ran collection-group query for collection ID: `salestrailCalls`
- Listed root collection IDs in `(default)` database
- Confirmed there is only one Firestore database in the Firebase project

## 2. Matched Vs Unmatched Calls

No production call documents were available to classify.

| Classification | Count |
| --- | ---: |
| Matched | 0 |
| Unmatched | 0 |
| Unknown / unavailable | 89 reported but not present in production Firestore |

## 3. Internal Call Count

Internal call count could not be computed from call documents because `salestrailCalls` is empty in production.

Expected logic from `functions/src/salestrailSync.ts`:

- A call is treated as internal when both normalized call sides match rep phone numbers.
- Internal detection does not currently set `direction: "internal"` during transform; it leaves direction as inbound/outbound and suppresses lead matching.

## 4. Inbound Vs Outbound Distribution

No production documents were available.

| Direction | Count |
| --- | ---: |
| Inbound | 0 |
| Outbound | 0 |
| Internal | 0 |
| Missing / malformed | 0 |

## 5. Match Confidence Distribution

No production documents were available.

| Match confidence | Count |
| --- | ---: |
| Exact | 0 |
| Partial | 0 |
| None | 0 |
| Missing / malformed | 0 |

## 6. Top Unmatched Phone Numbers

No unmatched production call documents were available.

Because this report is stored in the repository workspace, phone-number detail should be added only after confirming that production documents exist and that the report is handled as operational/customer data.

## 7. Duplicate Call IDs

No duplicates were found, but only because no `salestrailCalls` documents exist in production.

Expected uniqueness rule:

- Firestore document ID should equal `salestrailCallId`.
- The sync code writes to `db.collection("salestrailCalls").doc(doc.salestrailCallId)`, so duplicate call IDs should become updates, not duplicate documents.

## 8. Missing Or Malformed Fields

No document-level malformed field findings could be produced because the collection is empty.

Fields expected by the implemented schema:

- `salestrailCallId`
- `callerNumber`
- `callerNumberNormalized`
- `calleeNumber`
- `calleeNumberNormalized`
- `callerName`
- `userEmail`
- `userName`
- `direction`
- `callType`
- `durationSeconds`
- `sourceCreatedAt`
- `sourceUpdatedAt`
- `recordingAvailable`
- `recordingReference`
- `matchedLeadId`
- `matchedPhoneNumber`
- `matchedOn`
- `matchConfidence`
- `assignedRepId`
- `region`
- `importBatchId`
- `importStatus`
- `importedAt`
- `rawPayload`
- `createdAt`
- `updatedAt`

## 9. Timestamp Correctness

No call-document timestamps were available to validate.

Production config timestamps found:

| Field | Value |
| --- | --- |
| `lastSyncAt` | 2026-06-17 08:57:24 UTC |
| `syncStartedAt` | 2026-06-17 09:12:55 UTC |

Observation: `syncStartedAt` remains populated even though `syncInProgress` is false. This is not necessarily corrupt, but it makes the sync state harder to read after completion.

## 10. Caller/Callee Mapping Correctness

No production call documents were available for live validation.

The implemented mapping appears logically correct for the expected Salestrail fields:

| Raw direction | Stored caller | Stored callee | Expected lead match side |
| --- | --- | --- | --- |
| `inbound: true` | `raw.number` | `raw.userPhone` | `caller` |
| `inbound: false` | `raw.userPhone` | `raw.number` | `callee` |

However, the live audit cannot confirm whether the first 89 calls obeyed this mapping because the documents are not present.

## Audit Conclusion

The production post-import audit failed the most important reconciliation check: **the 89 reported imported calls are not present in production Firestore**.

Do not treat Salestrail Epic 1 as production-verified until a new sync run is reconciled against:

1. `salestrailCalls` document count
2. `appSettings/config.integrations.salestrail.lastSyncCallCount`
3. `auditLogs` entry for `action: "salestrail.sync"`
4. A sample of imported document IDs matching Salestrail `callId`
