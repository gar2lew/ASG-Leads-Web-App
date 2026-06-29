# Salestrail Epic 2 — Calls Page Design

Date: 2026-06-22
Status: Design only, not implemented
Scope: Salestrail Calls Page using the existing `salestrailCalls` collection schema from Epic 1

## Assumptions

- `salestrailCalls` remains callable-only. Firestore rules deny direct client reads and writes.
- Epic 2 is an operational visibility page for admins and managers, not a rep self-service page.
- Leads are navigated by `matchedLeadId`, which is the Firestore document ID for the matching lead.
- Existing route/page wiring is currently centralized in `src/App.tsx`, not split into `src/router` files in this branch.
- The first version should be read-only. Manual rematching, annotations, recordings, exports, and bulk actions stay out of Epic 2 unless explicitly promoted later.

## Recommended Approach

Use an admin/manager Salestrail Calls page backed by server callables:

- `getSalestrailCalls(filters, cursor)` for paginated list data and page-level stats.
- `getSalestrailFilterOptions()` for user filter options derived from imported calls or active reps.
- Optional later `getLeadSalestrailCalls(leadId)` for lead detail integration.

This is better than direct Firestore listeners because the collection is intentionally blocked by rules and call records need role/region policy enforcement on the server. It is also better than loading all calls client-side because call volume will grow quickly and date/user/status filtering must stay bounded.

Alternative approaches considered:

| Approach | Pros | Cons | Decision |
| --- | --- | --- | --- |
| Callable-backed paginated page | Secure, scalable, matches callable-only rules | More backend work than direct reads | Recommended |
| Direct Firestore `onSnapshot` | Fastest UI build | Violates callable-only access model | Reject |
| Admin-only CSV/report first | Useful for audit | Does not satisfy navigation/mobile CRM workflow | Defer |

---

# 1. UI Wireframe Plan

## Page Placement

Add page: `salestrail-calls`
Label: `Salestrail Calls`
Sidebar section: `LEADS`, after `DRAPS & Stats`, or `SYSTEM` if the team wants it treated as admin tooling.

Permission visibility:

- Admin: visible, all calls.
- Manager: visible, calls for allowed regions plus unmatched calls if product policy allows manager triage.
- Rep: hidden in Epic 2.

## Desktop Layout

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Topbar: Salestrail Calls                                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│ KPI strip                                                                    │
│ ┌ Total ┐ ┌ Matched % ┐ ┌ Unmatched ┐ ┌ Inbound ┐ ┌ Outbound ┐ ┌ Avg Duration┐
│ └───────┘ └───────────┘ └───────────┘ └─────────┘ └──────────┘ └────────────┘
├──────────────────────────────────────────────────────────────────────────────┤
│ Filters                                                                      │
│ [Search name/phone/email/call id ........] [Date preset v] [From] [To]       │
│ [User v] [Direction v] [Match status v] [Region v] [Clear] [Refresh]         │
├──────────────────────────────────────────────────────────────────────────────┤
│ Results header: 89 calls | 12 unmatched | sorted newest first                │
├──────────────────────────────────────────────────────────────────────────────┤
│ Table                                                                        │
│ Time         Direction  User          External Party   Duration  Match        │
│ 10:32 AM     Outbound   Grace L.      0412...          04:21     Lead: Jane   │
│ 10:11 AM     Inbound    Marco R.      089...           Missed    Unmatched    │
│ 09:42 AM     Internal   Grace -> Sam  04...            01:08     Internal     │
├──────────────────────────────────────────────────────────────────────────────┤
│ [Previous] [Next]                                                            │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Mobile Layout

Mobile should use stacked cards, not a squeezed table.

```text
┌──────────────────────────────┐
│ Salestrail Calls             │
│ [Search...]                  │
│ [Filters button] [Refresh]   │
├──────────────────────────────┤
│ KPI chips: Total | Matched |  │
│ Unmatched | Avg | Missed     │
├──────────────────────────────┤
│ Call card                    │
│ Outbound • 10:32 AM          │
│ Grace L. -> 0412...          │
│ 4m 21s • Answered            │
│ Match: Jane Smith            │
│ [Open Lead]                  │
├──────────────────────────────┤
│ Call card                    │
│ Inbound • Missed             │
│ 089... -> Marco R.           │
│ Match: Unmatched             │
└──────────────────────────────┘
```

## Core UI States

- Loading: skeleton KPI cards and 5 skeleton rows/cards.
- Empty: "No calls found for this filter set" with a clear-filters action.
- Error: concise message plus retry. Permission errors should say access is limited to managers/admins.
- Partial data: if stats are calculated over the current page rather than all matching calls, label them clearly as "This page". Preferred design returns stats for the full filtered result from the callable.

