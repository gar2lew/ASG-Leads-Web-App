# ASG CRM Technical Debt

Last updated: 6 July 2026

## Summary

The largest technical debt is concentrated in oversized UI modules, broad Firebase hooks, integration-heavy Functions code, high-risk migration and backfill paths, large vendor bundles, and incomplete no-network seams for external services.

The safest strategy is to keep reducing debt behind the existing validation baseline. Avoid broad rewrites. Prefer small goals with one workflow, one owner, one rollback point, and full validation.

## Largest Components

Current line-count scan of `src` and `functions/src` shows the largest files are:

| Lines | File | Risk |
| ---: | --- | --- |
| 4290 | `src/pages/Admin.tsx` | Very high. Settings, admin workflow, permissions, and operational controls are concentrated in one page. |
| 2694 | `src/components/AIRoleplay.tsx` | Medium. Large training surface with likely UI and state complexity. |
| 2495 | `src/components/SheetsSyncModal.tsx` | High. Import/sync workflow complexity and data quality risk. |
| 2396 | `src/pages/DealDashboard.tsx` | High. Deal pipeline and reporting workflow risk. |
| 2366 | `src/hooks/useFirebase.ts` | Very high. Many Firestore reads and writes share one hook file. |
| 2287 | `src/pages/Map.tsx` | Medium. Large map workflow and Google Maps dependency. |
| 2171 | `src/pages/DealPipeline.tsx` | High. Deal state and staff workflow risk. |
| 2123 | `src/pages/ClientProfilePage.tsx` | High. Client, notes, documents, and deal context risk. |
| 2114 | `src/components/DataTable.tsx` | High. Central table behaviour used across staff workflows. |
| 1955 | `src/pages/Calendar.tsx` | Medium. Scheduling workflow and responsive layout risk. |
| 1910 | `src/pages/DocumentCentre.tsx` | High. Document templates, file handling, and compliance workflow risk. |
| 1828 | `src/components/PdfFormFillerModal.tsx` | High. PDF generation and document accuracy risk. |
| 1759 | `src/components/LeadSidebar.tsx` | Very high. Lead workflow, notes, actions, and staff efficiency risk. |
| 1696 | `src/App.tsx` | Very high. Routing, auth, PIN flows, shell state, lazy pages, and global navigation converge here. |
| 1582 | `src/pages/Dashboard.tsx` | Medium. Daily staff rhythm and performance risk. |
| 1476 | `src/pages/ReportsDashboard.tsx` | Medium. Management reporting and large data presentation risk. |
| 1461 | `src/pages/Commissions.tsx` | Medium. Financial calculation and review risk. |
| 1363 | `src/pages/TrainingHub.tsx` | Low to medium. Content-heavy workflow. |
| 1230 | `src/pages/TeamChat.tsx` | Medium. Messaging and Firestore activity risk. |
| 1190 | `src/pages/KnowledgeBase.tsx` | Low to medium. Content and search workflow. |
| 1059 | `functions/src/docusign.ts` | High. External integration, webhook security, storage, notifications, and document status. |
| 880 | `functions/src/salestrailSync.ts` | Very high. External API, secrets, call matching, Firestore writes, dry-run behaviour, and reconciliation. |

## Highest Risk Files

- `src/App.tsx`: global app shell, lazy route registration, auth/PIN callable usage, and navigation decisions.
- `src/hooks/useFirebase.ts`: many Firestore collection reads and writes, broad blast radius if changed incorrectly.
- `src/pages/Admin.tsx`: admin settings and operational controls.
- `src/components/LeadSidebar.tsx`: lead actions, notes, staff workflow, and user-facing efficiency.
- `src/components/SheetsSyncModal.tsx`: import and sync behaviour with high data integrity risk.
- `functions/src/index.ts`: exported Functions surface and deployable entry point.
- `functions/src/auth/verifyPin.ts`: PIN setup, verification, backup password, and auth boundary.
- `functions/src/settingsAdmin.ts`: server-authoritative settings changes.
- `functions/src/phoneMigration.ts`: phone normalisation backfill risk.
- `functions/src/salestrail.ts` and `functions/src/salestrailSync.ts`: Salestrail config, dry-run, live sync, matching, audit, and writes.
- `functions/src/docusign.ts`: DocuSign envelope and webhook workflow.
- `firestore.rules`: direct client access boundary for sensitive collections.
- `firestore.indexes.json`: query support and deployment surface.
- `firebase.json` and `.firebaserc`: deploy and project-selection risk.

## Largest Technical Debt

### Oversized UI modules

Many pages are large enough that ordinary UI changes can accidentally affect workflow behaviour. These files should be split by workflow only after tests or screenshot review can protect the behaviour.

Recommended approach:

1. Extract presentational subcomponents first.
2. Keep state ownership unchanged.
3. Validate after each small extraction.
4. Avoid redesign during extraction goals.

### Broad Firebase hook file

`src/hooks/useFirebase.ts` is a central Firestore access layer for leads, reps, settings, chat, documents, appointments, notes, deals, and stats. It is useful as a single map, but risky as a long-term edit surface.

Recommended approach:

1. Document existing hook groups.
2. Extract by collection family only when tests are in place.
3. Preserve exported hook names until all call sites are migrated.
4. Keep rules tests and callable tests green during each extraction.

### External integration seams

Salestrail and DocuSign are high-value integrations, but Salestrail still needs a no-network test seam before broader callable coverage can be trusted without real API contact.

Recommended approach:

1. Add a Salestrail mock provider seam.
2. Add no-network tests for dry-run and config behaviour.
3. Keep live sync blocked until reconciliation can prove returned imported counts against `salestrailCalls`.

### Migration and backfill risk

Phone normalisation and Firebase leads migration are necessary operational tools, but they must remain dry-run-first and approval-gated.

Recommended approach:

1. Require export or backup before write modes.
2. Require affected-count and sample before/after review.
3. Require explicit approval before any full write or full replace mode.
4. Require post-run reconciliation and rollback notes.

### Bundle size and dependency risk

Vite reports large Firebase and PDF vendor chunks. The dependency stack includes Firebase, PDF rendering/generation, Google Maps, and document tooling, all of which can be heavy.

Recommended approach:

1. Keep route-level lazy loading.
2. Lazy-load PDF, map, DocuSign, import, and document tooling on demand.
3. Run bundle analysis before replacing dependencies.
4. Review dependency audit findings separately.

## Recommended Cleanup Order

1. Complete v1.0 release checklist and staff UAT planning.
2. Add Salestrail no-network mock seam.
3. Reduce bundle warnings through safe lazy-loading of heavy workflow tools.
4. Split `Admin.tsx` into low-risk sections.
5. Split `useFirebase.ts` by collection family behind stable exports.
6. Extract lead sidebar workflow sections after staff UAT confirms expected behaviour.
7. Review dependency audit vulnerabilities and upgrade only with targeted validation.

## Blocked Cleanup

- Do not change Firestore rules without a rules defect, a written proposal, and explicit approval.
- Do not alter production Firebase project selection.
- Do not run live Salestrail sync.
- Do not run phone backfill with `dryRun:false`.
- Do not run live migration scripts.
- Do not force-move release tags without human approval.
