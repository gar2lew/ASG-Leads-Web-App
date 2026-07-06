# Weekly Health Report

Date: 2026-07-06
Branch: `goal/weekly-maintenance`
Savepoint: `savepoint-before-weekly-maintenance`

## Summary

Weekly maintenance completed with validation passing across TypeScript, lint, root tests, build, emulator suite, Functions build, and settings/admin tests.

The repository remains suitable for human review and staff UAT planning. It is still not approved for production deployment because staff UAT, backup and recovery rehearsal, Firebase surface approval, dependency advisory review, and final human go/no-go remain open.

No deploy, push, migration, live Salestrail sync, phone backfill write, production Firebase change, or production data write was performed.

## Stage 0 Preflight

| Check | Result |
| --- | --- |
| Read `PROJECT_STATE.md` | Complete |
| Working tree before branch | Clean |
| Starting branch | `goal/v1-release-candidate` |
| Maintenance branch created | `goal/weekly-maintenance` |
| Savepoint created | `savepoint-before-weekly-maintenance` |
| Production Firebase actions | Not run |
| Destructive cleanup | Not run |

## Validation Results

| Command | Result | Notes |
| --- | --- | --- |
| `npm run typecheck` | Passed | App and Functions TypeScript passed. |
| `npm run lint` | Passed | Blocking lint passed with `--quiet`. |
| `npm test` | Passed | Auth boundaries, workflow state, region identity, observability, and release metadata passed. |
| `npm run build` | Passed | Build passed with known large chunk warnings. |
| `npm run test:emulator:preflight` | Passed | Demo project, Firebase CLI, Java, and emulator config confirmed. |
| `npm run test:emulator:rules` | Passed | Expected permission-denied logs appeared for negative checks. |
| `npm run test:emulator:firestore-smoke` | Passed | Firestore emulator smoke checks passed. |
| `npm run test:emulator:callables-dry-run` | Passed | PIN, settings/admin, phone dry-run, and Salestrail source contract checks passed without live API invocation. |
| `cd functions; npm run build` | Passed | Functions TypeScript build passed. |
| `cd functions; npm run test:settings-admin` | Passed | Settings/admin test passed. |

Build side effect:

- `npm run build` regenerated `src/generated/releaseMetadata.ts` for local metadata.
- The generated drift was restored before documentation edits.

## Dependency Advisories

### Root app

`npm audit --json` reported:

| Severity | Count |
| --- | ---: |
| Critical | 2 |
| High | 5 |
| Moderate | 21 |
| Low | 1 |
| Total | 29 |

Notable direct or high-impact advisories:

- `jspdf`: critical and high advisories affecting the direct PDF dependency.
- `vitest`: critical advisory for Vitest UI server exposure, direct dev dependency.
- `vite`: high and moderate advisories, direct dev dependency.
- `firebase`: moderate advisories through Firebase subpackages and `undici`.
- `firebase-admin`: moderate advisory path through Google Cloud Storage.
- `dompurify`: multiple moderate and low advisories through PDF or HTML sanitisation dependencies.

### Functions

`functions/npm audit --json` reported:

| Severity | Count |
| --- | ---: |
| Critical | 0 |
| High | 3 |
| Moderate | 12 |
| Low | 1 |
| Total | 16 |

Notable advisories:

- `@grpc/grpc-js`: high crash/DoS advisories.
- `form-data`: high CRLF injection advisory.
- `fast-xml-builder`: high XML attribute handling advisory.
- `firebase-admin`: moderate advisory with semver-major fix available.

Dependency recommendation:

- Create a dedicated dependency-audit goal.
- Do not run broad `npm audit fix` inside release work.
- Prioritise `jspdf`, `vitest`, `vite`, Firebase packages, `firebase-admin`, and Functions transitive advisories with compatibility validation.

## Bundle Size

`npm run build` still reports chunks above 500 kB.

Largest built assets:

| Asset | Size |
| --- | ---: |
| `vendor-pdf-BkYr9Xye.js` | 1334.92 KB |
| `pdf.worker.min-B_fnEKel.mjs` | 1210.01 KB |
| `vendor-firebase-PzOTFTuF.js` | 614.79 KB |
| `index-ogsc7u7H.js` | 299.13 KB |
| `html2canvas.esm-CBrSDip1.js` | 197.56 KB |
| `Admin-CHWuD-ID.js` | 171.46 KB |
| `vendor-maps-BhkuPmBy.js` | 170.74 KB |
| `TrainingHub-COVAjfbM.js` | 132.42 KB |
| `DealDashboard-cyehnemS.js` | 101.11 KB |

