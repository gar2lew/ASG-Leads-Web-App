# ASG CRM Dependency Map

Last updated: 6 July 2026

## Summary

ASG CRM is a React, Vite, TypeScript, Firebase, and Firebase Functions application. The highest-value dependencies are Firebase, React, PDF/document tooling, Google Maps, and the external Salestrail and DocuSign integrations. The highest-risk dependencies are the ones tied to production data, authentication, external APIs, large bundles, and document generation.

## Root Package Scripts

Important root scripts:

- `npm run dev`
- `npm run typecheck`
- `npm run lint`
- `npm run lint:report`
- `npm test`
- `npm run build`
- `npm run test:auth-boundaries`
- `npm run test:workflow-state`
- `npm run test:region-identity`
- `npm run test:observability`
- `npm run test:release-metadata`
- `npm run test:emulator:preflight`
- `npm run test:emulator:rules`
- `npm run test:emulator:firestore-smoke`
- `npm run test:emulator:callables-dry-run`
- `npm run release:dry-run`
- `npm run release:deploy`
- `npm run deploy`

Safety note: deployment scripts must not be run unless the user explicitly approves the target and surface.

## Functions Package Scripts

Important Functions scripts:

- `npm run build`
- `npm run serve`
- `npm run deploy`
- `npm run test:settings-admin`

Safety note: Functions deploys are production-impacting and remain blocked without explicit approval.

## Runtime Dependencies

| Dependency | Used for | Risk |
| --- | --- | --- |
| `react`, `react-dom` | Frontend app runtime. | Core rendering and workflow risk. |
| `firebase` | Client auth, Firestore, Functions, Storage, and app config. | High. Production project safety and rules alignment matter. |
| `zustand` | App state store. | Medium. State persistence and workflow consistency. |
| `lucide-react` | Icons. | Low. UI consistency. |
| `@react-google-maps/api`, `@googlemaps/markerclusterer` | Map and territory workflows. | Medium. Bundle size and API key/config risk. |
| `jspdf`, `pdf-lib`, `pdfjs-dist` | PDF generation, editing, rendering, and document workflows. | High. Bundle size and document accuracy risk. |
| `bcryptjs` | Functions PIN hashing and verification. | High. Auth-sensitive backend behaviour. |
| `firebase-admin`, `firebase-functions` | Functions runtime and Admin SDK access. | Very high. Production data and deployable backend surface. |
| `jsonwebtoken` | Token-related Functions support. | High if auth-sensitive paths are touched. |

## Development Dependencies

| Dependency | Used for | Risk |
| --- | --- | --- |
| `typescript` | Type checking and builds. | Low operational risk, high validation value. |
| `vite`, `@vitejs/plugin-react` | Frontend build and dev server. | Medium. Bundle output and build correctness. |
| `vitest` | Test runner. | Low. Validation coverage. |
| `eslint`, TypeScript ESLint plugins, React hooks plugin | Linting and guardrails. | Low. Quality gate. |
| `@firebase/rules-unit-testing` | Firestore rules harness. | High validation value. |
| `firebase-admin` in root dev dependencies | Emulator and harness tooling. | Medium. Must remain emulator/demo project only. |
| `googleapis` | Google integration tooling. | Medium. Credential and external API caution. |
| `tailwindcss`, `postcss`, `autoprefixer`, typography plugin | Styling pipeline. | Low to medium. Build and UI consistency. |

## Internal Application Map

```text
src/App.tsx
  -> auth/PIN callable usage
  -> route registration and lazy page loading
  -> app shell, navigation, modals, global workflow state

src/pages/*
  -> staff screens such as dashboard, leads, admin, reports, settings, deals, calendar, maps, documents
  -> shared components and hooks

src/components/*
  -> lead sidebar, data table, modals, import tools, document tools, UI controls

src/hooks/useFirebase.ts
  -> Firestore reads and writes for leads, reps, settings, chat, documents, appointments, notes, deals, stats

src/stores/appStore.ts
  -> client-side app state

src/lib/*
  -> workflow state, region/auth claims, dates, documents, automation, AI guidance, utilities

functions/src/index.ts
  -> exported Functions surface
  -> imports auth, settings, Salestrail, phone migration, DocuSign, audit, notifications, follow-ups, scheduled stats
```

