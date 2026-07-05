# ASG CRM Sprints

## Purpose

This file defines sprint-level delivery plans for ASG CRM. Sprint work must follow `AGENTS.md`, `docs/ENGINEERING_HANDBOOK.md`, and `docs/CODEX_PLAYBOOK.md`.

## Sprint Rules

- Start each phase from a clean tree.
- Create a dedicated branch for each phase.
- Create a savepoint tag before each phase.
- Validate the previous phase before new edits.
- Keep each phase independently reviewable and reversible.
- Do not deploy, push, migrate data, run live Salestrail sync, run phone backfill writes, or modify production Firebase resources without explicit approval.
- Do not redesign business logic unless the phase proves it is required and documents the reason.

## Sprint 1: CRM Stabilisation

Status: complete and locally validated.

Review branch: `goal/sprint-validation`

Review PR: `docs/sprint-1-review-pr.md`

Summary:

- Established validation and emulator baselines.
- Added UI audit, design system, and component audit documentation.
- Added shared UI primitives.
- Applied scoped UI polish across key CRM surfaces.
- Added Vite vendor chunk splitting.
- Produced `docs/sprint-1-report.md`.

## Sprint 2: Staff Experience And Workflow

Objective:

Transform the CRM into a premium, production-ready business application by improving staff workflow, usability, and consistency.

Non-goals:

- No Firebase production changes.
- No deploys.
- No live Salestrail sync.
- No phone backfill writes.
- No migrations.
- No security rule changes unless a defect is documented first and approved.
- No broad business logic redesign unless required by a quality gate.

Recommended base:

- Branch from the validated Sprint 1 branch until Sprint 1 is merged.
- Once Sprint 1 is merged, future phases should branch from the merge target.

### Phase 0: Sprint Plan And Quality Gates

Branch: `goal/sprint-2-phase-0-planning`

Savepoint: `savepoint-before-sprint-2-phase-0-planning`

Deliverables:

- `docs/SPRINTS.md`
- Sprint 2 phase map, gates, rollback, and validation rules.

Validation:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `git diff --check`

Exit criteria:

- Sprint 2 can be executed phase by phase without guessing scope.

### Phase 1: Staff Workflow Audit

Branch: `goal/sprint-2-phase-1-workflow-audit`

Savepoint: `savepoint-before-sprint-2-phase-1-workflow-audit`

Scope:

- Audit daily staff workflows across Dashboard, Leads, Lead Details, Client Hub, Calendar, Reports, Admin, My Settings, and System Controls.
- Identify unnecessary clicks, unclear states, inconsistent controls, weak mobile states, and role-specific pain points.
- Do not change app source code.

Deliverables:

- `docs/sprint-2-staff-workflow-audit.md`
- `docs/sprint-2-workflow-improvement-plan.md`

Validation:

- `git diff --check`

Exit criteria:

- The next implementation phase has a ranked, low-risk task list.

### Phase 2: Navigation And Staff Command Flow

Branch: `goal/sprint-2-phase-2-navigation-flow`

Savepoint: `savepoint-before-sprint-2-phase-2-navigation-flow`

Scope:

- Improve navigation clarity, page orientation, quick actions, empty states, and common staff movement between Dashboard, Leads, Clients, Calendar, Reports, and Admin.
- Preserve existing route/page-key model.
- Do not change auth, Firebase rules, or data writes.

Validation:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `git diff --check`

Exit criteria:

- Staff can understand where they are, what needs attention, and how to move to the next task with fewer visual ambiguities.

### Phase 3: Lead Workbench Polish

Branch: `goal/sprint-2-phase-3-lead-workbench`

Savepoint: `savepoint-before-sprint-2-phase-3-lead-workbench`

Scope:

- Improve Lead List and Lead Details usability, scanability, status clarity, responsive layout, and save/error feedback.
- Preserve existing lead lifecycle behaviour.
- Do not change Firestore write semantics.

Validation:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:emulator:preflight`
- `npm run test:emulator:rules`
- `npm run test:emulator:firestore-smoke`
- `git diff --check`

Exit criteria:

- Lead handling feels calmer, faster, and more consistent without changing business outcomes.

### Phase 4: Staff Settings And Admin Consistency

Branch: `goal/sprint-2-phase-4-settings-admin`

Savepoint: `savepoint-before-sprint-2-phase-4-settings-admin`

Scope:

- Improve My Settings, Admin, and System Controls consistency.
- Make risky controls visually clear and hard to misread.
- Preserve callable-only settings/admin paths.

Validation:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `cd functions && npm run build`
- `cd functions && npm run test:settings-admin`
- `npm run test:emulator:callables-dry-run`
- `git diff --check`

Exit criteria:

- Settings/admin workflows are clearer without expanding production risk.

### Phase 5: Reporting And Daily Rhythm

Branch: `goal/sprint-2-phase-5-reporting-rhythm`

Savepoint: `savepoint-before-sprint-2-phase-5-reporting-rhythm`

Scope:

- Improve Reports, Dashboard, and daily activity visibility.
- Prioritise staff decision-making and scanability.
- Avoid changing report calculations unless a defect is documented first.

Validation:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `git diff --check`

Exit criteria:

- Staff can quickly understand daily workload, performance, and follow-up priorities.

### Phase 6: Sprint 2 Validation And Review

Branch: `goal/sprint-2-validation`

Savepoint: `savepoint-before-sprint-2-validation`

Deliverables:

- `docs/sprint-2-report.md`
- `docs/sprint-2-review-pr.md`

Validation:

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

Exit criteria:

- Sprint 2 is ready for human review with documented risks, rollback, and next actions.

## Sprint 2 Review Checklist

- Confirm all changes are on phase branches.
- Confirm every phase has a savepoint tag.
- Confirm production Firebase was not modified.
- Confirm no deploys, pushes, migrations, live Salestrail sync, or phone backfill writes occurred unless explicitly approved.
- Confirm validation commands were run and documented.
- Confirm UI changes preserve existing business behaviour.
- Confirm rollback command is available for each phase.
