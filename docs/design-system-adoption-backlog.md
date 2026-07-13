# Design System Adoption Backlog

Date: 2026-07-04
Branch: `goal/design-system`
Savepoint tag: `savepoint-before-design-system`
Baseline commit: `40b30a6 docs: add UI audit and redesign plan`

## Objective

Prepare the ASG CRM design system for safe adoption without redesigning the CRM yet and without changing application code.

This backlog converts `docs/design-system.md`, `docs/ui-audit.md`, and `docs/ui-redesign-plan.md` into staged future implementation goals.

## Non-goals

- No application-code changes.
- No visual redesign implementation.
- No component refactor.
- No Firebase config, Firestore rules, Functions, migration, Salestrail live sync, phone backfill, deploy, or production data work.
- No broad cleanup combined with UI work.

## Adoption Principles

- Start with a low-risk pilot.
- Build primitives only when a real screen needs them.
- Preserve business behaviour.
- Avoid redesigning high-risk screens before current-state screenshots and acceptance states exist.
- Keep production-sensitive UI behind explicit dry-run, approval, and reconciliation patterns.

## Component Backlog

| Component or pattern | Priority | Candidate pilot | Required states | Blocked surfaces |
| --- | --- | --- | --- | --- |
| Page header | High | Admin Guide or Rep Settings | Default, long title, mobile wrap, permission context. | None. |
| Action bar | High | Rep Settings | Primary action, secondary action, disabled, saving. | Leads and Admin until workflow capture. |
| Tabs | High | Training Hub or Document Centre planning only. | Active, overflow, disabled, mobile scroll, keyboard focus. | Admin Console until tab IA is reviewed. |
| Status badge | High | Admin Guide examples or read-only docs. | Success, warning, danger, info, neutral, dry-run, live. | Salestrail and phone live actions until safety copy approved. |
| Empty state | High | Admin Guide or Knowledge Base. | Empty, filtered empty, permission denied, error recovery. | Data-changing import flows until wizard plan is approved. |
| Loading state | Medium | Admin Guide or Rep Settings. | Page, panel, table, button, long-running operation. | Import/sync until operation messaging is reviewed. |
| Modal shell | Medium | Future low-risk modal only. | Focus trap, escape, validation, mobile height, sticky footer. | Add Lead, Call Logger, Appointment, import modals until workflow capture. |
| Drawer shell | Medium | Future read-only detail surface. | Open, close, dirty state, save, error, mobile full-screen. | Lead Sidebar, Client Profile, Deal detail until acceptance states exist. |
| Table | High | Read-only admin/support table. | Sort, filter, loading, empty, error, mobile card, bulk actions. | Leads, Deals, Reports, Admin tables until current behaviours are captured. |
| Wizard | High | Documentation prototype first. | Source, mapping, dry-run, review, commit/export, blocked live action. | CSV, DQ Import, Sheets Sync until fixtures and dry-run UX are reviewed. |
| Danger zone | Critical | Documentation prototype first. | Dry-run first, affected count, sample review, approval checklist, live disabled, reconciliation. | Salestrail, phone normalisation, migration-like data tools. |
| Toast and inline feedback | Medium | Rep Settings. | Success, error, warning, undo, retry, persistent recovery. | Lead save and import/sync until workflow-specific copy is reviewed. |

## Pilot Recommendation

Use `Rep Settings` as the first implementation pilot after this docs-only goal.

Why:

- It is smaller than Admin Console, Leads, Deals, Map, Calendar, or Client Profile.
- It has user settings and save feedback but does not require redesigning production-sensitive admin controls.
- It can validate page header, action bar, form section, buttons, loading, saving, and error states.

Second choice: `Admin Guide`.

Why:

- It is low risk and content-led.
- It can validate typography, page header, knowledge layout, empty state, and responsive spacing.

Do not use the first pilot for:

- Leads.
- Lead Sidebar.
- Call Logger.
- Client Profile.
- Deal Dashboard.
- Admin Console.
- System Settings.
- Salestrail.
- Phone normalisation.
- Sheets Sync.
- Map.
- Calendar.

## Acceptance States For Pilot

Before any pilot implementation:

- Current desktop screenshot or written state captured.
- Current mobile screenshot or written state captured.
- Current loading, empty, error, permission, saving, and saved states listed.
- No data model, Firebase, auth, or business logic change required.
- Rollback command documented.
- Validation commands selected.

Pilot must demonstrate:

- Page header pattern.
- Consistent spacing.
- Standard button hierarchy.
- Accessible icon buttons.
- Visible focus states.
- Clear form labels.
- Clear save/error messaging.
- Responsive layout at 360 px, 768 px, and 1280 px.

## Accessibility Gate

Before any design-system component enters app code:

- Keyboard-only completion is possible.
- Icon-only controls have accessible names.
- Focus order matches visual order.
- Focus ring is visible.
- Colour-coded states include text.
- Touch targets are at least 44 px.
- Modals and drawers define focus handling.
- Validation errors are connected to fields or sections.

## Validation Commands

For this docs-only branch:

```powershell
git diff --check
git status --short
```

For future implementation branches:

```powershell
npm run typecheck
npm run lint
npm run build
npm test
git diff --check
```

For Firebase-adjacent UI branches, run emulator validation where relevant:

```powershell
npm run test:emulator:preflight
npm run test:emulator:rules
npm run test:emulator:firestore-smoke
npm run test:emulator:callables-dry-run
```

## Blocked Work

The following remain blocked until a dedicated approved goal exists:

- Redesigning Admin Console safety controls.
- Changing Salestrail dry-run or live sync behaviour.
- Changing phone normalisation dry-run or live backfill behaviour.
- Changing Firebase migration UI or scripts.
- Changing Firestore rules, Functions, indexes, or Firebase config.
- Deploying.
- Using production data.

## Proposed Goal Sequence

1. `goal/ui-current-state-screenshots`
2. `goal/design-system-pilot-rep-settings`
3. `refactor/ui-page-header-action-bar`
4. `refactor/ui-empty-loading-states`
5. `refactor/ui-status-badges`
6. `goal/import-wizard-ux-plan`
7. `goal/admin-safety-zone-ux-plan`
8. `goal/lead-workbench-ux-plan`

## Recommended Next Prompt

```text
Reach Goal: UI Current-State Screenshots

Follow AGENTS.md, docs/CODEX_PLAYBOOK.md, docs/ENGINEERING_HANDBOOK.md, docs/UI_GUIDELINES.md, docs/ui-audit.md, docs/ui-redesign-plan.md, docs/design-system.md, and docs/design-system-adoption-backlog.md.

Do not redesign the CRM yet.
Do not change application code.

Capture current-state screenshots or written screen notes for the priority workflows, then document acceptance states and validation needs.
```
