# ASG CRM Leads Sheet Reset Final Runbook

This runbook is for the final operator review and manual execution path for resetting ASG CRM Firestore leads from the Google Sheet source of truth.

Do not run the full replace command until every GO/NO-GO item at the end is satisfied.

## Current Situation Summary

- Firestore currently has 2,181 lead documents before reset.
- The latest all-tabs dry-run imports 1,797 valid leads.
- `Live` has been simplified into `Booked`; `Live` is now a legacy alias and should not remain as a canonical CRM status.
- The browser Sheets Sync modal previously used the dashboard lead array, which is intentionally limited to a 100-lead operational window.
- The browser Sheets Sync fix adds a dedicated paged CRM sync index, so sync matching can load all Firestore leads instead of the dashboard window.
- The CLI migration script is the safe tool for bulk reset. Browser sync is useful for routine operations, not for the authoritative hard reset.
- The CLI full replace deletes only top-level `leads/{id}` documents, then imports clean Sheet rows. It must not delete related collections unless a separate explicit migration is designed.

Canonical lead statuses after this work:

- `DQ`
- `No Answer`
- `Revisit`
- `Booked`
- `Not Interested`
- `Wrong Number`

## Environment Setup Commands For CMD

Run these in `cmd.exe` from the repo root:

```bat
cd /d C:\dev\ASG_LEADS_WEBAPP\asg_crm_react

set "GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\service-account.json"
set "GOOGLE_CLOUD_PROJECT=amplify-leads-2026"
set "GCLOUD_PROJECT=amplify-leads-2026"
set "GOOGLE_PROJECT_ID=amplify-leads-2026"
set "FIREBASE_PROJECT_ID=amplify-leads-2026"
set "GOOGLE_SHEET_URL=https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit"
```

Requirements:

- The service account JSON must have Firebase Admin access to `amplify-leads-2026`.
- The service account `client_email` must be shared onto the Google Sheet.
- Never print, paste, or commit the service account private key.
- Prefer `GOOGLE_SHEET_URL` over manually copying the Sheet ID, because the script can detect the ID from the URL.

## Read-Only Validation Commands

These commands are read-only and are safe to run before the migration window.

### 1. Firestore Status Count Check

This reads the current `leads` collection and prints the total plus canonical status counts. It does not write.

```bat
node -e "const fs=require('fs'); const {initializeApp,cert,getApps}=require('firebase-admin/app'); const {getFirestore}=require('firebase-admin/firestore'); const p=process.env.GOOGLE_APPLICATION_CREDENTIALS; if(!p) throw new Error('GOOGLE_APPLICATION_CREDENTIALS is required'); const sa=JSON.parse(fs.readFileSync(p,'utf8')); const projectId=process.env.FIREBASE_PROJECT_ID||process.env.GOOGLE_CLOUD_PROJECT||process.env.GCLOUD_PROJECT||process.env.GOOGLE_PROJECT_ID||sa.project_id; if(!getApps().length) initializeApp({credential:cert(sa),projectId}); const norm=s=>{s=String(s||'').trim().toLowerCase().replace(/[-_]/g,' ').replace(/\s+/g,' '); if(['live','booked','appointment booked','appointment','appt','booking','active','contacted','qualified'].includes(s)) return 'Booked'; if(['dq','new','fresh','back to dq','lead','leads'].includes(s)) return 'DQ'; if(['no answer','na','no ans','not answered','no reply'].includes(s)) return 'No Answer'; if(['revisit','callback','call back','follow up','followup','fu'].includes(s)) return 'Revisit'; if(['not interested','ni','not int','n/i','lost'].includes(s)) return 'Not Interested'; if(['wrong number','wn','wrong no','wrong num'].includes(s)) return 'Wrong Number'; return s||'(missing)';}; (async()=>{const snap=await getFirestore().collection('leads').get(); const raw={}, canonical={}; snap.forEach(d=>{const status=d.data().status||'(missing)'; raw[status]=(raw[status]||0)+1; const c=norm(status); canonical[c]=(canonical[c]||0)+1;}); console.log(JSON.stringify({total:snap.size,rawStatusBreakdown:raw,canonicalStatusBreakdown:canonical,liveRawCount:raw.Live||0},null,2));})().catch(e=>{console.error(e); process.exit(1);});"
```

Expected before reset, based on the latest audit:

- Total: `2181`
- Raw `Live` may exist before status normalization or reset.
- Canonical `Live` must be treated as `Booked`.

### 2. All-Tabs Dry-Run

This reads Firestore and Google Sheets, maps all lead tabs, generates reports, and performs no writes.

```bat
node scripts\firebase-leads-sheet-migration.mjs --dry-run --all-tabs --skip-related-scan
```

