# UI Audit Plan

Date: 2026-07-04
Branch: `goal/ui-audit-planning`
Savepoint tag: `savepoint-before-ui-audit-planning`
Baseline commit: `8b40295 refactor: perform safe cleanup`

## Objective

Prepare a safe, documentation-led UI audit before any UI redesign or workflow refactor begins.

The audit should identify high-value CRM workflow improvements, current UX risks, accessibility gaps, responsive-state gaps, and validation needs without changing application code.

## Scope

- Lead list, lead detail, lead sidebar, and lead workflow states.
- Client profile, client notes, document centre, and deal workflow surfaces.
- Admin settings, settings history, Salestrail controls, phone normalisation controls, and import controls.
- Reporting, dashboards, commissions, DRAPS, calendar, map, and training surfaces where they affect daily operations.
- Shared components that shape many screens, including tables, modals, toasts, sidebars, empty states, and loading states.
- Current navigation model, including tab and page-key behaviour.
- Mobile, desktop, loading, empty, error, permission denied, offline, saving, saved, and validation failure states.

## Non-goals

- No UI redesign implementation.
- No component extraction.
- No app source changes.
- No Firebase config, Firestore rules, Functions, migration, Salestrail live sync, or phone backfill changes.
- No production data access.
- No deploy.
- No dependency install.

## Deliverables For The Next Audit Goal

- Screenshot or notes inventory of current major CRM workflows.
- Workflow-by-workflow risk table.
- Accessibility and responsive-state findings.
- UI copy and operator-safety findings, especially for dry-run versus live actions.
- Candidate redesign backlog ranked by safety, user value, and validation readiness.
- Manual QA checklist for any later UI redesign branch.
- Explicit list of items blocked until better test coverage exists.

## Audit Inputs

- `docs/UI_GUIDELINES.md`
- `docs/foundation-audit.md`
- `docs/bloat-removal-plan.md`
- `docs/refactor-risk-register.md`
- `docs/RISK_REGISTER.md`
- Current validation output from Safe Cleanup.
- Existing emulator harnesses for rules, Firestore smoke, and callable dry-run validation.

## Priority Workflows

| Priority | Workflow | Why it matters | Audit focus |
| --- | --- | --- | --- |
| 1 | Lead management | Core daily CRM work and highest operational frequency. | Table scan speed, filters, status clarity, ownership, region context, empty/error states, and mobile usability. |
| 2 | Lead detail and sidebar | High risk for workflow-state and contact-history regressions. | Context preservation, saving states, validation messages, AI intent entry points, and note visibility. |
| 3 | Admin settings | Production-sensitive settings and rollback controls. | Permission clarity, audit history, rollback visibility, and admin-only affordances. |
| 4 | Salestrail controls | Live integration path exists and must remain callable-only. | Dry-run wording, live-action separation, reconciliation messaging, and direct Firestore access assumptions. |
| 5 | Phone normalisation | Can affect many lead records if live mode is approved later. | Dry-run result review, affected count visibility, sample before/after review, backup prompts, and approval language. |
| 6 | Import and sync | High data-integrity risk across Sheets and Firebase migration workflows. | Duplicate handling, warning hierarchy, rollback notes, dry-run reports, and error recovery. |
| 7 | Client profile and documents | Mixes client data, notes, deals, PDFs, and optimistic updates. | State consistency, document-loading feedback, permission states, and history visibility. |
| 8 | Reporting and dashboards | Used for management decisions and performance review. | Metric definitions, stale data indicators, loading states, and chart/table readability. |
| 9 | Map and calendar | Heavy UI surfaces with external services and dense visual state. | Performance perception, empty states, clustering or event density, and mobile fallback. |
| 10 | Training and knowledge surfaces | Supports operational consistency. | Search, navigation, stale release-safety copy, and task-based content structure. |

## Quality Gate Before UI Redesign

Any later UI redesign branch must have:

- Target workflows listed and ranked.
- Current behaviour captured with screenshots or written notes.
- Acceptance states defined for loading, empty, error, permission denied, offline, saving, saved, validation failure, mobile, and desktop.
- Data and permission boundaries confirmed.
- Firebase, Salestrail, migration, and phone-backfill live paths explicitly blocked unless separately approved.
- Manual QA checklist prepared before code changes.
- Rollback command documented.
- Validation commands selected before editing.

## Validation Plan For This Planning Branch

This branch is documentation-only. Required validation:

```powershell
git diff --check
git status --short
```

Full app validation was completed on the Safe Cleanup baseline before this branch was created. Re-run full validation before any UI code changes.

## Rollback

Return to the Safe Cleanup baseline:

```powershell
git switch goal/safe-cleanup
git branch -D goal/ui-audit-planning
```

Rollback to the savepoint if explicitly approved:

```powershell
git reset --hard savepoint-before-ui-audit-planning
```

## Recommended Next Prompt

```text
Reach Goal: UI Workflow Audit

Follow AGENTS.md, docs/CODEX_PLAYBOOK.md, docs/ENGINEERING_HANDBOOK.md, docs/UI_GUIDELINES.md, and docs/ui-audit-plan.md.

This is audit and documentation only. Do not edit app source.

Create branch: goal/ui-workflow-audit
Create tag: savepoint-before-ui-workflow-audit

Audit the priority workflows in docs/ui-audit-plan.md.
Capture current behaviour, risk, accessibility, responsive states, permission states, dry-run/live-action clarity, and validation needs.

Do not redesign UI, deploy, use production data, run migrations, run Salestrail live sync, or run phone backfill writes.

Deliver docs/ui-workflow-audit.md and update the risk register.
```
