# Salestrail Integration — Task Breakdown

**Date**: 2026-06-16 (updated 2026-06-17)
**Format**: Epic → Feature → Task (GitHub Issues / Linear compatible)
**Complexity**: S (1-3h), M (3-8h), L (1-2 days), XL (2-4 days)

---

## Prerequisites Block

> **Status: 3/4 RESOLVED** — one action remains.

### PRE-1: Audit leads collection document ID format
- **Status**: **RESOLVED** — numeric strings, `String(lead.id)` used as doc ID. Confirmed via codebase audit.
- **Complexity**: S
- **Dependencies**: None

### PRE-2: Obtain Salestrail API documentation
- **Status**: **RESOLVED** — confirmed 2026-06-17. Base URL, Basic Auth, endpoint path, 19 field names all documented.
- **Complexity**: S
- **Dependencies**: None

### PRE-3: Verify leads.phone Firestore index
- **Status**: **RESOLVED** — Firestore auto-creates single-field indexes on first query. No manual index entry needed.
- **Complexity**: S
- **Dependencies**: PRE-1

### PRE-4: Configure SALESTRAIL secrets
- **Status**: **PENDING** — run before first deploy.
- **Complexity**: S
- **Dependencies**: PRE-2
- **Description**: Run `firebase functions:secrets:set SALESTRAIL_API_USERNAME` and `firebase functions:secrets:set SALESTRAIL_API_PASSWORD` with the Basic Auth credentials from Salestrail.
- **Acceptance**: Both secrets set. Confirmed via `firebase functions:secrets:list`.

---

## Epic 1: Foundation & Schema

### Feature 1.1: Type Definitions

#### TASK-1.1.1: Define SalestrailCallDoc type
- **Complexity**: S
- **Dependencies**: PRE-1
- **File**: `src/types/index.ts`
- **Description**: Add `SalestrailCallDoc` interface with all fields from the reviewed schema. Add `SyncResult`, `SalestrailConfig`, `SalestrailSyncStatus` types. Export from types barrel.
- **Acceptance**: `tsc --noEmit` passes. All fields match design doc schema.

#### TASK-1.1.2: Extend AppConfig with integrations section
- **Complexity**: S
- **Dependencies**: TASK-1.1.1
- **Files**: `src/hooks/useAppSettings.ts`, `functions/src/settingsAdmin.ts`
- **Description**: Add `IntegrationSettings` and `SalestrailConfig` to `AppConfig`. Add `integrations` to `DEFAULT_APP_CONFIG`. Add `integrations.salestrail` to `settingsAdmin.ts` allowed sections whitelist.
- **Acceptance**: `tsc --noEmit` passes. Settings admin allows `integrations.salestrail.*` writes.

### Feature 1.2: Firestore Schema

#### TASK-1.2.1: Add salestrailCalls composite indexes
- **Complexity**: S
- **Dependencies**: None
- **File**: `firestore.indexes.json`
- **Description**: Add 5+ composite indexes: `matchedLeadId + sourceCreatedAt DESC`, `userEmail + sourceCreatedAt DESC`, `importStatus + sourceCreatedAt DESC`, `direction + sourceCreatedAt DESC`, `importBatchId + sourceCreatedAt DESC`, `assignedRepId + sourceCreatedAt DESC`, `region + sourceCreatedAt DESC`.
- **Acceptance**: Indexes added. `firebase deploy --only firestore:indexes` succeeds.

#### TASK-1.2.2: Add salestrailCalls Firestore rules
- **Complexity**: S
- **Dependencies**: None
- **File**: `firestore.rules`
- **Description**: Add `match /salestrailCalls/{callId} { allow read, write: if false; }`. All access through callables.
- **Acceptance**: Rules deployed. Direct client reads/writes to `salestrailCalls` are rejected.

### Feature 1.3: Server Stubs

