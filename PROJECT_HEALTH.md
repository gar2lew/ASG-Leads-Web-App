# ASG CRM Project Health

Last updated: 6 July 2026

## Summary

ASG CRM is in a materially healthier state than the early foundation baseline. The repository now has a documented operating contract, branch and savepoint discipline, validation scripts, emulator harnesses, Sprint 1 stabilisation work, Sprint 2 staff workflow improvements, and a clear release planning track.

The project should be treated as review-ready, not production-ready. The main reasons are still external to ordinary local validation: stacked PR merge confirmation, release tag verification, staff UAT, production Firebase approval, Salestrail live reconciliation, phone backfill approval, migration approval, and dependency vulnerability review.

## Current Health

| Area | Health | Notes |
| --- | --- | --- |
| Git and process | Strong | Handbook, playbook, roadmap, goals, sprints, savepoint pattern, rollback guidance, and draft PR documentation are in place. |
| Validation baseline | Strong | TypeScript, lint, build, unit tests, emulator preflight, Firestore rules tests, callable dry-run tests, Functions build, and settings/admin tests were reported passing in Sprint 2. |
| Firebase safety | Improving | Production-like project is documented. Emulator-only validation exists. High-risk deploy, migration, Salestrail, and backfill actions are approval-gated. |
| Frontend maintainability | Mixed | Shared component foundations and UI standards exist, but several pages and components remain very large. |
| Functions maintainability | Mixed | Callable auth patterns and timestamp compatibility were improved, but Salestrail, DocuSign, and migration-related functions remain high risk. |
| Product UX | Improving | Sprint 2 focused on staff workflow, navigation, consistency, rhythm, and review documentation. Full staff UAT is still required. |
| Performance | Mixed | Lazy-loaded routes exist, but Vite still warns about large Firebase and PDF-related vendor chunks. |
| Dependency health | Needs review | Dependency audit vulnerabilities and the `firebase-functions` emulator advisory remain documented risks. |
| Release readiness | Not ready for production | Review, merge sequence, tag verification, UAT, and explicit production approvals remain required. |

## Biggest Wins

- Validation coverage now includes Firebase emulator preflight, Firestore rules, Firestore smoke tests, and callable dry-run execution.
- The Functions Admin SDK timestamp compatibility issue was fixed and emulator coverage restored for affected callables.
- Sprint 1 established safe cleanup, component audit, design system documentation, shared component foundations, UI redesign milestones, performance review, and sprint reporting.
- Sprint 2 improved staff workflow and prepared a review package with dependency notes.
- The project now has practical operational documentation, including known issues, pending decisions, feature backlog, release plan, documentation index, risk register, and project state.
- Firebase production safety is now explicit in the docs and repeated across release plans and emulator validation plans.

## Biggest Risks

- `.firebaserc` points at `amplify-leads-2026`, which must be treated as production-like.
- `firebase.json` includes hosting, Functions, Firestore rules, and indexes, so an unscoped `firebase deploy` has a broad blast radius.
- Salestrail dry-run callables can still contact the real API when configured with real secrets unless the planned no-network mock seam is added.
- Phone normalisation with `dryRun:false` can write across many lead documents and requires export, sample review, explicit approval, and reconciliation.
- Firebase lead migration tooling can replace or reshape live lead data and remains approval-gated.
- Several important UI and data modules are very large, increasing review and regression risk.
- Large vendor chunks may affect staff load performance on slower devices or networks.
- Staff UAT has not been documented as complete.
- Release tags exist but require verification against actual merged PR commits.

## Most Critical Workflows

1. Staff authentication, PIN setup, PIN verification, backup password verification, and role/region identity.
2. Lead intake, lead list triage, lead details, call actions, notes, follow-ups, appointments, and workflow state.
3. Client profile and deal pipeline progression.
4. Admin settings and server-authoritative settings mutation.
5. Salestrail sync, dry-run review, reconciliation, and call matching.
6. Phone normalisation dry-run, approval, backfill, and reconciliation.
7. Firebase lead import and migration dry-run, duplicate handling, approval, rollback, and full replace protections.
8. Reporting, daily stats, commissions, and dashboards used for management decisions.
9. Document centre, O&A documents, PDF generation, and DocuSign envelope workflows.
10. Release validation, emulator validation, scoped deployment planning, and rollback.

## Health Verdict

The repository is ready to guide structured review and next-goal planning. It is not ready for production deployment until the remaining approval gates and UAT are completed.

Recommended next action: convert `docs/VERSION_PLAN_V1.md` into an executable v1.0 release checklist with named owners, go/no-go criteria, Firebase surface approvals, and rollback responsibilities.
