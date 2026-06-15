# Architecture Memory

## High-Level Shape

- Single-page React/Vite app wrapped by `src/App.tsx`.
- `App` renders `ErrorBoundary`, `ToastProvider`, and `AppShell`.
- `AppShell` owns session restoration, page state, URL push/pop handling, lazy page loading, region switching, offline/sync state, CSV/Sheets import modals, and global floating tools.
- Navigation is tab/page-key based. `src/router/routeConfig.ts` maps URL paths to `Page` keys, and `AppShell` renders pages by comparing `effectivePage`.
- `src/router/routeConfig.ts` includes a comment describing React Router as a future migration path, but current rendering is not React Router based.

## Routes And Pages

Current URL-to-page map:

| Path | Page key | Primary component |
| --- | --- | --- |
| `/` | `dashboard` | `src/pages/Dashboard.tsx` |
| `/leads` | `leads` | `src/pages/Leads.tsx` |
| `/leads/:leadId` | `leads` | Not directly matched by current exact `pathToPage()` |
| `/clients` | `client-hub` | `src/pages/ClientHub.tsx` |
| `/clients/:clientId` | `client-hub` | Not directly matched by current exact `pathToPage()` |
| `/calendar` | `calendar` | `src/pages/Calendar.tsx` |
| `/deals` | `deal-dashboard` | `src/pages/DealDashboard.tsx` |
| `/deals/:dealId` | `deal-dashboard` | Not directly matched by current exact `pathToPage()` |
| `/reports` | `reports` | `src/pages/ReportsDashboard.tsx` |
| `/training` | `training` | `src/pages/TrainingHub.tsx` |
| `/dq-import` | `dq-import` | `src/pages/DQImport.tsx` |
| `/map` | `map` | `src/pages/Map.tsx` |
| `/draps` | `draps` | `src/pages/Draps.tsx` |
| `/commissions` | `commissions` | `src/pages/Commissions.tsx` |
| `/admin` | `admin` | `src/pages/Admin.tsx` |
| `/team-chat` | `team-chat` | `src/pages/TeamChat.tsx` |
| `/knowledge-base` | `knowledge-base` | `src/pages/KnowledgeBase.tsx` |
| `/documents` | `document-centre` | `src/pages/DocumentCentre.tsx` |
| `/admin-guide` | `admin-guide` | `src/pages/AdminGuide.tsx` |
| `/my-dashboard` | `my-dashboard` | `src/pages/MyDashboard.tsx` |
| `/my-settings` | `rep-settings` | `src/components/RepSettingsPanel.tsx` |
| `/pia` | `pia` | `src/pages/PIA.tsx` |
| `/smsf` | `smsf` | `src/pages/SMSF.tsx` |
| `/rep-dashboard` | `rep-dashboard` | `src/components/RepDashboard.tsx` |
| `/assistant` | `assistant` | `src/pages/AssistantPage.tsx` |
| `/inbox` | `inbox` | `src/pages/InboxPage.tsx` |

Firebase Hosting also rewrites `/pia/**` and `/smsf/**` to static public calculator HTML files under `public/pia` and `public/smsf`.

## Page Domains

- Operations dashboard: `Dashboard`, `MyDashboard`, `RepDashboard`.
- Lead pipeline: `Leads`, `DQImport`, `Map`, `Draps`.
- Clients and deals: `ClientHub`, `ClientProfilePage`, `DealDashboard`, legacy/parallel `DealPipeline`.
- Revenue: `Commissions`, reports dashboards, daily stats.
- Documents and calculators: `DocumentCentre`, OA document editor components, PDF/form filler modals, `PIA`, `SMSF`.
- Training: `TrainingHub`, `AIRoleplay`, roleplay replay/dashboard, training library hooks.
- Admin: `Admin`, `AdminGuide`, settings panels, system health, snapshots, custom fields.
- Communication: `TeamChat`, `InboxPage`, team board, notifications.

## Component Organization

- Root shell components live in `src/layouts/`.
- Reusable shared components live in `src/components/`.
- Component subdomains:
  - `activity/` for activity timeline UI.
  - `client/` for client-specific tabs.
  - `custom-fields/` for dynamic field definitions/rendering.
  - `FloatingCalculator/` and `FloatingCalendar/` for global tools.
  - `OADocumentEditor/` for offer/acceptance document generation and DocuSign-related document flows.
  - `onboarding/` for onboarding flow.
  - `record-detail/` for reusable record detail layouts and placeholders.
  - `tasks/` for task editor/list/status UI.
  - `ui/` for small primitives such as status badges, skeletons, and empty states.
- Large components/pages are a technical-debt signal: `Admin.tsx`, `SheetsSyncModal.tsx`, `AIRoleplay.tsx`, `DataTable.tsx`, `Map.tsx`, `ClientProfilePage.tsx`, and `DealDashboard.tsx` are all high-complexity files.

