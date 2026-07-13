# Sprint 2 Staff Workflow Audit

Date: 5 July 2026

Branch: `goal/sprint-2-phase-1-workflow-audit`

Savepoint: `savepoint-before-sprint-2-phase-1-workflow-audit`

## Objective

Audit daily staff workflow after Sprint 1 and before Sprint 2 implementation. This is a documentation-only phase. No app source, Firebase configuration, Firestore rules, Functions, migrations, Salestrail live sync, phone backfill writes, deploys, or production data were changed.

## Sources Reviewed

- `AGENTS.md`
- `docs/ENGINEERING_HANDBOOK.md`
- `docs/CODEX_PLAYBOOK.md`
- `docs/ROADMAP.md`
- `docs/GOALS.md`
- `docs/SPRINTS.md`
- `docs/ui-audit.md`
- `docs/ui-redesign-plan.md`
- `docs/design-system.md`
- `docs/component-refactor-plan.md`
- `src/lib/navigationConfig.ts`
- `src/App.tsx`
- `src/pages/Dashboard.tsx`
- `src/pages/Leads.tsx`
- `src/components/LeadSidebar.tsx`
- `src/pages/ClientHub.tsx`
- `src/pages/Calendar.tsx`
- `src/pages/ReportsDashboard.tsx`
- `src/pages/Admin.tsx`
- `src/components/RepSettingsPanel.tsx`
- `src/components/SystemSettingsPanel.tsx`

## Executive Summary

Sprint 1 made the CRM calmer and safer to review. Sprint 2 should now focus on staff task flow rather than visual restyling. The highest-value improvements are:

- Make staff orientation clearer in the topbar and page headers.
- Reduce movement between Dashboard, Leads, Lead Details, Client Hub, Calendar, and Reports.
- Make the next action more obvious on every operational screen.
- Keep risky admin and integration controls visually separate from normal staff actions.
- Standardise repeated workflow patterns before touching high-risk data paths.

The app is already broad and capable. The risk is that staff must remember where each action lives. Sprint 2 should make the CRM feel more like a guided workbench and less like a collection of powerful pages.

## Current Navigation Model

Navigation is driven by:

- `src/lib/navigationConfig.ts`
- Page-key rendering in `src/App.tsx`
- Sidebar sections in `AppSidebar`
- Topbar actions that change by current page

The current documentation memory still references `src/router/routeConfig.ts`, but that file is not present on this branch. This is a documentation drift issue, not an app defect found during this phase.

Current sidebar groups:

- Dashboard
- Communication
- Lead Operations
- Sales Pipeline
- Field Tools
- Calculators
- Training
- My Workspace
- Admin

The grouping is reasonable, but several staff workflows cross groups:

- A lead call may start from Dashboard, continue in Leads, open Lead Details, create a Calendar item, and later become a Client or Deal.
- Client review may start in Client Hub but require Documents, PIA, SMSF, Calendar, Deals, and Reports.
- Admin safety work may start in Admin but require System Controls, Control History, Audit, Sync, and release documentation.

## Staff Workflow Findings

### 1. Daily Start

Surfaces:

- Dashboard
- My Dashboard
- Rep Dashboard
- Inbox
- Leads actionable badge

Pain points:

- Staff have several possible "start here" screens.
- Dashboard shows important operational queues, but My Dashboard and Rep Dashboard also contain personal or performance work.
- The topbar exposes callback and follow-up badges, but the relationship between those badges and Dashboard queues is not fully explicit.

Opportunity:

- Treat Dashboard as the shared daily command centre.
- Treat My Dashboard as personal planning.
- Treat Rep Dashboard as performance review.
- Add clearer labels and cross-links so staff know which screen to use for daily work.

### 2. Call Next Lead

Surfaces:

- Dashboard queue shortcuts
- Leads table
- Lead Sidebar
- Call Logger
- Toasts and row feedback

Pain points:

- The staff member can enter the call flow from Dashboard or Leads, but the transition into the next action is not always obvious.
- Lead details, call logging, notes, follow-up, and status updates are split across modal and drawer patterns.
- The "save and next" mental model exists in behaviour but is not presented as one consistent workbench.

Opportunity:

- Make "Call next lead" a first-class workflow.
- Keep queue context visible.
- Make outcome, note, follow-up, and next lead movement feel like one guided task.

### 3. Lead Follow-up And Status Update

Surfaces:

- Leads filters
- Lead Sidebar fields
- Dashboard overdue sections
- Calendar if appointment is needed

Pain points:

- Staff need to interpret status, next action, callback date, follow-up date, and appointment state across different UI locations.
- Follow-up urgency can appear in badges, Dashboard sections, Lead Sidebar metadata, and table rows.

Opportunity:

- Standardise a visible "Next action" strip across Dashboard, Leads, and Lead Details.
- Make overdue, due today, and future states use one language and one visual pattern.

### 4. Client Review Before Meeting

Surfaces:

- Client Hub
- Client Profile overlay
- Calendar
- Documents
- PIA
- SMSF
- Reports
- Deals

Pain points:

