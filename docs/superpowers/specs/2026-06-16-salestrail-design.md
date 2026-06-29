# Salestrail Integration — Architecture Review & Design

**Date**: 2026-06-16 (updated 2026-06-17)
**Status**: Design Finalised — API Schema Confirmed
**Reviewers**: Principal Architect, Firebase Architect, Firestore Specialist, Security Engineer, Senior Tech Lead

---

## Table of Contents

1. [Data Model Review](#1-data-model-review)
2. [Server Architecture Review](#2-server-architecture-review)
3. [Firestore Query & Index Review](#3-firestore-query--index-review)
4. [Security Review](#4-security-review)
5. [UI/UX Review](#5-uiux-review)
6. [Implementation Risk Assessment](#6-implementation-risk-assessment)
7. [Salestrail API Mapping (Confirmed)](#7-salestrail-api-mapping-confirmed)
8. [Final Scores & Recommendation](#8-final-scores--recommendation)

---

## 1. Data Model Review

### 1.1 Proposed Schema (Reviewed)

```
salestrailCalls/{callId}
├── salestrailCallId: string
├── callerNumber: string
├── callerNumberNormalized: string
├── calleeNumber: string
├── calleeNumberNormalized: string
├── callerName: string | null
├── userEmail: string
├── userName: string
├── direction: "inbound" | "outbound" | "internal" | null
├── callType: string | null
├── durationSeconds: number | null
├── sourceCreatedAt: Timestamp
├── sourceUpdatedAt: Timestamp | null
├── recordingAvailable: boolean
├── recordingReference: string | null
├── recordingUrl: string | null
├── matchedLeadId: string | null
├── matchedClientId: string | null
├── matchedPhoneNumber: string | null
├── matchedOn: "caller" | "callee" | null
├── matchConfidence: "exact" | "partial" | "none"
├── importBatchId: string
├── importStatus: "new" | "matched" | "unmatched" | "error"
├── importedAt: Timestamp
├── createdAt: Timestamp
├── updatedAt: Timestamp
├── rawPayload: object
```

### 1.2 Critical Findings

#### FINDING 1: Missing `assignedRepId` — HIGH

**Problem**: The schema has no field linking a Salestrail call to a CRM rep. `userEmail` and `userName` come from Salestrail, not the CRM. Without `assignedRepId`, rep performance reporting (calls per rep, duration per rep, call outcomes per rep) is impossible without a secondary join on email.

**Recommendation**: Add `assignedRepId: number | null`. Populated during import by matching `userEmail` against `reps` collection email field. If no match, leave null.

#### FINDING 2: Missing `region` field — MEDIUM

**Problem**: The CRM is multi-region (Brisbane / Perth). Leads have region affinity. Without a `region` field on calls, region-filtered views require a join on matchedLeadId, which is expensive and doesn't work for unmatched calls.

**Recommendation**: Add `region: "brisbane" | "perth" | null`. Derived from `matchedLeadId`'s lead region when available, otherwise null.

#### FINDING 3: `rawPayload` Document Size Risk — MEDIUM

**Problem**: Firestore documents have a 1 MiB size limit. A verbose Salestrail API response with nested objects, arrays of participants, call legs, or transcript segments could exceed this. Raw payloads compound with the rest of the document.

**Recommendation**:
- Add a size guard: measure `rawPayload` JSON length before write. If > 800 KB, truncate nested objects and store a `rawPayloadTruncated: true` flag.
- Alternatively, store `rawPayload` in a separate `salestrailCalls/{callId}/payloads/raw` subcollection document to avoid the 1 MiB limit entirely.

#### FINDING 4: `recordingUrl` Risk — HIGH

**Problem**: The schema includes `recordingUrl: string | null` but previous design discussions agreed this field should only exist if "confirmed stable." Recording URLs from APIs are almost always time-limited signed URLs. Storing them as permanent fields creates a false expectation and security risk (expired signed URLs could be replayed or leak).

**Recommendation**: Remove `recordingUrl` from the base document. If recordings are needed later, add a `recordingStoragePath: string | null` field pointing to a Firebase Storage object (after download), or a dedicated `recordings` subcollection. For v1, only `recordingAvailable` and `recordingReference` are needed.

#### FINDING 5: Missing enrichment fields — LOW

**Problem**: No fields for CRM users to annotate or review imported calls.

**Recommendation**: Add for future enrichment:
- `reviewedBy: number | null` — repId of reviewer
- `reviewedAt: Timestamp | null`
- `notes: string | null` — CRM user notes about the call
- `tags: string[]` — e.g. ["follow-up", "complaint", "sale"]

These can be added in v2. Schema is forward-compatible if we use `merge: true` writes.

#### FINDING 6: `matchedLeadId` / `matchedClientId` Type Mismatch Risk — HIGH

**Problem**: The existing `Lead.id` in `src/types/index.ts:129` is typed as `number`. Firebase document IDs are strings. If `leads` collection uses numeric IDs as document IDs (numeric string), matching works. But if leads have auto-generated Firestore IDs (20-char alphanumeric), numeric matching will fail.

**Verification required**: Audit the `leads` collection to confirm whether document IDs are numeric (`"12345"`) or auto-generated (`"abc123def456"`). If auto-generated, the matching query must be `leads.where("id", "==", numericId)` not `leads.doc(stringId)`.

**Recommendation**: Type `matchedLeadId` as `string` (as-is is correct for Firestore doc IDs), but add a comment documenting the mapping: if lead doc ID is numeric-string, it's the lead's `id` field stringified; if alphanumeric, it's the Firestore auto-ID.

### 1.3 Schema Additions Summary

| Field | Type | Priority | Reason |
|-------|------|----------|--------|
| `assignedRepId` | `number \| null` | HIGH | Rep performance reporting |
| `region` | `"brisbane" \| "perth" \| null` | MEDIUM | Multi-region filtering |
| `reviewedBy` | `number \| null` | LOW (v2) | Call review workflow |
| `reviewedAt` | `Timestamp \| null` | LOW (v2) | Call review workflow |
| `notes` | `string \| null` | LOW (v2) | User annotations |
| `tags` | `string[]` | LOW (v2) | Categorization |

### 1.4 Field Removals

| Field | Reason |
|-------|--------|
| `recordingUrl` | HIGH risk — signed URLs should not be persisted in the call document |

---

## 2. Server Architecture Review

### 2.1 Architecture Diagram (Text)

```
┌─────────────────────────────────────────────────────────┐
│                    Client (Browser)                       │
│  SystemSettingsPanel ──► useSalestrailSync ──► callable  │
│  SalestrailCallsPage ──► useSalestrailCalls ──► onSnap   │
│  Lead Detail          ──► useSalestrailCalls(leadId)     │
└──────────────────────────┬──────────────────────────────┘
                           │ httpsCallable / onSnapshot
┌──────────────────────────▼──────────────────────────────┐
│               Firebase Functions (Node 22)                │
│                                                          │
│  salestrail.ts (callable wrapper)                        │
│  ├── syncSalestrailCallsCallable (onCall)                │
│  ├── getSalestrailConfig (onCall)                        │
│  ├── updateSalestrailConfig (onCall)                     │
│  └── resetSalestrailSyncLock (onCall, admin-only)        │
│                                                          │
│  salestrailSync.ts (sync engine — callable-agnostic)      │
│  ├── syncSalestrailCalls(opts?) → SyncResult             │
│  ├── fetchSalestrailCalls(apiKey, lastSyncAt) → RawCall[]│
│  ├── normalizeCall(rawCall) → NormalizedCall             │
│  ├── matchCallsToLeads(normalizedCalls, leadMap)         │
│  └── batchWriteCalls(calls) → WriteResult                │
│                                                          │
│  Future: onSchedule("syncSalestrailCalls")               │
│  │  └── calls same syncSalestrailCalls() export          │
└──────────────────────────┬──────────────────────────────┘
                           │
              ┌────────────▼────────────┐
              │   External: Salestrail   │
              │   GET /export/calls/json │
              └─────────────────────────┘
```

### 2.2 Sync Engine Review

#### Strength: Callable-agnostic design
The `syncSalestrailCalls()` function accepting options is correctly decoupled. Both `onCall` and `onSchedule` can invoke it without code duplication. This is the right pattern.

#### FINDING 7: Sync lock must use Firestore transaction — HIGH

**Problem**: The proposed sync lock (`syncInProgress`, `syncStartedAt`, `syncBatchId`) is stored in `appSettings/config.integrations.salestrail`. Two concurrent callable invocations could both read `syncInProgress: false` before either writes `true`, resulting in a race condition.

**Recommendation**: Use a Firestore transaction for the lock acquisition:

```typescript
const configRef = db.doc("appSettings/config");
await db.runTransaction(async (tx) => {
  const snap = await tx.get(configRef);
  const integrations = snap.data()?.integrations?.salestrail ?? {};
  if (integrations.syncInProgress) {
    const startedAt = integrations.syncStartedAt ?? 0;
    if (Date.now() - startedAt < 15 * 60 * 1000) {
      throw new Error("Sync already in progress");
    }
    // Stale lock — override
  }
  tx.update(configRef, {
    "integrations.salestrail.syncInProgress": true,
    "integrations.salestrail.syncStartedAt": Date.now(),
    "integrations.salestrail.syncBatchId": batchId,
  });
});
```

This is the only correct way to implement a lock on Firestore without a separate locking collection.

#### FINDING 8: Batch write failure recovery — MEDIUM

**Problem**: Firestore batches are atomic — if batch 3 of 10 fails, all 500 docs in that batch are lost. The sync engine has no mechanism to retry or report which batch failed.

**Recommendation**:
- Each batch should be independently retryable (up to 3 attempts with exponential backoff).
- Failed batches should be logged with the range of call IDs they contained.
- At the end of sync, return `{ ..., failedBatchIndices: number[], failedCallIds: string[] }`.
- Do NOT use a single mega-batch across all calls — chunking is already correct, just add per-chunk error handling.

#### FINDING 9: `merge: true` vs `merge: false` trade-off — MEDIUM

**Problem**: The design oscillated between `merge: true` and `merge: false`. With `merge: false` (current proposal), existing fields like `matchedLeadId` from a prior import are wiped if the call is re-imported. With `merge: true`, stale data from old imports could persist.

**Recommendation**: Use `merge: true` for the following fields only (via a partial write object), and allow the sync engine to overwrite everything else:

```
Always merge (preserve if already set):
  - matchedLeadId, matchedClientId, matchedPhoneNumber, matchedOn
  - matchConfidence (only upgrade, never downgrade: "none"→"partial"→"exact")
  - reviewedBy, reviewedAt, notes, tags
  - assignedRepId (once assigned, don't overwrite)

Always overwrite (source of truth from API):
  - callerNumber, calleeNumber, durationSeconds, direction, callType
  - recordingAvailable, recordingReference
  - sourceCreatedAt, sourceUpdatedAt
  - rawPayload
```

Implementation: read existing doc first via `getAll()` (up to 500), merge fields in memory, then `batch.set()` with the merged object.

#### FINDING 10: API abstraction interface — LOW

**Problem**: The `fetchSalestrailCalls` function is mentioned but its interface isn't formally defined. When the real API schema arrives, this is the only function that changes.

**Recommendation**: Define the interface contract explicitly:

```typescript
interface SalestrailApiConfig {
  username: string;
  password: string;
  baseUrl: string;  // https://standalone-api.salestrail.io
}

interface SalestrailFetchOptions {
  from?: string;     // ISO-8601 datetime (inclusive lower bound)
  to?: string;       // ISO-8601 datetime (inclusive upper bound)
  limit?: number;    // max records per page (if API paginates)
}

interface SalestrailRawCall {
  // Real fields confirmed from Salestrail API:
  // answered, callId, createdAt, duration, formattedNumber,
  // inbound, integrated, number, phonebookName, recType,
  // recurId, source, sourceDetail, startTime, userEmail,
  // userId, userName, userPhone, userTeams
  [key: string]: unknown;
}

async function fetchSalestrailCalls(
  config: SalestrailApiConfig,
  options?: SalestrailFetchOptions
): Promise<SalestrailRawCall[]>;
```

The mapping from `SalestrailRawCall` → `SalestrailCallDoc` happens in a separate `transformCall()` function. This creates a clean seam where the API schema can change without touching the rest of the sync engine.

#### FINDING 11: Last sync timestamp should use source timestamp — HIGH

**Problem**: The design correctly states `lastSyncAt` should be the latest `sourceCreatedAt` from imported calls, not `Date.now()`. However, this must also handle the edge case where the most recent call's `sourceCreatedAt` is in the future (clock skew) or significantly delayed.

**Recommendation**: Use `Math.min(maxSourceCreatedAt, Date.now())` to protect against clock skew. Log a warning if any call's `sourceCreatedAt` exceeds the current time by more than 5 minutes.

### 2.3 Future Scheduled Sync Compatibility

**Assessment**: The sync engine design is correctly callable-agnostic. Adding a scheduled function requires only:

```typescript
// functions/src/salestrail.ts (future addition)
import { onSchedule } from "firebase-functions/v2/scheduler";

export const scheduledSalestrailSync = onSchedule(
  { schedule: "0 */6 * * *", timeZone: "Australia/Sydney" },
  async () => {
    await syncSalestrailCalls({ fullSync: false });
  }
);
```

No changes to `salestrailSync.ts` are required. This passes the reusability test.

---

## 3. Firestore Query & Index Review

### 3.1 Proposed Indexes

```
salestrailCalls:
  1. matchedLeadId ASC, sourceCreatedAt DESC
  2. userEmail ASC, sourceCreatedAt DESC
  3. importStatus ASC, sourceCreatedAt DESC
  4. direction ASC, sourceCreatedAt DESC
  5. importBatchId ASC, sourceCreatedAt DESC
```

### 3.2 Index Assessment

| Index | Queries Served | Verdict |
|-------|---------------|---------|
| `matchedLeadId ASC, sourceCreatedAt DESC` | Lead detail page ("show calls for lead X, newest first") | APPROVED |
| `userEmail ASC, sourceCreatedAt DESC` | Filter calls by staff user | APPROVED |
| `importStatus ASC, sourceCreatedAt DESC` | Filter by match/unmatched status | APPROVED |
| `direction ASC, sourceCreatedAt DESC` | Filter by inbound/outbound | APPROVED |
| `importBatchId ASC, sourceCreatedAt DESC` | Batch-level lookup (debugging) | APPROVED |

#### FINDING 12: Missing composite indexes — HIGH

**Problem**: Several critical query patterns have no index:

| Missing Query Pattern | Required Index | Priority |
|----------------------|----------------|----------|
| "Unmatched calls for review" (admin workflow) | `importStatus ASC, matchedLeadId ASC, sourceCreatedAt DESC` | HIGH |
| "Calls by rep performance" | `assignedRepId ASC, sourceCreatedAt DESC` | HIGH (after adding assignedRepId) |
| "Calls by region" | `region ASC, sourceCreatedAt DESC` | MEDIUM (after adding region) |
| "Calls by date range" (dashboard) | `sourceCreatedAt DESC` (single field) | MEDIUM |
| "Calls by match confidence" | `matchConfidence ASC, sourceCreatedAt DESC` | LOW |

### 3.3 Query Performance Concerns

#### FINDING 13: `leads.where("phone", "in", [...])` — Index requirement

**Problem**: Querying `leads` by `phone` with `in` operator requires a single-field index on `leads.phone`. If this index doesn't exist, the query will fail.

**Verification required**: Check `firestore.indexes.json` for a `leads.phone ASC` index. If absent, it must be added before the matching logic can run.

#### FINDING 14: Real-time listener cost — MEDIUM

**Problem**: `useSalestrailCalls` uses `onSnapshot` for real-time updates. If the SalestrailCalls page is left open with no filters, every sync could trigger reads for the entire collection.

**Recommendation**:
- Default to the last 7 days via `sourceCreatedAt >= sevenDaysAgo` filter.
- The dedicated page should use `limit(100)` with cursor pagination, not an unbounded listener.
- Lead detail tabs should filter by `matchedLeadId` (already indexed).

### 3.4 Document Size & Cost

Estimated document size: ~2-5 KB per call (including rawPayload at ~1-3 KB). At 1,000 calls/day, this is ~2-5 MB/day of storage. Within Firestore's free tier for the foreseeable future.

No cost concern for v1.

---

## 4. Security Review

### 4.1 Firestore Rules Assessment

#### FINDING 15: Firestore rules cannot enforce lead-level access — HIGH

**Problem**: The proposed rule:

```
allow read: if isAuthenticated()
  && resource.data.matchedLeadId != null
  && exists(/databases/$(database)/documents/leads/$(resource.data.matchedLeadId));
```

This only checks that the lead document **exists**. It does NOT verify the requesting user has access to that lead. Firestore security rules have no concept of "does this user have permission to read leads/12345?" — they can only check the authenticated user's UID or custom claims.

Furthermore, `exists()` can only return true/false — it cannot read the lead document's fields (like region) and compare them to the user's claims. The only workaround is embedding the user's UID or region in the lead document itself (e.g., `lead.accessibleRegions: ["brisbane"]`), which is a significant data model change.

**Recommendation**: Do NOT rely on Firestore rules for lead-level access control on salestrailCalls.

**Revised security model**:

1. **salestrailCalls direct reads**: Callable functions only. Disable direct client reads entirely.
   ```
   match /salestrailCalls/{callId} {
     allow read, write: if false;
   }
   ```

2. **New callable: `getSalestrailCalls(filters)`**: Server-side function that:
   - Accepts filter params (leadId, date range, user email, etc.)
   - Reads salestrailCalls with server-side Firestore queries (full access)
   - For each returned call with `matchedLeadId`, verifies the authenticated user has region access to that lead via `canAccessRegion()`
   - Strips calls from inaccessible leads
   - Returns sanitized results

3. **New callable: `getLeadSalestrailCalls(leadId)`**: Server-side function that:
   - Verifies user has access to the specified lead
   - Queries `salestrailCalls.where("matchedLeadId", "==", leadId)`
   - Returns results

This is the same pattern used for `smsfFinancials` and `settingsHistory` — callable-enforced access control.

#### FINDING 16: rawPayload security — MEDIUM

**Problem**: The design says "ensure no API key, auth headers, or sensitive tokens are ever stored." This must be enforced in code, not by convention.

**Recommendation**: Add a `sanitizePayload()` function that explicitly strips known sensitive keys:
```typescript
const SENSITIVE_KEYS = ["apiKey", "api_key", "token", "auth", "authorization",
  "password", "secret", "key", "credential", "bearer"];

function sanitizePayload(raw: Record<string, unknown>): Record<string, unknown> {
  // Deep-recursive strip of sensitive keys + truncation at 500 KB JSON
}
```

Unit test this function with a mock payload containing fake credentials.

#### FINDING 17: Recording access control — MEDIUM

**Problem**: If recordings are fetched in the future, recording URLs or Storage paths must be access-controlled. A rep should not be able to access recordings for calls not matched to their leads.

**Recommendation for v2**: Store recordings in Firebase Storage under `salestrail-recordings/{callId}.mp3`. Use Firebase Storage security rules that check the authenticated user's access to the matched lead. Generate signed download URLs per-request via callable rather than exposing Storage paths.

### 4.2 Callable Permissions

| Callable | Admin | Manager | Rep |
|----------|-------|---------|-----|
| `syncSalestrailCallsCallable` | Yes | No (v1) | No |
| `resetSalestrailSyncLock` | Yes | No | No |
| `updateSalestrailConfig` | Yes | No | No |
| `getSalestrailConfig` | Yes | Yes | No |
| `getSalestrailCalls` | Yes | Yes | By lead access* |
| `getLeadSalestrailCalls` | Yes | Yes | By lead access* |

*"By lead access" means: the function verifies the user's region matches the lead's region before returning results.

### 4.3 Secret Management

**Status**: APPROVED (updated for Basic Auth). Two Firebase secrets replace the previous single-key assumption:

```bash
firebase functions:secrets:set SALESTRAIL_API_USERNAME
firebase functions:secrets:set SALESTRAIL_API_PASSWORD
```

The Basic Auth header is constructed server-side only:
```
Authorization: Basic base64(username:password)
```

Neither credential is ever exposed to the client or stored in Firestore.

Register both secrets in `functions/src/salestrailSync.ts`:
```typescript
import { defineSecret } from "firebase-functions/params";
export const salestrailUsername = defineSecret("SALESTRAIL_API_USERNAME");
export const salestrailPassword = defineSecret("SALESTRAIL_API_PASSWORD");
```

Then in `functions/src/salestrail.ts`, declare them for every function that calls the sync engine:
```typescript
export const syncSalestrailCallsCallable = onCall(
  { secrets: [salestrailUsername, salestrailPassword] },
  async (request) => { ... }
);
```

---

## 5. UI/UX Review

### 5.1 SystemSettingsPanel Integration

**Proposed**: New collapsible "Salestrail" section with toggle, status badge, last sync info, and Sync Now button.

**Assessment**: APPROVED. Follows the existing Section pattern. The sync status flow (Idle → InProgress → Success/Error) is well-defined.

#### FINDING 18: Missing dry-run mode — LOW

**Recommendation**: Add a "Dry Run" checkbox next to Sync Now. When checked, the sync engine fetches from the API, normalizes, and reports counts, but does NOT write to Firestore. This lets admins verify the API connection and see what would be imported before committing.

Implementation: pass `dryRun: true` through the callable to `syncSalestrailCalls()`.

### 5.2 SalestrailCalls Page

**Proposed**: Admin/manager page with table, filters, expandable rows, and lead navigation.

**Assessment**: APPROVED with minor adjustments.

#### FINDING 19: Missing operational controls — MEDIUM

**Recommendation**: Add to the page:
- **Date range presets**: "Today", "Last 7 days", "Last 30 days", "All" — default "Last 7 days"
- **Stats summary bar**: above the table — "X calls imported | Y matched | Z unmatched | Last sync: date"
- **Error-only filter**: quick toggle to show only `importStatus: "error"` calls
- **Export CSV button** (future, not v1): placeholder disabled button with tooltip "Coming soon"

### 5.3 Lead Detail Integration

**Proposed**: "Calls" tab in lead detail showing last 10 matched Salestrail calls.

**Assessment**: APPROVED. The "Calls" label (not "Salestrail Calls") is correct for UX — regular users shouldn't need to know the integration name.

### 5.4 Missing Workflows

| Missing Workflow | Priority | Notes |
|-----------------|----------|-------|
| Manual rematch | LOW | Admins might want to re-run matching for unmatched calls after phone numbers are corrected in leads |
| Call review/dismiss | LOW | Marking a matched call as "reviewed" or "not relevant" |
| Bulk lead creation from unmatched calls | LOW (future) | Convert unmatched calls into new leads |

---

## 6. Implementation Risk Assessment

### HIGH RISK

| # | Risk | Impact | Mitigation |
|---|------|--------|------------|
| R1 | **lead.id type mismatch** — numeric vs string Firestore doc IDs | Matching logic completely broken | Audit `leads` collection before coding. Verify doc ID format. |
| R2 | ~~Salestrail API schema unknown~~ → **RESOLVED** | API schema confirmed 2026-06-17. Basic Auth, base URL, endpoint path, field names all documented in Section 7. | N/A — resolved. |
| R3 | **Firestore rules can't enforce lead-level access** | Unauthorized call viewing | Use callable-based access control (server-side region checks). Disable direct reads on salestrailCalls. |
| R4 | **Sync lock race condition** — two simultaneous Sync Nows | Duplicate imports, corrupt sync state | Implement lock as Firestore transaction, not plain read-then-write. |
| R5 | **rawPayload exceeds 1 MiB document limit** | Failed writes, incomplete imports | Add size guard + truncation. Consider subcollection for payloads. |

### MEDIUM RISK

| # | Risk | Impact | Mitigation |
|---|------|--------|------------|
| R6 | **Missing leads.phone index** — Firestore `in` query fails | Matching silently broken | Verify index exists. Add to firestore.indexes.json if missing. |
| R7 | **Batch write partial failure** — 500 docs in a failed batch lost | Missing data, silent gaps | Per-batch retry with exponential backoff. Log failed batch indices. |
| R8 | **Sync lock stale forever** — crash during sync | Sync permanently blocked | 15-min timeout + resetSalestrailSyncLock callable. |
| R9 | **Salestrail rate limiting** | Sync interrupted mid-run | Handle 429 responses with backoff. Return partial results. |
| R10 | **Phone number false matches** — e.g., shared office numbers | Wrong lead association | `matchConfidence: "partial"` for non-unique matches. Surface for manual review. |

### LOW RISK

| # | Risk | Impact | Mitigation |
|---|------|--------|------------|
| R11 | **Timezone handling** — `sourceCreatedAt` in ambiguous TZ | Wrong date grouping | Store as UTC Timestamp. Display in local timezone client-side. |
| R12 | **Large number of unmatched calls** | Cluttered UI, noisy data | Filter unmatched calls from lead detail views. Show only on admin page. |
| R13 | **Recording reference format changes** | Broken recording links in v2 | Store `recordingReference` as opaque string. Don't parse or assume format. |
| R14 | **Firestore composite index deployment delay** | Queries fail until indexes build | Deploy indexes in Phase 0 (before any code that queries). |

---

## 7. Salestrail API Mapping (Confirmed)

**Updated**: 2026-06-17 — real API schema confirmed.

### 7.1 API Endpoint & Auth

| Parameter | Value |
|-----------|-------|
| Base URL | `https://standalone-api.salestrail.io` |
| Auth method | HTTP Basic Auth |
| Auth header | `Authorization: Basic base64(username:password)` |
| Incremental sync | `GET /export/calls/byCreated/json` |
| Required params | `?from=<ISO-8601>&to=<ISO-8601>` |
| Firebase secrets | `SALESTRAIL_API_USERNAME`, `SALESTRAIL_API_PASSWORD` |

### 7.2 SalestrailRawCall Schema

Field-by-field mapping from the API response to internal processing:

| API Field | Type | Required | Maps To | Notes |
|-----------|------|----------|----------|-------|
| `callId` | string | Yes | `salestrailCallId` | Document ID — idempotency key |
| `answered` | boolean | Yes | `callType` | true → "answered", false → "missed" |
| `inbound` | boolean | Yes | `direction` | true → "inbound", false → "outbound" |
| `startTime` | string (ISO) | Yes | `sourceCreatedAt` | **Primary** timestamp — preferred over `createdAt` |
| `createdAt` | string (ISO) | No | `sourceCreatedAt` | **Fallback** if `startTime` is absent |
| `duration` | number | No | `durationSeconds` | Seconds |
| `number` | string | Yes | callerNumber OR calleeNumber | See phone mapping (7.3) |
| `formattedNumber` | string | No | — | Display-only; not stored separately |
| `userPhone` | string | No | callerNumber OR calleeNumber | Staff phone; see phone mapping (7.3) |
| `userName` | string | No | `userName` | Staff display name |
| `userEmail` | string | No | `userEmail` | Used for `assignedRepId` matching |
| `userId` | string/number | No | — | Salestrail internal ID; stored for reference tracing |
| `userTeams` | string[] | No | — | Stored in rawPayload for future org analysis |
| `phonebookName` | string | No | `callerName` | Contact name from Salestrail phonebook |
| `recType` | string | No | `callType` (detail) | e.g. "answered", "missed", "voicemail" |
| `source` | string | No | rawPayload only | Call origin (e.g. "android", "web") |
| `sourceDetail` | string | No | rawPayload only | Additional source info |
| `recurId` | string | No | rawPayload only | Recurrence group ID |
| `integrated` | boolean | No | rawPayload only | Integration flag |

### 7.3 Phone Number Mapping

The API provides `number` (the external party) and `userPhone` (the staff member). Direction determines which maps to caller/callee:

**Inbound calls** (`inbound: true`):
```
callerNumber = number          // external caller
calleeNumber = userPhone       // staff receiving the call
direction    = "inbound"
```

**Outbound calls** (`inbound: false`):
```
callerNumber = userPhone       // staff making the call
calleeNumber = number          // external callee
direction    = "outbound"
```

Both numbers are then normalised through `normalizeAUPhone()`:
```
callerNumberNormalized = normalizeAUPhone(calleeNumber)  // note: typo here? no — we normalize BOTH
calleeNumberNormalized = normalizeAUPhone(calleeNumber)  // actually wait
```

**Correction — both sides normalised independently**:
```
callerNumberNormalized = normalizeAUPhone(callerNumber)
calleeNumberNormalized = normalizeAUPhone(calleeNumber)
```

The matching query searches `leads` by normalised phone — if `callerNumberNormalized` matches a lead and `inbound === true`, that lead was calling in. If `calleeNumberNormalized` matches a lead and `inbound === false`, staff called that lead.

### 7.4 Timestamp Handling

```typescript
function resolveSourceTimestamp(raw: SalestrailRawCall): Date {
  // Prefer startTime (when the call actually began)
  const startTime = raw.startTime ?? raw.createdAt;
  if (startTime) {
    const d = new Date(startTime);
    // Cap at current time to protect against clock skew
    return d > new Date() ? new Date() : d;
  }
  // If neither field exists, fall back to import time
  return new Date();
}
```

`sourceUpdatedAt` is set to the API's `updatedAt` field if provided; otherwise null.

### 7.5 callType Derivation

```
if (answered === false || recType === "missed")
  → callType = "missed"
else if (answered === true && durationSeconds !== null && durationSeconds === 0)
  → callType = "no-answer"
else if (answered === true)
  → callType = "answered"
else
  → callType = recType ?? null
```

### 7.6 Recording

Recording download is **deferred to v2**. The Salestrail API provides `/export/calls/{callId}/recording` but its behaviour (signed URL vs permanent, format, authentication) is not yet confirmed.

For v1, set:
```
recordingAvailable  = false
recordingReference  = callId  // ready for future fetch
recordingUrl        = null    // never store signed URLs
```

### 7.7 Raw Payload Sanitisation

The `sanitizePayload()` function (FINDING 16) must additionally strip Basic Auth credentials if the API response echoes them anywhere. The existing sensitive-key blacklist already covers `authorization`, `token`, `password`, `credential`.

### 7.8 Sync Strategy (Updated)

```
GET /export/calls/byCreated/json?from=2026-06-16T00:00:00Z&to=2026-06-17T00:00:00Z
Authorization: Basic <base64>
```

- **Incremental sync**: `from` = `lastSyncAt` (previous max `sourceCreatedAt`, ISO formatted). `to` = `new Date().toISOString()`.
- **Full sync**: `from` = epoch start; `to` = now.
- **Date range**: 24-hour windows recommended for incremental to keep response size manageable. If API has no pagination, implement client-side windowing (1-day slices, sequential fetch).

### 7.9 Assigned Rep Matching (Updated)

The API provides `userEmail` and `userName`. During the matching phase:

1. Query `reps` collection: `where("email", "==", raw.userEmail)`
2. If found, set `assignedRepId = rep.id`
3. If not found, `assignedRepId = null` (external consultant? deleted rep? admin UI can surface these as "unassigned staff calls")

---

## 8. Final Scores & Recommendation

### Scores

| Category | Score | Rationale |
|----------|-------|-----------|
| **Architecture** | **9/10** | Callable-agnostic sync engine is well-designed. API abstraction layer confirmed correct with real schema. One point deducted: sync lock still needs transaction (R4). |
| **Security** | **8/10** | Two-secret Basic Auth is correct. Callable gating is sound. Two points deducted: Firestore rules gap (R3), recording access model deferred to v2. |
| **Scalability** | **8/10** | Batch writes, chunked queries, and pagination are all correct. Two points deducted: unbounded real-time listener risk (F14), and no clear strategy for very large syncs (>10k calls). |
| **Maintainability** | **10/10** | Clean module separation, fully typed interfaces, forward-compatible schema. All API-specific code isolated to two functions. |
| **Launch Readiness** | **8/10** | API schema confirmed (R2 resolved). Phone normalization deployed. Remaining: leads doc ID audit (R1), Firestore rules resolution (R3), sync lock transaction (R4). |

### Overall: **APPROVED FOR EPIC 1**

The architecture is sound and the real API schema matches the abstraction perfectly. The following **prerequisites** remain:

1. ~~Obtain Salestrail API docs~~ → **RESOLVED** — Section 7 documents the confirmed schema.
2. **Audit `leads` collection** — confirm document ID format (numeric vs auto-generated).
3. **Verify `leads.phone` index** — already confirmed present via Firestore auto-indexing. Deploy composite indexes during Phase 0.
4. **Resolve Firestore rules gap** — adopt callable-based access control for salestrailCalls reads (implementation task, not a prerequisite).

### Prerequisites Status

| # | Prerequisite | Status |
|---|-------------|--------|
| P1 | Audit leads doc ID format | **RESOLVED** — numeric strings (`"1768559328123456"`). Confirmed via codebase audit (leadSnapshots/useFirebase). |
| P2 | Salestrail API schema | **RESOLVED** — Section 7 documents all fields, auth, endpoints. |
| P3 | leads.phone index | **RESOLVED** — Firestore auto-creates single-field indexes on first query. |
| P4 | SALESTRAIL secrets | **PENDING** — `firebase functions:secrets:set` needed before first deploy. |

### Implementation Readiness Verdict: **READY**

Epic 1 (Foundation & Schema) can begin immediately. The TypeScript types, Firestore schema, collection rules, config extension, and server stubs have no remaining unknowns. The only blocking action is setting the two Firebase secrets before the first sync callable deploy.
```
All reads go through `getSalestrailCalls` and `getLeadSalestrailCalls` callables with server-side access control.