#### TASK-1.3.1: Create salestrailSync.ts skeleton
- **Complexity**: S
- **Dependencies**: TASK-1.1.1
- **File**: `functions/src/salestrailSync.ts`
- **Description**: Create file with typed exports: `syncSalestrailCalls()`, `fetchSalestrailCalls()`, `transformCall()`, `sanitizePayload()`, `batchWriteCalls()`, `matchCallsToLeads()`. All functions return empty/stub values for now.
- **Acceptance**: `cd functions && npm run build` passes. All function signatures typed.

#### TASK-1.3.2: Create salestrail.ts callable wrappers
- **Complexity**: S
- **Dependencies**: TASK-1.3.1
- **File**: `functions/src/salestrail.ts`
- **Description**: Create `syncSalestrailCallsCallable` (onCall, admin-only), `getSalestrailConfig` (onCall), `updateSalestrailConfig` (onCall, admin-only). Import and call stubs from `salestrailSync.ts`.
- **Acceptance**: `cd functions && npm run build` passes. Callables exportable.

#### TASK-1.3.3: Register exports in index.ts
- **Complexity**: S
- **Dependencies**: TASK-1.3.2
- **File**: `functions/src/index.ts`
- **Description**: Re-export all salestrail callables from `index.ts`.
- **Acceptance**: `firebase deploy --only functions` succeeds. Callables appear in Firebase console.

---

## Epic 2: Backend Sync Engine

### Feature 2.1: API Integration Layer

#### TASK-2.1.1: Implement fetchSalestrailCalls()
- **Complexity**: L
- **Dependencies**: PRE-2, TASK-1.3.1
- **File**: `functions/src/salestrailSync.ts`
- **Description**: Implement HTTP fetch to Salestrail API. Accept `apiKey`, optional `since`, `limit`, `page` params. Handle auth header per API docs. Handle pagination (fetch all pages if API paginates). Handle rate limiting (429 → retry with backoff). Return `SalestrailRawCall[]`.
- **Acceptance**: Can be called standalone with a real API key and returns data. 429 responses retried. Network errors throw descriptive errors.

#### TASK-2.1.2: Implement sanitizePayload()
- **Complexity**: S
- **Dependencies**: TASK-2.1.1
- **File**: `functions/src/salestrailSync.ts`
- **Description**: Recursively strip keys matching `apiKey`, `token`, `auth`, `authorization`, `password`, `secret`, `credential`, `bearer` (case-insensitive). Truncate JSON output > 500 KB. Unit test with mock payloads containing fake credentials.
- **Acceptance**: Unit test verifies sensitive keys are stripped. Truncation works on large payloads.

#### TASK-2.1.3: Implement transformCall()
- **Complexity**: M
- **Dependencies**: TASK-2.1.2
- **File**: `functions/src/salestrailSync.ts`
- **Description**: Map `SalestrailRawCall` → partial `SalestrailCallDoc`. Normalize phone numbers with `normalizeAUPhone()` (copy function to server or import shared util). Set `sourceCreatedAt`, `callerNumberNormalized`, `calleeNumberNormalized`, `durationSeconds`, `callType`, `direction`. Set `importStatus: "new"`, `matchConfidence: "none"`. Sanitize `rawPayload`.
- **Acceptance**: Unit test with mock API response produces correct `SalestrailCallDoc` fields. Null/undefined/missing fields handled without throwing.

### Feature 2.2: Sync Orchestration

#### TASK-2.2.1: Implement sync lock with Firestore transaction
- **Complexity**: M
- **Dependencies**: TASK-1.3.1
- **File**: `functions/src/salestrailSync.ts`
- **Description**: Acquire `syncInProgress` lock via `db.runTransaction()` on `appSettings/config`. Check existing lock — if active and <15 min stale, throw "Sync already in progress". If stale, override. Set `syncBatchId` (UUID), `syncStartedAt`. Release on completion or error.
- **Acceptance**: Two concurrent `syncSalestrailCalls()` calls → second throws. Stale lock >15 min → override succeeds. Lock released after sync completes.

