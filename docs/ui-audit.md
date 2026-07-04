# UI Audit

Date: 2026-07-04
Branch: `goal/ui-audit-planning`
Baseline commit: `0a4bb88 docs: add UI audit planning`

## Objective

Audit the current ASG CRM user experience before any redesign or application-code change. This audit reviews every current navigation screen plus global overlays for layout, spacing, navigation, typography, consistency, accessibility, responsiveness, workflow efficiency, duplicate UI, and unnecessary clicks.

## Method

This was a documentation-only source audit. It reviewed:

- `src/App.tsx`
- `src/lib/navigationConfig.ts`
- All files under `src/pages`
- High-impact shared UI under `src/components`
- Existing audit, risk, UI guideline, and bloat planning documents

No app source was changed. No production data, deploy, migration, Salestrail live sync, or phone backfill action was used.

## Executive Summary

The CRM has strong functional breadth and several good operational patterns: persistent sidebar navigation, region workspace identity, role-filtered admin navigation, lazy-loaded heavy pages, clear use of status badges, and many workflow-specific empty or loading states.

The UX risk is accumulation. Many screens solve similar problems in different ways, including filters, tabs, cards, tables, status badges, modals, save states, and destructive actions. The result is a powerful but visually busy CRM where daily users may need extra clicks and extra interpretation to complete common work.

The next redesign should not start with visual polish. It should start with workflow compression:

- Reduce lead-call friction.
- Make dry-run versus live actions unmistakable.
- Standardise tables, filters, tabs, page headers, and modals.
- Create one design system before changing large screens.
- Capture current behaviour before editing high-risk workflows.

## Global Findings

| Area | Finding | Risk | Recommendation |
| --- | --- | --- | --- |
| Navigation | Sidebar is comprehensive but long, with 23 page keys plus user controls. | Medium | Keep sections, but add task-based grouping and stronger active/breadcrumb context for deep workflows. |
| Header | Top page title exists, but page-level headers often repeat or vary. | Medium | Standardise page header anatomy: title, subtitle, primary action, secondary actions, status chips. |
| Layout | Screens mix dense CRM layouts with large cards, rounded panels, hover scale effects, and dashboard-style sections. | Medium | Use dense operational layouts for repeated work. Reserve cards for repeated records, modals, and framed tools. |
| Spacing | Common spacing scales vary between `p-3`, `p-4`, `p-5`, `rounded-xl`, `rounded-2xl`, and many custom class clusters. | Medium | Define spacing tokens and component patterns in `docs/design-system.md`. |
| Typography | Many screens use small uppercase labels, custom tracking, and multiple heading scales. | Medium | Reduce display variation. Use predictable type levels for page, section, table, form, and metadata text. |
| Colour | Amber is a strong brand accent, but some surfaces add blue, purple, red, green, and bespoke dark styles. | Medium | Define semantic colour roles and avoid page-specific colour systems unless they encode status. |
| Accessibility | Some icon buttons rely on `title`; several custom clickable rows and badges need explicit keyboard and aria review. | High | Require accessible names, focus states, keyboard flow, contrast checks, and target size review per screen. |
| Responsiveness | Many pages include responsive classes, but dense tables and side panels remain high risk on mobile. | High | Define mobile workflow rules: list-first, details drawer, sticky primary action, no horizontal-only critical action. |
| Workflow efficiency | Core flows often span table, modal, sidebar, drawer, and nested tabs. | High | Redesign around top tasks: call lead, update status, schedule follow-up, review client, run dry-run, reconcile import. |
| Duplicate UI | Tables, cards, tabs, modals, status badges, empty states, and upload flows are implemented repeatedly. | High | Create shared primitives and migration plan before visual redesign. |
| Safety UX | Salestrail, phone normalisation, import, migration, and settings controls are production-sensitive. | Critical | Use a dedicated danger-zone pattern with dry-run first, count review, approval step, and post-action reconciliation. |

## Screen Inventory