Expected headline values from the latest clean dry-run:

- Existing Firebase lead count: `2181`
- Valid import count: about `1797`
- Planned updates: about `1786`
- Planned creates: about `11`
- Final status breakdown must not contain `Live`
- Excluded tabs must include `Dedup Audit Log` and `Date Fix Log`

If this command is run without `--skip-related-scan`, it may take longer because it scans related collections read-only. Use the related scan when you need a final orphan-reference risk review.

### 3. Normalize Live To Booked Dry-Run

This reports existing Firestore leads with raw `status: "Live"` and performs no writes.

```bat
node scripts\firebase-leads-sheet-migration.mjs --normalize-live-to-booked-dry-run --skip-related-scan
```

This is optional if the full replace is about to run and the Sheet import already normalizes `Live` to `Booked`, but it is useful for confirming the remaining legacy status footprint.

### 4. Duplicate And Report Review

List latest reports:

```bat
dir /o-d migration-reports\leads
```

Open or parse the latest files:

```bat
node -e "const fs=require('fs'), path=require('path'); const dir='migration-reports/leads'; const files=fs.readdirSync(dir).filter(f=>f.startsWith('leads-dry-run-report-')&&f.endsWith('.json')).sort().reverse(); if(!files.length) throw new Error('No dry-run report found'); const report=JSON.parse(fs.readFileSync(path.join(dir,files[0]),'utf8')); console.log(JSON.stringify({file:files[0],existingLeadCount:report.existingLeadCount,validImportCount:report.validImportCount,plannedCreatedCount:report.plannedCreatedCount,plannedUpdatedCount:report.plannedUpdatedCount,duplicateCount:report.duplicateCount,statusBreakdown:report.statusBreakdown,excludedTabs:report.excludedTabs,missingExpectedTabs:report.missingExpectedTabs,unmatchedExistingCount:report.unmatchedExistingCount,fullReplaceImpact:report.fullReplaceImpact},null,2));"
```

Review these artifact types before GO:

- `migration-reports\leads\leads-dry-run-report-*.json`
- `migration-reports\leads\full-replace-impact-*.json`
- `migration-reports\leads\full-replace-impact-*.csv`
- `migration-reports\leads\duplicate-existing-firebase-docs-*.csv`
- `migration-reports\leads\unmatched-existing-leads-*.json`
- `migration-reports\leads\unmatched-existing-leads-*.csv`

Known latest impact to reconcile before full replace:

- Existing lead count: `2181`
- Incoming valid import count: `1797`
- Existing docs directly matched for update: `1786`
- Incoming creates: `11`
- Existing docs not directly reimported: `395`
- Existing docs unmatched by any strong key: `20`
- Existing docs matched by strong key but not selected: `375`
- Duplicate existing doc groups: `743`

Operator interpretation:

- The 375 matched-but-not-selected docs are likely stale Firebase duplicates.
- The 20 unmatched docs require explicit review, especially any `Booked` records.
- The duplicate group count is a strong-key group count, not necessarily 743 unique duplicate leads.

## Manual Full Replace Command

MANUAL ONLY. This command writes to Firestore. Do not paste it into a terminal until the final GO checklist is complete.

```bat
node scripts\firebase-leads-sheet-migration.mjs --full-replace --confirm-full-replace --all-tabs --skip-related-scan
```

Expected behavior:

- Back up existing top-level `leads` documents.
- Delete current top-level `leads/{id}` documents.
- Import all valid Sheet rows from lead tabs.
- Preserve stable IDs for incoming rows matched to existing docs.
- Create deterministic IDs for new incoming rows.
- Do not delete related collections.

Important:

- `--skip-related-scan` skips read-only related collection analysis for speed. It does not delete related records.
- If related references are a concern, run a dry-run without `--skip-related-scan` before the manual full replace.
- Do not add any related collection deletion behavior to this run.

## Post-Replace Verification

Immediately after a manual full replace, run these checks.

### 1. Run All-Tabs Dry-Run Again

```bat
node scripts\firebase-leads-sheet-migration.mjs --dry-run --all-tabs --skip-related-scan
```

Expected:

- Existing Firebase lead count should be approximately `1797`.
- Valid import count should remain approximately `1797`.
- Planned creates and updates should be low or explainable.
- Status breakdown should not contain `Live`.

### 2. Run Firestore Count And Status Check

Use the Firestore status count command from the read-only validation section.

Expected:

- Final lead count approximately `1797`.
- Raw `Live` count: `0`.
- Canonical statuses only:
  - `DQ`
  - `No Answer`
  - `Revisit`
  - `Booked`
  - `Not Interested`
  - `Wrong Number`

### 3. App Verification

Open the CRM and verify:

