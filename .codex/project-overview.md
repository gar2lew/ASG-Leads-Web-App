# Project Overview And Audit

## Scope

This audit inspected root-level repository source files only. It intentionally excluded:

- `asg_crm_react/asg_crm_react/` because project instructions identify it as a mirror copy.
- `node_modules/`, `dist/`, and `functions/lib/` build output.
- `awesome-codex-skills/` for app architecture, except noting that it contains unrelated skill assets.

No application code was modified.

## Product Summary

ASG CRM React is a Firebase-backed CRM for mortgage broking and financial services operations. It supports lead import/sync, door-knocking and call workflows, client profiles, deal progression, commissions, daily stats, maps, training/roleplay, document generation, calculators, team chat, notifications, and admin settings.

## Application Flow

1. `src/main.tsx` mounts the React app.
2. `src/App.tsx` wraps the app in `ErrorBoundary` and `ToastProvider`.
3. `src/layouts/AppShell.tsx`:
   - restores Firebase/rep session state
   - signs users in through `LoginScreen` when no app user is active
   - owns active page state and maps page keys to URL paths
   - renders `Sidebar`, `Topbar`, active page, floating calculator/calendar, onboarding, offline indicator, and import/sync modals
4. Page access is controlled by the current rep role/permissions in the client shell, with admin-only rendering for admin and admin-guide pages.
5. Firestore rules and callable functions provide partial server enforcement, with migration still in progress toward custom-claim/server-authoritative auth.

## Routes

The current route map lives in `src/router/routeConfig.ts`.

| Path | Page | Notes |
| --- | --- | --- |
| `/` | Dashboard | Default page. |
| `/leads` | Leads | Main lead table/workflow. |
| `/leads/:leadId` | Leads | Listed in config, but current exact path matcher does not parse params. |
| `/clients` | Client Hub | Client list. |
| `/clients/:clientId` | Client Hub | Listed in config, but current exact path matcher does not parse params. |
| `/calendar` | Calendar | Appointment/calendar flow. |
| `/deals` | Deal Dashboard | Main deal workflow. |
| `/deals/:dealId` | Deal Dashboard | Listed in config, but current exact path matcher does not parse params. |
| `/reports` | Reports | Reports dashboard. |
| `/training` | Training Hub | Training, roleplay, learning. |
| `/dq-import` | DQ Import | DQ lead import. |
| `/map` | Map | Google Maps lead view. |
| `/draps` | DRAPS | Daily activity stats. |
| `/commissions` | Commissions | Commission calculator/tracking. |
| `/admin` | Admin | Admin-only UI. |
| `/team-chat` | Team Chat | Team messaging/presence. |
| `/knowledge-base` | Knowledge Base | Internal KB. |
| `/documents` | Document Centre | Documents/form/PDF tools. |
| `/admin-guide` | Admin Guide | Admin-only guide. |
| `/my-dashboard` | My Dashboard | Personal rep dashboard. |
| `/my-settings` | Rep Settings | Rep settings panel. |
| `/pia` | PIA Calculator | Calculator page plus hosting rewrite for static `/pia/**`. |
| `/smsf` | SMSF Calculator | Calculator page plus hosting rewrite for static `/smsf/**`. |
| `/rep-dashboard` | Rep Dashboard | Rep dashboard component. |
| `/assistant` | Assistant | Assistant page. |
| `/inbox` | Inbox | Inbox page. |

## Pages

Root pages in `src/pages/`:

- `Admin.tsx`: large admin console for reps, permissions, settings, sync, snapshots, health, and migrations.
- `AdminGuide.tsx`: lightweight admin guide.
- `AssistantPage.tsx`: assistant UI.
- `Calendar.tsx`: calendar/appointment workflows.
- `ClientHub.tsx`: client list and filtering.
- `ClientProfilePage.tsx`: client record detail, notes, documents, activity, and calculator links.
- `Commissions.tsx`: commissions workflow and calculator.
- `Dashboard.tsx`: main operational dashboard.
- `DealDashboard.tsx`: current deal pipeline/dashboard.
- `DealPipeline.tsx`: older/parallel deal pipeline implementation.
- `DocumentCentre.tsx`: document/form/PDF tooling.
- `DQImport.tsx`: DQ import workflow.
- `Draps.tsx`: DRAPS and stats.
- `InboxPage.tsx`: inbox surface.
- `KnowledgeBase.tsx`: knowledge base.
- `Leads.tsx`: main leads page.
- `Map.tsx`: map/geocoding/pin workflow.
- `MyDashboard.tsx`: personal dashboard.
- `PIA.tsx`: PIA calculator/report persistence.
- `ReportsDashboard.tsx` and `ReportView.tsx`: reporting.
- `SMSF.tsx`: SMSF calculator/report persistence/encryption callable usage.
- `TeamChat.tsx`: team chat, DMs, presence, geolocation, notifications.
- `TrainingHub.tsx`: training modules, documents, videos, recordings, and roleplay entry.