- Client review is high value but crosses many surfaces.
- Client Profile is powerful, but it acts as an overlay launched from Client Hub rather than an obvious central command centre.
- Related documents, reports, appointments, calculators, and deal context need clearer hierarchy.

Opportunity:

- Make Client Profile the review hub.
- Keep upcoming appointment, active deal, recent notes, and key documents visible without tab hunting.
- Make "prepare for meeting" a named workflow.

### 5. Appointment And Calendar Work

Surfaces:

- Calendar page
- Appointment modal
- Lead Sidebar linked appointments
- Client Profile appointments
- Dashboard date-based queues

Pain points:

- Appointment creation and appointment review are available from multiple places.
- Calendar has several dense modes and service categories.
- Mobile calendar use remains high-risk because dense grids require precision.

Opportunity:

- Add clearer mode and view state.
- Provide a compact agenda-first option for staff on mobile.
- Standardise appointment status display across Calendar, Lead Details, and Client Profile.

### 6. Reporting And Daily Rhythm

Surfaces:

- Dashboard
- Reports
- Lead Stats
- Daily Report
- Rep Dashboard
- My Dashboard

Pain points:

- Reporting and daily rhythm data is spread across several screens.
- Metrics can be useful but staff need to know which numbers require action.

Opportunity:

- Separate "today's work" from "performance review".
- Add action-focused summary language before dense charts.
- Keep report filters and export actions consistent.

### 7. Staff Settings And Admin

Surfaces:

- My Settings
- Admin
- System Controls
- Settings History
- System Health
- Audit

Pain points:

- Admin is broad and contains both everyday roster tasks and production-sensitive controls.
- System Controls includes feature flags, failsafes, Salestrail sync, and phone normalisation.
- Risky actions are visually clearer after Sprint 1, but they still live close to normal settings work.

Opportunity:

- Split admin work into "people", "operations", "system safety", and "audit".
- Make risky controls look like governed runbooks.
- Preserve callable-only paths and dry-run-first behaviour.

## Role-Specific Findings

### Rep

Needs:

- Clear daily queue.
- Fast lead calling.
- Simple follow-up and appointment creation.
- Personal planning without too much admin noise.

Risks:

- Too many dashboards can dilute the daily starting point.
- Lead action context can be spread across pages.

### Manager

Needs:

- Team workload visibility.
- Rep performance signals.
- Overdue lead and follow-up visibility.
- Client/deal context for coaching.

Risks:

- Reporting screens may show metrics without action priority.
- Manager workflows can overlap with Admin Console.

### Admin

Needs:

- Roster and permissions.
- Sync and import oversight.
- System settings and history.
- Safety gates for integration and data tools.

Risks:

- Admin Console is too broad to treat as one workflow.
- Production-sensitive controls need continued separation from normal settings.

## Accessibility And Mobile Risks

High-priority checks for implementation phases:

- Topbar and sidebar buttons need accessible names.
- Mobile sidebar and overlays need predictable close and focus return.
- Lead Sidebar and Client Profile overlays need keyboard review.
- Calendar and Map need mobile mode clarity.
- Tables need card or safe horizontal-scroll alternatives where critical actions remain reachable.
- Colour-coded statuses need text labels and not colour alone.

## Documentation Drift

The `.codex/architecture.md` file still references `src/router/routeConfig.ts`, but this branch uses `src/lib/navigationConfig.ts` and page-key rendering in `src/App.tsx`. This should be corrected in a later documentation maintenance goal or included in Sprint 2 validation documentation.

## Ranked Workflow Issues

| Rank | Issue | Staff impact | Risk | Recommended phase |
| --- | --- | --- | --- | --- |
| 1 | Daily start is split across Dashboard, My Dashboard, Rep Dashboard, Inbox, and Leads badges. | Staff may waste time deciding where to start. | Medium | Phase 2 |
| 2 | Call-next-lead workflow crosses Dashboard, Leads, Lead Sidebar, and Call Logger. | More clicks and more context switching during the highest-volume workflow. | High | Phase 3 |
| 3 | Client review crosses Client Hub, overlay profile, Calendar, Documents, calculators, Deals, and Reports. | Staff may miss context before meetings. | High | Later Sprint 2 or Sprint 3 |
| 4 | Admin mixes routine roster tasks with production-sensitive controls. | Higher operator error risk. | High | Phase 4 |
| 5 | Reporting screens do not always separate action priority from performance metrics. | Staff may see data but not next action. | Medium | Phase 5 |
| 6 | Calendar and field workflows remain dense on mobile. | Field use may be slower or error-prone. | Medium | Later Sprint 2 or Sprint 3 |
| 7 | Documentation memory is stale for navigation architecture. | Future agents may inspect the wrong files. | Low | Phase 6 or docs maintenance |

## Phase 1 Conclusion

Sprint 2 should proceed, but the first implementation phase should stay narrow. The safest next phase is Navigation And Staff Command Flow:

- clarify page orientation
- improve task entry points
- reduce ambiguity between dashboards
- keep existing page-key navigation
- avoid data, auth, Firebase, and business logic changes

This provides a lower-risk path before touching Lead Workbench, Admin safety controls, or reporting calculations.
