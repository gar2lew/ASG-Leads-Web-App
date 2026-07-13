# Bloat Removal Plan

Date: 2026-07-04
Branch: `goal/foundation-audit`
Savepoint tag: `savepoint-before-foundation-audit`

## Purpose

Reduce maintenance risk, bundle risk, and feature sprawl in the ASG CRM without breaking production workflows. This is a planning document only. It does not authorise deletion or refactoring.

## Principles

- Stabilise validation before removing bloat.
- Remove or split one surface at a time.
- Prefer reversibility over speed.
- Treat Firebase, migration, Salestrail, authentication, and security rule paths as production-sensitive.
- Keep user-visible workflows working while internals are simplified.
- Use small branches and small commits.

## Current Bloat Signals

| Area | Signal | Risk | First safe action |
| --- | --- | --- | --- |
| Nested mirror directory | Lint output includes `asg_crm_react\asg_crm_react\...` paths. | Duplicate scans can hide real failures and waste audit time. | Confirm mirror purpose, then exclude from tooling or plan removal with approval. |
| Admin page | `src/pages/Admin.tsx` is about 195 KB. | High regression risk across settings, users, metrics, and admin actions. | Inventory panels and extract only after tests exist. |
| AI roleplay | `src/components/AIRoleplay.tsx` is about 116 KB. | Complex browser APIs, hooks, and UI state in one file. | Identify active routes and user value before splitting. |
| Sheets sync modal | `src/components/SheetsSyncModal.tsx` is about 114 KB. | Import/sync logic is fragile and likely hard to test. | Add fixture-based sync tests before refactoring. |
| Deal dashboard | `src/pages/DealDashboard.tsx` is about 105 KB. | Workflow and reporting changes can regress sales operations. | Map data dependencies and create workflow smoke tests. |
| Map page | `src/pages/Map.tsx` is about 105 KB. | Heavy map libraries and geocoding paths affect performance. | Measure bundle contribution and lazy-load map-only logic. |
| Client profile | `src/pages/ClientProfilePage.tsx` is about 103 KB. | Client data, notes, documents, and optimistic updates are coupled. | Add notes/client workflow tests before extraction. |
| Data table | `src/components/DataTable.tsx` is about 100 KB. | Shared component changes can affect many screens. | Identify consumers and document table feature modes. |
| Firebase hook | `src/hooks/useFirebase.ts` is about 78 KB. | Shared persistence logic increases blast radius. | Split only after integration tests cover key collections. |
| Document Centre and PDF stack | Large chunks for Document Centre, PDF workers, jsPDF, and html2canvas. | Slow load and larger deploy artefacts. | Audit route-level lazy loading and user journeys. |

## Removal and Refactor Candidate Categories

### Category A: Tooling Noise

Candidates:

- Nested mirror lint and audit inclusion.
- Missing standard scripts.
- Stale lint rules and unused disable comments.

Why first:

- These changes improve confidence without touching business workflows.

Controls:

- Do not delete the mirror until its purpose is confirmed.
- Prefer tool excludes first if the mirror is intentionally retained.
- Keep changes on a `fix/validation-baseline` branch.

### Category B: Stale Documentation and In-app Deploy Text

Candidates:

- Direct Firebase deploy instructions in `src/data/knowledgeBase.ts`.
- Firestore deployment suggestion in `src/lib/firebase.ts`.

Why second:

- The handbook now requires explicit approval gates, so stale deploy text can mislead operators.

Controls:

- Treat changes as user-facing copy and release-process updates.
- Do not alter Firebase config or deploy scripts in the same branch.

### Category C: Oversized UI Files

Candidates:

- Admin panels.
- Data table feature modes.
- Deal dashboard sections.
- Client profile panels.
- Document Centre panels.

Safe pattern:

1. Add smoke or unit coverage for the current surface.
2. Extract pure helpers first.
3. Extract read-only presentational subcomponents.
4. Keep data writes and callables unchanged.
5. Verify build, lint, targeted tests, and affected workflows.

### Category D: Heavy Integration and Import Surfaces

Candidates:

- Sheets sync modal.
- Firebase leads migration script.
- Salestrail sync UI.
- Phone normalisation admin panel.

Safe pattern:

1. Build fixtures and dry-run tests first.
2. Separate parsing, reconciliation, and write planning from live write execution.
3. Keep live write paths behind explicit approval gates.
4. Prove rollback or reconciliation before any production action.

### Category E: Heavy Runtime Dependencies

