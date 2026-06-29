# Calculator Upgrade Plan

Date: 2026-06-22
Scope: ASG CRM embedded SMSF and PIA calculator audit
Mode: Read-only audit. No code modified. No deploy performed.

## Executive Summary

The CRM currently embeds both calculators through React wrapper pages:

- `src/pages/SMSF.tsx` embeds `/smsf/index.html`
- `src/pages/PIA.tsx` embeds `/pia/index.html`

The latest standalone calculator assets in the root source tree are:

- SMSF standalone: `public/smsf/index.html`
- PIA standalone: `public/pia/index.html`

Both standalone calculators already include CRM `postMessage` bridges, so the correct upgrade strategy is to preserve the React wrapper pages and replace or patch the standalone HTML assets behind them. The wrappers add CRM-only features such as client selection, state persistence, report saving, toast feedback, and zoom handling.

There are three high-priority compatibility gaps before a clean upgrade:

1. PIA PDF export is requested by the React wrapper but not implemented by the standalone PIA iframe.
2. PIA saved cloud reports store summary result fields, not full calculator input state, so "load saved report" cannot fully restore a calculation.
3. SMSF report saving stores encrypted callable output only, while client report views expect a plain `result` object.

## Current Embedded SMSF Integration

Primary files:

| File | Purpose |
| --- | --- |
| `src/pages/SMSF.tsx` | CRM wrapper page, iframe shell, client selection, state persistence, encrypted save flow |
| `public/smsf/index.html` | Standalone SMSF calculator rendered inside iframe |
| `functions/src/smsfFinancials.ts` | Encrypt/decrypt helper callables |
| `firestore.rules` | Allows `smsfReports` broad operational read/write; `smsfFinancials` elevated role only |

Current wrapper behavior:

- Loads iframe from `/smsf/index.html`.
- Uses sandbox: `allow-scripts allow-same-origin allow-forms allow-popups`.
- Sends `CRM_CONTEXT` and `LOAD_CLIENT` messages.
- Receives `SMSF_READY`, `SMSF_RESULT`, and `SMSF_STATE`.
- Saves iframe state to `calculatorStates/smsf_{clientId}`.
- Restores state via `RESTORE_STATE`.
- Encrypts `smsfResult` through `saveSmsfFinancials`.
- Writes a `smsfReports` document with:
  - `userId`
  - `userName`
  - `clientId`
  - `clientGroupId`
  - `type: "smsf"`
  - `encrypted`
  - `createdAt`

Current embedded SMSF strengths:

- Client linking works for name/income/balance, though name is only logged in the standalone today.
- State persistence is implemented between wrapper and iframe.
- Iframe zoom/pinch handling is built into the wrapper.
- Standalone has CSV export, share-link support, charts, local storage, and query-string restore.

Current embedded SMSF gaps:

- The report document does not store a plain `result` object, but `FinancialReportsTab` and `ClientProfilePage` display paths expect `result`.
- The encryption callable does not call `requireAuth(request)` first and does not validate ownership, role, payload shape, or key length.
- Decryption is stubbed out in `ClientProfilePage`, so encrypted SMSF reports cannot currently be displayed as financial report cards without additional work.
- SMSF profile navigation exists in `ClientProfilePage`, but `App.tsx` only special-cases `pia` in the overlay `onNavigate` handler. `smsf` navigation from the client profile is likely a no-op.
- The standalone SMSF "client name" path only logs the name and does not display it in the calculator/report.

## Current Embedded PIA Integration

Primary files:

| File | Purpose |
| --- | --- |
| `src/pages/PIA.tsx` | CRM wrapper page, iframe shell, client prefill, state persistence, report list/save flow |
| `src/lib/piaReports.ts` | Canonical PIA report Firestore and Storage helpers |
| `public/pia/index.html` | Standalone PIA calculator rendered inside iframe |
| `public/pia/Circular Logo Prep.png` | Standalone PIA report logo |
| `public/pia/index.html.bak` | Older standalone PIA backup |

Current wrapper behavior:

- Loads iframe from `/pia/index.html`.
- Sends `CRM_CONTEXT`, `LOAD_CLIENT`, `RESTORE_STATE`, and `EXPORT_PDF`.
- Receives `PIA_READY`, `PIA_RESULT`, and `PIA_STATE`.
- Saves iframe state to `calculatorStates/pia_{clientId}`.
- Restores selected-client state via `RESTORE_STATE`.
- Supports prefill from `ClientProfilePage` through `piaPrefillClientId`.
- Saves cloud reports to `piaReports` via `savePIAReport`.
- Attempts to upload a PDF via `uploadPIAPdf` if iframe returns `PIA_PDF`.
- Shows local legacy reports from localStorage key `piaReports`.
- Shows cloud reports loaded by consultant name.

