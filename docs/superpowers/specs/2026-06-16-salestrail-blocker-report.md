# Salestrail Integration — Blocker Resolution Report

**Date**: 2026-06-16
**Audit Scope**: 4 blocking prerequisites from `2026-06-16-salestrail-design.md`
**Verdict**: 2 RESOLVED, 1 PARTIALLY RESOLVED, 1 BLOCKED

---

## Executive Summary

Four prerequisites were identified as blocking before Salestrail implementation could begin. This audit examined 30+ source files across the client (`src/`), server (`functions/src/`), and configuration layers and found:

1. **Lead ID format** — **RESOLVED**. Document IDs are numeric timestamps, typed as `number` in TypeScript, converted via `String()`/`Number()`. The matching query can safely use `doc.id` (string) as `matchedLeadId`.

2. **Phone storage/indexing** — **PARTIALLY RESOLVED**. `normalizeAUPhone()` exists but is NOT called consistently (4 of 9 write paths skip it). No `leads.phone` index exists. Phone data in Firestore is heterogeneous (some digits-only, some with spaces). A data normalization pass plus index deployment is required before phone matching can work reliably.

3. **Salestrail API** — **BLOCKED**. Zero API credentials, zero API schema, zero implementation code. The 3 spec documents are thorough but the external integration point is entirely unknown. Cannot proceed without API documentation from Salestrail.

4. **Secure read model** — **RESOLVED**. Existing architecture uses callable-only access for sensitive collections (`leadSnapshots`, `settingsHistory` writes, `auditLogs` writes). `canAccessRegion()` in `auth.ts:70` provides the exact pattern needed. Firestore rules CANNOT enforce lead-level region access without new cross-collection `get()` lookups. Recommendation stands: callable-only reads for `salestrailCalls`.

**Implementation may proceed on Epic 1 (Foundation & Schema) and Epic 2 (Sync Engine) once Prerequisites P2 and P3 are resolved. Phone matching (Epic 3) requires both P2 and P3 first.**

---

## 1. Lead Document ID Format — RESOLVED

### 1.1 Findings

| Question | Answer | Evidence |
|----------|--------|----------|
| Are lead Firestore document IDs numeric or auto-generated? | **Numeric timestamps** (e.g., `"1768559328123456"`) | `src/lib/idGenerator.ts:12-22` — `generateLeadId()` returns `Date.now() * 1000 + random0to999` |
| What is `Lead.id` typed as? | **`number`** | `src/types/index.ts:129` — `id: number` |
| Do `lead.id` and Firestore doc ID match? | **Yes** — `String()` / `Number()` conversion layer | Write: `src/hooks/useFirebase.ts:214` — `String(lead.id)`. Read: `src/hooks/useFirebase.ts:142` — `Number(d.id)` |
| How are queries constructed? | By field attributes (`region`, `status`), **never by `id` field or doc ID** | `src/hooks/useFirebase.ts:111-118`, `functions/src/leadSnapshots.ts:220` |
| Server-side ID handling | `doc.id` (string) used directly; some paths store `Number(id)` in data | `functions/src/leadSnapshots.ts:173-178` |

### 1.2 Files Inspected

| File | Key Lines | Relevance |
|------|-----------|-----------|
| `src/types/index.ts` | 128-131 | `Lead { id: number }` |
| `src/lib/idGenerator.ts` | 12-22 | `generateLeadId(): number` |
| `src/hooks/useFirebase.ts` | 142, 182, 214, 238 | Read/write/delete ID conversion |
| `src/components/AddLeadModal.tsx` | 191 | Creation call site |
| `src/components/SheetsSyncModal.tsx` | 1227, 1416, 1756, 2259 | Creation call sites |
| `src/pages/Map.tsx` | 1149, 1215 | Creation call sites |
| `src/pages/DQImport.tsx` | 139, 293 | Creation call sites |
| `src/components/DQImportModal.tsx` | 130 | Creation call site |
| `functions/src/index.ts` | 143, 150 | Server-side lead reads |
| `functions/src/followups.ts` | 15-17, 31 | Server-side lead queries |
| `functions/src/leadSnapshots.ts` | 173-178, 252, 366-368 | Server-side ID handling |
| `firestore.rules` | 60-87 | `leads/{leadId}` — no type constraint on ID |