Candidates:

- PDF libraries.
- Map libraries.
- Google APIs.
- Firebase Admin dependency duplication between root and Functions.

Safe pattern:

1. Measure current bundle contribution.
2. Confirm active feature usage.
3. Lazy-load where possible.
4. Remove only after route and workflow coverage exists.

## Proposed Sequence

### Stage 1: Validation Baseline

Branch: `fix/validation-baseline`

Actions:

- Add or align `typecheck` and `test` scripts.
- Resolve lint configuration blocker for `react/no-danger`.
- Decide how to handle nested mirror lint inclusion.
- Fix stale guardrail tests or corresponding behaviour.

No application behaviour changes should be made unless a failing test proves a real regression.

### Stage 2: Documentation Alignment

Branch: `docs/release-safety-copy`

Actions:

- Update stale deploy text in docs and in-app knowledge surfaces.
- Clearly mark deploy commands as release-manager-only and approval-gated.

No Firebase config changes.

### Stage 3: Read-only Inventory

Branch: `goal/bloat-inventory`

Actions:

- Generate an import graph.
- Identify unused files and components with at least two tools or checks.
- Identify dependency usage with static imports and package scripts.
- Produce deletion candidates as proposals only.

No deletion.

### Stage 4: Low-risk Extraction

Branch: `refactor/ui-foundation-slices`

Actions:

- Extract pure helpers from oversized files.
- Extract read-only presentational components.
- Avoid changing data writes, callables, auth, or Firestore access.

### Stage 5: Integration Hardening

Branch: `fix/import-sync-hardening`

Actions:

- Add fixture tests for Sheets sync, Salestrail dry-run, and migration planning.
- Split write planning from write execution.
- Keep all live modes blocked.

### Stage 6: Performance Optimisation

Branch: `goal/performance-optimisation`

Actions:

- Review Vite chunks.
- Improve lazy loading.
- Consider manual chunking only after measuring user impact.
- Validate load behaviour in browser.

## Do-not-remove List Until Dedicated Approval

- Authentication and PIN callables.
- Settings/admin callables.
- Salestrail callables and rule protections.
- Phone normalisation callable.
- Firebase leads migration tooling.
- Region isolation and permission logic.
- DocuSign webhook and related document records.
- Client notes collections and hooks.
- Release metadata generation.
- Firestore rules and indexes.

## Evidence Required Before Deletion

Before removing any file, component, dependency, or script, capture:

- Current usage search results.
- Import graph evidence.
- Route or feature ownership.
- Test coverage or manual validation plan.
- Rollback command.
- Explicit approval if the target touches Firebase, auth, data, migration, deploy, or security behaviour.

## Success Criteria

- Validation baseline is green or intentionally documented with approved exceptions.
- Nested mirror handling is resolved.
- Oversized surfaces have owners and staged extraction plans.
- Production-sensitive code remains unchanged until dedicated approval.
- Bloat removals happen in small, reversible branches.

## Safe Cleanup Update

Date: 2026-07-04
Branch: `goal/safe-cleanup`
Savepoint tag: `savepoint-before-safe-cleanup`

Completed low-risk cleanup after validation and emulator baselines were established.

Changes made:

- Replaced low-risk `any` usage in small utility and store surfaces with `unknown`, typed records, and existing CRM types.
- Cleaned CSV export helper typing in `src/lib/utils.ts`.
- Cleaned geocoding environment access in `src/lib/geocode.ts`.
- Cleaned PIA report payload typing in `src/lib/piaReports.ts`.
- Cleaned CSV import dynamic lead assignment typing in `src/components/CSVImportModal.tsx`.
- Cleaned app store report payload typing in `src/stores/appStore.ts`.
- Replaced stale in-app deployment instructions with approval-gated release guidance in `src/lib/firebase.ts` and `src/data/knowledgeBase.ts`.

Validation impact:

- `npm run typecheck` passed after cleanup.
- `npm run lint:report` warning count reduced from 78 to 64.
- Remaining warnings are concentrated in larger workflow surfaces, hook dependency reviews, Fast Refresh structure, and higher-risk `any` usage that should stay in dedicated goals.

Deferred cleanup:

- No files or components were deleted because no deletion candidate had enough evidence for this branch.
- Hook dependency warnings in large UI workflows were not changed because they can affect runtime behaviour.
- Oversized page/component extraction remains blocked until targeted workflow coverage exists.
- Nested mirror deletion remains blocked without explicit approval.