#### TASK-2.2.2: Implement syncSalestrailCalls() orchestration
- **Complexity**: L
- **Dependencies**: TASK-2.1.1, TASK-2.1.3, TASK-2.2.1
- **File**: `functions/src/salestrailSync.ts`
- **Description**: Main orchestrator:
  1. Acquire sync lock
  2. Read config for `lastSyncAt`
  3. Call `fetchSalestrailCalls()` with date range
  4. Transform each raw call via `transformCall()`
  5. Write to Firestore via `batchWriteCalls()` (see TASK-2.2.3)
  6. Update `appSettings/config` with `lastSyncAt`, `lastSyncStatus`, counts
  7. Write audit log entry
  8. Release lock
  9. Return `SyncResult`
  Support `dryRun: true` (skip step 5).
- **Acceptance**: Full sync cycle runs end-to-end. Dry run returns correct counts without writing. Error during fetch aborts cleanly.

#### TASK-2.2.3: Implement batchWriteCalls()
- **Complexity**: M
- **Dependencies**: TASK-2.1.3
- **File**: `functions/src/salestrailSync.ts`
- **Description**: Write calls to `salestrailCalls` collection in batches of 500. Before each batch, `getAll()` existing docs for merge strategy: preserve `matchedLeadId`/`matchedClientId`/CRM fields if already set, overwrite API-source fields. Retry failed batches up to 3 times with exponential backoff. Return `{ importedCount, updatedCount, skippedCount, errorCount, failedBatchIndices }`.
- **Acceptance**: Duplicate call IDs skipped. Merge preserves CRM fields. Failed batch retried. Counts accurate.

### Feature 2.3: Callable Wrappers

#### TASK-2.3.1: Implement syncSalestrailCallsCallable
- **Complexity**: M
- **Dependencies**: TASK-2.2.2
- **File**: `functions/src/salestrail.ts`
- **Description**: onCall wrapper. `requireAuth(request)`. `requireMinimumRole(auth, "admin")`. Call `syncSalestrailCalls({ fullSync: request.data.fullSync ?? false, dryRun: request.data.dryRun ?? false })`. Return result.
- **Acceptance**: Admin can trigger sync. Non-admin receives permission-denied. Dry-run flag works.

#### TASK-2.3.2: Implement resetSalestrailSyncLock callable
- **Complexity**: S
- **Dependencies**: TASK-2.2.1
- **File**: `functions/src/salestrail.ts`
- **Description**: onCall. Admin-only. Clears `syncInProgress`, `syncStartedAt`, `syncBatchId` on `appSettings/config`.
- **Acceptance**: Admin can clear a stuck lock. Non-admin receives permission-denied.

#### TASK-2.3.3: Implement config callables
- **Complexity**: S
- **Dependencies**: TASK-1.1.2
- **File**: `functions/src/salestrail.ts`
- **Description**: `getSalestrailConfig` (read-only, any authenticated), `updateSalestrailConfig` (admin-only, partial update of `integrations.salestrail`).
- **Acceptance**: Config reads correctly. Updates persist and validate.

---

## Epic 3: Lead Matching

### Feature 3.1: Phone Matching Engine

#### TASK-3.1.1: Implement lookupLeadsByPhone()
- **Complexity**: M
- **Dependencies**: TASK-2.1.3, PRE-3
- **File**: `functions/src/salestrailSync.ts`
- **Description**: Accept `normalizedPhones: string[]`. Chunk into groups of 10 (Firestore `in` limit). Query `leads.where("phone", "in", chunk)`. Build `Map<normalizedPhone, leadDoc[]>`. Handle empty input array gracefully. Also build `repsPhoneMap` for internal call detection via `reps.where("phone", "in", chunk)`.
- **Acceptance**: Unit test with mock phones returns correct map. Empty array returns empty map. Group of 15 phones makes 2 queries.

