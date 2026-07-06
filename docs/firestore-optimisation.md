# Firestore Optimisation Plan

Last updated: 6 July 2026

## Objective

Reduce Firestore cost, rules risk, query fragility, and duplicate write behaviour without changing production data or weakening staff workflows.

This plan is documentation only. It does not approve rules changes, index deploys, migrations, live Salestrail sync, phone backfill writes, or production Firebase deploys.

## Guiding Principles

- Keep production Firebase safe by default.
- Prove query and rule changes in the emulator first.
- Prefer callable-authoritative writes for sensitive workflows.
- Keep staff workflows fast and predictable.
- Reduce listener count where the same screen can use scoped reads or derived summaries.
- Do not replace broad rules in one step. Tighten by collection family with tests and rollback.

## Priority 0: Approval Gates

| Action | Status |
| --- | --- |
| Deploy Firestore rules | Blocked without explicit approval. |
| Deploy Firestore indexes | Blocked without explicit approval. |
| Run live migrations | Blocked without explicit approval. |
| Run phone normalisation with `dryRun:false` | Blocked without explicit approval. |
| Run live Salestrail sync | Blocked without explicit approval. |
| Write production data | Blocked without explicit approval. |

## Priority 1: Access Matrix and Rule Hardening Plan

Create a collection access matrix before any rules change.

Required columns:

- Collection
- Current direct client read
- Current direct client create
- Current direct client update
- Current direct client delete
- Desired direct client access
- Desired callable-only access
- Required role or region check
- Emulator rule test required
- Rollback note

Initial hardening candidates:

1. `reps`: block direct writes to role, active status, PIN, backup password, permissions, Firebase UID, and region access fields.
2. `settings`: move high-impact settings writes behind callables or `appSettings/config`.
3. `leads`: preserve staff workflow while adding region-aware access and sensitive-field guards.
4. `deals` and `dealDocuments`: add owner or role-aware write constraints after deal workflow tests exist.
5. `trainingSessions` and training libraries: separate staff read from admin write.
6. `docusignEnvelopes`: restrict direct client writes once document workflow callables are confirmed.

Validation before any hardening:

- `npm run test:emulator:rules`
- `npm run test:emulator:firestore-smoke`
- `npm run test:emulator:callables-dry-run`
- Targeted manual staff workflow checks in emulator or disposable test project

## Priority 2: Index Validation

Do not edit `firestore.indexes.json` until each query has been reproduced and confirmed to need a composite index.

Index candidates to validate:

| Query owner | Collection | Query shape | Why it matters |
| --- | --- | --- | --- |
| Team board | `teamPosts` | `teamId ==`, `pinned desc`, `createdAt desc` | Staff board may fail or degrade as posts grow. |
| My dashboard | `userNotes` | `userId ==`, `pinned desc`, `createdAt desc` | Personal notes need predictable ordering. |
| O&A document editor | `documentInstances` | `dealId ==`, `createdAt desc` | Deal document history should load reliably. |
| Deal documents | `dealDocuments` | `dealId ==`, `createdAt desc` | Deal document timeline should be fast. |
| Client reports | `piaReports` | `userId ==`, `createdAt desc` | Recent report history should be fast. |
| Client reports | `smsfReports` | `userId ==`, `createdAt desc` | Recent report history should be fast. |
| Notifications | `userDevices` | `userId ==`, `active == true` | Push notification fan-out should be efficient. |
| DocuSign | `docusignEnvelopes` | `envelopeId ==`; `dealId ==` and `oaDocumentInstanceId ==` | Webhook and envelope operations must be reliable. |

Recommended validation process:

1. Add emulator seed fixtures for each candidate collection.
2. Run the exact query in emulator.
3. Record whether Firestore requests a composite index.
4. Add only proven indexes.
5. Run `firebase emulators:exec` against the demo project.
6. Keep index deploy blocked until release approval.

## Priority 3: Listener Reduction

`src/hooks/useFirebase.ts` is the largest listener concentration with 27 `onSnapshot` calls. Listener count is not automatically bad, but many live listeners can increase read churn and make screen performance harder to reason about.

Recommended approach:

1. Keep live listeners for data that changes while staff are viewing it, such as active lead lists, appointments, chat, and presence.
2. Convert low-change reference data to cached one-shot reads where safe, such as service types, document templates, knowledge base metadata, and training catalogues.
3. Avoid mounting hidden screen listeners. Confirm that inactive pages do not subscribe unnecessarily.
4. Add screen-level loading boundaries so heavy listeners are opened only when their workflow is active.
5. Measure before and after with emulator logs or Firebase usage metrics in a non-production environment.

High-priority listener review candidates:

- `useOperationalQueueLeads()` because it opens four lead listeners at once.
- `TrainingHub` because it listens to `userProgress` without a user filter.
- Team chat and direct messages because message listeners can churn heavily during active use.
- `appointments` because the current base listener orders all appointments by date and start time.
- `dealDocuments`, `documentInstances`, and report listeners because they may only need to load when a specific tab is active.

