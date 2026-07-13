# Component Audit

Date: 2026-07-05
Branch: `goal/component-audit`
Savepoint tag: `savepoint-before-component-audit`
Baseline commit: `fc113d9 docs: add design system adoption backlog`

## Objective

Review the React component architecture before any shared component refactor begins. This is an audit only. It identifies duplication, oversized components, repeated layouts, repeated tables, repeated dialogs, repeated buttons, repeated cards, and props that should be simplified later.

## Scope

- `src/components`
- `src/pages`
- Existing shared UI primitives under `src/components/ui`
- Navigation components under `src/components/navigation`
- Design-system documentation created during Sprint 1

No application code was changed for this audit.

## Executive Summary

The CRM already has a useful component layer, but it is not yet the dominant way screens are built. The app contains many inline button, card, dialog, table, badge, loading, and empty-state implementations spread across large pages and large workflow components.

The main architectural issue is not one missing component. It is that major workflow files combine:

- Data loading.
- Filtering and sorting.
- Layout.
- Forms.
- Tables.
- Dialogs.
- Drawers.
- Status display.
- Workflow-specific business rules.

Shared components should be introduced in a compatibility-first way. The safest next refactor is a small primitives layer for buttons, cards, dialogs, form fields, badges, status indicators, loading indicators, and table shells. High-risk workflow containers such as Leads, Admin, Client Profile, Deals, Map, Calendar, and Sheets Sync should not be refactored until the primitives are stable and current behaviour is captured.

## Current Shared Component Layer

Existing reusable assets:

| Area | Existing files | Notes |
| --- | --- | --- |
| UI primitives | `src/components/ui/StatusBadge.tsx`, `Skeleton.tsx`, `EmptyState.tsx` | Useful but narrow. Not used consistently across the app. |
| State wrappers | `src/components/StateViews.tsx` | Contains loading, empty, error, and data wrapper patterns that overlap with `components/ui`. |
| Navigation | `src/components/navigation/*` | Stronger component separation than most page surfaces. Good candidate for pattern style. |
| Tables | `src/components/DataTable.tsx` | Powerful but oversized and domain-heavy. Not a simple generic table primitive. |
| Modals | Many workflow-specific files | Modal shell patterns are repeated rather than shared. |
| Forms | Inline fields in pages/modals | No standard field wrapper, validation summary, or form section primitive. |

## Oversized Components And Pages

### Highest-risk components

| File | Approximate size | Risk | Recommendation |
| --- | ---: | --- | --- |
| `src/components/AIRoleplay.tsx` | 116 KB | Voice, AI, simulation state, chat UI, setup, and results live together. | Do not refactor until browser permission and roleplay acceptance states exist. |
| `src/components/SheetsSyncModal.tsx` | 114 KB | Import/sync logic, mapping, all-tabs scan, dry-run-like review, and write actions are coupled. | Treat as high-risk data workflow. Extract only after import wizard plan and fixtures. |
| `src/components/DataTable.tsx` | 100 KB | Shared table is also a feature-rich domain table. | Do not use as the base primitive. Create smaller table shell primitives first. |
| `src/components/LeadSidebar.tsx` | 84 KB | Lead edit, notes, forms, history, save state, and workflow actions are coupled. | Block until lead workbench current-state capture exists. |
| `src/components/PdfFormFillerModal.tsx` | 75 KB | PDF rendering, field placement, form state, and document actions are coupled. | Block until document workflow capture exists. |
| `src/components/OADocumentEditor/OADocumentEditor.tsx` | 41 KB | Document editing and validation workflow. | Extract only after document-generation acceptance states exist. |
| `src/components/SystemSettingsPanel.tsx` | 40 KB | Includes production-sensitive controls for Salestrail and phone normalisation. | Do not refactor behaviour. Only apply safety-zone primitives after approval. |

### Highest-risk pages

| File | Approximate size | Risk | Recommendation |
| --- | ---: | --- | --- |
| `src/pages/Admin.tsx` | 195 KB | Many admin domains in one page, including settings, data tools, audit, health, reports, calendar settings. | Do not refactor during primitive extraction. Split only after admin IA plan. |
| `src/pages/DealDashboard.tsx` | 105 KB | Deal tables, cards, detail, documents, status workflow, filters. | Block until deal workflow capture exists. |
| `src/pages/Map.tsx` | 105 KB | Map modes, pins, zones, route planning, field workflow. | Block until field tools plan exists. |
| `src/pages/ClientProfilePage.tsx` | 103 KB | Client overlay, tabs, notes, history, docs, reports, appointments. | Block until Client 360 workflow capture exists. |
| `src/pages/DocumentCentre.tsx` | 84 KB | Documents, forms, uploads, templates, editing. | Candidate for later document library primitives after modal/table primitives. |
| `src/pages/Calendar.tsx` | 83 KB | Calendar views, toolbar, run sheet modal, legend, client panel. | Block until calendar mode/current-state capture exists. |
| `src/pages/Dashboard.tsx` | 75 KB | KPI cards, queues, charts, recent activity. | Candidate for later card and queue primitives. |

## Duplicate Component Patterns

