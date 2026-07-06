# ASG CRM Master Architect

## 1. Purpose

ASG CRM exists to help staff manage leads, calls, appointments, documents, reporting and client progress from one reliable internal system.

The product must be simple enough for daily staff use and structured enough to support future automation, Salestrail, reporting, AI assistance and ASG-X.

---

## 2. Product North Star

The CRM should become the daily operating system for ASG staff.

Every screen should answer one question:

"What should this user do next?"

---

## 3. Primary Users

### Sales Representatives

Need speed, clarity, lead context, call history, notes, appointments and next actions.

### Managers

Need visibility, reporting, staff activity, bottlenecks, conversion rates and compliance.

### Admins

Need safe settings, imports, integrations, user control and data maintenance tools.

### Directors

Need confidence, business visibility and strategic reporting without operational clutter.

---

## 4. Core Product Principles

1. Staff should never need to guess what to do next.
2. Important information should be visible without digging.
3. Data safety is more important than speed.
4. Destructive actions must require confirmation.
5. Every workflow must support auditability.
6. Every feature should reduce workload or improve decision-making.
7. Avoid novelty features unless they clearly improve business operations.
8. The CRM should feel premium, calm and trustworthy.

---

## 5. Engineering Principles

1. Never work directly on main.
2. Every major change requires a branch and savepoint.
3. Validation must pass before merge.
4. Prefer small, reversible changes.
5. Avoid large rewrites unless justified.
6. Keep business logic testable.
7. Avoid hidden production dependencies.
8. Do not weaken tests to make code pass.
9. Do not change Firebase, rules, deployment or production data without approval.

---

## 6. UX Principles

1. Lead workbench is the centre of the CRM.
2. Reps need speed more than complexity.
3. Managers need summary first, detail second.
4. Admin actions must be clearly separated from staff actions.
5. Mobile should support key actions, not every admin workflow.
6. Empty states should explain what to do.
7. Errors should be plain English and actionable.
8. Use consistent spacing, buttons, cards, tables and status badges.

---

## 7. Data Principles

1. Firestore data must remain consistent and auditable.
2. Avoid destructive migrations unless dry-run is available.
3. Phone numbers should be normalised but raw values should be preserved where useful.
4. Lead status changes should be traceable.
5. Imports must detect duplicates and report failures clearly.
6. Integrations must be idempotent where possible.
7. Production data should never be used casually for testing.

---

## 8. Security Principles

1. Admin-only actions must remain admin-only.
2. Managers can view broader reporting, but should not receive unnecessary system powers.
3. Reps should only see what they need to act on.
4. Secrets must never be committed.
5. Firebase rules must be tested before release.
6. Callable functions must enforce role checks server-side.
7. Audit logs should be preferred for sensitive actions.

---

## 9. Performance Principles

Targets:

- Initial app experience should feel fast on normal office hardware.
- Main app chunk should stay under agreed bundle budget.
- Heavy modules should be lazy-loaded.
- Firestore reads should be intentional and minimised.
- Dashboards should avoid expensive live queries where summaries are enough.
- PDF, Firebase and reporting-heavy code should be split where practical.

---

## 10. AI Readiness Principles

AI should support staff, not replace core workflow.

Future AI features may include:

- lead summaries
- appointment preparation
- next-action suggestions
- call outcome summaries
- manager reporting summaries
- stale lead detection
- document drafting support

AI must not:

- silently change client records
- make irreversible decisions
- bypass staff review
- expose sensitive data unnecessarily

---

## 11. Salestrail Principles

Salestrail should become a trusted call history layer.

Rules:

1. No live sync without approved credentials and dry-run validation.
2. No duplicate call imports.
3. Calls should match leads by normalised phone where possible.
4. Unmatched calls should be visible for admin review.
5. Salestrail data should enrich the lead timeline.
6. Sync failures must be visible and recoverable.

---

## 12. Reporting Principles

Reports should answer business questions, not just show data.

Core questions:

- How many leads came in?
- Who followed up?
- What was booked?
- What was missed?
- Where are leads getting stuck?
- Which staff need support?
- What changed today?
- What needs attention tomorrow?

---

## 13. Release Principles

A release is only ready when:

- Typecheck passes
- Lint passes
- Tests pass
- Build passes
- Emulator checks pass
- Functions build passes
- Risk register is updated
- Changelog is updated
- Rollback path is known
- Human review is complete

---

## 14. Technical Debt Rules

Technical debt is acceptable only when:

- it is documented
- it is low-risk
- it does not affect production data safety
- it has a clear future cleanup path

Technical debt is not acceptable when it affects:

- authentication
- Firebase rules
- production data
- lead workflow integrity
- imports
- reporting accuracy
- deployment safety

---

## 15. Future Vision

The CRM should support:

- ASG internal CRM
- ASG-X online-only sales model
- Salestrail call intelligence
- lead scoring
- AI-assisted summaries
- reporting automation
- document centre
- client timeline
- broker or partner portal
- controlled customer portal
- mobile-first staff workflows

---

## 16. Decision Rule

When choosing between two options:

Prefer the option that is:

1. safer for production data
2. easier for staff to use
3. easier to test
4. easier to roll back
5. more consistent with the design system
6. more useful to ASG operations

If still unsure, document the trade-off and stop for approval.
