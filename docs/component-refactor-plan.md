# Component Refactor Plan

Date: 2026-07-05
Branch: `goal/component-audit`

## Objective

Plan a safe shared component refactor for ASG CRM. This plan does not authorise broad UI redesign or behaviour changes.

## Refactor Principles

- Preserve existing CRM behaviour.
- Add primitives before replacing high-risk workflow code.
- Keep each commit logical and validated.
- Prefer additive compatibility wrappers first.
- Avoid changing Firebase, auth, Salestrail, phone normalisation, migration, deploy, or production data behaviour.
- Do not combine visual redesign with business logic extraction.

## Proposed Shared Component Package

Create or extend primitives under `src/components/ui` where safe:

| Primitive | Purpose | Initial scope |
| --- | --- | --- |
| `Button` | Standard primary, secondary, ghost, danger, icon-compatible button classes. | Additive primitive. Use in low-risk screens first. |
| `IconButton` | Accessible icon-only action button. | Require `aria-label`. |
| `Card` | Standard panel/card surface with spacing and border variants. | Additive primitive. |
| `Dialog` | Modal shell with header/body/footer slots. | Additive primitive first. No focus-trap behaviour change unless tested. |
| `Field` | Label, help text, error text, and control wrapper. | Additive primitive. |
| `TextInput` | Standard input class and state styling. | Additive primitive. |
| `SelectInput` | Standard select class and state styling. | Additive primitive. |
| `Textarea` | Standard textarea class and state styling. | Additive primitive. |
| `Badge` | Generic semantic badge. | Can coexist with existing `StatusBadge`. |
| `StatusIndicator` | Dot plus label for online/sync/status states. | Additive primitive. |
| `Spinner` | Small consistent loading spinner. | Additive primitive. |
| `LoadingBlock` | Consistent panel/table loading placeholder. | Can wrap existing skeleton styles. |
| `TableShell` | Structural table container and header/cell class helpers. | Additive only. Do not replace `DataTable` yet. |

## Milestone Plan

### Milestone 1: Additive Primitive Layer

Scope:

- Add new primitive files.
- Export from `src/components/ui/index.ts` if such barrel exists or create one if safe.
- Do not update consumers yet unless required for type validation.

Validation:

```powershell
npm run typecheck
npm run lint
git diff --check
```

### Milestone 2: Low-risk Consumer Pilot

Candidate screens:

- `AdminGuidePage`
- `RepSettingsPanel`
- Small read-only support components

Scope:

- Replace simple button/card/field patterns only.
- No data workflow changes.
- No auth or Firebase changes.

Validation:

```powershell
npm run typecheck
npm run lint
npm run build
npm test
git diff --check
```

### Milestone 3: Empty, Loading, Badge Consolidation

Scope:

- Align `components/ui/EmptyState`, `Skeleton`, `StatusBadge`, and `StateViews`.
- Avoid breaking PIA/SMSF/report consumers that already import these primitives.

Validation:

```powershell
npm run typecheck
npm run lint
npm run build
npm test
```

### Milestone 4: Table Shell Planning

Scope:

- Add a table frame primitive only.
- Do not replace `DataTable`.
- Do not touch Leads, Deals, Reports, Admin, or Commissions table behaviour in the first table milestone.

Validation:

```powershell
npm run typecheck
npm run lint
```

### Milestone 5: Dialog Shell Planning

Scope:

- Add compatible dialog shell.
- Pilot only in a low-risk modal if current behaviour can be preserved exactly.
- Do not touch Sheets Sync, Lead Sidebar, Call Logger, Appointment Modal, or PDF/Form Filler first.

Validation:

```powershell
npm run typecheck
npm run lint
npm run build
npm test
```

## Blocked Surfaces

Do not refactor these in the first shared component implementation:

- `src/components/SheetsSyncModal.tsx`
- `src/components/LeadSidebar.tsx`
- `src/components/DataTable.tsx`
- `src/components/SystemSettingsPanel.tsx`
- `src/pages/Admin.tsx`
- `src/pages/DealDashboard.tsx`
- `src/pages/Map.tsx`
- `src/pages/ClientProfilePage.tsx`
- Salestrail live controls
- Phone normalisation live controls
- Migration-like data tooling

## Compatibility Requirements

New primitives must:

- Accept `className` for gradual adoption.
- Forward refs where useful for form controls and buttons.
- Preserve native button/input props.
- Avoid custom behaviour unless necessary.
- Use existing CSS variables where possible.
- Work in light and dark mode.
- Keep touch targets at least 44 px for interactive controls where practical.
- Provide accessible names for icon-only controls.

## Logical Commit Plan

1. `feat: add shared UI primitives`
2. `refactor: adopt primitives in low-risk settings UI`
3. `refactor: align empty loading and badge primitives`

Stop after any failing validation command.

## Validation Gate For Shared Component Refactor

Minimum after each logical commit:

```powershell
npm run typecheck
npm run lint
git diff --check
```

Before final commit:

```powershell
npm run typecheck
npm run lint
npm run build
npm test
npm run test:emulator:preflight
npm run test:emulator:rules
npm run test:emulator:firestore-smoke
npm run test:emulator:callables-dry-run
cd functions
npm run build
npm run test:settings-admin
cd ..
git diff --check
```

## Rollback

Return to the component audit baseline:

```powershell
git switch goal/design-system
git branch -D goal/component-audit
```

Rollback the component audit branch to its savepoint only with explicit approval:

```powershell
git reset --hard savepoint-before-component-audit
```

## Recommended Next Prompt

```text
Reach Goal: Shared Component Refactor

Use docs/design-system.md, docs/component-audit.md, and docs/component-refactor-plan.md.

Create reusable shared components where safe.
Focus only on Buttons, Cards, Dialogs, Tables, Form fields, Badges, Status indicators, and Loading indicators.
Do not alter behaviour.
Maintain compatibility.
Validate after every logical commit.
```