### 1.3 Decision: RESOLVED

**For Salestrail matching**: Query leads by `where("phone", ...)`. Use the Firestore document ID (string, e.g., `"1768559328123456"`) as `matchedLeadId`. This is consistent with how the server already references leads (e.g., `functions/src/followups.ts:31` uses `doc.id` as `leadId`). No schema change needed for the ID type.

**One caveat**: The `matchedLeadId` field on `SalestrailCallDoc` should remain typed as `string` (as designed), matching Firestore's native `doc.id`. The design doc's field comment should clarify: "This is the Firestore document ID from the `leads` collection (numeric string, e.g., `'1768559328123456'`)."

### 1.4 Follow-up Actions

- [x] **None required** — ID format is confirmed and compatible with the design.

---

## 2. Phone Storage & Indexing — PARTIALLY RESOLVED

### 2.1 Findings

| Question | Answer | Evidence |
|----------|--------|----------|
| Does `normalizeAUPhone()` exist? | **Yes** — strips non-digits, fixes leading-0 from Google Sheets drops, handles international prefixes | `src/lib/utils.ts:12-28` |
| Is it called before every lead phone write? | **NO** — 4 of 9 write paths skip it | See write path audit below |
| Is there a `leads.phone` index? | **NO** — no single-field or composite index on `phone` | `firestore.indexes.json` — zero phone indexes |
| Are there any `.where("phone", ...)` queries? | **NO** — zero in production code | grep across all `*.ts`, `*.tsx` — only in spec docs |
| Is `Lead.phone` typed as string? | **Yes** — `phone: string` (required) | `src/types/index.ts:131` |
| Is there a `mobile` field? | **No** — only `phone` exists on Lead | `src/types/index.ts:128-131` |
| Server-side phone normalization? | **None** — functions have zero phone handling | grep of `functions/src/` for `phone`, `normalizeAUPhone` — zero results |

### 2.2 Phone Write Path Audit

| Write Path | File | Line | Normalized? |
|------------|------|------|-------------|
| **AddLeadModal** (manual add) | `src/components/AddLeadModal.tsx` | 193 | **NO** — `form.phone!.trim()` |
| **App.tsx CSV import** | `src/App.tsx` | 1174 | **NO** — uses `rawPhone` instead of computed `phone` variable |
| **Map.tsx knock save** | `src/pages/Map.tsx` | 1217 | **NO** — raw `form.phone` |
| Map.tsx quick pin | `src/pages/Map.tsx` | 1151 | N/A — hardcoded `""` |
| DQImport.tsx fill-row | `src/pages/DQImport.tsx` | 141 | **YES** |
| DQImport.tsx batch | `src/pages/DQImport.tsx` | 295 | **YES** |
| CSVImportModal.tsx | `src/components/CSVImportModal.tsx` | 150 | **YES** |
| SheetsSyncModal smart sync | `src/components/SheetsSyncModal.tsx` | 1152, 1229 | **YES** |
| SheetsSyncModal pull sync | `src/components/SheetsSyncModal.tsx` | 2261 | **NO** — uses raw `get("phone")` |

**9 total write paths. 5 normalize, 4 do not.**

### 2.3 Impact on Salestrail Matching

The phone matching engine (Epic 3, `lookupLeadsByPhone()`) queries `leads.where("phone", "in", normalizedNumbers)`. If 4 of 9 write paths store unnormalized phone numbers, the `leads.phone` field will contain heterogeneous formats:

- Digits-only `0412345678` (normalized)
- Space-formatted `0412 345 678` (from AddLeadModal `validateAUPhone` formatting)
- Raw strings like `+61412345678` (from SheetsSync pull sync)
- Raw strings like `(04) 1234 5678` (from App.tsx CSV import)

