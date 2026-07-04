# Risk Register

## Risk Ratings

- Critical: can break production, expose data, or block core operations.
- High: can cause major workflow failure or security weakness.
- Medium: can cause localised regression or operational friction.
- Low: manageable with normal review.

## Active Risks

| ID | Risk | Rating | Mitigation | Status |
| --- | --- | --- | --- | --- |
| R-001 | Production-like Firebase project is the local default in `.firebaserc`. | Critical | Require explicit deploy approval and use demo emulator projects for tests. | Active |
| R-002 | Some exported callables lack `requireAuth(request)` or role checks. | Critical | Add callable auth tests and harden before functions deploy. | Active |
| R-003 | Firestore rules remain broad for operational collections. | Critical | Add emulator tests and tighten collection by collection. | Active |
| R-004 | Salestrail production reconciliation previously did not prove document writes. | High | Use mocked tests, dry-run, and count reconciliation before live sync. | Active |
| R-005 | Phone normalisation can write many lead records with `dryRun:false`. | High | Dry-run first, review samples, backup/export, explicit approval. | Active |
| R-006 | Firebase lead migration tooling can replace live lead data. | Critical | Follow runbook, backup/export, dry-run, duplicate review, explicit approval. | Active |
| R-007 | Large UI files increase regression risk. | Medium | Refactor by workflow with tests and screenshots. | Active |
| R-008 | Emulator harnesses exist but callable coverage is still incomplete for Salestrail live-API-adjacent paths. | Medium | Preflight, Firestore smoke, authenticated rules harness, and callable dry-run harness now execute. Keep Salestrail behind source contracts until a no-network mock seam exists. | Active |
| R-009 | Build writes generated release metadata. | Low | Inspect and restore when generated drift is not intended. | Active |
| R-010 | Lint still reports warning-level debt when `npm run lint:report` is used. | Medium | Address `any`, hook dependency, and Fast Refresh warnings in small targeted goals. Keep `npm run lint` focused on blocking errors. | Active |
| R-011 | Long-running shells may not see newly installed Java on PATH. | Low | Open a fresh terminal or refresh `JAVA_HOME` and prepend `%JAVA_HOME%\bin` before emulator commands. Preflight now passes when Java is visible. | Active |
| R-012 | Salestrail dry-run callable cannot be safely invoked in emulator while it can still reach the live API if secrets are present. | High | Keep the callable behind static contract checks until an approved mock fetch seam or no-network emulator adapter exists. Do not run live Salestrail sync during tests. | Active |
| R-013 | `npm install` reported 29 dependency audit vulnerabilities. | Medium | Do not run broad audit fixes inside emulator harness work. Create a separate dependency audit goal. | Active |
| R-014 | Callable mutation paths previously failed in the Functions emulator when using namespace Admin timestamp sentinels. | Low | Replaced known timestamp call sites with modular Admin Firestore compatibility helpers and restored executable coverage for `setPin`, `changePin`, and settings/admin mutation callables. Keep monitoring new timestamp call sites. | Mitigated |

## Risk Review Cadence

- Review before production readiness.
- Review after any Firebase rules, Functions, migration, import, or integration change.
- Close risks only with validation evidence.