## Table Columns

Primary columns:

- Call time: `sourceCreatedAt`, newest first.
- Direction: inbound, outbound, internal, unknown.
- User: `userName`, fallback `userEmail`.
- External party: caller/callee opposite the CRM user; show `callerName` if present.
- Duration/type: `durationSeconds`, `callType`.
- Match: matched lead name if hydrated, otherwise `matchedLeadId`, unmatched, or internal.
- Region: `region`, hidden on narrow screens.
- Confidence: `matchConfidence`, hidden on narrow screens.

## Search Behavior

Search input should support:

- Salestrail call ID
- Caller/callee phone
- Normalized phone
- User name
- User email
- Matched lead name when hydrated

V1 search should filter the current server-returned window client-side, with clear copy: "Search current results". Server-side text search can come later after adding explicit search fields or Algolia-style indexing. Phone and call ID exact searches can be server-supported sooner because fields already exist.

## Matched Lead Navigation

For matched calls:

- Show a clear "Open Lead" action in each row/card.
- Clicking the matched lead should open the existing client/lead profile overlay where possible.
- The page integration should pass `matchedLeadId` into existing selected-client state if the app treats lead/client profiles as the same document.
- If the matched lead cannot be loaded, keep the call visible and show "Matched lead unavailable".

---

# 2. Firestore Query Strategy

## Access Model

Do not query `salestrailCalls` directly from the browser. Keep:

```text
Browser -> httpsCallable(functions, "getSalestrailCalls") -> Firestore Admin SDK
```

The callable must:

- Call `requireAuth(request)` first.
- Require `manager` or higher for the page.
- Apply allowed-region filtering using `canAccessRegion()`.
- Return sanitized call rows only. Do not expose full `rawPayload` in the page response.

## Request Shape

`getSalestrailCalls` input:

| Field | Type | Notes |
| --- | --- | --- |
| `dateFrom` | ISO date string | Required by default; page can default to last 7 days. |
| `dateTo` | ISO date string | Required by default; inclusive day converted to exclusive upper timestamp. |
| `userEmail` | string or `"all"` | Prefer exact `userEmail` filter. |
| `assignedRepId` | number or `"all"` | Prefer this when the UI selects CRM reps. |
| `direction` | `"inbound"`, `"outbound"`, `"internal"`, `"all"` | Exact filter. |
| `importStatus` | `"matched"`, `"unmatched"`, `"new"`, `"error"`, `"all"` | Exact filter. |
| `matchConfidence` | `"exact"`, `"partial"`, `"none"`, `"all"` | Exact filter. |
| `region` | `"brisbane"`, `"perth"`, `"all"` | Admin/manager filtering. |
| `search` | string | V1: optional exact phone/call-id detection only; fuzzy search stays client-side. |
| `pageSize` | number | Clamp to 25-100. Default 50. |
| `cursor` | string/null | Encoded cursor from last `sourceCreatedAt` and document ID. |

## Query Composition

Preferred sort:

- `orderBy("sourceCreatedAt", "desc")`
- tie-breaker `orderBy("__name__", "desc")` if cursor stability requires it.

Base query:

- Always constrain `sourceCreatedAt >= fromTs` and `sourceCreatedAt < toTs`.
- Always limit page size.

Filter rules:

- Use at most one primary equality filter per query in V1, selected by priority:
  1. `matchedLeadId` for lead-specific calls
  2. `assignedRepId` or `userEmail` for user filtering
  3. `importStatus`
  4. `direction`
  5. `region`
- Apply secondary low-cardinality filters server-side after fetching an over-limit window, or add additional composite indexes before supporting arbitrary combinations.
- Clamp over-fetching, for example fetch up to `pageSize * 3` with a max of 150, to avoid unbounded reads.

## Stats Strategy

The page needs call statistics that match the current filters.

V1 options:

1. For small date windows, callable runs the filtered list query without pagination up to a strict cap, calculates stats, and returns `statsCompleteness: "complete"` or `"capped"`.
2. Use Firestore aggregation count queries for total counts where supported, then run separate filtered queries for directional/status splits.
3. Maintain daily rollup docs later, for example `salestrailDailyStats/{yyyy-mm-dd}_{region}_{repId}`.

Recommended V1:

- Calculate stats in the callable for the selected date window, with a hard max scanned document count such as 2,000.
- Default the UI to "This week" so stats stay cheap.
- If capped, show "Stats based on first 2,000 calls in range" and ask the user to narrow filters.

Recommended V2:

- Add daily rollups for fast reporting once call volume grows.

## Lead Hydration

For each page of calls:

