# Feature Backlog

## Purpose

This backlog prioritises ASG CRM product work by business value, user group, effort, risk, dependencies, status, and target release.

Items here are candidates for scoped goals. They are not approval to deploy, migrate, or write production data.

## Priority Definitions

| Priority | Meaning |
| --- | --- |
| P0 | Required for the next internal production release path. |
| P1 | High-value follow-up once v1.0 readiness is stable. |
| P2 | Strategic product expansion. |
| P3 | Future optimisation, experimentation, or platform expansion. |

## Backlog

| Priority | Feature | Business value | User group | Effort | Risk | Dependencies | Status | Target release |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0 | v1.0 Internal Production Release | Establish a safe internal production baseline. | All staff | Medium | High | Sprint 1 and Sprint 2 review, UAT, release checklist | Planned | v1.0 |
| P0 | Lead Workbench final polish | Make daily lead calling and follow-up smoother. | Reps, managers | Medium | Medium | Sprint 2 workflow changes, staff UAT | Planned | v1.0 |
| P0 | Staff onboarding documentation | Help staff use the CRM consistently. | All staff | Low | Low | User manual, workflow decisions | Planned | v1.0 |
| P0 | Production rollout checklist | Reduce release risk. | Admins, directors | Low | High | Release process, Firebase plan | Planned | v1.0 |
| P0 | Backup and rollback process | Protect data and release confidence. | Admins, release manager | Medium | High | Firebase export plan, runbooks | Planned | v1.0 |
| P0 | Salestrail no-network mock seam | Allow safe executable integration coverage. | Engineering | Medium | High | Callable harness, mock adapter | Planned | v1.0 or v1.1 |
| P0 | Salestrail executable dry-run coverage | Prove dry-run behaviour without live API writes. | Engineering, admins | Medium | High | No-network mock seam | Planned | v1.1 |
| P0 | Manager daily reporting rhythm | Give managers a consistent daily operating view. | Managers, directors | Medium | Medium | Report definitions, staff feedback | Planned | v1.0 |
| P1 | Salestrail call timeline | Show trusted call history on leads and clients. | Reps, managers | Medium | High | Salestrail matching decisions | Proposed | v1.1 |
| P1 | Reporting dashboard upgrade | Improve business insight and review flow. | Managers, directors | Medium | Medium | Metric definitions, aggregation decision | Proposed | v1.2 |
| P1 | Admin audit log review | Make sensitive actions easier to review. | Admins, directors | Low | Medium | Audit log scope | Proposed | v1.0 or v1.2 |
| P1 | Import dry-run and duplicate review improvements | Reduce bad imports and duplicate records. | Admins | Medium | High | Import runbook, duplicate policy | Proposed | v1.0 or v1.2 |
| P1 | AI lead summary proposal | Define safe AI summary behaviour. | Reps, managers | Medium | High | AI storage decision, privacy review | Proposed | v1.3 |
| P1 | Document centre planning | Define document workflow before build. | Reps, admins, clients | Medium | Medium | Product decision, storage review | Proposed | v1.4 |
| P2 | Client portal | Give clients controlled access to progress and documents. | Clients, staff | Large | High | Auth model, portal architecture | Future | v1.5 or later |
| P2 | Broker portal | Support broker or partner workflows. | Brokers, directors | Large | High | Portal strategy | Future | Future |
| P2 | ASG-X online platform | Support online-only sales model. | Directors, ASG-X staff | Large | High | Backend decision, product discovery | Future | v2.0 |
| P2 | AI next-action suggestions | Support staff workflow with safe recommendations. | Reps, managers | Medium | High | AI governance, workflow rules | Future | v1.3 |
| P2 | Appointment reminders | Reduce missed appointments. | Reps, clients | Medium | Medium | Messaging provider, consent rules | Future | v1.2 or later |
| P2 | SMS/email templates | Standardise outbound communication. | Reps, managers | Medium | Medium | Template approval, compliance review | Future | v1.2 or later |
| P3 | Gamification | Increase staff motivation if operational basics are stable. | Reps, managers | Medium | Low | Reporting reliability | Parked | Future |
| P3 | Advanced analytics | Improve strategic insight. | Managers, directors | Large | Medium | Data model maturity | Parked | Future |
| P3 | Native mobile wrapper | Improve mobile access if PWA is insufficient. | Reps | Large | Medium | PWA decision, mobile UAT | Parked | Future |
| P3 | Offline mode expansion | Improve resilience for field workflows. | Reps | Large | High | Data conflict strategy | Parked | Future |

## Backlog Maintenance

- Review before each sprint.
- Promote ideas only after decision and risk review.
- Keep Firebase, migration, Salestrail, and AI items approval-gated.
- Assign every P0 item to a target release before v1.0 go/no-go.