| Screen | Main purpose | Current UX notes | Audit priority |
| --- | --- | --- | --- |
| Login and PIN setup | Rep selection, first-time setup, PIN verification, backup password recovery. | Clear staged flow, but uses custom card styling and dense validation logic in `src/App.tsx`. Needs keyboard, error, and mobile checks. | High |
| App shell and sidebar | Global navigation, region switch, quick pull, display controls, sign out. | Strong operational structure, but sidebar is long and combines navigation, workspace, sync, appearance, and account controls. | High |
| Dashboard | Daily action queues, call volume, pipeline, callbacks, recent activity. | Good operational intent. Risk of card density, repeated dashboard components, and unclear priority between urgent tasks and metrics. | High |
| Inbox | Action-oriented communication/task inbox. | Keyboard shortcuts are implied in titles. Needs visible affordances, focus order, and empty-state review. | Medium |
| Team Chat | Team messages, DMs, reactions, attachments, status/location actions. | Useful communication surface, but custom chat interactions need mobile, keyboard, and attachment error-state checks. | Medium |
| Assistant | AI assistant surface. | Needs boundaries around what it can act on, loading/error states, and consistency with AI coaching surfaces. | Medium |
| Leads | Core lead table, lead actions, call logger, lead sidebar, add/import entry points. | Highest-value workflow. Current table/sidebar/modal pattern is powerful but likely click-heavy. | Critical |
| Lead Sidebar | Lead edit, notes, status, forms, history and related actions. | Deep drawer with many sections. Needs hierarchy, save-state consistency, and mobile drawer ergonomics. | Critical |
| Call Logger | Log outcome and notes for a lead. | Should be fastest CRM flow. Needs minimal clicks, keyboard entry, and clear next-lead flow. | Critical |
| Add Lead Modal | Create a lead manually. | Standard modal pattern. Needs field grouping, validation summary, and mobile safe-area review. | High |
| CSV Import Modal | Import leads from CSV. | Has upload, mapping, preview, and result states. Needs clearer stepper and duplicate/error hierarchy. | High |
| Sheets Sync Modal | Google Sheets sync, all-tabs scan, mapping, pull/push/two-way actions. | Very high complexity and production-adjacent data risk. Needs wizard model, dry-run report, and clearer action separation. | Critical |
| DQ Lead Import | Lead import workflow. | Needs alignment with CSV and Sheets import patterns to avoid three separate import UX models. | High |
| DRAPS and Stats | Lead stats and funnel reporting. | Useful management screen. Needs consistent KPI, filter, export, and table patterns. | Medium |
| Reports | Deal and performance reporting. | Dense analytics surface. Needs metric definitions, stale-data indicators, and table/chart consistency. | High |
| Client Hub | Client list and client opening workflow. | Good search/list pattern, but client, lead, and deal concepts can blur. Needs stronger row actions and profile entry clarity. | High |
| Client Profile Overlay | Overview, notes, history, appointments, deals, documents, reports. | Strong tab model, but very large surface. Needs progressive disclosure and consistent save/error feedback. | Critical |
| Deals | Active/completed deal table, filters, detail modal, documents, stages. | High business value and high regression risk. Needs stage clarity, mobile card parity, and action hierarchy. | Critical |
| Commissions | Settlement and invoice calculations. | Financial workflow needs stronger validation, review, and audit messaging. | High |
| Map | Field map, knock mode, quick pins, routes, zones, heatmap, fullscreen. | Powerful but control-heavy. Needs mode clarity, mobile action rail, and safety around accidental pin/zone edits. | High |
| Calendar | Run sheet, filters, appointments, field workflow. | Dense visual calendar. Needs legend clarity, touch targets, mobile day view, and client-profile return path review. | High |
| Document Centre | Documents and forms tabs, templates, upload, reorder, PDF/form workflows. | Broad document workflow with repeated modal/card patterns. Needs standardised library/table view and upload states. | High |
| PIA Calculator | Property/investment calculator and linked reports. | Calculator-specific layout appears separate from CRM style. Needs integration with client profile and report saving. | Medium |
| SMSF Calculator | Superannuation strategy modelling. | Similar to PIA. Needs shared calculator shell, disclaimer, save state, and client-linking clarity. | Medium |
| Training Hub | Simulation, documents, videos, recordings. | Good tab model, but training/admin upload flows need consistency. AI roleplay needs focused audit. | Medium |
| AI Roleplay | Training simulation, coaching, voice, replay-related flows. | Very large component with specialised UI. Needs separate accessibility and browser-permission review. | High |
| Knowledge Base | Search, articles, editing, admin seed actions. | Useful support surface. Needs alignment with docs/release safety language and clearer article information architecture. | Medium |
| My Dashboard | Personal notes, tasks, checklist, planner. | Useful personal workspace. Needs consistency with task and team-board patterns. | Medium |
| Rep Dashboard | Rep targets, training, DRAPS, recent calls. | Overlaps with My Dashboard and Reports. Needs clear role distinction and possible consolidation. | Medium |
| Rep Settings | Personal profile and settings. | Straightforward. Needs consistency with admin rep edit fields and save feedback. | Medium |
| Admin Console | Roster, stats, performance, operations, sync, data tools, settings, controls, history, health, reports, audit, calendar. | Extremely broad and high-risk. Needs split by task and safety zone before redesign. | Critical |
| Admin Guide | Technical guide surfaced through knowledge layout. | Useful, but should not encourage unsafe deploy or production actions. | Medium |
| System Settings | Deal, training, AI, feature flags, failsafe, Salestrail, phone normalisation. | Strong safety hints exist, but live controls need a dedicated dry-run and approval pattern. | Critical |
| Settings History | Settings audit and rollback. | Needs standard compare/rollback UX and clear actor/time/source metadata. | High |
| System Health | Health and diagnostics. | Needs standard status severity scale and operator action guidance. | Medium |
| Daily Report Dashboard | Daily operational reporting. | Needs consistency with Reports and DRAPS metric definitions. | Medium |
| Floating Calculator | Global quick calculation tool. | Useful utility, but must not obscure dense screens on mobile. | Medium |
| Floating Calendar | Global quick calendar tool. | Useful utility, but overlapping with Calendar page needs clear use case. | Medium |
| Offline and Connection Indicators | Network state and sync status. | Important operational feedback. Needs consistent placement and recovery actions. | High |
| Onboarding Flow | First-use guidance. | Needs audit for role-specific onboarding and whether it matches current navigation. | Medium |