#### TASK-3.1.2: Implement matchCallsToLeads()
- **Complexity**: M
- **Dependencies**: TASK-3.1.1
- **File**: `functions/src/salestrailSync.ts`
- **Description**: For each transformed call:
  1. Look up `callerNumberNormalized` and `calleeNumberNormalized` in `leadsPhoneMap`
  2. Look up both in `repsPhoneMap` for internal detection
  3. Both match reps → `direction: "internal"`, no lead match
  4. One side matches lead → set `matchedLeadId`, `matchedOn`, `matchedPhoneNumber`, `matchConfidence: "exact"`
  5. Both match leads → prefer callee match (outbound call logic)
  6. Neither matches → `importStatus: "unmatched"`
  7. Also set `assignedRepId` by matching `userEmail` to `reps` email
  8. Set `region` from matched lead's region if available
- **Acceptance**: Unit tests for each scenario. Exact, partial, and none confidence levels correct. Internal call detection works.

#### TASK-3.1.3: Integrate matching into sync pipeline
- **Complexity**: S
- **Dependencies**: TASK-3.1.2, TASK-2.2.2
- **File**: `functions/src/salestrailSync.ts`
- **Description**: Insert matching step between transform and batchWrite in `syncSalestrailCalls()`. Collect unique normalized phones from all calls, batch-lookup, match, then write.
- **Acceptance**: End-to-end sync with real lead data produces matchedLeadId on matching calls.

### Feature 3.2: Access-Controlled Query Callables

#### TASK-3.2.1: Implement getSalestrailCalls callable
- **Complexity**: M
- **Dependencies**: TASK-2.3.3
- **File**: `functions/src/salestrail.ts`
- **Description**: Accept filter params. Query `salestrailCalls` with server-side Firestore queries. For manager: return all. For rep: filter by `matchedLeadId` leads in user's `allowedRegions`. Paginate with cursor. Sanitize output (strip rawPayload for non-admins).
- **Acceptance**: Managers see all calls. Reps only see calls for leads in their region. Admin sees rawPayload. Pagination works.

#### TASK-3.2.2: Implement getLeadSalestrailCalls callable
- **Complexity**: S
- **Dependencies**: TASK-3.2.1
- **File**: `functions/src/salestrail.ts`
- **Description**: Accept `leadId`. Verify user has region access to that lead via `canAccessRegion()`. Query `salestrailCalls.where("matchedLeadId", "==", leadId)`. Order by `sourceCreatedAt desc`. Limit 50.
- **Acceptance**: Returns calls for lead. Rejects if user can't access that lead's region.

---

## Epic 4: Client UI

### Feature 4.1: Settings Panel Integration

#### TASK-4.1.1: Add Salestrail section to SystemSettingsPanel
- **Complexity**: M
- **Dependencies**: TASK-1.1.2, TASK-2.3.1
- **File**: `src/components/SystemSettingsPanel.tsx`
- **Description**: Add collapsible "Salestrail Integration" section. Controls: enabled toggle, last sync status badge (success/error/in-progress), last sync time, last sync count. Sync Now button with loading/result states. Dry Run checkbox. Follow existing `Section` pattern.
- **Acceptance**: Section renders. Toggle persists to Firestore. Sync Now triggers callable and shows result. Dry run checkbox works.

### Feature 4.2: useSalestrailCalls Hook

#### TASK-4.2.1: Implement useSalestrailCalls hook
- **Complexity**: M
- **Dependencies**: TASK-3.2.1
- **File**: `src/hooks/useSalestrailCalls.ts`
- **Description**: Hook wrapping `getSalestrailCalls` callable. Accept filter params (date range, user email, direction, status, leadId). Returns `{ calls, loading, error, hasMore, loadMore }`. Cursor pagination with `startAfter`. Default: last 7 days, ordered by `sourceCreatedAt desc`, limit 100.
- **Acceptance**: Hook returns calls. Pagination loads next page. Filters narrow results.