- Collect `matchedLeadId` values.
- Fetch corresponding lead docs with Admin SDK `getAll`.
- Return only minimal lead summary:
  - `id`
  - `name`
  - `phone`
  - `status`
  - `region`

Authorization:

- Managers/admins can only receive lead summaries for regions they can access unless admin/director policy says otherwise.
- If a call's `matchedLeadId` points outside access, omit lead details and mark it restricted.

## User Filter Options

Use one of two V1 options:

- From CRM reps: active reps from `reps`, mapped to `assignedRepId`.
- From imported calls: distinct `userEmail`/`userName` values in recent range.

Recommended:

- Show CRM reps first using `assignedRepId`.
- Include an "Unassigned Salestrail users" group for calls with `assignedRepId == null`, using `userEmail`.

---

# 3. Index Review

Existing `firestore.indexes.json` already includes these `salestrailCalls` composites:

| Existing index | Supports |
| --- | --- |
| `matchedLeadId ASC, sourceCreatedAt DESC` | Lead-specific call history |
| `userEmail ASC, sourceCreatedAt DESC` | Salestrail user filter |
| `importStatus ASC, sourceCreatedAt DESC` | Matched/unmatched/new/error filters |
| `direction ASC, sourceCreatedAt DESC` | Inbound/outbound/internal filters |
| `importBatchId ASC, sourceCreatedAt DESC` | Sync batch review |
| `assignedRepId ASC, sourceCreatedAt DESC` | CRM rep/user filter |
| `region ASC, sourceCreatedAt DESC` | Region filter |

## Gap: Date-Only Default Query

The default page query sorted by `sourceCreatedAt DESC` with only range bounds should be supported by Firestore single-field indexes. No composite is required unless adding a second ordered field.

## Gap: Combined Filters

Firestore will require more composite indexes for combinations such as:

- `assignedRepId + importStatus + sourceCreatedAt`
- `assignedRepId + direction + sourceCreatedAt`
- `region + importStatus + sourceCreatedAt`
- `region + direction + sourceCreatedAt`
- `userEmail + direction + sourceCreatedAt`

Recommendation:

- Do not add every combination up front.
- Support one primary server equality filter plus date range in Epic 2.
- Add only the combinations that real usage demands after observing operators.

## Recommended New Indexes For Epic 2

If the UI must support common combined filters immediately, add these:

| Priority | Composite index | Reason |
| --- | --- | --- |
| P1 | `assignedRepId ASC, importStatus ASC, sourceCreatedAt DESC` | Manager asks "show unmatched calls for Grace this week". |
| P1 | `region ASC, importStatus ASC, sourceCreatedAt DESC` | Regional unmatched review queue. |
| P2 | `assignedRepId ASC, direction ASC, sourceCreatedAt DESC` | Rep call mix analysis. |
| P2 | `region ASC, direction ASC, sourceCreatedAt DESC` | Regional inbound/outbound analysis. |
| P3 | `matchConfidence ASC, sourceCreatedAt DESC` | Confidence audit; current indexes do not cover confidence. |

Because the user requested no implementation, these are review recommendations only.

## Search Indexing

Firestore is not a good fuzzy search engine. For V1:

- Support client-side search over returned rows.
- Support exact server search by `salestrailCallId`.
- Support exact normalized phone search by querying either `callerNumberNormalized` or `calleeNumberNormalized`, but this requires two queries and likely two new indexes if combined with date sort.

Recommended future fields:

- `searchTokens: string[]` for exact token matching via `array-contains`.
- `externalNumberNormalized` to avoid querying caller and callee separately for the external party.

---

# 4. Implementation Plan

## Phase 1 — Product Shell And Permissions

Objective: add the page concept safely without data rendering yet.

Planned work:

- Add `salestrail-calls` to the page union.
- Add lazy page import.
- Add page label.
- Add sidebar item visible to admin and manager.
- Add permission fallback so unauthorized users cannot land on the page.
- Keep no direct Firestore reads in the page.

Validation:

- Admin and manager can see the page.
- Rep cannot see or navigate to it.
- Unauthorized direct state/path access falls back to an allowed page.

## Phase 2 — Callable Read API

Objective: server-authoritative access to call records.

Planned work:

- Add `getSalestrailCalls` callable.
- Add `getSalestrailFilterOptions` callable if filter options cannot be derived from existing store reps.
- Validate request payload manually or with the repo's existing validation patterns.
- Apply `requireAuth(request)` first.
- Enforce manager/admin minimum role.
- Apply `allowedRegions` and `canAccessRegion()`.
- Return sanitized row DTOs and minimal lead summaries.
- Do not return `rawPayload` by default.

Validation:

- Unauthenticated call rejected.
- Rep rejected.
- Manager limited to allowed regions.
- Admin receives all regions.
- Date windows are clamped and page size is capped.

## Phase 3 — Client Hook And Data Model

Objective: isolate page data access and formatting.

Planned work:

- Create `useSalestrailCalls` hook for filters, loading/error state, pagination, refresh, and stats.
- Keep filter state serializable.
- Convert Firestore timestamp-like values to display-safe numbers/dates at the edge.
- Add small formatters for duration, direction labels, match labels, and phone display.

Validation:

- Hook handles loading, empty, error, and refresh states.
- Pagination cursor flows forward/back without duplicate rows.
- Filters reset pagination.

## Phase 4 — Page UI

Objective: build the CRM operator experience.

Planned work:

- KPI strip.
- Filter toolbar with search, date preset, custom dates, user, direction, match status, region.
- Desktop table.
- Mobile cards.
- Matched lead navigation action.
- Empty/error/loading states.
- Refresh action.

Validation:

- Desktop at 1440px and 1024px.
- Mobile at 390px.
- Keyboard focus for filters and lead navigation.
- No horizontal overflow on mobile.

## Phase 5 — Stats And Operational Polish

Objective: make the page useful for call QA and management.

Planned work:

- Stats for total, matched, unmatched, internal, inbound, outbound, missed, answered, average duration.
- Clear labels if stats are capped.
- "Unmatched" quick filter.
- "Today", "This week", "This month", "Custom" date presets.
- Optional CSV export remains deferred unless requested.

Validation:

- Stats match returned filter scope.
- Date presets use local business day expectations.
- Large ranges show capped-state copy if needed.

## Phase 6 — Lead Detail Integration

Objective: make calls actionable from CRM records.

Planned work:

- Add navigation from call row/card to existing lead/client profile overlay.
- Consider adding a compact Calls panel/tab to lead detail in a later sub-epic using `getLeadSalestrailCalls`.

Validation:

- Matched call opens the correct lead.
- Missing/restricted matched lead fails gracefully.

---

# 5. Task Breakdown

## Backend Tasks

- Define `SalestrailCallListRequest`, `SalestrailCallListResponse`, `SalestrailCallRowDto`, and `SalestrailCallStatsDto`.
- Implement request validation and default date range.
- Implement `getSalestrailCalls` callable with auth and role checks.
- Implement region policy for manager/admin users.
- Implement base date-bounded query and cursor pagination.
- Implement primary-filter selection strategy.
- Implement exact call ID lookup.
- Implement lead hydration with minimal lead DTOs.
- Sanitize response so `rawPayload` is excluded.
- Add tests for unauthenticated, rep, manager, admin, date clamp, and page-size clamp.

## Frontend Data Tasks

- Add page-level DTO types or reuse shared types carefully without exposing raw payload.
- Create `useSalestrailCalls`.
- Add filter state reducer or small state helpers.
- Add duration/date/phone formatters.
- Add pagination helpers.
- Add error normalization for callable errors.

## Frontend UI Tasks

- Create `SalestrailCallsPage`.
- Create `SalestrailStatsStrip`.
- Create `SalestrailFilters`.
- Create `SalestrailCallsTable`.
- Create `SalestrailCallCardList` for mobile.
- Create `SalestrailMatchBadge`.
- Create `SalestrailDirectionBadge`.
- Add matched lead navigation action.
- Add loading skeletons, empty state, and error state.

## App Integration Tasks

- Add `salestrail-calls` page key.
- Add lazy import.
- Add page label.
- Add sidebar item.
- Add permission visibility for managers/admins.
- Add fallback handling if the current user lacks permission.

## Index And Data Tasks

- Confirm current indexes are deployed before releasing the page.
- Decide whether Epic 2 will support combined filters immediately.
- If yes, add only P1 indexes:
  - `assignedRepId ASC, importStatus ASC, sourceCreatedAt DESC`
  - `region ASC, importStatus ASC, sourceCreatedAt DESC`
- Defer fuzzy/full search indexing.

## QA Tasks

- Test with zero calls.
- Test with matched, unmatched, internal, inbound, outbound, missed, and no-duration calls.
- Test with calls whose matched leads no longer exist.
- Test manager allowed-region filtering.
- Test admin all-region visibility.
- Test mobile cards at 390px.
- Test desktop table at 1024px and 1440px.
- Test date presets and custom date range boundaries.
- Test pagination stability when multiple calls have the same timestamp.

## Release Notes For Epic 2

- This page is read-only.
- Access is limited to managers and admins.
- Search is scoped to current results in V1 unless exact call ID or phone lookup is implemented server-side.
- Firestore direct access remains denied; all reads go through callables.
- Manual rematching and call annotations are deferred.
