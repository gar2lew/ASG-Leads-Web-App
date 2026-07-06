# Firestore Architecture Review

Last updated: 6 July 2026

## Scope

This is a documentation-only review of Firestore architecture on `goal/firestore-architecture-review`.

Reviewed surfaces:

- `firebase.json`
- `.firebaserc`
- `firestore.rules`
- `firestore.indexes.json`
- Client Firestore usage in `src`
- Functions Firestore usage in `functions/src`
- Emulator and migration scripts in `scripts` and `src/scripts`
- Repository memory and architecture notes

No code, rules, indexes, Firebase project settings, data, migrations, deploys, or production resources were changed.

## Executive Summary

Firestore is the central operational data layer for ASG CRM. The current architecture is functional and now has emulator-backed rule coverage, but it still carries production risk because many operational collections remain broadly readable and writable by any authenticated app session. The app also has a high listener count, a very broad compatibility hook in `src/hooks/useFirebase.ts`, several potentially expensive full-collection reads in Functions, and some duplicated client write paths.

The most important current strength is that the highest-risk Salestrail collection, `salestrailCalls`, is explicitly denied for all direct client reads and writes. The most important current weakness is that broad operational collections such as `leads`, `deals`, `reps`, `settings`, `appointments`, `draps`, `commissions`, and training collections still rely mainly on `request.auth != null`, which includes anonymous Firebase Auth sessions.

## Deployment and Project Risk

| Surface | Finding | Risk |
| --- | --- | --- |
| `.firebaserc` | Default project is `amplify-leads-2026`. | Very high. Treat as production-like. |
| `firebase.json` | Firestore rules and indexes are deployable from the repo. | Very high if unscoped deploy is run. |
| `firebase.json` | Emulators configured for auth, Firestore, Functions, and UI. | Positive. Supports local validation. |
| `firestore.rules` | Rule changes affect production access boundaries. | Very high. Require explicit approval. |
| `firestore.indexes.json` | Index changes affect query support and deployment surface. | Medium to high. Require validation and approval before deploy. |

## Collection Map

### Core CRM

| Collection | Main usage | Current rule posture |
| --- | --- | --- |
| `leads` | Lead list, lead detail, operational queues, imports, Salestrail matching, phone backfill, follow-ups. | Broad read/write for authenticated app sessions. |
| `leads/{leadId}/presence` | Live editing presence in lead sidebar. | Read, create, update, delete for authenticated app sessions with limited create/update fields. |
| `leads/{leadId}/files` | Lead file and generated document attachment records. | Broad read/write. |
| `leads/{leadId}/notes` | Lead notes. | Broad read/create/update/delete. |
| `leads/{leadId}/dealUpdates` | Lead-specific deal update log. | Read/create allowed, update/delete denied. |
| `reps` | Staff records, PIN auth, role data, notification lookup, Salestrail rep matching. | Broad read/write. Sensitive-field hardening is not yet enforced at this top-level rule. |
| `deals` | Deal dashboard and deal pipeline. | Broad read/write. |
| `dealEvents` | Immutable deal activity log. | Read/create allowed, update/delete denied. |
| `dealDocuments` | Deal and O&A document records. | Broad read/write. |
| `documentInstances` | O&A and document editor instances. | Broad read/write. |
| `docusignEnvelopes` | DocuSign envelope tracking and webhook updates. | Broad read/write. |

### Settings and Administration

| Collection | Main usage | Current rule posture |
| --- | --- | --- |
| `appSettings` | App configuration, integrations, Salestrail settings. | Read allowed. Writes to `appSettings/config` are blocked directly, other docs remain broadly writable. |
| `settings` | Legacy and reporting settings. | Broad read/write. |
| `settingsHistory` | Settings audit and rollback history. | Read only for non-anonymous authenticated users, writes denied to clients. |
| `auditLogs` | Server and selected client audit records. | Read only for elevated roles, writes denied to clients. |
| `audit` | Legacy audit collection. | Read only for elevated roles, writes denied to clients. |
| `customPinTypes` | PIN/admin custom settings. | Broad read/write. |
| `scripts` | Script content. | Read for app sessions, write only elevated role. |