#### TASK-4.2.2: Implement useSalestrailSync hook
- **Complexity**: S
- **Dependencies**: TASK-2.3.1
- **File**: `src/hooks/useSalestrailSync.ts`
- **Description**: Hook wrapping `syncSalestrailCallsCallable`. Exposes `syncNow(dryRun?)` function, `syncing` state, `lastResult`, `error`. Pattern mirrors `useDocuSign.ts`.
- **Acceptance**: `syncNow()` triggers callable. Loading state updates. Result returned.

### Feature 4.3: SalestrailCalls Page

#### TASK-4.3.1: Register page in App type and sidebar
- **Complexity**: S
- **Dependencies**: None
- **File**: `src/App.tsx`
- **Description**: Add `"salestrail-calls"` to `Page` type. Add lazy import for `SalestrailCallsPage`. Add sidebar entry under SYSTEM section (admin/manager only). Label: "Salestrail".
- **Acceptance**: Page appears in sidebar for admin/manager. Click navigates to page. Non-admin/manager doesn't see entry.

#### TASK-4.3.2: Build SalestrailCallsPage component
- **Complexity**: L
- **Dependencies**: TASK-4.2.1, TASK-4.3.1
- **File**: `src/pages/SalestrailCallsPage.tsx`
- **Description**: Full-page component:
  - Stats summary bar: total imported, matched, unmatched, last sync time
  - Filter bar: date range presets, user email search, direction dropdown, status dropdown
  - Table columns: date/time, staff user, caller, callee, duration, direction, status, matched lead
  - Expandable row detail: call details, match info, admin sees rawPayload in collapsed "Developer details" section
  - Click matched lead name → navigates to lead profile
  - Client-side pagination via "Load more" button
  - Empty state when no calls imported
- **Acceptance**: Page renders with data. Filters work. Row expansion works. Lead navigation works. Empty state renders.

### Feature 4.4: Lead Detail Integration

#### TASK-4.4.1: Build SalestrailCallsTab component
- **Complexity**: M
- **Dependencies**: TASK-3.2.2, TASK-4.3.2
- **File**: `src/components/SalestrailCallsTab.tsx`
- **Description**: Compact panel showing last 10 calls matched to a lead. Columns: date, duration, staff name, direction. "View all" link navigates to SalestrailCallsPage filtered by this lead.
- **Acceptance**: Panel renders on lead detail. Shows correct calls. "View all" navigates correctly.

#### TASK-4.4.2: Integrate into lead detail view
- **Complexity**: S
- **Dependencies**: TASK-4.4.1
- **Files**: `src/components/LeadSidebar.tsx` or `src/pages/ClientProfilePage.tsx`
- **Description**: Add "Calls" tab/panel to lead detail view. Import and render `SalestrailCallsTab`. Only show if lead has matched calls or integration is enabled.
- **Acceptance**: "Calls" tab appears in lead detail. Matched calls display correctly.

---

## Epic 5: Polish & Reporting (Phase 3)

### Feature 5.1: Call Review Workflow

#### TASK-5.1.1: Add unmatched calls review view
- **Complexity**: M
- **Dependencies**: TASK-4.3.2
- **File**: `src/pages/SalestrailCallsPage.tsx`
- **Description**: Quick filter toggle: "Unmatched only". Shows calls with `importStatus: "unmatched"`. Add "Review" action per row (marks `reviewedBy`, `reviewedAt`).
- **Acceptance**: Unmatched filter works. Review action persists to Firestore.

#### TASK-5.1.2: Implement manual rematch
- **Complexity**: M
- **Dependencies**: TASK-3.1.2
- **Files**: `functions/src/salestrail.ts`, `functions/src/salestrailSync.ts`
- **Description**: `rematchSalestrailCall` callable. Admin-only. Re-runs phone matching for a single call or all unmatched calls. Updates `matchedLeadId`, `matchConfidence` if new matches found.
- **Acceptance**: Rematch updates existing call docs. New matches appear in UI.

### Feature 5.2: Rep Performance Stats