Bundle recommendation:

- Keep bundle optimisation as a separate goal.
- Prioritise PDF/document tooling, Firebase import boundaries, and map/report/document routes.

## Technical Debt Review

Current high-risk technical debt remains consistent with `TECHNICAL_DEBT.md`:

- Oversized UI modules: `Admin.tsx`, `LeadSidebar.tsx`, `DataTable.tsx`, `DealDashboard.tsx`, `DocumentCentre.tsx`, `ClientProfilePage.tsx`.
- Broad Firebase compatibility hook: `src/hooks/useFirebase.ts`.
- High-risk integration functions: Salestrail, DocuSign, phone migration, SMSF financials.
- Broad Firestore operational collection rules remain active risk.
- Release and data tooling remain approval-gated.

No new technical debt source was introduced by this maintenance run.

## Documentation Freshness

Reviewed documentation is current as of 2026-07-06, but some state docs needed refresh after recent goals.

Fresh or current:

- `docs/staff-uat-plan.md`
- `docs/v1.0-release-notes.md`
- `docs/v1.0-final-risk-assessment.md`
- `docs/internal-production-readiness-go-no-go.md`
- `docs/ai-foundation-audit.md`

Updated by this maintenance:

- `PROJECT_STATE.md`
- `docs/RISK_REGISTER.md`
- `docs/CHANGELOG_INTERNAL.md`

Remaining documentation freshness notes:

- Staff UAT results are still pending.
- Admin booklet auth wording still needs a refresh before production sign-off.
- Release tags and branch/PR status still require human verification before they are treated as release evidence.

## Stale Branches

Local branch review found many merged or historical goal branches still present, including prior Sprint, emulator, cleanup, Firebase, Salestrail, and release-prep branches.

No branches were deleted during this maintenance run.

Recommendation:

- Run a separate branch hygiene review after PRs are merged and release tags are verified.
- Do not delete local or remote branches during weekly maintenance without explicit approval.

## Open Pull Requests

`gh pr list --state open` returned six open draft PRs:

| PR | Title | Source | Target | Draft |
| --- | --- | --- | --- | --- |
| #18 | Sprint 2: Staff Experience and Workflow | `goal/sprint-2-validation-review` | `goal/sprint-validation` | Yes |
| #17 | Sprint 1: CRM stabilisation review | `goal/sprint-validation` | `codex-foundation` | Yes |
| #16 | docs: add Firebase emulator validation results | `docs/firebase-emulator-validation-results` | `codex-foundation` | Yes |
| #15 | docs: add Firebase emulator validation checklist | `codex/docs/firebase-emulator-validation-checklist` | `codex-foundation` | Yes |
| #14 | docs: add Firebase release plan | `docs/firebase-release-plan` | `codex-foundation` | Yes |
| #13 | docs: add appointment pack integration plan | `docs/appointment-pack-plan` | `codex-foundation` | Yes |

PR recommendation:

- Merge order remains Sprint 1 before Sprint 2 if proceeding with those drafts.
- Retarget Sprint 2 after Sprint 1 lands if it is still stacked.
- Review whether older docs-only PRs have already been superseded by newer branch history before merging.

## TODO/FIXME Review

Source TODO/FIXME scan found three active TODO comments, all in `src/components/SystemSettingsPanel.tsx`:

- Line 178: remove after phone normalization migration is complete.
- Line 257: remove after phone normalization migration is complete.
- Line 717: Phone Normalisation Migration section marked for removal after migration complete.

No `FIXME` or `HACK` source comments were found in the scanned source paths.

Recommendation:

- Keep these TODOs until phone normalisation write mode is approved, run, reconciled, and no longer needed.

## Current Release Health

| Area | Status |
| --- | --- |
| Local validation | Green |
| Emulator validation | Green |
| Build | Green with known large chunk warnings |
| Dependency audit | Red until reviewed |
| Staff UAT | Pending |
| Production Firebase approval | Pending |
| Backup and recovery rehearsal | Pending |
| Release tags | Pending verification |
| Open PRs | Six draft PRs remain |
| Production readiness | No-Go until human approvals and blockers clear |

## Recommended Next Actions

1. Run staff UAT using `docs/staff-uat-plan.md`.
2. Create a dependency audit goal focused on `jspdf`, `vitest`, `vite`, Firebase, and Functions advisories.
3. Refresh admin guide auth wording and risky-control language.
4. Verify PR merge order and release tag targets.
5. Prepare backup and recovery rehearsal before any production deployment.
6. Keep live Salestrail sync, phone backfill writes, migrations, and Firebase deploys blocked until explicitly approved.