| Pattern | Evidence | Risk | Future primitive |
| --- | --- | --- | --- |
| Buttons | Many inline `button` class strings across pages, modals, maps, calendar, reports, chat, admin. | Inconsistent size, focus, aria labels, disabled states. | `Button`, `IconButton`, `ButtonGroup`. |
| Cards | Repeated `bg-white dark:bg-[var(--surface)] rounded-xl border ... p-4 shadow-sm` patterns. | Visual drift and over-carded layouts. | `Card`, `MetricCard`, `RecordCard`, `Panel`. |
| Dialogs/modals | Add Lead, Call Logger, Appointment, CSV, DQ, Sheets, PDF, Form Filler, Commissions, Client link/document modals. | Repeated close buttons, headers, sizing, focus risk. | `Dialog`, `DialogHeader`, `DialogFooter`. |
| Tables | DataTable, reports tables, deal tables, admin tables, commissions table, document tables. | Repeated header/cell classes, mobile parity gaps. | `TableShell`, `DataTableFrame`, `SortableHeader`, `ResponsiveRecordList`. |
| Form fields | Repeated `px-3 py-2 rounded-lg border ... focus:ring-2` inputs. | Inconsistent labels, errors, help text, validation. | `Field`, `TextInput`, `SelectInput`, `Textarea`, `CheckboxField`. |
| Badges | Status badges exist in UI primitives but many local badge implementations remain. | Colour/status meanings can diverge. | `Badge`, `StatusBadge`, `ModeBadge`. |
| Loading states | `PageLoader`, `Loader`, `Skeleton`, `SkeletonCard`, `LoadingCard`, inline spinners. | Different loading language and layout shift. | `Spinner`, `LoadingBlock`, `TableSkeleton`. |
| Empty/error states | `EmptyState`, `EmptyCard`, `StateViews`, plus local empty blocks. | Inconsistent recovery actions. | One `EmptyState` and one `ErrorState` standard. |
| Tabs/segmented controls | Admin, Training, Client Profile, Document Centre, Deals active/completed, filters. | Inconsistent keyboard and overflow behaviour. | `Tabs`, `SegmentedControl`. |
| Danger zones | System Settings, Data Tools, import/sync flows. | Production-sensitive actions need consistent dry-run/live gating. | `DangerZone`, `DryRunPanel`, `ApprovalChecklist`. |

## Props That Should Be Simplified Later

These are candidates only. Do not change them until the relevant workflow has acceptance states.

| Surface | Current signal | Simplification direction |
| --- | --- | --- |
| `AppSidebar` | Many props for page state, region, user, quick pull, sync, visibility, handlers, icons. | Group into `navigationState`, `userState`, `actions`, and `permissions` objects after tests. |
| `LeadSidebar` | Large lead-edit API with many workflow callbacks and local state. | Split presentational sections from persistence callbacks. Use a lead detail view model. |
| `DataTable` | Large prop surface likely covering many table modes. | Separate generic table shell from CRM-specific lead table behaviour. |
| `Calendar` subcomponents | Toolbar, views, run sheet, legend, client panel all local. | Extract calendar primitives only after field workflow capture. |
| `ClientProfilePage` | Overlay and all tab workflows in one component. | Split tab content into stable subcomponents with a shared client profile context. |
| `SheetsSyncModal` | Mapping, tab scanning, review, write actions, settings, and auth in one component. | Extract source, mapping, dry-run review, and commit steps as wizard sections. |
| `SystemSettingsPanel` | Multiple settings domains and production-sensitive operations in one component. | Split normal settings from safety-zone operations after safety design is approved. |

## Repeated Layouts

- Page header plus action buttons.
- Filter bar plus table/list.
- KPI card grid.
- Internal tab bar.
- Modal with sticky header and footer.
- Right-side or overlay detail panel.
- Upload dropzone plus preview table.
- Search plus category/list navigation.
- Status summary plus record list.

Recommended future layout primitives:

- `PageHeader`
- `ActionBar`
- `FilterBar`
- `Panel`
- `MetricGrid`
- `RecordList`
- `DetailDrawer`
- `WorkflowWizard`

## Refactor Risk Ranking

| Risk level | Safe examples | Avoid initially |
| --- | --- | --- |
| Low | New primitive files with no consumers, docs, read-only adoption in Admin Guide or Rep Settings. | None. |
| Medium | Replacing simple repeated cards, buttons, inputs in low-risk settings/content screens. | Shared table behaviour in core workflows. |
| High | Leads, Client Profile, Deals, Calendar, Document Centre, Reports. | Behaviour-carrying extraction without screenshots/tests. |
| Critical | Admin data tools, System Settings, Salestrail, phone normalisation, Sheets Sync write paths, migration-like flows. | Any behaviour change without explicit approval and dry-run validation. |

## Findings By Requested Category

- Duplicate components: local status badges, empty states, loading states, modal shells, table shells, cards, tabs, upload flows.
- Oversized components: `AIRoleplay`, `SheetsSyncModal`, `DataTable`, `LeadSidebar`, `PdfFormFillerModal`, `Admin`, `DealDashboard`, `Map`, `ClientProfilePage`.
- Props to simplify: `AppSidebar`, `LeadSidebar`, `DataTable`, `ClientProfilePage`, `SheetsSyncModal`, `SystemSettingsPanel`.
- Repeated layouts: page headers, filters, KPI grids, tables, drawers, wizards, modal shells.
- Repeated tables: reports, deals, admin, commissions, documents, DataTable.
- Repeated dialogs: add/edit, import, appointment, document, commission, client link, PDF/form filler.
- Repeated buttons: primary, secondary, icon, destructive, segmented choices.
- Repeated cards: KPI cards, record cards, document cards, training cards, report cards, client summary cards.

## Recommended Next Step

Proceed to `Goal: Shared Component Refactor` only after this audit is committed. The first implementation should add compatible primitives without changing page behaviour.
