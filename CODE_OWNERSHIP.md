# ASG CRM Code Ownership

Last updated: 6 July 2026

## Purpose

This document defines practical ownership for review and release decisions. It does not assign permanent people. It defines the role that must be accountable before a change proceeds.

## Ownership Principles

- Every risky change needs a named owner before implementation.
- Production-like Firebase surfaces require release manager approval.
- Data writes, migrations, backfills, and integrations require dry-run evidence before write approval.
- No direct work on `main`.
- No deploy, push, migration, live sync, or destructive cleanup without the approval gate required by the handbook.

## Ownership Map

| Area | Primary owner role | Secondary owner role | Required review |
| --- | --- | --- | --- |
| App shell and routing | Frontend owner | QA lead | Navigation, auth, mobile, accessibility, build. |
| Authentication and PIN | Firebase/functions owner | Security reviewer | Callable auth, role claims, region access, emulator callable tests. |
| Leads workflow | Product owner | Frontend owner | Staff workflow, state transitions, notes, actions, UAT. |
| Lead data hooks | Firebase/frontend owner | QA lead | Firestore reads/writes, rules expectations, regression tests. |
| Admin settings | Firebase/functions owner | Release manager | Server-authoritative mutation, audit logs, settings rollback. |
| Salestrail | Integration owner | Release manager | No-network dry-run, secrets by name only, live reconciliation approval. |
| Phone normalisation | Data owner | Release manager | Dry-run, sample review, backup/export, explicit write approval. |
| Firebase lead migration | Data owner | Release manager | Runbook, duplicate handling, dry-run, backup/export, rollback. |
| Firestore rules and indexes | Firebase owner | Security reviewer | Emulator rules tests, access matrix, scoped deploy plan. |
| Functions exports | Firebase/functions owner | QA lead | Build, callable emulator coverage, auth boundaries. |
| DocuSign and documents | Integration owner | Compliance reviewer | Webhook security, document status, PDF accuracy, audit trail. |
| Reporting and commissions | Product owner | QA lead | Calculation correctness, performance, sample reconciliation. |
| UI and design system | Frontend owner | Product owner | Consistency, accessibility, responsive behaviour, no workflow regression. |
| Release process | Release manager | QA lead | Validation, PR order, tags, rollback, approval gates. |

## Directory Ownership

| Path | Ownership |
| --- | --- |
| `src/App.tsx` | Frontend owner and QA lead. Any auth, PIN, or navigation change also needs security review. |
| `src/pages/` | Frontend owner and product owner for workflow impact. |
| `src/components/` | Frontend owner. Shared workflow components also need QA lead review. |
| `src/components/ui/` | Design system owner and frontend owner. |
| `src/hooks/useFirebase.ts` | Firebase/frontend owner. Any write path needs security and rules awareness. |
| `src/hooks/useAppSettings.ts` | Firebase/frontend owner and release manager for settings impact. |
| `src/stores/` | Frontend owner and QA lead for state persistence or workflow changes. |
| `src/lib/` | Module-specific owner. Auth, workflow, dates, documents, and reporting helpers need targeted review. |
| `functions/src/` | Firebase/functions owner. Any exported function needs callable or function validation. |
| `functions/src/auth/` | Security reviewer and Firebase/functions owner. |
| `functions/src/settingsAdmin.ts` | Firebase/functions owner and release manager. |
| `functions/src/salestrail*` | Integration owner and release manager. |
| `functions/src/phoneMigration.ts` | Data owner and release manager. |
| `firestore.rules` | Firebase owner and security reviewer. |
| `firestore.indexes.json` | Firebase owner and release manager. |
| `firebase.json` and `.firebaserc` | Release manager only. |
| `scripts/` | Tool-specific owner. Migration and emulator scripts require QA and release review. |
| `docs/` | Documentation owner, with subject-matter review for release, security, and data docs. |
| `public/templates/` | Document workflow owner and compliance reviewer. |

## Critical Workflow Stewardship

### Login and PIN

Owner roles: security reviewer, Firebase/functions owner, QA lead.

Required evidence:

- Auth boundary tests.
- Callable dry-run emulator tests for `setPin`, `verifyPin`, `changePin`, and `verifyBackupPassword` when touched.
- No weakening of plaintext PIN fallback until migration is fully complete.

### Lead operations

Owner roles: product owner, frontend owner, QA lead.

Required evidence:

- Lead list and lead detail workflow review.
- Workflow state test coverage.
- Region access checks where applicable.
- Staff UAT before production release.

### Admin and settings

Owner roles: release manager, Firebase/functions owner.

Required evidence:

- `functions` build.
- `functions` settings/admin tests.
- Callable auth and role checks.
- Audit log behaviour preserved.

### Salestrail

Owner roles: integration owner, release manager.

Required evidence:

- Secrets referenced by name only: `SALESTRAIL_API_USERNAME` and `SALESTRAIL_API_PASSWORD`.
- Emulator or mocked callable tests.
- No-network dry-run path before wider automated tests.
- Controlled live reconciliation only after explicit approval.
- Direct client Firestore reads to `salestrailCalls` remain denied.

### Migration and backfill

Owner roles: data owner, release manager.

Required evidence:

- Backup/export plan.
- Dry-run validation.
- Affected-count and sample review.
- Duplicate handling validation where relevant.
- Explicit approval before write mode.
- Post-run reconciliation.

## Review Gates

| Gate | Applies to | Minimum review |
| --- | --- | --- |
| Before coding | All non-trivial goals | Branch, clean tree, savepoint, scope, non-goals. |
| Before refactoring | Shared files and large modules | Validation baseline and rollback command. |
| Before UI redesign | Staff-facing screens | Design system, responsive review, workflow preservation. |
| Before Firebase/data changes | Rules, Functions, migrations, backfills | Release manager, Firebase owner, dry-run evidence. |
| Before integration work | Salestrail, DocuSign, Google, PDF/doc flows | Mock or dry-run plan and secret safety. |
| Before production release | Any production deploy or data action | Full validation, UAT, release plan, rollback, explicit approval. |

## CODEOWNERS Recommendation

The repository does not need a formal `.github/CODEOWNERS` file until the human team confirms names or teams. When ready, create one using the ownership map above as the source of truth.
