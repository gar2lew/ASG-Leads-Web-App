# Leads Sheet Reset Migration

This is the safe maintenance workflow for rebuilding Firestore `leads` from the Google Sheet lead tabs.

The migration script is:

```powershell
node scripts/firebase-leads-sheet-migration.mjs
```

## What It Does

- Backs up every current Firestore lead from `leads` to `migration-backups/leads/leads-backup-<timestamp>.json`.
- Reads rows from the Google Sheet `LEADS` tab by default, or all lead tabs with `--all-tabs`.
- Known all-tab import tabs: `LEADS`, `DQ`, `LIVE`, `NO ANSWER`, `REVISIT`, `BOOKED`, `NOT INTERESTED`, `WRONG NUMBER`.
- With `--all-tabs`, lists actual Google Sheet titles, matches expected lead tabs after trimming, uppercasing, and collapsing spaces, and uses the exact actual title in A1 ranges.
- Also discovers lead-like tabs by headers such as `Lead Name`, `Contact Number`, `Lead Status`, `Call Result`, and `LeadID`.
- Excludes audit/maintenance tabs such as `Dedup Audit Log`, `Date Fix Log`, and any tab title containing `audit`, `log`, or `fix`.
- Skips discovered lead-like tabs that have only a header row, with a warning, instead of failing the run.
- Auto-maps known sheet headers to the CRM lead schema.
- Normalizes Australian phone numbers.
- Normalizes statuses to the current app import statuses: `DQ`, `Live`, `Booked`, `Revisit`, `Not Interested`, `Wrong Number`, `No Answer`.
- Detects duplicates only by strong keys: `LeadID`, normalized phone, email, or normalized full name plus address. Name-only repeats are warnings, not duplicates.
- Preserves important existing CRM fields when matching sheet rows to current leads.
- Uses stable IDs: matched sheet rows keep the current CRM `lead.id`; new sheet-only rows get a deterministic numeric ID from `LeadID`, normalized phone, email, then name/address.
- Generates a JSON report in `migration-reports/leads/`.
- Scans related lead-linked collections and reports them without deleting or changing them.

## Required Environment

Install root package dependencies first. The migration script uses root dev dependencies `firebase-admin` and `googleapis`; both are local/admin tooling dependencies and are not bundled into the Vite client app.

```powershell
npm install
```

Create local environment variables or load them in your shell. Do not commit real credential files.

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\service-account.json"
$env:FIREBASE_PROJECT_ID="amplify-leads-2026"
$env:GOOGLE_SHEET_ID="your_google_spreadsheet_id"
$env:GOOGLE_SHEET_TAB="LEADS"
```

The service account must:

- Have Firebase Admin access to the Firebase project.
- Be shared onto the Google Sheet as at least a viewer.

## Dry Run

Dry-run is the default and performs no Firestore writes.

```powershell
node scripts/firebase-leads-sheet-migration.mjs --dry-run --sheet-id $env:GOOGLE_SHEET_ID --tab LEADS --project-id amplify-leads-2026
```

Dry-run all lead tabs:

```powershell
node scripts/firebase-leads-sheet-migration.mjs --dry-run --all-tabs --sheet-id $env:GOOGLE_SHEET_ID --project-id amplify-leads-2026
```

Review:

- existing Firebase lead count
- sheet row count
- total rows across all tabs, when `--all-tabs` is used
- available sheet titles
- matched lead tabs
- missing expected tabs
- excluded tabs
- discovered lead tabs
- skipped empty tabs
- skipped non-lead tabs
- valid/skipped/duplicate counts per tab
- per-tab rows including header, data rows, valid imports, skipped rows, and status breakdown
- unmatched existing Firebase leads when `--dry-run --all-tabs` is used, including count, status breakdown, samples, and full JSON/CSV artifact paths
- full replace impact reconciliation when `--dry-run --all-tabs` is used:
  - directly matched existing docs that would be preserved
  - incoming creates
  - existing docs not directly reimported
  - unmatched existing docs
  - existing duplicate docs that match Sheet rows but are not selected
  - JSON/CSV artifact paths, including duplicate existing Firebase docs CSV
- valid import count
- skipped row count
- duplicate count
- status breakdown
- ID strategy and counts for existing matched IDs vs deterministic new IDs
- planned created/updated counts
- related collection reference warnings
- report JSON under `migration-reports/leads/`

## Backup Only

```powershell
node scripts/firebase-leads-sheet-migration.mjs --backup-only --project-id amplify-leads-2026
```

## Import Without Delete

This creates or updates lead docs by matching existing CRM leads on `LeadID`, normalized phone, email, or full name plus address. It does not delete current leads.

```powershell
node scripts/firebase-leads-sheet-migration.mjs --import --sheet-id $env:GOOGLE_SHEET_ID --tab LEADS --project-id amplify-leads-2026
```

All-tabs import without delete:

```powershell
node scripts/firebase-leads-sheet-migration.mjs --import --all-tabs --sheet-id $env:GOOGLE_SHEET_ID --project-id amplify-leads-2026
```

## Full Replace

Full replace backs up existing leads, deletes only top-level `leads/{id}` documents, then imports clean sheet rows.

Before using full replace, confirm the dry-run report's `idStrategy` section. Related records in this app commonly store lead IDs in fields such as `appointments.linkedLeadId`, `deals.leadId`, and `clientNotes.linkedLeadId/clientId`, so full replace is safest only when sheet rows match existing lead IDs or when orphaned historical links are acceptable.

It does not delete:

- `leads/{id}/notes`
- `leads/{id}/files`
- `leads/{id}/dealUpdates`
- `leads/{id}/presence`
- related top-level documents such as `appointments`, `deals`, `clientNotes`, `dealDocuments`, reports, or tasks

Full replace should import all lead tabs and requires explicit confirmation flags:

```powershell
node scripts/firebase-leads-sheet-migration.mjs --full-replace --confirm-full-replace --all-tabs --sheet-id $env:GOOGLE_SHEET_ID --project-id amplify-leads-2026
```

If you intentionally want to delete all current leads and import only one tab, the script requires a second confirmation flag:

```powershell
node scripts/firebase-leads-sheet-migration.mjs --full-replace --confirm-full-replace --confirm-single-tab-replace --sheet-id $env:GOOGLE_SHEET_ID --tab LEADS --project-id amplify-leads-2026
```

## Verification

After `--import` or `--full-replace`, the script reads Firestore again and reports:

- final lead count
- final status breakdown
- sample imported records
- missing required fields

## Risks And Assumptions

- The script uses legacy display statuses because the current Sheets sync, dashboard, admin status tables, and map filters still depend heavily on `DQ`, `Live`, `Booked`, `Revisit`, `Not Interested`, `Wrong Number`, and `No Answer`.
- The newer type model also includes `new`, `contacted`, `qualified`, `booked`, and `lost`; status cleanup should be a separate migration.
- Full replace can orphan related documents that reference old lead IDs. The script reports related references but does not delete them.
- Lead subcollections are not removed by this script. If a top-level lead doc is deleted, old subcollection documents can remain addressable by the old lead ID.
- Google Sheet header auto-mapping depends on recognizable column names. Review `mappedColumns` in the dry-run report before writing.
- With `--all-tabs`, blank `Lead Status` cells fall back to the source tab status and each imported lead stores `sourceTab`.
- Rows without phone numbers are skipped because phone is the safest matching key and the app's existing Sheets sync also relies on phone matching.
- `dqRep` falls back to the first active rep, then rep ID `1`, when the sheet rep name/ID cannot be resolved.
- `region` falls back to `brisbane` unless a row maps to `perth` or `brisbane`.