## Detailed Findings By UX Dimension

### Layout

- Many operational pages rely on cards for both summary metrics and primary workflow content.
- Large pages use internal tab bars, filter rows, tables, drawers, and modals within one screen, which can create a nested-control feeling.
- Admin Console, Client Profile, Deals, Map, Training, Document Centre, and Sheets Sync are too broad to redesign safely without workflow-level acceptance states.

Recommendation:

- Move to a standard operational layout:
  - Page header.
  - Filter/action bar.
  - Primary work area.
  - Context drawer or detail panel.
  - Status/feedback area.
- Avoid nested cards inside page sections.
- Use tables for scan/comparison workflows and cards only for mobile or repeated record summaries.

### Spacing

- Spacing is visually competent but inconsistent between screens.
- Common component spacing uses many variants of `p-3`, `p-4`, `p-5`, `gap-2`, `gap-3`, `rounded-xl`, and `rounded-2xl`.
- Some dense CRM surfaces need tighter, more regular spacing than dashboard-style cards.

Recommendation:

- Define spacing tokens:
  - `xs`: 4 px
  - `sm`: 8 px
  - `md`: 12 px
  - `lg`: 16 px
  - `xl`: 24 px
- Use 8 px radius by default for operational controls.
- Reserve larger radii for modals and major panels only.

### Navigation

- Sidebar grouping is logical, but the number of destinations makes the app feel broad.
- Several screens overlap in purpose: Dashboard, My Dashboard, Rep Dashboard, Reports, DRAPS, Daily Report.
- Route memory documents older route config that no longer exists, which can confuse future navigation work.

Recommendation:

- Keep the sidebar but prioritise top tasks within groups.
- Add a review for dashboard/report consolidation.
- Use a breadcrumb or context label for overlay/detail workflows such as Client Profile and Deal detail.
- Update architecture memory in a later docs goal to match the current navigation source.

### Typography

- Typography uses many small uppercase labels and custom tracking.
- Page titles vary from compact topbar titles to larger page titles.
- Dense tables and cards sometimes rely on colour and small text at the same time.

Recommendation:

- Use five type levels:
  - Page title
  - Section title
  - Table header
  - Body
  - Metadata
- Avoid letter spacing except for rare labels.
- Do not use hero-scale text inside operational screens.

### Consistency

- There are multiple implementations of:
  - KPI cards
  - Empty states
  - Skeleton/loading states
  - Status badges
  - Tab bars
  - Modal shells
  - Upload dropzones
  - Search/filter bars
  - Table/card responsive switches
- Existing shared primitives under `src/components/ui` are useful but not yet dominant.

Recommendation:

- Build a documented component inventory before implementation.
- Standardise one pattern at a time, starting with page header, action bar, tabs, table, drawer, modal, badge, empty state, and danger zone.

### Accessibility

Accessibility needs a dedicated pass before UI code changes. Current source shows positive signs such as some `aria-label`, `role`, and labelled controls, but risks remain:

- Icon-only buttons often rely on `title`.
- Some clickable rows and custom controls need keyboard semantics review.
- Small text and low-contrast metadata are common.
- Mobile drawers and modals need focus trapping and escape behaviour review.
- Colour-coded statuses need text labels and not colour alone.

Recommendation:

- Require accessible names for all icon buttons.
- Require visible focus states.
- Minimum target size should be 44 px for touch actions.
- Test keyboard-only navigation for login, lead call flow, client profile, admin settings, import, and map controls.

### Responsiveness