#### TASK-5.2.1: Build SalestrailRepStats component
- **Complexity**: M
- **Dependencies**: TASK-4.2.1
- **File**: `src/components/SalestrailRepStats.tsx`
- **Description**: Dashboard card showing per-rep call stats: total calls, avg duration, inbound/outbound split, calls per day trend. Query `salestrailCalls` grouped by `assignedRepId` for last 30 days.
- **Acceptance**: Stats render per rep. Numbers are accurate.

### Feature 5.3: CSV Export

#### TASK-5.3.1: Add CSV export to SalestrailCalls page
- **Complexity**: S
- **Dependencies**: TASK-4.3.2
- **File**: `src/pages/SalestrailCallsPage.tsx`
- **Description**: "Export CSV" button. Generates CSV from currently filtered calls. Downloads via `URL.createObjectURL` + Blob. Columns: date, staff, caller, callee, duration, direction, matched lead, status.
- **Acceptance**: CSV downloads with correct data. All visible columns included.

---

## Epic 6: Scheduled Sync & Analytics (Phase 4, Future)

### Feature 6.1: Automated Sync

#### TASK-6.1.1: Add onSchedule Salestrail sync function
- **Complexity**: S
- **Dependencies**: TASK-2.2.2
- **File**: `functions/src/salestrail.ts`
- **Description**: `onSchedule({ schedule: "0 */6 * * *", timeZone: "Australia/Sydney" }, () => syncSalestrailCalls({ fullSync: false }))`. Register in `index.ts`. Sync lock prevents overlap with manual sync.
- **Acceptance**: Sync runs automatically. Manual sync still works concurrently (blocked by lock).

#### TASK-6.1.2: Add sync frequency config
- **Complexity**: S
- **Dependencies**: TASK-6.1.1, TASK-4.1.1
- **File**: `src/components/SystemSettingsPanel.tsx`
- **Description**: Dropdown in Salestrail settings: "Sync every: 1h / 6h / 12h / 24h / Manual only". Updates `integrations.salestrail.syncFrequency`.
- **Acceptance**: Setting persists. (Actual schedule change requires redeploy; document this limitation.)

### Feature 6.2: Analytics Dashboard

#### TASK-6.2.1: Build SalestrailAnalytics component
- **Complexity**: L
- **Dependencies**: TASK-4.2.1
- **File**: `src/components/SalestrailAnalytics.tsx`
- **Description**: Analytics page/section: call volume trend chart (last 30 days), time-of-day heatmap, inbound/outbound ratio, top callers/callees, missed call rate. Use simple SVG/Canvas charts (no new dependencies).
- **Acceptance**: Charts render. Data matches underlying collection.

---

## Summary: Task Count & Complexity

| Epic | S | M | L | XL | Total |
|------|---|---|---|-----|-------|
| PRE (Prerequisites) | 4 | 0 | 0 | 0 | 4 |
| Epic 1: Foundation | 7 | 0 | 0 | 0 | 7 |
| Epic 2: Sync Engine | 4 | 5 | 2 | 0 | 11 |
| Epic 3: Matching | 3 | 5 | 0 | 0 | 8 |
| Epic 4: Client UI | 4 | 4 | 1 | 0 | 9 |
| Epic 5: Reporting | 1 | 3 | 0 | 0 | 4 |
| Epic 6: Scheduled (future) | 2 | 0 | 1 | 0 | 3 |
| **Total** | **25** | **17** | **4** | **0** | **46** |

### Estimated Timeline

| Phase | Epics | Duration |
|-------|-------|----------|
| Prerequisites | PRE | 1 day |
| Phase 0 | Epic 1 | 1-2 days |
| Phase 1 | Epic 2 | 3-4 days |
| Phase 2 | Epic 3 + 4 | 4-5 days |
| Phase 3 | Epic 5 | 2-3 days |
| Phase 4 | Epic 6 | 2-3 days |

**Total estimated**: 13-18 days of focused engineering work.