## Components

Important component groups:

- Shell/layout: `Sidebar`, `Topbar`, `LoginScreen`, `LoginCard`, `ErrorBoundary`, `ToastContext`.
- Lead workflows: `DataTable`, `AddLeadModal`, `LeadSidebar`, `CallLogger`, `CSVImportModal`, `DQImportModal`, `SheetsSyncModal`, `TimelyCSVImportModal`.
- Deal/client workflows: `DealTimeline`, `AppointmentModal`, `record-detail/*`, `client/FinancialReportsTab`.
- Documents: `DocumentCentre`, `FormFillerModal`, `PdfFormFillerModal`, `OADocumentEditor/*`.
- Training/AI: `AIRoleplay`, `AICoachingPanel`, `AIGuidanceCard`, `RoleplayDashboard`, `RoleplayReplay`, `VoiceRecorder`.
- Admin/settings: `SystemSettingsPanel`, `SystemHealthPanel`, `SettingsHistoryPanel`, `LeadSnapshotAdminPanel`, `LeadDuplicateAuditPanel`, `custom-fields/*`.
- Tasks/activity: `tasks/*`, `activity/ActivityTimeline`.
- Global tools: `FloatingCalculator/*`, `FloatingCalendar/*`, `OfflineIndicator`, `ConnectionStatus`.
- UI primitives: `ui/StatusBadge`, `ui/Skeleton`, `ui/EmptyState`.

## Firebase Usage

### Client

- Firebase app initialization is centralized in `src/lib/firebase.ts`.
- Firestore uses `initializeFirestore(app, { localCache: persistentLocalCache() })`.
- Firebase Auth uses anonymous sign-in by default.
- Firebase Functions are called through `httpsCallable`.
- Firebase Storage is used for document uploads/downloads.
- Real-time Firestore subscriptions are widespread through `onSnapshot`.

### Common Collections

- Core CRM: `leads`, `reps`, `deals`, `dealEvents`, `dealDocuments`, `clientNotes`, `activityEvents`, `tasks`, `savedViews`.
- Operations: `draps`, `commissions`, `appointments`, `dailyStats`, `sentAlerts`, `properties`.
- Settings/admin: `settings`, `appSettings`, `settingsHistory`, `auditLogs`, `audit`.
- Training: `trainingSessions`, `trainingDocuments`, `trainingVideos`, `trainingRecordings`, `trainingCourses`, `trainingModules`, `userProgress`.
- Documents/calculators: `documentInstances`, `documentLibrary`, `formTemplates`, `piaReports`, `smsfReports`, `smsfFinancials`, `calculatorStates`.
- Communication/notifications: `teamChat`, `dmChannels`, `teamPosts`, `presence`, `userDevices`, `errors`.

### Cloud Functions

- `functions/src/index.ts` is the deployed export surface.
- Deployed callables include auth/PIN, settings, snapshots, DocuSign, SMSF crypto helpers, notifications, and property insights.
- Scheduled/triggered functions include daily stats aggregation, daily report notifications, follow-up engine, and dailyStats-triggered performance alerts.
- `functions/src/migrateAuthFields.ts` is exported from `index.ts`; project instructions say not to import it into `index.ts`, so this should be reviewed before future deployments.

## Vercel Usage

- No app-level Vercel usage was found.
- There is no root `vercel.json`.
- There is no root `.vercel/` config detected.
- There are no root npm scripts for Vercel deploy.
- Vercel references found are only in Codex guardrails and unrelated `awesome-codex-skills/` assets.

## Deployment Flow

### Firebase Hosting Only

`npm run deploy`:

1. Runs `npm run build`.
2. Deploys Firebase Hosting only with `firebase deploy --only hosting`.

### Governed Release

`npm run release:deploy` runs `deploy.ps1`.

`deploy.ps1`:

1. Validates `git`, `firebase`, `npm`, project root files, Firebase login, and Firebase project target.
2. Confirms environment safety. Production expects Firebase project `amplify-leads-2026`.
3. Reads current branch and commit.
4. Warns on dirty worktree and requires typing `DEPLOY` to continue.
5. Creates rollback tag `pre-deploy-YYYYMMDD-HHMMSS`.
6. Installs dependencies only if `node_modules` is missing.
7. Sets release metadata env vars.
8. Runs release metadata generation.
9. Runs TypeScript validation with relaxed unused checks.
10. Runs production build.
11. Deploys Firestore rules, Firestore indexes, Hosting, and Functions in order.

