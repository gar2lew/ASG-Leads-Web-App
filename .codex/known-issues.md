# Known Issues

Senior engineering review based on `.codex/memory.md`, `.codex/architecture.md`, `.codex/project-overview.md`, `.codex/tech-stack.md`, and targeted source checks.

Review date: 2026-06-15

## Executive Summary

The highest risk is not UI complexity; it is trust boundaries. The app handles CRM, financial, staff, client, document, notification, and SMSF-adjacent data while still relying heavily on anonymous Firebase Auth, client-side rep/session identity, and broad Firestore rules. Several exported callable functions also bypass the repository's own `requireAuth(request)` rule.

The second major risk is operational scale. Core workflows are concentrated in very large files and one large compatibility hook, which makes security and behavior changes expensive to review. Testing exists, but it is mostly utility/server-unit oriented rather than rule, page, or end-to-end workflow coverage.

## 1. Highest-Risk Security Issues

### Critical: Unauthenticated or under-authorized callable functions

Evidence:

- `functions/src/index.ts:78` exports `getPropertyInsights` without `requireAuth(request)`.
- `functions/src/index.ts:277` exports `sendPushNotification` without `requireAuth(request)` or role checks.
- `functions/src/index.ts:355` exports `triggerPerfAlert` without `requireAuth(request)` or role checks.
- `functions/src/smsfFinancials.ts:7` exports `saveSmsfFinancials` without auth, role, ownership, or payload validation.
- `functions/src/smsfFinancials.ts:33` exports `getSmsfFinancials` without auth, role, ownership, or payload validation.

Impact:

- Anyone able to invoke deployed callables may be able to trigger notifications, generate property records, or use SMSF encryption/decryption helpers.
- This violates the repo rule that every callable must call `requireAuth(request)` first.

Recommended response:

- Add unauthenticated tests for every callable.
- Add `requireAuth(request)` and explicit role/ownership checks before any business logic.
- Treat `sendPushNotification`, `triggerPerfAlert`, and SMSF helpers as priority fixes.

### Critical: Broad Firestore write access behind anonymous Auth

Evidence:

- `firestore.rules:145-148` permits authenticated read/create/update/delete on `leads`.
- `firestore.rules:184-187` permits authenticated read/create/update/delete on `deals`.
- `firestore.rules:291-292` permits authenticated read/write on `settings`.
- Many other operational collections permit broad authenticated writes.
- `.codex/architecture.md` documents that client auth currently uses anonymous sign-in.

Impact:

- "Authenticated" does not necessarily mean a verified staff member with server-enforced role and region claims.
- Direct client writes to leads, deals, commissions, appointments, reports, training, and chat rely too much on client-side controls.

Recommended response:

- Add Firebase emulator rule tests for the current intended policy.
- Move collection-by-collection toward claim-backed rules and server-authoritative callables for sensitive writes.
- Keep compatibility paths only where explicitly documented and tested.

### High: `migrateAuthFields` is exported from deployed index

Evidence:

- `.codex/memory.md` and project instructions say not to import `migrateAuthFields.ts` into `index.ts`.
- `functions/src/index.ts:43` exports `migrateAuthFields`.

Impact:

- A migration callable may remain deployed longer than intended.
- Even if guarded, migration surfaces expand production blast radius.

Recommended response:

- Decide whether this callable is still operationally required.
- If not required, remove it from the deployed export surface in a controlled release.

### High: Dev/admin bypass must remain impossible in production

Evidence:

- `src/layouts/LoginScreen.tsx:5` and `src/layouts/AppShell.tsx:60` gate dev bypass with `import.meta.env.DEV && VITE_ENABLE_DEV_AUTH_BYPASS === "true"`.

Impact:

- Current guard looks reasonable, but this is a high-consequence path.

Recommended response:

- Add a build-time or unit test proving production builds cannot expose the bypass.
- Keep deploy env validation strict around `VITE_ENABLE_DEV_AUTH_BYPASS`.

