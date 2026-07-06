# Component Modernisation Review

Last updated: 6 July 2026

## Scope

This goal reviewed the React component surface and made only low-risk shared-component changes.

Included:

- `src/pages/**/*.tsx`
- `src/components/**/*.tsx`
- `src/context/**/*.tsx`
- Existing shared UI primitives under `src/components/ui`
- Existing component audit and refactor plan documentation

Excluded:

- Firebase config, Firestore rules, Functions, migrations, deploy scripts, and production data.
- Behavioural refactors in core workflows.
- UI redesign.

## Component Inventory

The repository currently has approximately 297 React component declarations across TSX files.

Largest component and page files by line count:

| Lines | File | Signals |
| ---: | --- | --- |
| 4291 | `src/pages/Admin.tsx` | 102 hook calls, 54 `useState` calls, 13 dialog/modal signals. |
| 2695 | `src/components/AIRoleplay.tsx` | Voice, AI roleplay, setup, chat, and results in one surface. |
| 2496 | `src/components/SheetsSyncModal.tsx` | Import, mapping, sync review, and write workflow in one modal. |
| 2397 | `src/pages/DealDashboard.tsx` | 50 hook calls, 20 `useState` calls, 22 dialog/modal signals. |
| 2288 | `src/pages/Map.tsx` | 63 hook calls, 23 `useState` calls, field workflow and map complexity. |
| 2172 | `src/pages/DealPipeline.tsx` | Parallel deal workflow that duplicates Deal Dashboard patterns. |
| 2124 | `src/pages/ClientProfilePage.tsx` | Client overlay, notes, reports, documents, linking, and history. |
| 2115 | `src/components/DataTable.tsx` | Shared table with large domain-specific behaviour. |
| 1956 | `src/pages/Calendar.tsx` | 36 dialog/modal signals across calendar views and run sheet flow. |
| 1911 | `src/pages/DocumentCentre.tsx` | 55 hook calls, 27 `useState` calls, 31 dialog/modal signals. |
| 1829 | `src/components/PdfFormFillerModal.tsx` | PDF rendering, signing, field placement, and persistence. |
| 1760 | `src/components/LeadSidebar.tsx` | Lead edit, notes, files, presence, and audit behaviour. |
| 1697 | `src/App.tsx` | App shell, PIN flow, modals, lazy pages, and global state. |

## Complex State Hotspots

| File | Why it is complex | Modernisation direction |
| --- | --- | --- |
| `src/pages/Admin.tsx` | Many admin domains, production-sensitive controls, nested sections, drill-down modals. | Split by admin domain only after acceptance states and admin safety tests exist. |
| `src/components/SheetsSyncModal.tsx` | Data import and sync workflow combines discovery, mapping, review, and writes. | Convert to a wizard model with fixtures and dry-run style tests before UI extraction. |
| `src/pages/DealDashboard.tsx` | Deal cards, tables, drawer, documents, sorting, and create flow. | Extract shared deal view model before extracting table/card UI. |
| `src/pages/DealPipeline.tsx` | Duplicates much of Deal Dashboard with similar write paths. | Decide whether this is legacy, alternate view, or merge candidate before refactor. |
| `src/pages/ClientProfilePage.tsx` | Client tabs, partner linking, report history, notes, and document actions. | Split tabs behind a stable client profile context. |
| `src/pages/DocumentCentre.tsx` | Uploads, form builder, PDF templates, and use-for-lead workflows. | Extract document template services before changing modal UI. |
| `src/components/DataTable.tsx` | Generic table and CRM-specific lead table behaviour are mixed. | Do not use as a primitive. Keep `TableShell` separate. |
| `src/components/LeadSidebar.tsx` | Lead workflow actions and persistence callbacks are coupled to dense UI. | Extract presentational sections after lead workflow snapshots exist. |

## Duplicate Hooks and Data Patterns

| Pattern | Evidence | Risk |
| --- | --- | --- |
| Broad Firebase compatibility hook | `src/hooks/useFirebase.ts` remains the largest data hook and powers many collections. | New feature work can keep expanding a high-risk file. |
| Deal write hooks and handlers | `DealDashboard` and `DealPipeline` both update status, notes, fields, create deals, and write lead deal ids. | Duplicate behaviour can drift. |
| Training library and Training Hub listeners | Training data is split between library hooks and page-local listeners. | Multiple subscription styles. |
| Settings/admin hooks | `useAppSettings`, `SystemSettingsPanel`, `Admin`, and settings callables overlap. | Direct client settings writes must stay aligned with rules and callables. |
| Client notes and AI brief reads | `useClientNotes` and `aiInsights` both query `clientNotes`. | Acceptable now, but should share query constants if expanded. |

## Duplicate Forms

Repeated local field wrappers and form patterns exist in:

