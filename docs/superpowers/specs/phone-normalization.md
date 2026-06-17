# Phone Normalisation

**Date**: 2026-06-16
**Purpose**: Ensure `leads.phone` is consistently normalised so equality queries work for Salestrail call matching and future integrations.

## Normalised Format

All `leads.phone` values are normalised via `normalizeAUPhone()` in `src/lib/utils.ts`. The normalised format is:

- **10 digits, no formatting**: e.g., `0412345678`
- **Strips**: spaces, dashes, parentheses, international prefixes (`+61`, `6104`)
- **Restores**: leading `0` from Google Sheets dropped-leading-0 (e.g., `412345678` → `0412345678`)

## Write Paths

All lead creation/update paths now call `normalizeAUPhone()` before writing to Firestore:

| Path | File | Status |
|------|------|--------|
| AddLeadModal (manual) | `src/components/AddLeadModal.tsx:193` | Fixed |
| Quick Pull CSV import | `src/App.tsx:1174` | Fixed |
| Knock save | `src/pages/Map.tsx:1218` | Fixed |
| SheetsSync pull sync | `src/components/SheetsSyncModal.tsx:2261` | Fixed |
| DQImport fill-row | `src/pages/DQImport.tsx:141` | Already normalized |
| DQImport batch | `src/pages/DQImport.tsx:295` | Already normalized |
| CSVImportModal | `src/components/CSVImportModal.tsx:150` | Already normalized |
| SheetsSync smart sync | `src/components/SheetsSyncModal.tsx:1229` | Already normalized |

## Safety Field: `phoneRaw`

A `phoneRaw?: string` field was added to the `Lead` type. During the backfill migration, if `preserveRaw: true` (default), the original unnormalized value is stored in `phoneRaw` before `phone` is overwritten with the normalized version. This ensures no data is lost and manual verification is possible post-migration.

New leads created after the write-path fixes do NOT set `phoneRaw` — their `phone` is normalized directly.

## Backfill Migration

A server-side callable `backfillPhoneNormalization` is available at `functions/src/phoneMigration.ts`. It:

1. Reads all `leads` documents
2. Normalizes each `phone` value
3. Skips docs already normalized
4. Skips docs with empty or unnormalizable phones
5. Preserves original value in `phoneRaw` (optional, default `true`)
6. Writes in batches of 450
7. Logs counts and errors to `auditLogs`

### Dry-Run Instructions

```bash
# Deploy the callable first:
cd functions && npm run build && firebase deploy --only functions:backfillPhoneNormalization

# Then run from client or Firebase console with:
# await httpsCallable(functions, "backfillPhoneNormalization")({ dryRun: true })
```

Expected output: `{ dryRun: true, totalScanned: N, updated: M, skippedAlreadyNormalized: X, ... }`

### Live Migration Instructions

```bash
# After verifying dry-run results:
# await httpsCallable(functions, "backfillPhoneNormalization")({ dryRun: false })

# Optional: skip writing phoneRaw:
# await httpsCallable(functions, "backfillPhoneNormalization")({ dryRun: false, preserveRaw: false })
```

## Tests

Tests for `normalizeAUPhone()` are at `src/lib/__tests__/utils.test.ts`. Run with:

```bash
npm run test
```

## Why This Matters

Salestrail phone matching queries `leads.where("phone", "in", [...])` with normalised numbers. If `phone` values are heterogeneous (some digits-only, some space-formatted), equality queries will miss matches. Consistent normalisation guarantees reliable matching.