## 2. Highest-Risk Technical Debt

### Large files concentrate unrelated responsibilities

Evidence:

- `src/pages/Admin.tsx`: about 200 KB.
- `src/components/SheetsSyncModal.tsx`: about 161 KB.
- `src/components/AIRoleplay.tsx`: about 116 KB.
- `src/pages/ClientProfilePage.tsx`, `src/pages/DealDashboard.tsx`, `src/pages/Map.tsx`, and `src/components/DataTable.tsx` are each about 100 KB or larger.

Impact:

- Harder security review.
- Higher regression risk from small edits.
- More expensive test setup and code ownership.

Recommended response:

- Extract domain services, reducers/state machines, and smaller panels from these files one workflow at a time.

### `src/hooks/useFirebase.ts` remains a compatibility monolith

Evidence:

- `.codex/architecture.md` identifies mixed usage between `src/hooks/useFirebase.ts`, `src/services/*`, and `src/hooks/domain/*`.

Impact:

- New data access patterns can diverge.
- Broad Firestore behavior is hard to audit.

Recommended response:

- Freeze new feature growth in `useFirebase.ts`.
- Prefer `src/services/*` and `src/hooks/domain/*` for new work.
- Migrate high-risk write paths first.

### Route config implies deep links that do not work

Evidence:

- `src/router/routeConfig.ts:23` includes parameterized routes.
- `src/router/routeConfig.ts:85` exact-matches `r.path === cleanPath`.

Impact:

- `/leads/:leadId`, `/clients/:clientId`, and `/deals/:dealId` are documented routes but not actually parsed.
- Sharing links to records likely fails or falls back incorrectly.

Recommended response:

- Either implement param matching or remove parameterized entries until router migration is real.

## 3. Missing Test Coverage

Highest-priority gaps:

- Firebase emulator-backed tests for `firestore.rules`.
- Callable auth tests for every exported function, especially unauthenticated and wrong-role calls.
- E2E smoke tests for login, role/permission navigation, region switching, lead creation/update, Sheets sync, map loading, admin settings, and deploy dry run.
- Page-level integration tests for Dashboard, Leads, Map, ClientHub, DealDashboard, Admin, TrainingHub, TeamChat, DocumentCentre, PIA, and SMSF.
- Tests for `AppShell` session restoration, permission fallback, and route path handling.
- Tests for large modal workflows: `SheetsSyncModal`, `PdfFormFillerModal`, `FormFillerModal`, and OA document editor.

Existing coverage is useful but mostly focused on selected utilities, auth/roles, lead identity/reset/snapshots, saved views, Sheets sync utilities, settings admin, migration, and lead snapshots.

## 4. Performance Bottlenecks

### Full collection reads and broad real-time listeners

Evidence:

- `.codex/architecture.md` documents widespread `onSnapshot` usage.
- `functions/src/index.ts` daily stats aggregation reads full `leads`, `trainingSessions`, `commissions`, and `draps` collections.
- `functions/src/aggregateStats.ts` exists as an optimized alternative but is not exported and has TODO metrics.

Impact:

- Read costs and latency grow with every lead, training session, commission, and rep.
- Client pages can become expensive if listeners are broad or duplicated.

Recommended response:

- Audit listeners by page and add scoped queries, limits, pagination, and indexes where needed.
- Finish the optimized stats function safely before replacing the current implementation.

### Large UI bundles and lazy boundaries are only partial relief

Evidence:

- AppShell lazy-loads many pages, but several lazy pages/components are very large.

Impact:

- Route transitions can still be heavy.
- Large modules make browser parsing and React rendering more expensive.

Recommended response:

- Split the largest pages by tab/panel/workflow.
- Memoize high-cardinality table/map rendering paths and keep derived data stable.

## 5. Scalability Concerns