**A query for `"0412345678"` will miss leads stored with `"0412 345 678"` or `"+61412345678"`.** Match rate will be degraded unless:

1. The matching engine normalizes BOTH the Salestrail numbers AND the Firestore strings (which it can't do in a `where("phone", "==", ...)` query without first reading all documents), **or**
2. All existing lead phone data is backfilled/cleaned first.

### 2.4 Firestore Index Gap

No `leads.phone` single-field index exists. Any `where("phone", "in", [...])` query will either:
- Auto-create a single-field index on first use (Firestore may auto-create it), **or**
- Fail if automatic index creation is disabled or the query uses composite ordering

**Recommendation**: Explicitly deploy the index before running the first sync.

### 2.5 Server-Side Normalization Gap

The Salestrail sync engine (server-side) will receive raw phone numbers from the Salestrail API. It must normalize them before matching. The `normalizeAUPhone()` function currently exists only in the client bundle (`src/lib/utils.ts`).

**Recommendation**: Either:
- Copy `normalizeAUPhone()` to `functions/src/salestrailSync.ts` (and add a test), **or**
- Extract it to a shared utility that both client and server import (requires `functions` to use ESM or a shared `common` package)

### 2.6 Files Inspected

| File | Key Lines | Relevance |
|------|-----------|-----------|
| `src/lib/utils.ts` | 12-28 | `normalizeAUPhone()` function |
| `src/lib/utils.ts` | 76-94, 107-120 | `sanitizePhone()`, `isValidPhone()` (not used by validators) |
| `src/lib/validators.ts` | 145-147 | Minimal phone validation (string type only) |
| `src/components/AddLeadModal.tsx` | 32-34, 193 | `validateAUPhone` formatting, write path |
| `src/components/SheetsSyncModal.tsx` | 1152, 1229, 2186, 2261 | Two write paths, one skip |
| `src/App.tsx` | 1142, 1174 | Normalizes for dedup, writes raw |
| `firestore.indexes.json` | Entire file | Zero phone indexes |
| `firestore.rules` | 60-87 | No phone-specific rules |
| `functions/src/` | All files | Zero phone handling |

### 2.7 Decision: PARTIALLY RESOLVED

The normalization function exists and works correctly. The index can be deployed. But **phone data in production is heterogeneous** due to inconsistent normalization at write time, and server-side phone normalization doesn't exist yet.

### 2.8 Follow-up Actions Required

- [ ] **Action 2.1**: Deploy `leads.phone ASC` single-field index (`firestore.indexes.json`)
- [ ] **Action 2.2**: Copy `normalizeAUPhone()` to `functions/src/salestrailSync.ts` (server-side)
- [ ] **Action 2.3**: Run a one-time backfill: read all leads, normalize `phone` field, write back (callable or migration script)
- [ ] **Action 2.4**: Fix the 4 write paths that skip normalization (separate bugfix PR):
  - `AddLeadModal.tsx:193` — call `normalizeAUPhone(form.phone)` before creating lead
  - `App.tsx:1174` — use `phone` variable (already normalized) instead of `rawPhone`
  - `Map.tsx:1217` — normalize `form.phone` before lead creation
  - `SheetsSyncModal.tsx:2261` — use `phone` variable (already normalized at line 2186) instead of `get("phone")`

---

## 3. Salestrail API Placeholder Assumptions — BLOCKED

### 3.1 Findings

| Question | Answer | Evidence |
|----------|--------|----------|
| Existing Salestrail code? | **None** — zero implementation files exist | grep across entire repo for `salestrail` |
| API key configured? | **No** — not in `.env`, `.env.example`, or Firebase secrets | All environment files checked |
| API documentation in repo? | **Design docs only** — external API schema entirely unknown | 3 spec files in `docs/superpowers/specs/` |
| Placeholder types? | **None** — `SalestrailCallDoc`, `SalestrailRawCall` not yet added to `src/types/index.ts` | `src/types/index.ts` — no Salestrail types |
| Page type registered? | **No** — `"salestrail-calls"` not in `Page` union | `src/App.tsx:169-192` |
| Firestore rules for collection? | **No** — no `salestrailCalls` rule | `firestore.rules` |
| Settings admin whitelist? | **No** — `"integrations"` not in `SETTINGS_SECTIONS` | `functions/src/settingsAdmin.ts:35` |
| Functions exports? | **No** — no Salestrail callables exported | `functions/src/index.ts` |

### 3.2 What Exists vs What's Missing

| Artifact | Status |
|----------|--------|
| `docs/superpowers/specs/2026-06-16-salestrail-design.md` (563 lines) | EXISTS — thorough design review, 19 findings, 5 risk levels |
| `docs/superpowers/specs/2026-06-16-salestrail-implementation-plan.md` (267 lines) | EXISTS — 6-phase plan with dependencies |
| `docs/superpowers/specs/2026-06-16-salestrail-tasks.md` (391 lines) | EXISTS — 46 tasks across 6 epics |
| Salestrail API base URL | MISSING — not documented anywhere |
| Auth header name/format | MISSING |
| API response JSON schema | MISSING |
| Pagination mechanism | MISSING |
| Rate limit information | MISSING |
| Recording API endpoint | MISSING |
| SALESTRAIL_API_KEY | MISSING — not set in Firebase secrets |

### 3.3 API Abstraction Readiness

The design's `fetchSalestrailCalls()` function is designed with a clean abstraction boundary:

```typescript
interface SalestrailApiConfig {
  apiKey: string;
  baseUrl?: string;
}
interface SalestrailRawCall {
  [key: string]: unknown; // TBD when docs arrive
}
async function fetchSalestrailCalls(
  config: SalestrailApiConfig,
  options?: { since?: number }
): Promise<SalestrailRawCall[]>;
```

This is the correct interface. Once the API docs arrive, only `fetchSalestrailCalls` and `transformCall` need to be updated. The rest of the sync engine (locking, batching, matching, config) is decoupled.

### 3.4 Files Inspected

| File | Relevance |
|------|-----------|
| `.env` | No SALESTRAIL_API_KEY |
| `.env.example` | No SALESTRAIL_API_KEY placeholder |
| `src/types/index.ts` | No Salestrail types |
| `src/App.tsx:169-192` | No `"salestrail-calls"` page |
| `functions/src/index.ts` | No Salestrail exports |
| `functions/src/settingsAdmin.ts:35` | No `"integrations"` in allowed sections |
| `functions/package.json` | No Salestrail SDK |
| `firestore.indexes.json` | No `salestrailCalls` indexes |
| `firestore.rules` | No `salestrailCalls` rules |
| `docs/` | No Salestrail API docs |
| `functions/src/` | No `salestrailSync.ts` or `salestrail.ts` |

### 3.5 Decision: BLOCKED

Cannot proceed with API integration (`fetchSalestrailCalls()`) without the external API schema. However, **Epic 1 (Foundation & Schema)** can proceed in parallel — it only requires the internal Firestore schema, types, and config.

### 3.6 Follow-up Actions Required

- [ ] **Action 3.1**: Obtain Salestrail API documentation (base URL, auth header format, response schema, pagination, rate limits)
- [ ] **Action 3.2**: Obtain Salestrail API key and set via `firebase functions:secrets:set SALESTRAIL_API_KEY`
- [ ] **Action 3.3**: Document the `SalestrailRawCall` interface in code once schema is known
- [ ] **Action 3.4**: Update `transformCall()` to map real API fields to `SalestrailCallDoc`

---

## 4. Secure Read Model for `salestrailCalls` — RESOLVED

### 4.1 Findings

| Question | Answer | Evidence |
|----------|--------|----------|
| Can Firestore rules enforce lead-level region access? | **No** — would require cross-collection `get()` lookups, a pattern not used anywhere | `firestore.rules` — zero `exists()`/`get()` calls in entire file |
| Do existing collections use callable-only access? | **Yes** — `leadSnapshots` (full callable-only), `settingsHistory` (write callable-only), `auditLogs` (write callable-only) | See 4.3 below |
| Does `canAccessRegion()` exist server-side? | **Yes** — `functions/src/auth.ts:70-74` | Battle-tested, used in `leadSnapshots.ts:132` |
| Does `hasElevatedRole()` exist in Firestore rules? | **Yes** — `firestore.rules:18-21` — checks `token.role in ["admin", "director"]` | But only for simple role checks, not region-lead cross-checks |
| What custom claims are available? | `repId`, `role`, `admin`, `director`, `region`, `allowedRegions`, `active` | `functions/src/auth.ts:44-55` |
| Are claims accessible in Firestore rules? | **Yes** — via `request.auth.token.<claim>` | Already used: `request.auth.token.role` (line 20), `request.auth.token.firebase.sign_in_provider` (line 15) |
| Does `request.auth.token.allowedRegions` get used in any rule? | **No** — region is never enforced at Firestore rule level | All operational collections use `canUseOperationalApp()` only |

### 4.2 Why Firestore Rules Cannot Enforce Lead-Level Access

The requirement is: "A rep should only see `salestrailCalls` documents where `matchedLeadId` points to a lead in the rep's region."

This requires a Firestore rule that:
1. Reads `resource.data.matchedLeadId` from the `salestrailCalls` document
2. Looks up `leads/{matchedLeadId}` to get the lead's `region` field
3. Compares `lead.region` against `request.auth.token.allowedRegions`

Step 2 requires `get(/databases/$(database)/documents/leads/$(resource.data.matchedLeadId))`, which:
- Adds 1 Firestore read cost per rule evaluation
- Is a cross-collection lookup pattern **never used** in this codebase
- Would require the `leads` collection to permit reads in rules (it currently uses `canUseOperationalApp()` which any auth'd user passes)
- Could fail if `matchedLeadId` is null (unmatched calls) — the rule would need to handle this case

### 4.3 Existing Callable-Only Collections (Precedent)

| Collection | Read Access | Write Access |
|------------|-------------|--------------|
| `leadSnapshots` + `leadSnapshots/{id}/leads` | Callable-only (catch-all deny at `firestore.rules:383`) | Callable-only |
| `settingsHistory` | Direct (`isAuthenticated()`) | Callable-only (`allow create/update/delete: if false`) |
| `auditLogs` | Direct (`hasElevatedRole()`) | Callable-only |
| `appSettings/config` | Direct (`canUseOperationalApp()`) | Callable-only (blocked by `docId != "config"` rule) |
| `dailyStats` | Direct | Disabled — scheduled function only |
| `sentAlerts` | Direct | Disabled — cloud functions only |

**The cleanest precedent is `leadSnapshots`**: no Firestore rule at all, falls to the default deny-all catch-all rule at `firestore.rules:383`. All access goes through callables with `requireAuth` + `requireMinimumRole(auth, "admin")`.

### 4.4 Recommended Model for `salestrailCalls`

```
// firestore.rules — add explicit deny for clarity
match /salestrailCalls/{callId} {
    allow read, write: if false;
}
```

Two callables control access:

| Callable | Access Level | Logic |
|----------|-------------|-------|
| `getSalestrailCalls(filters)` | Admin: all | Query `salestrailCalls` with filters, return all |
| | Manager: all | Same — managers can view all calls |
| | Rep: filtered | Query, then strip calls where `matchedLeadId` is null or lead is outside `allowedRegions` |
| `getLeadSalestrailCalls(leadId)` | Any authenticated with lead access | Verify lead exists + user can access its region via `canAccessRegion()`, then query by `matchedLeadId` |

This is consistent with the existing `leadSnapshots` pattern and reuses the existing `canAccessRegion()` function.

### 4.5 Files Inspected

| File | Key Lines | Relevance |
|------|-----------|-----------|
| `functions/src/auth.ts` | 39-74 | `requireAuth`, `hasMinimumRole`, `requireMinimumRole`, `canAccessRegion` |
| `functions/src/leadSnapshots.ts` | 313, 337, 395 | Admin-only callable pattern |
| `functions/src/settingsAdmin.ts` | 35, 137-138, 188-189 | `SETTINGS_SECTIONS`, admin-only pattern |
| `functions/src/audit.ts` | 66-67 | `requireAuth` in callable |
| `functions/src/smsfFinancials.ts` | 7, 33 | Elevated-role Firestore rules |
| `firestore.rules` | 9-48, 170-199, 346-351, 364-374, 383 | All helper functions, collection rules, catch-all |
| `src/hooks/useUserRole.ts` | 54-85, 106-126 | Client-side permission matrix |
| `src/App.tsx` | 1248, 1251-1259, 1489-1507, 1952-1958 | Admin/manager page gating |

### 4.6 Decision: RESOLVED

Callable-only reads are the correct model, consistent with existing architecture. No new Firestore rule patterns required. The pattern is proven in production (`leadSnapshots`).

### 4.7 Follow-up Actions

- [x] **None required** — decision confirmed. Implement `getSalestrailCalls` and `getLeadSalestrailCalls` callables as designed.

---

## Implementation Gate Status

| Prerequisite | Status | Blocker for Epics |
|-------------|--------|-------------------|
| P1: Lead ID format | RESOLVED | None — format confirmed |
| P2: Salestrail API docs | **BLOCKED** | Epic 2 (Sync Engine) — cannot implement `fetchSalestrailCalls()` |
| P3: Phone index + normalization | PARTIALLY RESOLVED | Epic 2 (matching step) — index deployable, but data is heterogeneous |
| P4: SALESTRAIL_API_KEY | **BLOCKED** | Epic 2 — cannot call API without key |

### What Can Proceed Now

| Deliverable | Status |
|-------------|--------|
| Epic 1.1: Type Definitions (`SalestrailCallDoc`, `SyncResult`, etc.) | **Can proceed** |
| Epic 1.2: Firestore Schema (indexes for `salestrailCalls`, rules entry) | **Can proceed** |
| Epic 1.3: Server Stubs (skeleton `salestrailSync.ts`, `salestrail.ts`) | **Can proceed** |
| Epic 4.1: SystemSettingsPanel section | **Can proceed** (UI only, no sync logic) |
| `leads.phone` index deployment | **Can proceed** (Action 2.1) |
| Phone normalization backfill | **Can proceed independently** (Action 2.3) |
| Fix 4 write-path normalization bugs | **Can proceed independently** (Action 2.4) |

### What Cannot Proceed Until P2 + P4 Are Resolved

| Deliverable | Depends On |
|-------------|-----------|
| `fetchSalestrailCalls()` | P2 (API schema), P4 (API key) |
| `syncSalestrailCalls()` | P2, P4 |
| `matchCallsToLeads()` | P2, P3 (heterogeneous phone data) |
| `transformCall()` | P2 |
| SalestrailCallsPage with real data | P2, P3, P4 |

---

## Summary of Required Actions

### Immediate (unblocks work)

- [ ] **A1**: Obtain Salestrail API documentation from vendor (base URL, auth format, response schema)
- [ ] **A2**: Obtain API key and run `firebase functions:secrets:set SALESTRAIL_API_KEY`
- [ ] **A3**: Add `leads.phone ASC` to `firestore.indexes.json` and deploy

### Before Matching (Epic 3)

- [ ] **A4**: Copy `normalizeAUPhone()` to `functions/src/salestrailSync.ts`
- [ ] **A5**: Run one-time phone normalization backfill on `leads` collection
- [ ] **A6**: Fix 4 write-path normalization bugs (separate PR)

### Already Resolved (no action)

- [x] Lead ID format confirmed — compatible with design
- [x] Secure read model confirmed — callable-only pattern
