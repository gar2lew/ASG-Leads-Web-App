# UI Guidelines

## CRM Product Principle

ASG CRM is an operational tool. The interface should be calm, scannable, fast, and reliable for repeated daily work.

## Design Rules

- Prioritise task clarity over decoration.
- Use dense but organised layouts for CRM tables, dashboards, queues, and admin tools.
- Keep cards for repeated items, modals, and framed tools.
- Avoid nested cards and decorative backgrounds that reduce scan speed.
- Use predictable navigation and clear active states.
- Use icons for common actions when recognisable.
- Do not hide destructive or data-changing actions behind vague labels.

## Required UI States

For each meaningful workflow, consider:

- Loading
- Empty
- Error
- Permission denied
- Offline or degraded network
- Saving
- Saved
- Validation failure
- Mobile
- Desktop

## CRM Workflow Priorities

- Lead lists must support quick scanning and filtering.
- Lead details must preserve context and history.
- Admin settings must show what changed, who changed it, and how to roll back.
- Salestrail and phone normalisation actions must make dry-run versus live action unmistakable.
- Import workflows must show counts, duplicates, warnings, and rollback notes.

## UI Redesign Gate

Before redesigning:

1. Identify the user task.
2. Capture current behaviour.
3. Define acceptance states.
4. Confirm data and permission boundaries.
5. Plan validation with screenshots or manual checks.
6. Confirm rollback.