## State And Data Flow

- Global client state is in `src/stores/appStore.ts` using Zustand.
- Firebase auth user state is exposed via `src/hooks/useFirebaseAuthUser.ts`.
- Rep/session identity combines Firebase anonymous auth, saved local rep id, custom claims, and server PIN callables.
- Region state is global and currently supports `brisbane` and `perth`.
- Existing code mixes:
  - legacy all-in-one hooks in `src/hooks/useFirebase.ts`
  - newer service modules in `src/services/*`
  - newer domain hooks in `src/hooks/domain/*`
- New code should prefer smaller services/hooks over expanding `useFirebase.ts`.

## Firebase Usage

- Client Firebase initialization: `src/lib/firebase.ts`.
- Required client env vars:
  - `VITE_FIREBASE_API_KEY`
  - `VITE_FIREBASE_AUTH_DOMAIN`
  - `VITE_FIREBASE_PROJECT_ID`
  - `VITE_FIREBASE_STORAGE_BUCKET`
  - `VITE_FIREBASE_MESSAGING_SENDER_ID`
  - `VITE_FIREBASE_APP_ID`
- Client initializes Firestore with `persistentLocalCache()`, Storage, Auth, and Functions.
- Auth currently calls `signInAnonymously()` when no Firebase user exists.
- Firestore collections used include `leads`, `reps`, `deals`, `dealEvents`, `dealDocuments`, `activityEvents`, `tasks`, `savedViews`, `clientNotes`, `draps`, `commissions`, `appointments`, `settings`, `appSettings`, `settingsHistory`, `auditLogs`, `trainingSessions`, `trainingDocuments`, `trainingVideos`, `trainingRecordings`, `trainingCourses`, `trainingModules`, `userProgress`, `userProfiles`, `userDevices`, `dailyStats`, `sentAlerts`, `properties`, `piaReports`, `smsfReports`, `smsfFinancials`, `calculatorStates`, `teamChat`, `dmChannels`, `teamPosts`, `presence`, `errors`, and lead subcollections.
- Firebase Storage is used through `src/lib/storage.ts` for deal/client/document assets.
- FCM/web push is handled by `src/hooks/useNotifications.ts`, `public/firebase-messaging-sw.js`, and Functions helpers in `functions/src/notifications.ts`.

## Cloud Functions

Exports from `functions/src/index.ts` include:

- Auth/PIN: `verifyPin`, `setPin`, `changePin`, `verifyBackupPassword`, `migrateAuthFields`.
- Settings/audit: `appendAuditEvent`, `updateAppSettingsCallable`, `rollbackAppSettingsCallable`.
- Lead snapshots: `createLeadSnapshotCallable`, `restoreLeadSnapshotCallable`, `deleteLeadSnapshotCallable`.
- DocuSign: `createDocuSignEnvelope`, `resendDocuSignEnvelope`, `voidDocuSignEnvelope`, `syncEnvelopeStatus`, `docusignWebhook`.
- SMSF financial crypto helpers: `saveSmsfFinancials`, `getSmsfFinancials`.
- Scheduled/triggered jobs: `aggregateDailyStats`, `sendDailyReportNotification`, `followUpEngine`, `onDailyStatsWritten`.
- Notification helpers exposed as callables: `sendPushNotification`, `triggerPerfAlert`.
- Placeholder/property insight callable: `getPropertyInsights`.

Security rule for this repo: every callable should call `requireAuth(request)` first unless it is intentionally public and documented. Current audit found exceptions; see `.codex/project-overview.md`.

## Deployment Flow

- Firebase is the active deployment target.
- `npm run deploy` builds the client and deploys Firebase Hosting only.
- `npm run release:deploy` runs `deploy.ps1`.
- `npm run release:dry-run` runs `deploy.ps1 -DryRun`.
- `deploy.ps1` validates local tools, Firebase login, project root, Firebase project target, git state, creates a rollback tag, generates release metadata, runs TypeScript/build validation, then deploys Firestore rules, indexes, hosting, and functions.
- Firebase Hosting rewrites `/docusignWebhook` to the `docusignWebhook` function and falls back all other routes to `/index.html`.
- Vercel is not configured as an app deployment target in this repository.

## Security Model

- Authentication is anonymous Firebase Auth plus custom PIN verification.
- Server auth claims include `repId`, `role`, `region`, `active`, and `allowedRegions`.
- Roles rank `rep < manager < admin < director`.
- Region access should always respect `allowedRegions` and `canAccessRegion()`.
- Sensitive rep fields such as PIN hashes, backup password hashes, role, permissions, active status, allowed regions, and Firebase UID are blocked from normal client updates in Firestore rules.
- Several operational collections are still broadly writable by any authenticated anonymous user; tighter rules depend on completing custom-claim and server-authoritative migrations.
