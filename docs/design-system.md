# Design System

Date: 2026-07-04
Branch: `goal/ui-audit-planning`

## Purpose

Define a practical ASG CRM design system before any redesign implementation begins. This document is a target system for future work. It does not change application code.

## Product Character

ASG CRM should feel:

- Calm.
- Fast.
- Operational.
- Trustworthy.
- Dense enough for daily work.
- Clear about risk, permissions, dry-runs, live actions, and rollback.

It should not feel:

- Decorative.
- Marketing-led.
- Over-carded.
- Animation-heavy.
- Ambiguous about data-changing actions.

## Core Principles

- Use predictable layouts.
- Prioritise scan speed.
- Keep actions close to the record they affect.
- Make primary actions obvious and secondary actions quiet.
- Use colour semantically, not decoratively.
- Make destructive and production-sensitive actions visibly different.
- Preserve current CRM behaviour while standardising UI.

## Layout System

### Page Shell

Standard page anatomy:

```text
Page header
Filter or action bar
Primary content
Context drawer or detail panel
Feedback and status messages
```

### Page Header

Required elements:

- Title.
- One-line task-focused subtitle when helpful.
- Primary action.
- Secondary actions.
- Workspace or permission context when relevant.

Example:

```text
Leads                                      [Add Lead]
Work today's queue and keep follow-ups current.
[Brisbane workspace] [Online] [Rep access]
```

### Content Width

- Full-width operational screens: Leads, Deals, Admin, Reports, Map, Calendar.
- Constrained content screens: Rep Settings, Admin Guide, Knowledge articles.
- Split-panel screens: Client Profile, Lead details, Deal detail.

### Cards

Use cards for:

- Repeated records on mobile.
- KPI summaries.
- Modal content.
- Framed utility tools.

Avoid:

- Cards inside cards.
- Whole page sections as floating decorative cards.
- Hover scale on dense operational rows.

## Spacing

Use an 8 px spacing base:

| Token | Size | Use |
| --- | --- | --- |
| `space-1` | 4 px | Icon gaps, compact metadata. |
| `space-2` | 8 px | Button icon gaps, compact field groups. |
| `space-3` | 12 px | Table cells, form rows. |
| `space-4` | 16 px | Panel padding, section gaps. |
| `space-6` | 24 px | Page section spacing. |
| `space-8` | 32 px | Large page breaks only. |

Default radius:

- Controls: 8 px.
- Cards and panels: 8 px.
- Modals and drawers: 12 px.
- Pills and badges: full radius only when the shape encodes status or selection.

## Typography

Use five levels:

| Level | Purpose | Suggested style |
| --- | --- | --- |
| Page title | Screen identity | 20 to 24 px, semibold or bold. |
| Section title | Local grouping | 14 to 16 px, semibold. |
| Table header | Scan labels | 11 to 12 px, semibold. |
| Body | Main content | 13 to 14 px. |
| Metadata | Secondary context | 11 to 12 px. |

Rules:

- Avoid negative letter spacing.
- Use uppercase sparingly.
- Avoid tiny text for critical states.
- Keep numbers tabular where comparison matters.

## Colour

Core roles:

| Role | Use |
| --- | --- |
| Brand accent | Primary action, active navigation, key highlights. |
| Surface | Page and panel backgrounds. |
| Border | Separation without heavy outlines. |
| Text | Primary readable text. |
| Muted text | Metadata only. |
| Success | Saved, completed, reconciled. |
| Warning | Dry-run caution, pending review, stale items. |
| Danger | Destructive, live production-sensitive, failed, blocked. |
| Info | Neutral guidance, system messages. |

Rules:

- Do not rely on colour alone.
- Pair status colour with text.
- Keep danger actions visually distinct from normal primary actions.
- Keep dry-run actions visually distinct from live actions.

## Component Standards

### Buttons

Types:

- Primary: one per local workflow.
- Secondary: normal alternative action.
- Ghost: low-emphasis action.
- Icon: familiar action with accessible label.
- Danger: destructive or live production-sensitive action.

Rules:

- Minimum touch target: 44 px.
- Icon-only buttons need `aria-label`.
- Avoid vague labels such as `Run`, `Go`, or `Submit` when data can change.
- Use verbs that describe the result, such as `Run dry-run`, `Save lead`, `Export report`, `Rollback settings`.

### Tabs

Use tabs for sibling views inside the same workflow.

Rules:

- Keep tab count under seven where possible.
- Use horizontal scroll only when labels remain readable.
- Preserve active tab state during local edits.
- Do not hide production-sensitive actions in a tab without a visible warning or badge.

### Tables

Use tables for comparison and high-volume scanning.

Required states:

- Loading.
- Empty.
- Error.
- Filtered empty.
- Permission denied where applicable.
- Mobile card alternative where table columns become unusable.

Rules:

- Keep primary row action visible.
- Keep destructive row actions separated.
- Use sticky headers where practical for long tables.
- Align numeric values right.
- Provide clear sort state.

### Drawers

Use drawers for contextual details that should not replace the queue.

Best use:

- Lead detail.
- Client quick review.
- Deal quick review.

Rules:

- Header with title, close action, and save state.
- Sticky footer for save/cancel on long forms.
- Focus returns to the originating row when closed.

### Modals

Use modals for interruptive or bounded tasks:

- Add lead.
- Log call.
- Upload file.
- Confirm destructive action.
- Generate document.

Rules:

- Trap focus.
- Close with Escape unless a save is in progress.
- Include explicit cancel.
- Show validation summary for multi-field forms.

### Badges

Use badges for:

- Status.
- Role.
- Region.
- Sync state.
- Risk level.
- Dry-run/live mode.

Rules:

- Include readable text.
- Do not use more than three badges in one row unless the row is a dense table.

### Empty States

Required content:

- What is empty.
- Why it may be empty.
- What the user can do next.

Example:

```text
No overdue follow-ups
All follow-ups for this workspace are current.
[View all leads]
```

### Loading States

Rules:

- Use skeletons for tables and cards.
- Use spinners only for short blocking actions.
- Show long-running operation context, especially import, sync, and report generation.

### Toasts and Inline Feedback

Use toasts for temporary confirmation. Use inline feedback for actions that need recovery.

Examples:

- Toast: `Lead saved`.
- Inline: `Phone normalisation dry-run found 214 affected leads. Review samples before requesting approval.`

## Safety Components

### Dry-run Panel

Required fields:

- Operation name.
- Target.
- Mode.
- Run dry-run action.
- Count summary.
- Sample records.
- Warnings.
- Export report action.
- Approval checklist.

### Live Action Gate

Live action buttons must be disabled until:

- Dry-run is complete.
- Count and sample review is complete.
- Backup/export plan is confirmed when data can change.
- Explicit approval has been recorded outside the UI goal.

### Rollback Panel

Required fields:

- What can be rolled back.
- Last changed by.
- Last changed at.
- Source.
- Preview difference.
- Rollback action.
- Confirmation copy.

## Screen Patterns

### Workbench Pattern

Use for Leads, Deals, Client Hub, and Admin search tables.

```text
Header
Filter bar
List/table
Detail drawer
Sticky feedback
```

### Wizard Pattern

Use for CSV import, DQ import, Sheets Sync, migration-like dry-runs, and document generation.

```text
Source
Map or configure
Dry-run or preview
Review
Commit or export
```

### Dashboard Pattern

Use for Dashboard, Reports, DRAPS, Daily Report, Rep Dashboard, and My Dashboard.

```text
Priority actions
Critical metrics
Trends
Tables or queues
Recent activity
```

### Field Tool Pattern

Use for Map and Calendar.

```text
Mode bar
Search and filters
Primary canvas
Selected item panel
Mobile action sheet
```

### Knowledge Pattern

Use for Knowledge Base, Admin Guide, and Training content.

```text
Search
Category navigation
Article or lesson content
Related actions
```

## Accessibility Checklist

Before merging any UI implementation:

- Every icon button has an accessible name.
- Every form field has a label.
- Every validation error points to the field or section.
- Focus order follows the visual order.
- Focus is trapped inside modals.
- Escape closes non-destructive modals.
- Colour-coded data has text labels.
- Touch targets are at least 44 px.
- Text has sufficient contrast in light and dark mode.
- Keyboard-only user can complete the target workflow.

## Responsive Checklist

Review at:

- 360 px.
- 390 px.
- 768 px.
- 1024 px.
- 1280 px.

Check:

- Header actions wrap or collapse cleanly.
- Filters do not push content off-screen.
- Tables have card alternatives or safe horizontal scroll.
- Drawers and modals fit viewport height.
- Sticky actions do not cover content.
- Floating calculator and calendar do not block primary workflows.

## Mock-up Library

### Table Row

```text
Name             Status        Next action        Last touch       Owner       Actions
Sarah Nguyen     Callback      Call at 2:30       Yesterday        Brisbane    Call | Open
```

### Mobile Record Card

```text
Sarah Nguyen                         Callback
04xx xxx xxx                         Call at 2:30
Last touch: Yesterday                Owner: Brisbane
[Call] [Open]
```

### Danger Zone

```text
Phone normalisation
Dry-run first. Live write mode is blocked until approval.

Affected leads: 214
Samples reviewed: Not yet
Backup/export: Not confirmed

[Run dry-run] [Export report] [Request approval]
[Run live backfill] disabled
```

### Standard Modal

```text
Title
Short explanation

Fields or content

Inline validation or warning

[Cancel] [Primary action]
```

## Adoption Plan

1. Use this document as the design reference for future UI goals.
2. Choose a low-risk pilot screen.
3. Define shared primitives in code only after the pilot is accepted.
4. Migrate high-risk workflows one at a time.
5. Keep production-sensitive workflows behind separate approval gates.

## Blocked Until Approved

- Any live data-changing UX flow.
- Any Firebase rules, Functions, indexes, or config change.
- Any deploy.
- Any Salestrail live sync.
- Any phone backfill write.
- Any migration live run.

## Recommended Next Goal

```text
Reach Goal: Design System

Follow AGENTS.md, docs/CODEX_PLAYBOOK.md, docs/ENGINEERING_HANDBOOK.md, docs/UI_GUIDELINES.md, docs/ui-audit.md, docs/ui-redesign-plan.md, and docs/design-system.md.

Do not redesign the CRM yet.
Do not change application code.

Review the proposed design system and produce a component adoption backlog with pilot candidates, acceptance states, accessibility checks, validation commands, and blocked high-risk surfaces.
```