- Dashboard opens.
- Operational queues open.
- Leads page opens.
- Callback and revisit queues open.
- Booked leads display as `Booked`.
- No visible canonical `Live` filter, dropdown option, chart segment, or legend remains.
- Google Sheets Sync modal displays separate counts:
  - Dashboard loaded leads, expected around `100`
  - Firestore total leads, expected around final Firestore count
  - CRM sync index loaded, expected to match Firestore total
- Google Sheets Sync modal shows full index progress such as:
  - `Loading CRM sync index 500/1797`
  - `Loading CRM sync index 1000/1797`
  - `Loading CRM sync index 1500/1797`
  - `Loading CRM sync index complete`
- Pull Updates, Push, Two-Way, and Smart Sync are blocked while the CRM sync index is loading, errored, or partial.

## Rollback Notes

Backup location:

```text
migration-backups\leads\leads-backup-<timestamp>.json
```

Report locations:

```text
migration-reports\leads\leads-dry-run-report-<timestamp>.json
migration-reports\leads\full-replace-impact-<timestamp>.json
migration-reports\leads\full-replace-impact-<timestamp>.csv
migration-reports\leads\duplicate-existing-firebase-docs-<timestamp>.csv
migration-reports\leads\unmatched-existing-leads-<timestamp>.json
migration-reports\leads\unmatched-existing-leads-<timestamp>.csv
```

Rollback principles:

- Do not restore related collections unless there is a specific, reviewed reason.
- Do not delete related collections as part of rollback.
- Do not restore stale duplicate Firebase leads unless the business explicitly wants the old pre-reset state.
- If rollback is needed, use the timestamped backup from immediately before the full replace and document the exact backup file used.
- If related collection references are affected, treat that as a separate repair task. Do not improvise broad deletes.

## Git Safety

Before committing any code or docs, run:

```bat
git status --short
```

Required safety checks:

- `.firebase/` is ignored by `.gitignore`.
- Service account JSON files are ignored by patterns such as `*service-account*.json`, `*firebase-admin*.json`, and `firebase-service-account*.json`.
- No service account keys are committed.
- No `.env`, `.env.local`, `.env.production`, or credential files are committed.
- `migration-backups/` and `migration-reports/` are operational artifacts. If they are not ignored in `.gitignore`, handle them safely by leaving them untracked or adding local-only excludes in `.git\info\exclude`.
- Do not commit backup JSON, report CSVs, report JSONs, or customer lead data unless a sanitized artifact is intentionally prepared.

Optional local-only excludes:

```bat
>> .git\info\exclude echo migration-backups/
>> .git\info\exclude echo migration-reports/
```

Do not add service account files to Git under any circumstances.

## Final GO/NO-GO Checklist

Mark GO only when every item is true.

- [ ] Operator is in `C:\dev\ASG_LEADS_WEBAPP\asg_crm_react`.
- [ ] `GOOGLE_APPLICATION_CREDENTIALS` points to the intended service account JSON.
- [ ] `FIREBASE_PROJECT_ID`, `GOOGLE_CLOUD_PROJECT`, `GCLOUD_PROJECT`, and `GOOGLE_PROJECT_ID` are all `amplify-leads-2026`.
- [ ] `GOOGLE_SHEET_URL` points to the intended production source-of-truth Sheet.
- [ ] Service account is shared onto the Sheet.
- [ ] `git status --short` has been reviewed and no secrets are staged.
- [ ] `npx tsc --noEmit` passes.
- [ ] `node --check scripts\firebase-leads-sheet-migration.mjs` passes.
- [ ] `node scripts\test-leads-migration-duplicates.mjs` passes.
- [ ] Firestore status count check confirms the expected pre-reset count, currently `2181`.
- [ ] All-tabs dry-run confirms approximately `1797` valid imports.
- [ ] All-tabs dry-run status breakdown contains no canonical `Live`.
- [ ] Dry-run confirms `Dedup Audit Log` and `Date Fix Log` are excluded.
- [ ] The 20 unmatched existing leads have been reviewed or explicitly accepted for removal.
- [ ] The 375 matched-but-not-selected docs have been accepted as stale duplicates.
- [ ] Related collection risk has been reviewed, or the operator explicitly accepts `--skip-related-scan`.
- [ ] A backup will be generated by the full replace run.
- [ ] No one is actively editing the CRM during the reset window.
- [ ] Browser Sheets Sync fix has been built and is ready for deployment separately from the data reset.
- [ ] The operator understands the full replace command is manual-only and writes to Firestore.

NO-GO if any item above is false, if the Sheet is not trusted, if counts drift unexpectedly, if `Live` appears as a final canonical status, if secrets are staged, or if the operator is uncertain which Firebase project or Sheet is targeted.