## Functions Export Surface

Exported or deployable backend surfaces include:

- PIN/auth callables: `verifyPin`, `setPin`, `changePin`, `verifyBackupPassword`.
- Settings/admin callables: `updateAppSettingsCallable`, `rollbackAppSettingsCallable`.
- Phone normalisation callable: `backfillPhoneNormalization`.
- Salestrail callables: `syncSalestrailCallsCallable`, `getSalestrailConfig`, `updateSalestrailConfig`, `resetSalestrailSyncLock`.
- DocuSign functions: `createDocuSignEnvelope`, `docusignWebhook`, `resendDocuSignEnvelope`, `voidDocuSignEnvelope`, `syncEnvelopeStatus`.
- Audit callable: `appendAuditEvent`.
- Notifications and scheduled functions: `onDailyStatsWritten`, `followUpEngine`, `aggregateDailyStats`, `sendDailyReportNotification`.
- Other callables: `getPropertyInsights`, `sendPushNotification`, `triggerPerfAlert`.

## Firebase Dependency Map

| Surface | Files | Risk |
| --- | --- | --- |
| Project selection | `.firebaserc` | Very high. Default project is production-like `amplify-leads-2026`. |
| Deploy configuration | `firebase.json` | Very high. Hosting, Functions, Firestore rules, and indexes can deploy together. |
| Rules | `firestore.rules` | Very high. Direct client access boundaries. |
| Indexes | `firestore.indexes.json` | Medium to high. Query support and deploy surface. |
| Client Firestore | `src/hooks/useFirebase.ts`, feature hooks | High. Staff-facing data reads and writes. |
| Callable clients | `src/App.tsx`, `src/hooks/useDocuSign.ts`, admin/settings UI | High. Must match backend auth expectations. |
| Functions backend | `functions/src/*` | Very high. Production data and integration writes. |
| Emulator harnesses | `scripts/test-emulator-*.cjs` | High validation value. Must use demo project only. |

## External Integration Map

| Integration | Code path | Current gate |
| --- | --- | --- |
| Salestrail | `functions/src/salestrail.ts`, `functions/src/salestrailSync.ts`, Salestrail UI and docs | Dry-run-first, no live sync without approval, mock seam still recommended. |
| DocuSign | `functions/src/docusign.ts`, `src/hooks/useDocuSign.ts`, document centre flows | Requires webhook, credential, and document-status caution. |
| Google Maps | Map page and Google Maps dependencies | Requires key/config safety and bundle awareness. |
| Google Sheets/import | `SheetsSyncModal`, import docs, migration docs | Requires dry-run, duplicate validation, and data-owner approval. |
| PDF/document generation | PDF components, document centre, templates | Requires sample output checks and bundle awareness. |

## Dependency Risks

- Firebase and PDF dependencies create large chunks in production build output.
- `firebase-functions` emulator output reports an outdated SDK advisory.
- Dependency audit vulnerabilities remain documented and need targeted review.
- Integration dependencies can become production data risks if tests accidentally use live credentials or live project selection.
- Deployment scripts exist and must stay behind explicit approval gates.

## Recommended Dependency Work

1. Add a no-network Salestrail mock seam before expanding Salestrail callable tests.
2. Investigate Vite bundle chunks and lazy-load heavy PDF, map, import, and document tooling.
3. Review dependency audit vulnerabilities in a dedicated dependency hardening goal.
4. Keep Firebase emulator commands pinned to `demo-asg-crm-emulator`.
5. Treat dependency upgrades as behaviour changes when they affect Firebase, Functions, PDF generation, maps, or auth.