## Priority 4: Expensive Function Reads

### `aggregateDailyStats`

Current risk:

- Reads full `leads`, `trainingSessions`, `commissions`, `draps`, and active `reps` collections.
- Cost grows with total historical data.

Optimisation options:

1. Use date-bounded queries where possible.
2. Maintain rolling summary documents from write-time events.
3. Split per-region or per-day aggregation.
4. Store checkpoint metadata so only changed windows are recalculated.

Validation:

- Compare aggregate output against a seeded data fixture.
- Run Functions build and relevant tests.
- Do not deploy without release approval.

### Phone normalisation

Current risk:

- Reads all leads and may update many lead records when `dryRun:false`.

Optimisation options:

1. Keep dry-run first.
2. Page through leads with checkpoints.
3. Store affected-count and sample output.
4. Require export, approval, and reconciliation before writes.

### Salestrail matching

Current risk:

- Chunked phone and email lookups are necessary but can be expensive if phone fields are inconsistent.

Optimisation options:

1. Ensure normalised phone fields exist and are indexed by default single-field indexes.
2. Keep `salestrailCalls` writes server-only.
3. Add a no-network mock seam for Salestrail dry-run tests.
4. Reconcile imported count to actual `salestrailCalls` document count after any approved live test.

## Priority 5: Duplicate Write Consolidation

Do not consolidate until existing workflows are covered by tests or manual checks.

Candidates:

| Duplicate area | Files | Proposed destination |
| --- | --- | --- |
| Deal status, notes, creation, and lead deal id updates | `src/pages/DealDashboard.tsx`, `src/pages/DealPipeline.tsx` | Shared deal service or hook. |
| Lead file records | `LeadSidebar`, `DocumentCentre`, `FormFillerModal`, `PdfFormFillerModal` | Shared lead file service. |
| Client notes creation | `useClientNotes` helpers | Single client notes service. |
| Error logging | `src/lib/errorHandler.ts`, `src/lib/logger.ts` | Single logging adapter. |
| Audit log creation | Client UI paths and Functions callables | Prefer `appendAuditEvent` callable or server-side audit. |

Acceptance criteria:

- Existing behaviour preserved.
- No rules weakened.
- Emulator rules still pass.
- Build and tests pass.
- Staff workflow smoke checks pass.

## Priority 6: Misaligned Client Writes

Audit and resolve direct client writes that appear blocked or discouraged by rules:

- `appSettings/config` seeding from `useAppSettings.ts`.
- `dailyStats` writes from `useDailyStats.ts`.
- Client `auditLogs` writes from pages and components.

Resolution options:

1. Remove dead write paths if unused and proven safe.
2. Replace with callables if the workflow is required.
3. Keep as documented legacy behaviour only if a current user workflow depends on it and a migration plan exists.

## Priority 7: Collection Growth Controls

Recommended controls:

- Add retention policy proposals for `errors`, `presence`, `teamChat`, `dmChannels`, `auditLogs`, `salestrailCalls`, and `sentAlerts`.
- Keep audit logs long enough for compliance and release investigation.
- Use scheduled cleanup only after approval and dry-run reporting.
- Avoid deleting production data without explicit approval and backup.

## Proposed Roadmap

### Stage 0: No change

- Keep this review as the reference document.
- No deploys, data writes, or Firebase resource changes.

### Stage 1: Emulator query inventory

- Add or run query smoke tests for candidate indexes.
- Record missing index messages.
- No index deploy.

### Stage 2: Client write alignment audit

- Confirm which direct writes are active, blocked, or legacy.
- Create a proposal for each blocked write path.
- No code change unless separately approved.

### Stage 3: Rules hardening proposal

- Build the collection access matrix.
- Add failing tests that represent desired access.
- Propose narrow rules changes.
- Stop for approval before changing rules.

### Stage 4: Listener and cost optimisation

- Profile read churn in emulator or non-production environment.
- Convert low-change listeners to scoped reads where safe.
- Validate staff screens after each small change.

### Stage 5: Duplicate write refactor

- Extract shared write services for deal updates, lead files, client notes, errors, and audit events.
- Keep existing exported hooks and UI behaviour stable.

## Quality Gates

Before any Firestore optimisation implementation:

- Clean branch and savepoint tag.
- Explicit scope and non-goals.
- Emulator validation plan.
- No production data access.
- No deploy.
- No rules or index deploy without approval.

Before merge:

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm test`
- `npm run test:emulator:preflight`
- `npm run test:emulator:rules`
- `npm run test:emulator:firestore-smoke`
- `npm run test:emulator:callables-dry-run`
- `cd functions && npm run build`
- `cd functions && npm run test:settings-admin`
- `git diff --check`

## Current Recommendation

The next safest goal is:

Reach Goal: Firestore Access Matrix

Objective:

- Document desired collection-level access and produce emulator tests for the highest-risk rules boundaries.

Non-goals:

- No rules changes.
- No index changes.
- No deploy.
- No production data access.
- No live migrations, Salestrail sync, or phone backfill writes.
