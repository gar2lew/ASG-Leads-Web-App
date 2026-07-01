# Salestrail Integration — Implementation Plan

**Date**: 2026-06-16 (updated 2026-06-17)
**Status**: Ready — Prerequisites Resolved
**Design Reference**: `2026-06-16-salestrail-design.md`

---

## Prerequisites (All Resolved)

- [x] **P1**: Audit `leads` collection — **CONFIRMED**: numeric strings (`"1768559328123456"`). `Lead.id` is `number`, Firestore doc ID is `String(id)`. Matched via `leads.doc(String(leadId))` or `leads.where("phone", "==", normalized)`.
- [x] **P2**: Salestrail API documentation — **CONFIRMED 2026-06-17**. Base URL, auth (Basic), endpoint, field names all documented in design doc Section 7.
- [x] **P3**: `leads.phone` index — Firestore auto-creates single-field indexes on first query. Existing `leads.where("region", ...)` queries confirm indexing works. No manual index needed.
- [ ] **P4**: Firebase Functions secrets — `SALESTRAIL_API_USERNAME` + `SALESTRAIL_API_PASSWORD`. Must be set before first sync callable deploy.

---

## Phase 0 — Foundation & Schema (Day 1-2)

**Objective**: Deployable but non-functional skeleton. No sync logic yet — just types, collection, indexes, and config schema.

### Deliverables
- Firestore schema finalized (types, collection indexes)
- `salestrailCalls` collection security rule (callable-only)
- `appSettings/config` extended with `integrations.salestrail` section
- Server module stubs (`salestrailSync.ts`, `salestrail.ts`)
- `SALESTRAIL_API_KEY` secret registered
- Zero production impact

### Files Changed/Created
| File | Action | Notes |
|------|--------|-------|
| `src/types/index.ts` | MODIFY | Add `SalestrailCallDoc`, `SyncResult`, `SalestrailConfig` types |
| `src/hooks/useAppSettings.ts` | MODIFY | Extend `AppConfig` with `integrations.salestrail` |
| `functions/src/salestrailSync.ts` | CREATE | Stub: empty `syncSalestrailCalls()` returning `SyncResult` |
| `functions/src/salestrail.ts` | CREATE | Stub: `syncSalestrailCallsCallable` (onCall, admin-only) |
| `functions/src/index.ts` | MODIFY | Re-export salestrail callables |
| `firestore.indexes.json` | MODIFY | Add 5 composite indexes for `salestrailCalls` |
| `firestore.rules` | MODIFY | Add `salestrailCalls` rule (allow read/write: if false) |
| `functions/src/settingsAdmin.ts` | MODIFY | Add `integrations.salestrail` to allowed sections |

### Validation
- [ ] `cd functions && npm run build` — zero errors
- [ ] `npm run build` (client) — zero errors
- [ ] `firebase deploy --only firestore:indexes` — indexes created
- [ ] `firebase deploy --only firestore:rules` — rules deployed
- [ ] `firebase deploy --only functions` — callable stubs deploy without errors
- [ ] Call `getSalestrailConfig` via client — returns default config

### Rollback
- Revert `firestore.rules` and `firestore.indexes.json` changes
- Redeploy `firebase deploy --only firestore:rules,firestore:indexes`
- Remove salestrail exports from `functions/src/index.ts`, redeploy functions

---

## Phase 1 — Backend Sync Engine (Day 3-5)

**Objective**: Working `syncSalestrailCalls()` that fetches from Salestrail API and persists to Firestore. No lead matching yet — all calls imported as `importStatus: "new"`.

### Deliverables
- `fetchSalestrailCalls()` — HTTP call to Salestrail API with auth
- `transformCall()` — map raw API response → `SalestrailCallDoc`
- `sanitizePayload()` — strip sensitive keys from rawPayload
- `batchWriteCalls()` — chunked Firestore writes (500/batch) with merge strategy
- Sync lock via Firestore transaction
- Stale lock override (15-min timeout)
- `resetSalestrailSyncLock` callable
- `lastSyncAt` based on max `sourceCreatedAt`, capped at `Date.now()`
- Audit log entry per sync run
- Sync Now button in SystemSettingsPanel (admin-only)