- `src/components/AddLeadModal.tsx`
- `src/components/AppointmentModal.tsx`
- `src/components/CallLogger.tsx`
- `src/components/DQImportModal.tsx`
- `src/components/SystemSettingsPanel.tsx`
- `src/pages/Commissions.tsx`
- `src/pages/DocumentCentre.tsx`
- `src/pages/KnowledgeBase.tsx`
- `src/components/OADocumentEditor/OADocumentEditor.tsx`

Migration direction:

1. Keep `src/components/ui/FormField.tsx` as the stable field primitive layer.
2. Pilot adoption only in low-risk settings or content forms.
3. Do not touch document, lead, appointment, or commission forms until workflow checks exist.

## Duplicate Dialogs

Dialog and modal shells are repeated across:

- Add lead
- Appointment
- Call logger
- CSV import
- DQ import
- Sheets sync
- Timely CSV import
- Document upload
- Use-for-lead
- PDF template upload
- Form filler
- PDF form filler
- Commission invoice and new commission
- Rep drill-down
- Client linking
- Calendar run sheet
- Map knock and zone modals

Migration direction:

1. Keep `src/components/ui/Dialog.tsx` as the simple shell.
2. Add focus management only as a dedicated accessibility goal.
3. Do not migrate high-risk modals until each has visual and workflow acceptance states.

## Duplicate Shared UI Patterns

| Pattern | Current state | Target |
| --- | --- | --- |
| Buttons | Shared `Button` exists, but inline buttons remain widespread. | Adopt in low-risk support screens first. |
| Cards | Shared `Card` exists, but local KPI and record cards dominate. | Add specialised metric/card variants only after design review. |
| Tables | `DataTable` is large and domain-specific, while `TableShell` is small. | Keep `TableShell` as primitive and avoid touching `DataTable` first. |
| Badges | `Badge`, `StatusIndicator`, and `StatusBadge` exist, plus local status badges. | Standardise tone mapping by workflow. |
| Loading | `LoadingBlock`, `Spinner`, `Skeleton`, and `StateViews` overlap. | Consolidate in a later loading-state goal. |
| Empty states | `components/ui/EmptyState` and `StateViews.EmptyState` overlap. | Choose one long-term wrapper and migrate gradually. |

## Low-Risk Refactor Completed

Changed shared primitives only:

- `src/components/ui/Button.tsx`
  - Adds `aria-busy` when `isLoading` is true.
  - Marks the loading spinner as decorative with `aria-hidden`.
- `src/components/ui/EmptyState.tsx`
  - Uses the shared `Button` primitive for optional actions instead of a local inline button.

Why this is low risk:

- No business workflow code changed.
- No Firebase or data behaviour changed.
- The change is isolated to shared UI primitives.
- `EmptyState` has limited usage and preserves the same action contract.

## Migration Plan

### Stage 0: Keep current behaviour

- Use this document as the component modernisation baseline.
- Do not refactor large workflow files yet.

### Stage 1: Shared primitive hardening

- Improve primitive accessibility, types, and consistent composition.
- Keep changes internal to `src/components/ui`.
- Validate with typecheck, lint, build, and tests.

### Stage 2: Low-risk pilot adoption

Candidate surfaces:

- `AdminGuidePage`
- `RepSettingsPanel`
- `SettingsHistoryPanel`
- `SystemHealthPanel`
- Read-only dashboard support widgets

Avoid:

- Lead workflow
- Deals
- Calendar
- Admin data tools
- Salestrail controls
- Phone normalisation controls
- Migration and import workflows

### Stage 3: Form and dialog standardisation

- Create acceptance states for each modal before migration.
- Migrate one low-risk modal at a time.
- Do not introduce focus-trap behaviour without testing keyboard flow.

### Stage 4: Deal workflow convergence

- Decide whether `DealPipeline` is legacy, alternate view, or merge candidate.
- Extract shared deal services before shared deal UI.
- Add tests around deal status, notes, sorting, creation, and lead deal id writes.

### Stage 5: Large workflow decomposition

Split only after current behaviour is captured:

- `Admin.tsx`
- `SheetsSyncModal.tsx`
- `ClientProfilePage.tsx`
- `DocumentCentre.tsx`
- `LeadSidebar.tsx`
- `DataTable.tsx`

## Quality Gates For Future Component Work

- Clean branch and savepoint tag.
- No Firebase config, rules, deployment, or production data changes.
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm test`
- Relevant emulator tests if any workflow touches Firebase behaviour.
- Screenshot or manual UI check for any visual consumer migration.

## Recommended Next Goal

Reach Goal: Low-Risk Primitive Adoption

Objective:

- Adopt `Button`, `Card`, `Field`, `Badge`, `LoadingBlock`, and `TableShell` in one low-risk support screen.

Non-goals:

- No lead, deal, calendar, admin data tool, Salestrail, phone normalisation, import, migration, or document workflow refactor.
- No Firebase changes.
- No deploy.