### Dry Run

`npm run release:dry-run` runs the same flow but prints Firebase deploy commands instead of executing them.

## Known Technical Debt

- Navigation config lists parameterized routes, but `pathToPage()` only exact-matches strings, so `/leads/:leadId`, `/clients/:clientId`, and `/deals/:dealId` are not functional deep links today.
- The app has very large page/component files, especially `Admin.tsx`, `SheetsSyncModal.tsx`, `AIRoleplay.tsx`, `DataTable.tsx`, `Map.tsx`, `ClientProfilePage.tsx`, and `DealDashboard.tsx`.
- `src/hooks/useFirebase.ts` remains a large compatibility layer while newer domain hooks and services exist.
- `DealDashboard.tsx` and `DealPipeline.tsx` appear to overlap as deal workflow implementations.
- `functions/src/aggregateStats.ts` contains an optimized scheduled function with top-level `admin.firestore()` and TODO metrics, but it is not currently exported from `index.ts`.
- `getPropertyInsights` contains placeholder assumptions/baseline values.
- Client code still performs many direct Firestore writes for operational data that should eventually move to server-authoritative callables or tighter rules.
- Legacy activity data is still merged with canonical `activityEvents`.
- Several flows rely on browser-only APIs with known compatibility limits: Speech Recognition, Notifications, Service Workers, IndexedDB persistence, and Geolocation.
- No `.env.example` was found during audit, even though many env vars are required for Firebase, Maps, Sheets, and FCM.

## Missing Tests / Coverage Gaps

Existing tests cover selected utilities and server modules, but gaps remain:

- No broad page-level integration tests for Dashboard, Leads, Map, ClientHub, DealDashboard, Admin, TrainingHub, TeamChat, DocumentCentre, PIA, or SMSF.
- No Firebase emulator-backed rules test suite was found for `firestore.rules`.
- No browser/E2E tests were found for login, route navigation, region isolation, Sheets sync, offline replay, document upload, DocuSign, notifications, or maps.
- No tests found for `AppShell` permission fallback behavior or URL param deep-link limitations.
- No tests found for large modal workflows such as `SheetsSyncModal`, `PdfFormFillerModal`, `FormFillerModal`, and OA document editor.
- Limited tests around Cloud Functions auth boundaries; several exported callables still need explicit unauthenticated/role tests.
- No deployment script test harness was found for `deploy.ps1`; validation is operational/manual via dry run.

## Security Concerns

- Several exported callables do not call `requireAuth(request)` first:
  - `getPropertyInsights`
  - `sendPushNotification`
  - `triggerPerfAlert`
  - `saveSmsfFinancials`
  - `getSmsfFinancials`
- `sendPushNotification` and `triggerPerfAlert` accept user-targeting payloads without server role checks in `functions/src/index.ts`.
- SMSF financial encryption/decryption callables use a secret but do not validate auth, role, payload shape, or ownership in `functions/src/smsfFinancials.ts`.
- Firestore rules permit broad authenticated reads/writes for many business-critical collections. Anonymous auth means "authenticated" does not necessarily mean identified staff unless claims/session migration is complete.
- `settings` remains broadly writable by authenticated users, while `appSettings/config` is protected from client writes.
- Direct client writes to `leads`, `deals`, `commissions`, `draps`, `appointments`, reports, training sessions, and chat increase reliance on client-side permission checks.
- Dev admin bypass exists behind `import.meta.env.DEV && VITE_ENABLE_DEV_AUTH_BYPASS === "true"`; keep it dev-only and verify production env never enables it.
- Some audit writes from client-side code target collections whose rules now deny creates; this may produce silent or non-blocking permission errors.
- Firebase env vars are required at runtime and missing values throw at app startup; no checked-in `.env.example` documents expected keys.

## Audit Recommendation Order

1. Fix or explicitly document callable auth exceptions.
2. Add Firebase emulator tests for rules and callables.
3. Decide whether `migrateAuthFields` should remain exported from `index.ts`.
4. Tighten Firestore rules collection by collection after custom claims are reliably present.
5. Split the largest files along established page/service/component boundaries.
6. Add route param handling or remove parameterized route entries until React Router migration is real.
7. Add `.env.example` with placeholder values only.
8. Add E2E smoke coverage for login, navigation, leads, map, admin settings, Sheets sync, and deploy dry run.