### Files Changed/Created
| File | Action | Notes |
|------|--------|-------|
| `functions/src/salestrailSync.ts` | WRITE | Full sync engine implementation |
| `functions/src/salestrail.ts` | WRITE | Callable wrappers with auth |
| `functions/src/index.ts` | MODIFY | Export `resetSalestrailSyncLock` |
| `src/hooks/useSalestrailSync.ts` | CREATE | Client hook for sync callable |
| `src/components/SystemSettingsPanel.tsx` | MODIFY | Add Salestrail section |
| `src/hooks/useAppSettings.ts` | MODIFY | Add `integrations` to defaults |

### Validation
- [ ] Unit test: `sanitizePayload()` strips auth headers, tokens
- [ ] Unit test: `transformCall()` handles null/undefined fields safely
- [ ] Integration test: `syncSalestrailCalls()` with dry-run flag — fetches from API, counts correctly
- [ ] `syncSalestrailCalls({ dryRun: true })` — returns counts, writes NOTHING to Firestore
- [ ] `syncSalestrailCalls()` — writes to Firestore, `salestrailCalls` docs appear
- [ ] Re-run sync — existing docs preserved, new docs added, `skippedCount` correct
- [ ] Concurrent sync attempt — second callable returns "Sync already in progress"
- [ ] Stale lock — simulate a crash, wait >15 min, `resetSalestrailSyncLock` clears lock
- [ ] Sync Now button in UI — triggers sync, shows loading, shows result
- [ ] `cd functions && npm run build` — zero errors
- [ ] `npm run build` (client) — zero errors
- [ ] `npm run test` — all existing tests pass

### Rollback
- Revert `salestrailSync.ts` and `salestrail.ts` to stubs
- Remove Salestrail section from SystemSettingsPanel
- Redeploy functions

---

## Phase 2 — Lead Matching & UI (Day 6-8)

**Objective**: Phone number matching against leads and reps. Dedicated SalestrailCalls page. Lead detail integration.

### Deliverables
- Phone normalization (reuse `normalizeAUPhone()` from `src/lib/utils.ts`)
- Batch lead lookup by phone (chunked `where("phone", "in", [...])`, groups of 10)
- Rep lookup by phone for internal call detection
- Match assignment logic (caller/callee → lead, confidence scoring)
- `useSalestrailCalls` hook with real-time listener (date-bounded, paginated)
- `useLeadSalestrailCalls` hook filtered by matchedLeadId
- `SalestrailCallsPage` component with table, filters, pagination
- Lead detail "Calls" tab/panel
- Server-side `getSalestrailCalls` and `getLeadSalestrailCalls` callables (access-controlled)
- Dry-run mode for Sync Now

### Files Changed/Created
| File | Action | Notes |
|------|--------|-------|
| `functions/src/salestrailSync.ts` | MODIFY | Add `matchCallsToLeads()`, `lookupLeadsByPhone()` |
| `functions/src/salestrail.ts` | MODIFY | Add `getSalestrailCalls`, `getLeadSalestrailCalls` callables |
| `src/hooks/useSalestrailCalls.ts` | CREATE | Real-time listener hook |
| `src/pages/SalestrailCallsPage.tsx` | CREATE | Full-page table view |
| `src/components/SalestrailCallsTab.tsx` | CREATE | Lead detail calls panel |
| `src/types/index.ts` | MODIFY | Add Page type `"salestrail-calls"` |
| `src/App.tsx` | MODIFY | Add Page type, lazy import, sidebar entry |
| `functions/src/index.ts` | MODIFY | Export new callables |

### Validation
- [ ] Sync with known phone numbers → `matchedLeadId` populated on matching calls
- [ ] Sync with unknown phone numbers → `importStatus: "unmatched"`, `matchedLeadId: null`
- [ ] Both caller and callee match different leads → `matchedOn` reflects priority (callee preferred)
- [ ] Both numbers match reps → `direction: "internal"`, no lead match
- [ ] SalestrailCalls page renders with real data
- [ ] Filters work (user email, date range, direction, status)
- [ ] Pagination works (cursor-based, `startAfter`)
- [ ] Lead detail "Calls" tab shows matched calls for that lead
- [ ] Regular rep user can only see calls matched to leads in their region
- [ ] Manager can view all calls
- [ ] Admin can sync and view all calls
- [ ] `cd functions && npm run build` — zero errors
- [ ] `npm run build` (client) — zero errors
- [ ] `npm run test` — all tests pass

