# Phone Normalisation Audit

**Date**: 2026-06-16
**Method**: Code-path analysis (not live dry-run — see appendix for why)
**Status**: Pre-migration

---

## Audit Methodology

This report analyzes **all 9 lead phone write paths** and the `normalizeAUPhone()` transformation to predict which phone formats exist in production. Because the deployed dry-run function requires admin credentials not available in the current environment, this is a code-path audit. A live dry-run should be run before the actual migration to confirm these predictions.

---

## Write Path Analysis

| # | Path | File:Line | Normalized? | Format Written | Impact |
|---|------|-----------|-------------|----------------|--------|
| 1 | AddLeadModal (primary manual UI) | `src/components/AddLeadModal.tsx:193` | Fixed (was NO) | Was: space-formatted `"0412 345 678"` | HIGH — primary creation UI |
| 2 | Quick Pull CSV import | `src/App.tsx:1174` | Fixed (was NO — used `rawPhone`) | Was: raw cell value (e.g., `"412345678"` or `"+61412345678"`) | HIGH |
| 3 | Knock save | `src/pages/Map.tsx:1218` | Fixed (was NO) | Was: raw `form.phone` | MEDIUM — knock team usage |
| 4 | SheetsSync pull sync | `src/components/SheetsSyncModal.tsx:2261` | Fixed (was NO — used `get("phone")`) | Was: raw cell value | HIGH — bulk import path |
| 5 | DQImport fill-row | `src/pages/DQImport.tsx:141` | YES | Digits-only `"0412345678"` | Already correct |
| 6 | DQImport batch | `src/pages/DQImport.tsx:295` | YES | Digits-only | Already correct |
| 7 | CSVImportModal | `src/components/CSVImportModal.tsx:150` | YES | Digits-only | Already correct |
| 8 | SheetsSync smart sync (create) | `src/components/SheetsSyncModal.tsx:1229` | YES | Digits-only | Already correct |
| 9 | SheetsSync smart sync (update) | `src/components/SheetsSyncModal.tsx:1204-1218` | N/A | Phone NOT updated during updates | No phone change on update |

### Impact Summary

**4 of 9 paths historically wrote unnormalized phones. All 4 are now fixed.**

Two of the 4 are high-volume paths:
- AddLeadModal — the day-to-day manual lead entry UI
- Quick Pull CSV import — bulk import used by admin

This means most recently-created leads likely have space-formatted phones (`"0412 345 678"`), while older leads (DQImport, SheetsSync smart sync) have digits-only.

---

## Phone Format Prediction

Based on the code paths, production leads contain these phone formats:

### Format A: Digits-only, 10 chars (normalized)
- **Source**: DQImport, CSVImportModal, SheetsSync smart sync, any lead already backfilled
- **Example**: `"0412345678"`
- **normalizeAUPhone() result**: `"0412345678"` (unchanged)
- **Backfill action**: SKIP (already normalized)

### Format B: Space-formatted, 10 digits
- **Source**: AddLeadModal (primary UI, `validateAUPhone` formatting)
- **Example**: `"0412 345 678"`
- **normalizeAUPhone() result**: `"0412345678"`
- **Backfill action**: UPDATE

### Format C: Google Sheets dropped leading 0
- **Source**: Quick Pull CSV, SheetsSync pull sync (cell stored as numeric)
- **Example**: `"412345678"` (9 digits)
- **normalizeAUPhone() result**: `"0412345678"`
- **Backfill action**: UPDATE

### Format D: International prefix
- **Source**: Quick Pull CSV, SheetsSync pull sync
- **Example**: `"+61412345678"` or `"61412345678"`
- **normalizeAUPhone() result**: `"0412345678"`
- **Backfill action**: UPDATE

### Format E: 12-digit international (6104 prefix)
- **Source**: Quick Pull CSV, SheetsSync pull sync
- **Example**: `"610412345678"`
- **normalizeAUPhone() result**: `"0412345678"` (bug fixed in this PR — was `"00412345678"`)
- **Backfill action**: UPDATE

### Format F: Non-AU / unknown format
- **Source**: Any path if non-AU phone entered
- **Example**: `"123456"`, `"0012345678901"`
- **normalizeAUPhone() result**: Original trimmed (unchanged)
- **Backfill action**: SKIP (cannot normalize)
- **Risk**: These will never match Salestrail AU calls

### Format G: Empty / missing
- **Source**: Quick pin drops, optional phone on some forms
- **Example**: `""`, `undefined`
- **normalizeAUPhone() result**: `""` / passes through
- **Backfill action**: SKIP (empty)

---

## Estimated Distribution

Without live data, these are conservative estimates based on the code paths' relative usage:

| Format | % of Leads (est.) | Count (if 10k leads) | Action |
|--------|-------------------|----------------------|--------|
| A: Already normalized | ~40% | ~4,000 | SKIP |
| B: Space-formatted | ~30% | ~3,000 | UPDATE |
| C: Dropped leading 0 | ~15% | ~1,500 | UPDATE |
| D: International prefix | ~8% | ~800 | UPDATE |
| E: 6104-format | ~2% | ~200 | UPDATE |
| F: Non-AU / unknown | ~3% | ~300 | SKIP |
| G: Empty / missing | ~2% | ~200 | SKIP |

**Estimated leads requiring update**: ~55% (5,500 of 10,000)

---

## Data Quality Risks

| Risk | Severity | Description |
|------|----------|-------------|
| R1: Same number, different formats | HIGH | `"0412 345 678"` and `"0412345678"` are the same person but will be separate leads post-normalization (batched updates don't deduplicate leads). This is NOT a regression — they were always separate documents. |
| R2: Non-AU phones | LOW | ~3% of leads have non-AU phone numbers. These will never match Salestrail calls. Acceptable for v1. |
| R3: `phoneRaw` data volume | LOW | Storing original values in `phoneRaw` adds ~30 bytes per updated lead. Negligible. |
| R4: In-flight writes during migration | LOW | A lead created via AddLeadModal during the backfill will be written normalized (since the write path is now fixed), but may also be picked up by the backfill. Since `phone === normalizeAUPhone(phone)` for new writes, it will be skipped. Safe. |

---

## Appendix: Why Code Analysis, Not Live Data

The deployed `backfillPhoneNormalization` function requires admin Firebase Auth credentials. The current environment lacks:
- `gcloud` CLI (for `application-default login`)
- A service account key file
- Firebase Admin SDK credentials

Running the dry-run requires either:
1. `gcloud auth application-default login` + a Node script with `firebase-admin`, **or**
2. Signing in as an admin rep in the CRM UI, then calling the function from the browser console with `httpsCallable(functions, "backfillPhoneNormalization")({ dryRun: true })`, **or**
3. Using the Firebase Console > Functions > backfillPhoneNormalization > Testing tab

This audit provides the code-level analysis to validate the migration logic. The live dry-run should be run immediately before the actual migration to confirm the predictions.