Current embedded PIA strengths:

- Strongest CRM integration of the two calculators.
- Supports selected-client prefill and client-group state lookup.
- Has a canonical report helper module.
- Cloud reports can be loaded by client and consultant.
- Standalone PIA has an extensive multi-page report, tax calculations, stamp duty calculator, charts, local snapshot save/export/import, and print support.

Current embedded PIA gaps:

- The wrapper requests `EXPORT_PDF` and waits for `PIA_PDF`, but `public/pia/index.html` only supports browser print and JSON snapshot export. It does not emit `PIA_PDF`.
- `savePIAReport` stores `inputs: piaResult`, where `piaResult` is a summary result object, not the full DOM input state emitted by `PIA_STATE`. This means saved cloud reports cannot fully restore the standalone calculator.
- Standalone local snapshots use localStorage key `pia-snapshots`, while the wrapper reads legacy key `piaReports`; these stores are disconnected.
- `ClientProfilePage` can set `reportToLoad` using `r.inputs || r.result`, but if `inputs` is only result summary, `RESTORE_STATE` will ignore most fields because it expects DOM IDs such as `prop-price`, `weekly-rent`, `show-tax`, and `show-charts`.
- The standalone relies on CDN Chart.js. If network access or CSP blocks jsDelivr, charts fail.

## Latest Standalone SMSF Version

Audited latest source file: `public/smsf/index.html`

Observed features:

- Dark ASG-styled standalone page.
- Chart.js from `https://cdn.jsdelivr.net/npm/chart.js`.
- Two-scenario comparison: current super vs SMSF strategy.
- Inputs for balance, salary, employer contribution, growth, years, and salary sacrifice.
- Copy buttons to mirror values between scenarios.
- Year-by-year projection table.
- Chart rendering.
- CSV export.
- Share link via query string.
- Local storage state key: `smsf-comparison-state-v4`.
- CRM bridge:
  - emits `SMSF_READY`
  - emits `SMSF_RESULT`
  - receives `LOAD_CLIENT`
  - receives `CRM_CONTEXT`
  - receives `RESTORE_STATE`
  - emits `SMSF_STATE`

Build compatibility:

- Compatible with Vite public asset copying because it is plain static HTML.
- It is not compiled or typechecked.
- It depends on external Chart.js CDN at runtime.
- It has no required local static assets besides itself.

Route compatibility:

- `/smsf/index.html` works as iframe source.
- Firebase Hosting rewrites `/smsf/**` to `/smsf/index.html`, so direct `/smsf` browser access loads the standalone calculator, not the CRM wrapper page.
- Internal CRM navigation renders the React wrapper because `App.tsx` uses page state rather than direct route loading.

Required files:

- `public/smsf/index.html`
- `src/pages/SMSF.tsx`
- `functions/src/smsfFinancials.ts`
- `functions/src/index.ts` export for SMSF callables
- `firestore.rules` entries for `smsfReports`, `smsfFinancials`, and `calculatorStates`

Optional/stray file:

- `public/smsf/SMSF.tsx` is a tiny React iframe wrapper under `public`. It is not imported by the app and will be copied as a static asset rather than compiled. It should not be treated as the source of truth.

## Latest Standalone PIA Version

Audited latest source file: `public/pia/index.html`

Compared with backup: `public/pia/index.html.bak`

Differences from backup:

- Adds reset behavior that clears client/property/user-entered fields while preserving captured defaults.
- Fixes `weekly-rent` access with optional chaining.
- Revises vacancy handling and gross-yield calculation.
- Removes projection year `0` from display rows.
- Adjusts weekly values to align with the updated projection years.
- Adds DOMContentLoaded default capture and cleared-fields initialization.
- Adds `RESTORE_STATE` handling.
- Adds `PIA_STATE` emission for CRM persistence.

Observed features:

- Multi-page property investment report.
- ASG logo asset via `Circular Logo Prep.png`.
- Print-optimized report CSS.
- Chart.js from `https://cdn.jsdelivr.net/npm/chart.js`.
- Stamp duty calculator.
- 2024-25 Australian tax brackets and Medicare levy logic.
- Cash flow, tax, borrowing-capacity, who-pays charts, cumulative charts.
- Local standalone snapshots with export/import JSON.
- CRM bridge:
  - emits `PIA_READY`
  - emits `PIA_RESULT`
  - receives `LOAD_CLIENT`
  - receives `CRM_CONTEXT`
  - receives `RESTORE_STATE`
  - emits `PIA_STATE`

Build compatibility:

- Compatible with Vite public asset copying because it is plain static HTML plus a local PNG.
- It is not compiled or typechecked.
- The `<base href="/pia/" />` is required so `Circular Logo Prep.png` resolves correctly.
- It depends on external Chart.js CDN at runtime.
- It does not currently satisfy the React wrapper's `EXPORT_PDF`/`PIA_PDF` expectation.