- The app includes many responsive classes and mobile-specific card alternatives.
- Highest-risk responsive surfaces are Leads, DataTable, Lead Sidebar, Client Profile, Deals, Map, Calendar, Admin, Document Centre, and Sheets Sync.
- Dense modals can exceed mobile viewport height.

Recommendation:

- Define mobile-first workflow rules:
  - One primary action visible.
  - Filters collapse into a panel.
  - Details use a bottom sheet or full-screen drawer.
  - Tables become ordered cards only when all critical fields and actions remain available.
  - Sticky footer actions for save/cancel in long forms.

### Workflow Efficiency

Potential unnecessary-click areas:

- Lead call flow may require moving between table, call logger, sidebar, and next-lead selection.
- Client work crosses Client Hub, Client Profile, Documents, PIA/SMSF, Deals, and Reports.
- Admin safety work crosses Settings, System Controls, Control History, Data Tools, Sync, and Audit.
- Import workflows are split across CSV Import, DQ Import, Sheets Sync, Admin Sync, and migration docs.
- Reports, DRAPS, Daily Report, Rep Dashboard, and My Dashboard overlap in performance information.

Recommendation:

- Define critical workflow journeys and optimise by clicks:
  - Call next lead.
  - Book appointment.
  - Update follow-up.
  - Review client before meeting.
  - Run dry-run import/sync and review results.
  - Roll back a settings change.
  - Find an overdue deal.

### Duplicate UI

High-value consolidation candidates:

- `DataTable`, deal tables, reports tables, admin tables, document tables.
- `EmptyState`, `StateViews`, inline empty blocks.
- `Skeleton`, `LoadingCard`, page loaders.
- Status badge implementations across leads, deals, reports, calendar, and map pins.
- Modal shells across add lead, call logger, appointment, import, document, forms, and PDF flows.
- Upload and mapping flows across CSV, Timely CSV, DQ Import, Sheets Sync, Document Centre, and Training.

Recommendation:

- Do not consolidate mechanically.
- First document the target component API and expected states.
- Migrate one low-risk surface before touching Leads, Admin, or Deals.

## Mock-up Recommendations

These are recommendations only. They are not implementation instructions for this branch.

### 1. Standard Page Header

```text
Page Title                         Primary Action
Short task-focused subtitle        Secondary actions
[Workspace] [Sync state] [Permission context]
```

Use on Dashboard, Leads, Clients, Deals, Reports, Document Centre, Training, Admin, and calculators.

### 2. Lead Workbench

```text
Filter/action bar
Search | Status | Rep | Region | Saved views | Add lead

Lead queue table or mobile cards
Name | Phone | Status | Next action | Last touch | Owner | Actions

Right detail drawer
Lead summary
Next best action
Call outcome
Follow-up
Notes
History
```

Design goal: log a call and move to the next lead without losing queue context.

### 3. Client 360

```text
Client header
Name | Phone | Email | Region | Risk/status chips | Primary next action

Tabs
Overview | Notes | Appointments | Deals | Documents | Reports | History

Right rail
Linked partner
Open tasks
Recent activity
Linked calculators
```

Design goal: reduce switching between Client Hub, Profile, Documents, Reports, PIA, SMSF, and Deals.

### 4. Admin Safety Zone

```text
Danger or production-sensitive action
Purpose
Target collection or integration
Dry-run button
Result count
Sample before/after
Approval checklist
Live action button disabled until approved
Post-run reconciliation
```

Use for Salestrail sync, phone normalisation, migration-like data tools, and settings rollback.

### 5. Import Wizard

```text
1 Source
2 Map fields
3 Dry-run
4 Review duplicates and warnings
5 Commit or export report
```

Design goal: make CSV Import, DQ Import, and Sheets Sync feel like one family.

### 6. Mobile CRM Pattern

```text
Top: page title and primary action
Middle: single-column list or cards
Bottom: sticky action bar for selected item
Full-screen drawer: details and forms
```

Design goal: keep lead calling, map field work, calendar run sheet, and client review usable on phones.

## Blocked Before Redesign

- Do not change app code until the UI workflow audit is reviewed.
- Do not touch Firebase rules, Functions, project selection, migration tooling, Salestrail live sync, or phone backfill writes.
- Do not refactor large files during visual redesign.
- Do not redesign Admin, Leads, Deals, Sheets Sync, Map, or Client Profile without current-state screenshots or written acceptance states.

## Recommended Next Actions

1. Review `docs/design-system.md`.
2. Review `docs/ui-redesign-plan.md`.
3. Create a UI workflow audit branch for screenshots/manual walkthroughs.
4. Pick one low-risk pilot screen for design-system application.
5. Keep high-risk admin/data/integration screens behind separate approval gates.