- Broad Firestore rules prevent safe multi-team or external-user scaling.
- Daily stat aggregation currently scales poorly with total collection size.
- `callHistory` and other array-on-document patterns may hit concurrent-write and document-size limits as usage grows.
- Offline queue and localStorage-backed state can become fragile under high-volume field usage.
- Region isolation exists in app state and some queries, but broad rules mean server-side isolation is incomplete until claim-backed rules are tightened.
- Cloud Functions should avoid top-level Admin SDK access patterns. `functions/src/aggregateStats.ts:4` currently violates this, even though it is not exported.

## 6. Deployment Risks

- `npm run deploy` deploys Hosting only; `npm run release:deploy` deploys rules, indexes, hosting, and functions. Operators must choose the correct path deliberately.
- `deploy.ps1` defaults to `production`, so accidental production intent needs process guardrails outside the script.
- `deploy.ps1` deploys Firestore rules, indexes, hosting, and functions together in the governed flow; this can increase blast radius.
- `deploy.ps1` creates a rollback tag before validation, but uncommitted changes are not captured by the tag.
- Vercel CLI exists in the developer environment, but the app has no Vercel project config. Vercel deploy requests should be treated as unsupported until intentionally configured.
- No automated deployment script test harness was found.
- No `.env.example` was found, despite required Firebase/Maps/Sheets/FCM environment variables.

## 7. Quick Wins Under 1 Hour

1. Add `requireAuth(request)` to `getPropertyInsights`, `sendPushNotification`, and `triggerPerfAlert`, then add admin/manager role checks to notification callables.
2. Add auth guards and basic payload validation to `saveSmsfFinancials` and `getSmsfFinancials`.
3. Add `.env.example` with placeholder keys only.
4. Remove parameterized route entries from `routeConfig` or add a TODO warning beside them until matching exists.
5. Add a small test that production env cannot expose the dev admin bypass.
6. Add a `known unsupported` note for Vercel deployments in deployment docs.
7. Add a comment or ticket to resolve why `migrateAuthFields` is exported from `index.ts`.

## 8. Medium Improvements Under 1 Day

1. Add Firebase emulator tests for the top 5 sensitive rule boundaries: `leads`, `deals`, `settings`, `reps`, and `smsfFinancials`.
2. Add callable auth boundary tests for all exported functions in `functions/src/index.ts`.
3. Split `sendPushNotification` and `triggerPerfAlert` behind an admin-only callable service with input schemas.
4. Replace broad client settings writes with the existing `updateAppSettingsCallable` path wherever feasible.
5. Implement route parameter matching for `/leads/:leadId`, `/clients/:clientId`, and `/deals/:dealId`, or remove those routes from config.
6. Add a deployment preflight script that prints target branch, Firebase project, changed files, and build/test status without deploying.
7. Extract one high-risk section from `Admin.tsx` or `SheetsSyncModal.tsx` into a smaller component plus service tests.

## 9. Major Improvements Over 1 Week

1. Complete the auth migration to custom-claim-backed server authorization and tighten Firestore rules collection by collection.
2. Move sensitive operational writes from direct client Firestore calls to server-authoritative callables with audit logging.
3. Build a Firebase emulator security test suite covering all business-critical collections and callables.
4. Break down the largest files into domain modules with tested services and smaller UI panels.
5. Finish and safely deploy optimized daily stats aggregation with indexed queries and complete metrics.
6. Add Playwright or equivalent E2E smoke coverage for login, lead lifecycle, region isolation, admin settings, Sheets sync, map, documents, and deploy dry run.
7. Rationalize deal workflow duplication between `DealDashboard.tsx` and `DealPipeline.tsx`.
8. Add observability around callable errors, permission denials, offline queue failures, and deployment metadata.

## Recommended Priority Order

1. Secure callable auth gaps.
2. Add emulator tests for Firestore rules and callable auth boundaries.
3. Tighten the highest-risk Firestore collections.
4. Clarify deployment targets and add env/deploy preflight docs.
5. Reduce large-file complexity in the highest-change areas.
6. Improve stats/listener scalability.
