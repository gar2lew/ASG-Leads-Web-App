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
| R-010 | Lint still reports warning-level debt when `npm run lint:report` is used. | Medium | Safe cleanup reduced warning count from 78 to 64. Continue addressing `any`, hook dependency, and Fast Refresh warnings in small targeted goals. Keep `npm run lint` focused on blocking errors. | Active |
| R-011 | Long-running shells may not see newly installed Java on PATH. | Low | Open a fresh terminal or refresh `JAVA_HOME` and prepend `%JAVA_HOME%\bin` before emulator commands. Preflight now passes when Java is visible. | Active |
| R-012 | Salestrail dry-run callable cannot be safely invoked in emulator while it can still reach the live API if secrets are present. | High | Keep the callable behind static contract checks until an approved mock fetch seam or no-network emulator adapter exists. Do not run live Salestrail sync during tests. | Active |
| R-013 | Dependency advisories remain unresolved. Root `npm audit` now reports 28 advisories, including 1 critical and 5 high, after the direct `jspdf` update to `4.2.1`. Functions `npm audit` reports 16 advisories, including 3 high. Remaining risk includes direct `vitest` and `vite` dev-tooling advisories, Firebase web SDK transitive advisories, transitive `dompurify` moderate advisories under `jspdf`, and Functions runtime transitive risk through Firebase and Google libraries. | Critical | Do not run broad audit fixes inside release work. Follow `docs/dependency-remediation-plan.md` with separate goals for DOMPurify/PDF transitive review, Firebase web SDK, Functions runtime, and dev tooling. | Active |
| R-014 | Callable mutation paths previously failed in the Functions emulator when using namespace Admin timestamp sentinels. | Low | Replaced known timestamp call sites with modular Admin Firestore compatibility helpers and restored executable coverage for `setPin`, `changePin`, and settings/admin mutation callables. Keep monitoring new timestamp call sites. | Mitigated |
| R-015 | UI redesign could change core CRM workflows before current behaviour is captured. | High | Complete a documentation-only UI workflow audit with current-state notes, acceptance states, permission boundaries, and manual QA checklist before editing UI code. | Active |
| R-016 | Release tags may exist before Sprint PR merge status is confirmed. | Medium | Verify tag targets against merged PR commits before treating tags as release evidence. Prefer corrected tag names over force-moving old tags unless explicitly approved. | Active |
| R-017 | Operational state can drift across sprint reports, PRs, tags, and release docs. | Medium | Keep `PROJECT_STATE.md`, `docs/KNOWN_ISSUES.md`, `docs/DECISIONS_PENDING.md`, and `docs/PRODUCT_RELEASES.md` updated during release planning. | Active |
| R-018 | Staff UAT has a plan but no executed sign-off evidence yet. | Critical | Run `docs/staff-uat-plan.md`, capture tester feedback, triage issues, and obtain release-owner sign-off before production approval. | Active |
| R-019 | Local branch list contains many historical merged goal branches. | Low | Do not delete branches during maintenance. Run separate branch hygiene after PRs and release tags are verified. | Active |
| R-020 | v1.0 release candidate passed validation but remains blocked from production deployment. | Critical | Require human go/no-go, staff UAT, backup/recovery rehearsal, Firebase surface approval, and tag/merge verification before deployment. | Active |

## Risk Review Cadence

- Review before production readiness.
- Review after any Firebase rules, Functions, migration, import, or integration change.
- Close risks only with validation evidence.
