# Salestrail Production Validation Audit

Audit timestamp: 2026-06-22T09:52:36.018Z
Firebase project: `amplify-leads-2026`
Firestore database: `(default)`
Collection audited: `salestrailCalls`
Mode: read-only production validation

## Executive Summary

The production `salestrailCalls` collection currently contains **0 documents**.

Because the collection is empty, matched/unmatched distribution, internal-call distribution, top unmatched numbers, assigned rep coverage, region coverage, duplicate detection, and malformed-document analysis all return zero or not applicable.

This means there is no persisted Salestrail call import data available for validation in `amplify-leads-2026` at the time of this audit.

## Counts

| Metric | Count |
| --- | ---: |
| Total `salestrailCalls` documents | 0 |
| Matched calls | 0 |
| Unmatched calls | 0 |
| Unmatched non-internal calls | 0 |
| Internal calls | 0 |

## Matched Vs Unmatched

No documents were present.

| Category | Count |
| --- | ---: |
| Matched | 0 |
| Unmatched | 0 |

## Internal Calls

No documents were present.

| Category | Count |
| --- | ---: |
| Internal | 0 |
| Non-internal | 0 |

## Inbound / Outbound Distribution

No documents were present.

| Direction | Count |
| --- | ---: |
| Inbound | 0 |
| Outbound | 0 |
| Internal | 0 |
| Missing/invalid | 0 |

## Top Unmatched Numbers

No unmatched numbers were found because the collection is empty.

Phone numbers are intentionally not listed in this report to avoid storing client phone data in repository artifacts.

## Assigned Rep Coverage

No documents were present.

| Coverage | Count |
| --- | ---: |
| With `assignedRepId` | 0 |
| Without `assignedRepId` | 0 |

## Region Coverage

No documents were present.

| Region | Count |
| --- | ---: |
| Brisbane | 0 |
| Perth | 0 |
| Null/missing | 0 |

## Duplicate Call IDs

No duplicate call IDs were found.

| Duplicate Type | Count |
| --- | ---: |
| Duplicate Firestore document IDs | 0 |
| Duplicate `salestrailCallId` values | 0 |
| Document ID / `salestrailCallId` mismatches | 0 |

## Malformed Documents

No malformed documents were found because no documents were present.

Validation categories checked:

- Missing or non-string `salestrailCallId`
- Firestore document ID mismatch against `salestrailCallId`
- Invalid `direction`
- Invalid `importStatus`
- Invalid `matchConfidence`
- Invalid `userEmail`
- Invalid `durationSeconds`
- Invalid or future `sourceCreatedAt`
- Invalid `importedAt`
- Missing `importBatchId`
- Invalid `assignedRepId`
- Invalid `region`

## Timestamp Ranges

No documents were present.

| Field | Earliest | Latest |
| --- | --- | --- |
| `sourceCreatedAt` | n/a | n/a |
| `importedAt` | n/a | n/a |

## Import Batches

No import batches were present.

## Validation Result

Status: **Blocked / no production import data present**

The collection is structurally clean only because it is empty. This audit cannot validate Salestrail matching quality, direction mapping, region attribution, assigned rep coverage, or duplicate behavior until a live sync writes documents to `salestrailCalls`.

## Recommended Next Safe Steps

1. Confirm whether a live Salestrail sync has actually been run after the dry-run fixes.
2. If live sync has not been run, run it only when explicitly approved.
3. After live sync completes, rerun this validation audit immediately.
4. Confirm:
   - `salestrailCalls` document count increases.
   - `auditLogs` contains a `salestrail.sync` entry.
   - `appSettings/config.integrations.salestrail.lastSyncCallCount` matches committed writes.
5. If live sync was expected to have already run, inspect `syncSalestrailCallsCallable` logs for the live invocation timestamp and confirm whether the request used `dryRun: false`.
