# UI Redesign Plan

Date: 2026-07-04
Branch: `goal/ui-audit-planning`

## Objective

Plan a safe redesign of ASG CRM workflows without starting the redesign yet. This plan turns the UI audit into a staged sequence that protects production-sensitive workflows and preserves current CRM behaviour.

## Redesign Principles

- Stability first. Do not break login, lead calling, client records, admin settings, reporting, or Firebase-backed workflows.
- Workflow first. Improve the user's task path before changing visual style.
- Reversibility first. Redesign in small branches with screenshots, validation, and rollback.
- One system, many screens. Do not create a new bespoke layout per page.
- Safety is visible. Dry-run, live action, approval, rollback, and reconciliation states must be obvious.
- Dense but calm. ASG CRM is an operational tool, not a marketing site.

## Non-goals

- No application-code change in the audit branch.
- No UI redesign implementation before design-system review.
- No Firebase, data, migration, Salestrail live sync, phone backfill, deploy, or production data work.
- No large refactor combined with visual redesign.

## Staged Redesign Sequence

| Stage | Name | Scope | Exit criteria |
| --- | --- | --- | --- |
| 0 | Current-state capture | Screenshots or written notes for every priority workflow. | Existing behaviour, states, and risks are documented. |
| 1 | Design system | Tokens, components, layout rules, accessibility rules, and mock-up recommendations. | `docs/design-system.md` accepted as the implementation reference. |
| 2 | Low-risk pilot | One small screen or shared primitive with low data risk. | Validation passes and reviewer confirms the pattern. |
| 3 | Shared primitives | Header, action bar, tabs, badge, empty state, loading state, modal, drawer, table patterns. | Components can be used without changing business logic. |
| 4 | Lead workbench | Leads table, call logger, lead sidebar, add lead and CSV import entry points. | Call-next-lead flow is faster and current lead behaviour is preserved. |
| 5 | Client 360 | Client Hub and Client Profile overlay. | Client review, notes, documents, reports, and linked calculators have a clear structure. |
| 6 | Deal and revenue workflows | Deals, Commissions, Reports, DRAPS, Daily Report. | Stage/status definitions and metric definitions are clearer. |
| 7 | Field tools | Map and Calendar. | Mode clarity, touch targets, and mobile workflow are improved. |
| 8 | Training and knowledge | Training Hub, AI Roleplay, Knowledge Base, Admin Guide. | Learning flows and support content are easier to search and operate. |
| 9 | Admin safety redesign | Admin Console, System Settings, data tools, Salestrail, phone normalisation, settings history. | Dry-run/live gates, approval states, and rollback/reconciliation states are explicit. |
| 10 | Final QA and release planning | Full UI regression, accessibility checks, responsive checks, and release notes. | Ready for production-readiness review, not deploy by default. |

## Pilot Candidate

Recommended first pilot: `Admin Guide` or `Rep Settings`.

Reason:

- Smaller surface than Leads, Admin, Deals, Map, or Client Profile.
- Low data-write risk compared with settings, imports, and integrations.
- Good place to validate page header, section spacing, empty state, buttons, typography, and documentation layout.

Avoid as first pilot:

- Leads
- Admin Console
- System Settings
- Salestrail controls
- Phone normalisation controls
- Sheets Sync
- Map
- Calendar
- Client Profile
- Deal Dashboard

## Target Workflows

### Lead Workbench

Current issue:

- Lead work crosses table, sidebar, call logger, toasts, reminders, filters, imports, and dashboard navigation.

Redesign target:

- Keep the queue visible while editing or calling.
- Put next action, call outcome, follow-up, and notes in one focused detail panel.
- Reduce the call-log path to one open action, one outcome, optional note, save, and next lead.

Mock-up:

```text
[Search] [Saved View] [Status] [Rep] [Region]                       [Add Lead]

Leads queue
Name        Phone       Status       Next action     Last touch      Actions
Client A    04...       No Answer    Call today      2d ago          Call | Open

Detail drawer
Client A
Next best action
[Call outcome segmented control]
[Notes]
[Save and next]
```

### Client 360

Current issue:

- Client work is split between Client Hub, profile tabs, documents, calculators, reports, and deals.

Redesign target:

- Make the client profile the main command centre.
- Keep notes, appointments, linked documents, reports, and deals visible without excessive tab hunting.

Mock-up:

```text
Client name | Region | Owner | Risk/status chips                  [Book] [Document] [Report]

Overview summary        Right rail
Contact                 Next appointment
Linked partner          Recent notes
Financial context       Linked deal

Tabs: Notes | Appointments | Deals | Documents | Reports | History
```

### Admin Safety Zone

Current issue:

- Admin Console contains many unrelated tasks, including production-sensitive controls.

Redesign target:

- Split safe admin work from production-sensitive action zones.
- Require dry-run, review, approval, and reconciliation language before any live operation.

Mock-up:

```text
Production-sensitive action
Target: Salestrail call import
Mode: Dry-run first

[Run dry-run]

Dry-run results
Imported candidate count
Skipped count
Warnings
Sample records

Approval checklist
[ ] Secrets are configured by name
[ ] Emulator or mock tests passed
[ ] Count reconciliation plan ready

[Live sync] disabled until approved
```

### Import Wizard

Current issue:

- CSV, Timely CSV, DQ Import, Sheets Sync, and migration planning use different interaction models.

Redesign target:

- One import mental model with consistent step names, result summaries, duplicate handling, and rollback notes.

Mock-up:

```text
Step 1 Source
Step 2 Field mapping
Step 3 Dry-run
Step 4 Review
Step 5 Commit or export report
```

### Field Work

Current issue:

- Map and Calendar have dense controls and several modes.

Redesign target:

- Make mode state visible.
- Keep primary field action reachable on mobile.
- Separate browse, edit, knock, route, zone, and clean-view modes.

Mock-up:

```text
Map mode bar
Browse | Knock | Route | Zones | Clean

Left: search and filters
Main: map
Bottom/mobile: selected lead or pin action sheet
```

## Accessibility Plan

Each redesign branch must check:

- Keyboard-only navigation.
- Focus order.
- Visible focus ring.
- Accessible names for icon buttons.
- No critical information by colour alone.
- Form labels and validation summaries.
- Modal and drawer focus management.
- Escape and close behaviour.
- Touch target size of at least 44 px.
- Text contrast in light and dark modes.

## Responsive Plan

Use three review widths:

- Mobile: 360 px to 430 px.
- Tablet: 768 px to 1024 px.
- Desktop: 1280 px and wider.

Required responsive states:

- Sidebar collapsed or drawer mode.
- Filter/action bar collapsed.
- Table-to-card behaviour.
- Detail drawer or bottom sheet.
- Sticky save actions for long forms.
- No horizontal scroll for critical actions unless the table itself is intentionally scrollable.

## Validation Plan

For each implementation branch:

```powershell
npm run typecheck
npm run lint
npm run build
npm test
git diff --check
```

For Firebase-adjacent UI, also run the emulator harnesses where relevant:

```powershell
npm run test:emulator:preflight
npm run test:emulator:rules
npm run test:emulator:firestore-smoke
npm run test:emulator:callables-dry-run
```

Use manual UI checks for:

- Login.
- Lead call flow.
- Lead edit/save.
- Client profile.
- Deal detail.
- Admin settings.
- Dry-run-only Salestrail and phone normalisation states.
- Import dry-run and review states.

## Blocked Work

The following remain blocked until a dedicated approved goal exists:

- Production Firebase deploy.
- Firestore rules or Functions deploy.
- Salestrail live sync.
- Phone backfill with `dryRun:false`.
- Firebase leads migration live import or full replace.
- Broad app refactor.
- Unreviewed redesign of Admin Console or data tools.

## Recommended Implementation Goals

1. `goal/design-system`
2. `goal/ui-current-state-screenshots`
3. `refactor/ui-primitives-pilot`
4. `goal/lead-workbench-redesign-plan`
5. `goal/client-360-redesign-plan`
6. `goal/admin-safety-zone-redesign-plan`
7. `goal/import-wizard-redesign-plan`
8. `goal/field-tools-redesign-plan`

## Exit Criteria For Starting UI Code

- `docs/ui-audit.md` reviewed.
- `docs/design-system.md` reviewed.
- A pilot workflow chosen.
- Current behaviour captured.
- Acceptance states written.
- Validation commands agreed.
- Rollback command documented.