### Staff Workflow and Content

| Collection | Main usage | Current rule posture |
| --- | --- | --- |
| `appointments` | Calendar and lead appointment views. | Broad read/write. |
| `calendarServiceTypes` | Appointment service type configuration. | Broad read/write. |
| `clientNotes` | Client-level notes and AI brief source. | Read/create/update/delete with light field guards. |
| `clientGroups` | Linked client groups and partner records. | Broad read/write. |
| `knowledgeBase` | Knowledge base articles. | Broad read/write. |
| `documentLibrary` | Document centre library. | Broad read/write. |
| `formTemplates` | Form and PDF templates. | Broad read/write. |
| `teamChat` | Team chat messages. | Read/create/update allowed, delete denied. |
| `dmChannels/{channelId}/messages` | Direct messages. | Read/create/update allowed, delete denied. |
| `teamPosts` | Team board posts. | Broad read/create/update/delete. |
| `presence` | Team chat presence. | Authenticated create/update/delete with light field guards. |
| `userDevices` | FCM token storage. | Read allowed, create/update constrained, delete allowed. |
| `userProfiles` | User profile and voice sample references. | Firebase UID owner only. |
| `users/{uid}/dashboard` | Dashboard layout. | Firebase UID owner only. |
| `users/{uid}/repSettings` | Rep settings. | Firebase UID owner only. |
| `users/{uid}/dailyHistory` | Rep daily snapshots. | Firebase UID owner only. |

### Training, Reporting, and Analytics

| Collection | Main usage | Current rule posture |
| --- | --- | --- |
| `trainingSessions` | Training and roleplay session records. | Broad read/write. |
| `trainingDocuments` | Training library documents. | Broad read/write. |
| `trainingVideos` | Training video library. | Broad read/write. |
| `trainingRecordings` | Training recording library. | Broad read/write. |
| `trainingCourses` | Course setup. | Read allowed, write elevated only. |
| `trainingModules` | Module setup. | Read allowed, write elevated only. |
| `userProgress` | Training progress. | Read allowed, create/update constrained by deterministic id. |
| `dailyStats` | Aggregated daily reporting. | Read allowed, client writes denied. |
| `sentAlerts` | Notification dedupe records. | Read allowed, client writes denied. |
| `errors` | Client error logging. | Create/read allowed, update/delete denied. |
| `analyticsEvents` | Onboarding and analytics events. | Create allowed, read elevated only, update/delete denied. |
| `piaReports` | PIA calculator reports. | Broad read/write. |
| `smsfReports` | SMSF calculator reports. | Broad read/write. |
| `smsfFinancials` | Encrypted SMSF financial data. | Elevated non-anonymous role only. |
| `calculatorStates` | PIA/SMSF draft calculator state. | Broad read/write. |

### Callable-Only and System Data

| Collection | Main usage | Current rule posture |
| --- | --- | --- |
| `salestrailCalls` | Salestrail imported call records. | Direct client read/write denied. Callable/server only. |
| `properties` | Property insights placeholder data. | Read allowed, client writes denied. |

## Index Review

`firestore.indexes.json` currently defines 26 composite indexes:

| Collection group | Count | Notes |
| --- | ---: | --- |
| `salestrailCalls` | 7 | Strongest index coverage. Covers common filters by lead, rep, status, direction, batch, region, and created time. |
| `leads` | 3 | Covers region plus updated time, status plus lead date, and DQ rep plus lead date. |
| `dailyStats` | 2 | Covers date/rep and rep/date access. |
| `trainingSessions` | 2 | Covers rep and partial session views. |
| `auditLogs` | 2 | Covers target type and user id with timestamp. |
| `errors` | 2 | Covers date and user id with timestamp. |
| `userDevices` | 2 | Covers user/platform and user/token lookups. |
| Other indexed groups | 1 each | `appointments`, `clientNotes`, `commissions`, `draps`, `sentAlerts`, `settingsHistory`. |

Potential index gaps to test before any index deploy:

- `teamPosts`: `where("teamId", "==", teamId)`, `orderBy("pinned", "desc")`, `orderBy("createdAt", "desc")`.
- `userNotes`: `where("userId", "==", userId)`, `orderBy("pinned", "desc")`, `orderBy("createdAt", "desc")`.
- `documentInstances`: `where("dealId", "==", dealId)`, `orderBy("createdAt", "desc")`.
- `dealDocuments`: `where("dealId", "==", dealId)`, `orderBy("createdAt", "desc")`.
- `piaReports`: `where("userId", "==", currentUser.id)`, `orderBy("createdAt", "desc")`.
- `smsfReports`: `where("userId", "==", currentUser.id)`, `orderBy("createdAt", "desc")`.
- `userDevices`: Functions query `userId == repId` and `active == true`, while current indexes cover `userId/platform` and `userId/token`.
- `docusignEnvelopes`: repeated lookups by `envelopeId`, and lookup by `dealId` plus `oaDocumentInstanceId`.

These are not deploy recommendations yet. They are candidates for emulator and staging validation.

## Rules Review

### Strong areas

- `salestrailCalls` denies all direct client reads and writes.
- `auditLogs`, `audit`, and `settingsHistory` deny client writes.
- `appSettings/config` direct writes are blocked.
- `dailyStats`, `sentAlerts`, and `properties` deny client writes.
- `dealEvents` are immutable after create.
- `users/{uid}/...` and `userProfiles/{uid}` use Firebase UID ownership.
- `smsfFinancials` requires elevated non-anonymous roles.

### Risk areas

- `canUseOperationalApp()` only checks `request.auth != null`. Anonymous Firebase Auth sessions satisfy this helper.
- Broad read/write access remains on `leads`, `reps`, `deals`, `dealDocuments`, `documentInstances`, `docusignEnvelopes`, `draps`, `commissions`, `invoiceDrafts`, `knockZones`, `customPinTypes`, `clientGroups`, `settings`, `appointments`, `knowledgeBase`, `documentLibrary`, `formTemplates`, `trainingSessions`, `trainingDocuments`, `trainingVideos`, `trainingRecordings`, `calculatorStates`, and several nested lead collections.
- `reps` remains broadly writable even though it contains auth-sensitive fields such as role, active state, PIN and backup-password material, region access, permissions, and Firebase UID linkage.
- `settings` remains broadly writable despite the newer callable-authoritative `appSettings/config` path.
- Some client paths still attempt direct writes to areas that rules deny or intend to migrate behind callables, such as audit and settings-adjacent data.

## Reads, Listeners, and Queries

Repository scan counts across `src`, `functions/src`, and scripts:

| Operation | Count |
| --- | ---: |
| `onSnapshot` | 51 |
| `getDocs` | 18 |
| `getDoc` | 24 |
| `getCountFromServer` | 5 |
| `setDoc` | 45 |
| `addDoc` | 35 |
| `updateDoc` | 31 |
| `deleteDoc` | 25 |
| `writeBatch` | 5 |
| `runTransaction` | 3 |

Largest client Firestore hotspots:

| File | Listener count | Write count | Notes |
| --- | ---: | ---: | --- |
| `src/hooks/useFirebase.ts` | 27 | 39 | Central compatibility hook for most operational collections. Highest read/write concentration. |
| `src/hooks/useTrainingLibrary.ts` | 3 | 12 | Training content management. |
| `src/hooks/useDashboard.ts` | 2 | 5 | Per-user dashboard documents and daily history. |
| `src/pages/DealDashboard.tsx` | 0 | 7 | Deal status, note, creation, and lead deal id updates. |
| `src/pages/DealPipeline.tsx` | 0 | 7 | Parallel or legacy deal workflow with duplicated write shape. |
| `src/components/LeadSidebar.tsx` | 1 | 5 | Presence, files, and audit writes. |
| `src/pages/TrainingHub.tsx` | 4 | 1 | Multiple listeners for training collections and progress. |

Notable read patterns:

- `useLeads()` reads the active region page with `where("region", "==", activeRegion)`, `orderBy("updatedAt", "desc")`, and `limit(PAGE_SIZE)`.
- `useFullCrmLeadSyncIndex()` pages through `leads` by document id for sync indexing.
- `useOperationalQueueLeads()` opens four simultaneous lead queue queries for callbacks, next contact, stale calls, and new/DQ/no-answer status.
- `useCrmLeadStatusSummary()` and related hooks use server count queries against `leads`.
- `aggregateDailyStats` reads full `leads`, `trainingSessions`, `commissions`, `draps`, and active `reps` collections on schedule.
- `phoneMigration` reads the full `leads` collection before dry-run or write processing.
- Salestrail matching queries `leads` and `reps` by phone and reps by email in chunks.

## Writes and Duplicate Write Paths

Likely duplicate or overlapping write paths:

- `src/pages/DealDashboard.tsx` and `src/pages/DealPipeline.tsx` both update deal status, notes, generic deal fields, create deals, and write `dealId` back to `leads`.
- Lead file records can be added from `LeadSidebar`, `DocumentCentre`, `FormFillerModal`, and `PdfFormFillerModal`.
- Client notes can be created from multiple helpers in `useClientNotes`.
- Error logs can be written by both `src/lib/errorHandler.ts` and `src/lib/logger.ts`.
- Audit log writes exist in callables and selected client UI paths. Rules deny direct client writes to `auditLogs`, so client attempts should be checked for silent failures or migrated to `appendAuditEvent`.
- `useAppSettings.ts` listens to `appSettings/config` and attempts to seed defaults with `setDoc(CONFIG_DOC, DEFAULT_APP_CONFIG, { merge: true })`; rules deny direct writes to `appSettings/config`, so this may produce expected caught failures until fully callable-authoritative.
- `useDailyStats.ts` includes a direct `dailyStats` save helper, but rules deny client writes to `dailyStats`. This should be treated as legacy or admin-only behaviour needing verification before use.

## Expensive Read Risks

| Path | Risk | Notes |
| --- | --- | --- |
| `functions/src/index.ts` `aggregateDailyStats` | High | Full reads of several growing collections on schedule. Cost grows with total data, not changed data. |
| `functions/src/phoneMigration.ts` | High | Full `leads` collection read. Safe only as dry-run-first, approval-gated tooling. |
| `src/hooks/useFullCrmLeadSyncIndex()` | Medium to high | Paginates all leads for sync indexing. Must stay intentional and bounded by UI needs. |
| `src/hooks/useOperationalQueueLeads()` | Medium | Four concurrent live lead listeners can overlap results and increase read churn. |
| `TrainingHub` user progress listener | Medium | `collection(db, "userProgress")` without user filter can grow expensive. |
| Team chat and direct messages | Medium | `limit(150)` helps, but active listeners on chat can still create read churn. |
| `clientNotes` and AI brief reads | Medium | Notes query is capped in AI path but live client notes can grow over time. |
| Salestrail matching | Medium to high | Chunked phone/email lookups are necessary, but depend on normalised phone fields and careful batch sizing. |

## Security and Data Integrity Risks

1. Broad `canUseOperationalApp()` access remains the main Firestore rules risk.
2. `reps` direct writes remain sensitive because they may affect auth and role data.
3. Client-writeable operational collections can bypass server-side audit and validation.
4. Full-collection scheduled reads can become costly and slow as data grows.
5. Duplicate deal and lead file write paths increase the chance of inconsistent fields.
6. Some direct client writes appear misaligned with current rules and may be failing silently or relying on catches.
7. Index coverage is strong for Salestrail and core lead views but incomplete for some newer staff workflow queries.

## Recommended Follow-Up

1. Add a Firestore access matrix that maps every collection to owner, allowed direct client operations, callable-only operations, and required tests.
2. Create an index validation goal that runs emulator or local query checks for the potential index gaps before proposing any index file change.
3. Create a server-authoritative reps/settings hardening proposal before changing rules.
4. Audit client attempts to write `auditLogs`, `dailyStats`, and `appSettings/config`.
5. Review full-collection scheduled Functions and replace with incremental summaries where safe.
6. Consolidate duplicated deal write logic behind a shared service after validation coverage is in place.
7. Keep all Firestore rules and index changes blocked until explicitly approved.