### Rollback
- Remove `"salestrail-calls"` from Page type
- Remove sidebar entry
- Remove SalestrailCallsPage component and related hooks
- Redeploy client

---

## Phase 3 — Reporting & Recording (Day 9-11)

**Objective**: Rep performance reporting, recording download support, and UX polish.

### Deliverables
- Rep call performance stats (calls/day, avg duration, inbound/outbound split)
- "Unmatched calls" review workflow for admins
- Manual rematch capability (admin triggers re-match for selected calls)
- Recording download via Firebase Storage (if Salestrail recording API confirmed stable)
- CSV export of call data
- Date range presets on SalestrailCalls page
- Stats summary bar above call table

### Files Changed/Created
| File | Action | Notes |
|------|--------|-------|
| `functions/src/salestrailSync.ts` | MODIFY | Export `rematchCall()` helper |
| `functions/src/salestrail.ts` | MODIFY | Add `rematchSalestrailCall` callable |
| `functions/src/storage/salestrailRecordings.ts` | CREATE | Optional: recording fetch + Storage upload |
| `src/pages/SalestrailCallsPage.tsx` | MODIFY | Add stats bar, date presets, CSV export |
| `src/components/SalestrailRepStats.tsx` | CREATE | Rep call performance dashboard |

### Validation
- [ ] Rep stats show accurate call counts
- [ ] Manual rematch updates matchedLeadId on existing calls
- [ ] CSV export downloads valid file
- [ ] Recording download works (if implemented)

### Rollback
- Minor UI reverts only. Backend changes are additive.

---

## Phase 4 — Scheduled Sync & Analytics (Day 12-14)

**Objective**: Automated periodic sync. Advanced call analytics.

### Deliverables
- `onSchedule` function wrapping `syncSalestrailCalls()` (every 6 hours)
- Sync frequency configurable from SystemSettingsPanel
- Call volume trends dashboard
- Caller/callee network graphs
- Time-of-day heatmap
- Missed call alerts

### Files Changed/Created
| File | Action | Notes |
|------|--------|-------|
| `functions/src/salestrail.ts` | MODIFY | Add `onSchedule` function |
| `functions/src/index.ts` | MODIFY | Export scheduled function |
| `src/components/SalestrailAnalytics.tsx` | CREATE | Analytics dashboard |

### Validation
- [ ] Scheduled sync runs automatically every 6 hours
- [ ] Manual sync still works alongside scheduled
- [ ] Sync lock prevents overlap between manual and scheduled
- [ ] Analytics dashboard renders with real data

### Rollback
- Remove scheduled function export
- Redeploy functions

---

## Phase Dependency Graph

```
P0 (Foundation)
 │
 ├──► P1 (Backend Sync) ──► P2 (Matching + UI) ──► P3 (Reporting) ──► P4 (Scheduled)
 │                              │
 │                              └──► First user-visible value
 │
 └──► Deployable at every phase (no broken intermediate state)
```

---

## Testing Strategy

### Per Phase
- **Phase 0**: TypeScript compilation only (no runtime behavior)
- **Phase 1**:
  - Unit tests: `sanitizePayload`, `transformCall`, `normalizeAUPhone` integration
  - Integration: dry-run sync against Salestrail API
  - Manual: verify Firestore writes
- **Phase 2**:
  - Unit tests: `matchCallsToLeads`, `lookupLeadsByPhone`
  - Integration: full sync with real lead data
  - E2E: SalestrailCalls page renders, filters work, lead detail tab works
- **Phase 3-4**: Manual verification + smoke tests

### Test File Locations
```
functions/test/salestrailSync.test.ts     # Unit tests for sync engine
src/lib/__tests__/salestrailUtils.test.ts # Unit tests for client-side utils
```

---

## Deployment Checklist (Per Phase)

- [ ] `git status` — clean or expected changes
- [ ] `git branch --show-current` — feature branch
- [ ] `cd functions && npm run build` — zero errors
- [ ] `npm run build` — zero errors (Phase 1+)
- [ ] `npm run test` — all tests pass
- [ ] `firebase deploy --only firestore:indexes` — Phase 0 only
- [ ] `firebase deploy --only firestore:rules` — rules updated
- [ ] `firebase deploy --only functions` — functions deployed
- [ ] `firebase deploy --only hosting` — Phase 2+ (client changes)
- [ ] Verify in production: smoke test key workflows