Route compatibility:

- `/pia/index.html` works as iframe source.
- Firebase Hosting rewrites `/pia/**` to `/pia/index.html`, so direct `/pia` browser access loads the standalone calculator, not the CRM wrapper page.
- Internal CRM navigation renders the React wrapper because `App.tsx` uses page state rather than direct route loading.
- The standalone `<base href="/pia/" />` should be preserved if the file remains hosted under `/pia/`.

Required files:

- `public/pia/index.html`
- `public/pia/Circular Logo Prep.png`
- `src/pages/PIA.tsx`
- `src/lib/piaReports.ts`
- `firestore.rules` entries for `piaReports` and `calculatorStates`

Optional/legacy files:

- `public/pia/index.html.bak` is an older backup. It should not be deployed as an active asset unless intentionally retained for rollback.
- `src/pia/PIACalculator.tsx` is a tiny iframe-only component and is not imported by the current app. The active wrapper is `src/pages/PIA.tsx`.

## Differences And Missing Features

| Area | SMSF | PIA |
| --- | --- | --- |
| Active wrapper | `src/pages/SMSF.tsx` | `src/pages/PIA.tsx` |
| Standalone source | `public/smsf/index.html` | `public/pia/index.html` |
| CRM ready message | `SMSF_READY` | `PIA_READY` |
| CRM result message | `SMSF_RESULT` | `PIA_RESULT` |
| CRM state message | `SMSF_STATE` | `PIA_STATE` |
| Restore support | Yes | Yes |
| Client prefill | income + balance; name logged only | name + income + deposit |
| Cloud report save | Encrypted result only | Summary result + optional PDF URL |
| Full input state saved to report | No | No |
| Per-client state persistence | Yes, `calculatorStates` | Yes, `calculatorStates` |
| Standalone local save | localStorage/share link | localStorage snapshots/export/import |
| PDF export from iframe | No | No, despite wrapper expecting it |
| Direct profile navigation | UI exists, app handler missing | Works through PIA-specific handler |

## Build Compatibility Findings

1. Static calculators under `public/` are copied to `dist/` by Vite. They are not bundled, linted, typechecked, minified by Vite, or imported as modules.
2. Both calculators depend on external Chart.js CDN. This is acceptable for standalone tools but fragile for CRM production if offline use, CSP, or CDN availability matters.
3. `public/smsf/SMSF.tsx` is under `public`, so Vite will serve it as a raw file if copied. It is not a valid compiled app entry and should be removed or ignored in a cleanup task.
4. `src/pia/PIACalculator.tsx` is unused. If retained, it may confuse future upgrades because it looks like an active integration.
5. The PIA wrapper's PDF flow cannot work until the standalone implements `EXPORT_PDF` handling or the wrapper switches to a print/download strategy.
6. Firestore indexes were not reviewed as blockers because report queries are simple equality filters plus client-side sorting in the inspected paths. If ordering moves server-side, add matching composite indexes where Firestore requests them.

## Route Compatibility Findings

Current `firebase.json` rewrites:

```json
{ "source": "/smsf/**", "destination": "/smsf/index.html" }
{ "source": "/pia/**", "destination": "/pia/index.html" }
{ "source": "**", "destination": "/index.html" }
```

Implications:

- Inside the CRM shell, `App.tsx` renders `PIA` and `SMSF` page components by page state.
- Direct browser navigation to `/pia` or `/smsf` will match the static calculator rewrites before the SPA fallback.
- If future URL routing expects `/pia` and `/smsf` to open CRM wrapper pages, these rewrites conflict.
- Keeping the static rewrites is acceptable only if the product intentionally supports standalone public calculator URLs.

Recommended route decision:

- Keep iframe asset URLs under `/tools/pia/index.html` and `/tools/smsf/index.html`, or `/standalone/pia/index.html` and `/standalone/smsf/index.html`.
- Reserve `/pia` and `/smsf` for CRM wrapper pages once route-based navigation is reintroduced.
- If public standalone URLs are required, expose them explicitly as `/standalone/pia` and `/standalone/smsf` rather than overloading CRM page paths.

## Required Files For A Safe Upgrade

PIA required files:

- `public/pia/index.html`
- `public/pia/Circular Logo Prep.png`
- `src/pages/PIA.tsx`
- `src/lib/piaReports.ts`
- `src/stores/appStore.ts`
- `src/pages/ClientProfilePage.tsx`
- `firestore.rules`
- `firebase.json`

SMSF required files:

- `public/smsf/index.html`
- `src/pages/SMSF.tsx`
- `functions/src/smsfFinancials.ts`
- `functions/src/index.ts`
- `src/pages/ClientProfilePage.tsx`
- `src/components/client/FinancialReportsTab.tsx`
- `firestore.rules`
- `firebase.json`

Shared required files:

- `src/App.tsx`
- `src/lib/firebase.ts`
- `src/stores/appStore.ts`
- `src/types/index.ts`

## Upgrade Plan

### Phase 1 — Stabilize Integration Contracts

Do this before replacing standalone calculator files.

- Document the postMessage contracts for both calculators.
- Add a `schemaVersion` to emitted `PIA_STATE`, `PIA_RESULT`, `SMSF_STATE`, and `SMSF_RESULT` payloads.
- Decide whether report documents store:
  - summary result only,
  - full calculator state only,
  - or both `result` and `state`.
- Recommended schema:
  - `result`: display-ready summary numbers
  - `state`: full iframe restore payload
  - `schemaVersion`: number
  - `calculatorVersion`: string or date
  - `source`: `"crm-wrapper"` or `"standalone"`

### Phase 2 — Fix PIA Save/Restore And PDF Expectations

- Change PIA cloud report save design so `piaReports.inputs` or a new `state` field stores the full `PIA_STATE` payload.
- Keep `result` separately for cards and summaries.
- Update load-from-client-profile to send full state to `RESTORE_STATE`.
- Either implement `EXPORT_PDF` inside `public/pia/index.html`, or remove the wrapper's PDF wait and mark PDF as print-only.
- If implementing PDF export, prefer a deterministic in-frame print/PDF pathway rather than trying to send a DOM-generated Blob without a library.

### Phase 3 — Fix SMSF Report Visibility

- Store a display-safe `result` object on `smsfReports` alongside encrypted payload.
- Keep encrypted payload for sensitive details if required.
- Add auth, role, ownership, and payload validation to `saveSmsfFinancials` and `getSmsfFinancials`.
- Wire decryption only for roles that should see sensitive SMSF financial fields.
- Update `FinancialReportsTab` and `ClientProfilePage` to read the new `result` field consistently.

### Phase 4 — Resolve Route Ownership

- Decide whether `/pia` and `/smsf` are CRM page URLs or standalone public URLs.
- Recommended:
  - Move standalone assets to `/standalone/pia/` and `/standalone/smsf/`.
  - Point iframe src values to those paths.
  - Let `/pia` and `/smsf` fall through to the CRM SPA wrapper when route mapping exists.
- Preserve `<base href="/pia/" />` only if PIA remains hosted under `/pia/`; otherwise update it to the new standalone base path.

### Phase 5 — Replace Standalone Assets

Once contracts are stable:

- Replace `public/pia/index.html` and required assets as a unit.
- Replace `public/smsf/index.html` as a unit.
- Confirm new standalone files still emit expected ready/result/state messages.
- Confirm new standalone files still accept `LOAD_CLIENT` and `RESTORE_STATE`.
- Confirm no new external assets were added without being listed.

### Phase 6 — Cleanup

- Remove or archive `public/pia/index.html.bak` outside the served `public` tree.
- Remove or relocate `public/smsf/SMSF.tsx`.
- Remove or document `src/pia/PIACalculator.tsx` if it remains unused.
- Add a small `docs/calculators.md` contract note for future standalone updates.

## Verification Checklist

Do not deploy until these pass locally:

- `npm run build`
- PIA wrapper loads iframe and receives `PIA_READY`.
- SMSF wrapper loads iframe and receives `SMSF_READY`.
- PIA selected-client prefill populates name, income, and deposit.
- SMSF selected-client prefill populates salary and balance.
- PIA state is saved to `calculatorStates` and restored after page reload.
- SMSF state is saved to `calculatorStates` and restored after page reload.
- PIA report save stores both summary result and restore state.
- SMSF report save stores display result and encrypted payload.
- Client profile can open PIA with selected client context.
- Client profile can open SMSF with selected client context.
- Direct `/pia` and `/smsf` behavior matches the chosen route decision.
- Charts render when online.
- A graceful message appears if Chart.js fails to load.

## Recommended Priority Order

1. Fix report schemas for PIA and SMSF.
2. Fix SMSF client-profile navigation.
3. Decide route ownership for `/pia` and `/smsf`.
4. Resolve PIA PDF/export expectation.
5. Add auth and validation to SMSF financial callables before expanding SMSF persistence.
6. Replace standalone assets only after the bridge contract is versioned.

## Non-Goals For This Upgrade

- No deployment.
- No production data migration until report schema is finalized.
- No redesign of calculator financial formulas unless separately requested.
- No broad CRM routing refactor beyond the calculator route decision.
- No Firestore rules tightening beyond calculator-specific security fixes.
