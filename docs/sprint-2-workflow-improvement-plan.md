# Sprint 2 Workflow Improvement Plan

Date: 5 July 2026

Branch: `goal/sprint-2-phase-1-workflow-audit`

## Objective

Define the Sprint 2 implementation path for staff workflow improvements. This plan converts the staff workflow audit into small, reversible implementation phases.

## Guiding Principles

- Preserve business behaviour.
- Improve task clarity before adding features.
- Keep Firebase, auth, rules, migrations, and deploy surfaces out of scope unless explicitly approved.
- Make risky operations visibly different from everyday staff actions.
- Prefer additive UI improvements and shared primitives over large rewrites.
- Validate each phase before continuing.

## Phase 2: Navigation And Staff Command Flow

Goal:

Help staff understand where they are, what needs attention, and where to go next.

Scope:

- App topbar orientation.
- Sidebar task grouping clarity.
- Dashboard entry points.
- Cross-links from Dashboard to Leads, Clients, Calendar, Reports, and Admin where safe.
- Empty and loading state language where it affects staff orientation.

Non-goals:

- No auth changes.
- No Firebase changes.
- No route model migration.
- No business logic redesign.
- No broad dashboard calculation changes.

Candidate changes:

- Add clearer page subtitles or task descriptions to high-use screens.
- Standardise "workspace", "sync", and "attention needed" indicators.
- Clarify Dashboard, My Dashboard, and Rep Dashboard roles.
- Make topbar action labels consistent and keyboard accessible.
- Add safer action wording for Sheets, CSV, export, and add lead entry points.

Quality gate:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `git diff --check`

Rollback:

```powershell
git switch goal/sprint-2-phase-2-navigation-flow
git reset --hard savepoint-before-sprint-2-phase-2-navigation-flow
```

## Phase 3: Lead Workbench Polish

Goal:

Make the highest-volume staff workflow, calling and updating leads, feel faster and calmer.

Scope:

- Lead List.
- Lead Details.
- Call Logger entry and feedback.
- Dashboard-to-Leads queue handoff.
- Save, error, and next-action visibility.

Non-goals:

- No lead lifecycle behaviour changes.
- No Firestore write semantic changes.
- No migration or backfill work.
- No broad `DataTable` rewrite unless required and documented.

Candidate changes:

- Standardise next-action language across Dashboard, Leads, and Lead Details.
- Improve active filter and queue context.
- Make call, open, save, and next actions clearer.
- Make mobile lead handling use one primary action at a time.
- Improve inline recovery text for failed saves.

Quality gate:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:emulator:preflight`
- `npm run test:emulator:rules`
- `npm run test:emulator:firestore-smoke`
- `git diff --check`

Rollback:

```powershell
git switch goal/sprint-2-phase-3-lead-workbench
git reset --hard savepoint-before-sprint-2-phase-3-lead-workbench
```

## Phase 4: Staff Settings And Admin Consistency

Goal:

Make routine settings and admin work easier to understand while keeping risky controls clearly governed.

Scope:

- My Settings.
- Admin page shell and tab orientation.
- System Controls safety sections.
- Settings/admin callable UI only.

Non-goals:

- No callable behaviour changes unless a clear defect is found and documented first.
- No live Salestrail sync.
- No phone normalisation with `dryRun:false`.
- No Firebase config or rules changes.

Candidate changes:

- Standardise section headers and action bars.
- Separate routine settings from production-sensitive controls.
- Make dry-run actions visually distinct from live actions.
- Keep live migration and sync controls behind clear warnings and disabled states where current behaviour already supports it.
- Improve recovery guidance for settings save failures.

Quality gate:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `cd functions && npm run build`
- `cd functions && npm run test:settings-admin`
- `npm run test:emulator:callables-dry-run`
- `git diff --check`

Rollback:

```powershell
git switch goal/sprint-2-phase-4-settings-admin
git reset --hard savepoint-before-sprint-2-phase-4-settings-admin
```

## Phase 5: Reporting And Daily Rhythm

Goal:

Make daily operational reports and dashboards easier to scan and act on.

Scope:

- Dashboard.
- Reports.
- Lead Stats.
- Daily rhythm language and page framing.

Non-goals:

- No metric calculation changes unless a defect is documented first.
- No Firestore query redesign unless required by validation and approved.
- No export behaviour changes.

Candidate changes:

- Separate urgent action queues from performance analytics.
- Improve filter row consistency.
- Clarify stale, empty, loading, and export states.
- Make report cards and tables use consistent hierarchy.
- Document any metric ambiguity rather than changing calculations.

Quality gate:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `git diff --check`

Rollback:

```powershell
git switch goal/sprint-2-phase-5-reporting-rhythm
git reset --hard savepoint-before-sprint-2-phase-5-reporting-rhythm
```

## Phase 6: Sprint 2 Validation And Review

Goal:

Produce the Sprint 2 closeout report and review PR document.

Deliverables:

- `docs/sprint-2-report.md`
- `docs/sprint-2-review-pr.md`

Quality gate:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:emulator:preflight`
- `npm run test:emulator:rules`
- `npm run test:emulator:firestore-smoke`
- `npm run test:emulator:callables-dry-run`
- `cd functions && npm run build`
- `cd functions && npm run test:settings-admin`
- `git diff --check`

## Recommended Implementation Order

1. Phase 2: Navigation And Staff Command Flow.
2. Phase 3: Lead Workbench Polish.
3. Phase 4: Staff Settings And Admin Consistency.
4. Phase 5: Reporting And Daily Rhythm.
5. Phase 6: Sprint 2 Validation And Review.

## Deferred Work

These should not be pulled into Sprint 2 unless the user explicitly approves a new scope:

- Full Client 360 redesign.
- Calendar grid redesign.
- Map mode redesign.
- Document Centre redesign.
- Import wizard consolidation.
- Salestrail live reconciliation.
- Phone normalisation live migration.
- Firestore rules tightening.
- Callable auth hardening outside existing tests.
- Router architecture migration.

## Review Checklist For Each Implementation Phase

- Branch is correct for the phase.
- Savepoint tag exists.
- Working tree was clean before edits.
- Previous phase validation was checked.
- Source changes are scoped to the phase.
- Business logic changes are either absent or clearly justified.
- No production Firebase resource was touched.
- No deploy, push, migration, live sync, or live backfill was run.
- Required validation commands passed.
- Rollback command is documented.

## Recommended Next Prompt

```text
Continue Sprint 2 Phase 2: Navigation And Staff Command Flow.

Follow AGENTS.md, docs/ENGINEERING_HANDBOOK.md, docs/CODEX_PLAYBOOK.md, docs/SPRINTS.md, docs/sprint-2-staff-workflow-audit.md, and docs/sprint-2-workflow-improvement-plan.md.

Do not deploy, push, migrate data, run live Salestrail sync, run phone backfill writes, or modify production Firebase resources.

Preserve existing business behaviour.
```
