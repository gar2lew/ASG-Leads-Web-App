# AI Foundation Data Audit

Date: 2026-07-06
Branch: `goal/ai-foundation`
Savepoint: `savepoint-before-ai-foundation`

## Objective

Audit whether the CRM has the data structures needed for an AI-ready lead record.

This audit is documentation only. It does not change schema, application code, Firebase configuration, Firestore rules, production data, Salestrail data, migrations, or deployment resources.

## Summary

The CRM has most of the raw ingredients needed to build AI-assisted lead context, but they are spread across several surfaces:

- Embedded fields on `Lead`, including status, result, appointment summary fields, callback fields, `notes`, `lastCall`, `callHistory`, `activities`, and deal fields.
- Lead subcollections under `leads/{leadId}`, including `notes`, `files`, `dealUpdates`, and broad wildcard subcollections.
- Top-level operational collections such as `appointments`, `clientNotes`, `dealDocuments`, `documentInstances`, `dealEvents`, and `salestrailCalls`.
- Derived recommendation engines in `src/lib/nextAction.ts`, `src/hooks/useAIGuidance.ts`, and `src/lib/aiInsights.ts`.
- Personal dashboard task structures in `users/{userId}/dashboard`, including quick notes and todo items.

The main AI foundation gap is not absence of all data. The main gap is lack of a canonical per-lead context model that reliably joins notes, calls, appointments, status changes, documents, tasks, and recommendations into one permission-aware view.

## Files Reviewed

- `src/types/index.ts`
- `src/hooks/useFirebase.ts`
- `src/hooks/useClientNotes.ts`
- `src/hooks/useDashboard.ts`
- `src/components/LeadSidebar.tsx`
- `src/components/CallLogger.tsx`
- `src/components/DataTable.tsx`
- `src/components/AppointmentModal.tsx`
- `src/pages/ClientProfilePage.tsx`
- `src/pages/ClientHub.tsx`
- `src/pages/InboxPage.tsx`
- `src/pages/MyDashboard.tsx`
- `src/pages/DealPipeline.tsx`
- `src/pages/DealDashboard.tsx`
- `src/lib/nextAction.ts`
- `src/lib/workflowState.ts`
- `src/lib/aiInsights.ts`
- `src/lib/automation.ts`
- `firestore.rules`
- `docs/firestore-review.md`

## Lead Intelligence Matrix

| Required area | Current data source | Present for every lead | AI readiness | Missing data |
| --- | --- | --- | --- | --- |
| Timeline | Derived from `Lead` fields, `callHistory`, lead notes, appointments, files, deal updates, deal events, and document records. Deal pages already build local activity timelines from deal notes and call history. | No | Partial | No canonical `leadTimelineEvents` model, no single ordering contract, no source tagging across all events, no guaranteed empty state record. |
| History | `Lead.activities`, `callHistory`, `dealUpdates`, `dealEvents`, audit collections, appointment status, and document timestamps. | No | Partial | No unified lead history contract. Audit logs are server-oriented and not consistently tied to lead context. `activities` exists on the type but is not the clear system of record. |
| Notes | Legacy `Lead.notes`, `leads/{leadId}/notes`, top-level `clientNotes`, appointment notes, and deal notes. | Partial | Medium | Multiple note stores with different shape, ownership, source, and timestamps. No documented precedence between legacy lead notes and structured note collections. |
| Calls | Embedded `Lead.callHistory`, `lastCall`, call logger writes, reporting reads, and Salestrail imported `salestrailCalls`. | Partial | Medium | Salestrail calls are callable-only and not directly joined into lead UI context. Legacy call history is embedded in the lead document, which can become large and is hard to source-tag. |
| Appointments | Top-level `appointments` with `linkedLeadId`, plus embedded summary fields such as `appointmentDate`, `appointmentTime`, `fcAppt`, `frAppt`, and `psAppt`. | Partial | Medium | No guaranteed appointment context object per lead. Appointment outcomes are split between general appointment status and deal-stage appointment fields. |
| Status history | Current `Lead.status`, `result`, workflow-derived state, `dnqFellOver`, `dealStage`, settlement fields, and some stage-change/deal update structures. | No | Low | No canonical `statusHistory` array or subcollection was identified. Missing actor, timestamp, previous status, next status, reason, and source for each transition. |
| Documents | `leads/{leadId}/files`, `dealDocuments`, `documentInstances`, form templates, library documents, and appointment documents on `fcAppt`, `frAppt`, `psAppt`. | Partial | Medium | No single per-lead document index that joins lead files, deal documents, generated documents, and appointment attachments. |
| Tasks | Derived operational queue tasks in `InboxPage`, `nextAction`, dashboard `QuickNote` and `TodoItem` structures, and linked quick notes via `linkedLeadId`. | No | Low | No canonical lead task collection or lead-linked task lifecycle. Personal todos are user dashboard data, not durable lead workflow tasks. |
| Recommendations | `getNextAction`, `useAIGuidance`, and `aiInsights` derive next actions, scripts, client briefs, and risk cues from lead data, notes, appointments, and call history. | Derived only | Medium | Recommendations are not persisted with explanation, inputs, version, confidence, or approval state. Dashboard recommendations can run without full notes and appointments context. |

## Detailed Findings

### Timeline

There is no single persisted lead timeline. Current timelines are assembled locally by screens such as lead sidebar, client profile, deal pipeline, and deal dashboard.

This is acceptable for present UI behaviour, but it is weak for AI because each surface can include a different subset of events. An AI assistant should not infer that the absence of timeline events means no activity occurred unless the context builder has explicitly loaded all relevant sources.

Recommended next step: define a derived `LeadAIContext` view model before any schema change. It should merge the lead document, lead notes, appointments, files, deal updates, documents, and Salestrail call summaries into a stable event list.

### History

Lead history is currently distributed across embedded fields, audit-oriented collections, deal events, deal updates, and call history. Some records are immutable, while others are editable.

The missing structure is a lead-scoped history contract that can answer:

- Who changed the lead.
- What changed.
- When it changed.
- Why it changed.
- Whether the event came from UI, callable, import, migration, Salestrail, or system automation.

Recommended next step: document a lead history event type and build it as a derived read model first.

### Notes

The CRM has several note surfaces:

- `Lead.notes` as a legacy text field.
- `leads/{leadId}/notes` as structured lead notes.
- `clientNotes` as centralised client notes.
- Appointment notes, created through appointment flows.
- Deal updates and deal notes.

This gives staff flexibility, but AI needs a normalised note packet with source, author, timestamp, importance, and lead or client relationship.

Recommended next step: create a note normalisation plan that preserves all existing note stores and only changes how they are read into AI context.

### Calls

The current lead call model is split between:

- `Lead.callHistory`, used heavily across reporting, dashboard, lead list, lead sidebar, workflow state, and call logging.
- `salestrailCalls`, which is denied to direct client reads and intended for callable/server access.

The Firestore rule denial on `salestrailCalls` is a strength. The AI gap is that Salestrail calls are not yet safely reconciled into the per-lead context used by frontend recommendations.

Recommended next step: expose Salestrail call summaries through a callable-only read model or derived local fixture first. Do not give direct client access to `salestrailCalls`.

### Appointments

Appointments are relatively strong. The top-level `appointments` collection supports `linkedLeadId`, and `useLeadAppointments` loads linked appointments for a lead. The lead type also includes older appointment summary and deal-stage appointment structures.

The gap is consistency. AI context needs one normalised appointment list that includes top-level appointments and deal appointment outcomes without double-counting.

Recommended next step: define appointment normalisation rules, including how `fcAppt`, `frAppt`, `psAppt`, and top-level `appointments` relate.

### Status History

The current state of a lead is well represented, but the path taken to reach that state is not.

Fields such as `status`, `result`, `dealStage`, `dnqFellOver`, `settlementDate`, and `dealComplete` support current workflow decisions. They do not provide a full status transition history.

Recommended next step: propose a `statusHistory` model before implementation. It should include actor, timestamp, previous status, next status, reason, source, and optional related event ID.

### Documents

Document data exists across lead files, deal documents, document instances, form templates, document library records, and appointment document arrays.

The missing piece is a lead-level document index or derived document view. AI should be able to answer which documents exist, which are missing, which are stale, and which are linked to a deal or appointment.

Recommended next step: create a derived document inventory for AI context. Avoid moving files or changing Storage paths during the first phase.

### Tasks

There are task-like experiences, but no durable lead task model.

Current task surfaces include:

- Operational queue tasks derived from `useOperationalQueueLeads` and `getNextAction`.
- Personal dashboard todo items in `users/{userId}/dashboard`.
- Quick notes that can optionally link to a lead.

These are useful workflow aids, but they do not provide a lead task lifecycle with assignment, due date, status, completion reason, and related lead event.

Recommended next step: design a lead task model and keep the first implementation read-only or derived until the workflow has approval.

### Recommendations

Recommendations are deterministic and derived from current lead state. `getNextAction` is a useful foundation because it is pure logic and can be tested. `useAIGuidance` and `aiInsights` provide guidance, scripts, summaries, and risk cues.

The current limitation is explainability and context completeness. Some screens compute recommendations without full notes, appointments, Salestrail calls, or documents.

Recommended next step: add a versioned recommendation envelope before using recommendations for AI automation. The envelope should include inputs loaded, inputs missing, recommendation version, reason, confidence, and whether a human accepted or ignored it.

## Missing Data Register

| Gap | Impact | Proposed owner | Safe next action |
| --- | --- | --- | --- |
| Canonical per-lead timeline | AI and staff can see different histories depending on screen. | Product and engineering | Define a derived timeline view model. |
| Canonical status history | Cannot reliably explain workflow transitions. | Engineering | Draft `statusHistory` proposal and tests before schema change. |
| Normalised note packet | Notes are fragmented across lead, client, appointment, and deal surfaces. | Engineering | Create note normalisation rules. |
| Salestrail call summaries in lead context | Imported calls are protected but not yet consistently available to AI context. | Engineering and release manager | Use callable-only summaries, never direct client reads. |
| Lead task lifecycle | Operational tasks are derived or personal, not durable lead workflow records. | Product | Define task lifecycle and approval rules. |
| Document inventory | Documents exist in multiple places without one lead-level view. | Operations and engineering | Build a derived document inventory first. |
| Recommendation envelope | Recommendations are not persisted with inputs, version, or confidence. | Engineering | Define a versioned recommendation result object. |
| Source and actor consistency | Events cannot always prove who or what created them. | Engineering | Standardise event metadata for future writes. |
| Permission-aware AI context | Current AI inputs are assembled in UI code and may vary by surface. | Security and engineering | Build a central context builder that respects role and region. |

## Firebase and Security Notes

- `salestrailCalls` correctly denies all direct client reads and writes in `firestore.rules`.
- Lead subcollections currently allow operational users to read and write several surfaces, including a broad wildcard under each lead. This is compatible with current UI, but it is not ideal for future AI-generated writes.
- `auditLogs` and `audit` are read-only to elevated users and cannot be written directly by clients.
- `dailyStats` and `sentAlerts` are read-only to clients.
- Any future AI write action should go through server-authoritative callables with explicit role, region, dry-run, and audit controls.

## AI Foundation Readiness

Current readiness: **partial**.

The CRM can support an AI assistant that reads and summarises lead context if the assistant uses a conservative context builder and clearly reports missing sources. It is not ready for autonomous AI writes or decisions.

Before AI-assisted actions are enabled, the project should add:

- A derived `LeadAIContext` builder.
- Fixtures for leads with no activity, legacy notes only, structured notes, call history, appointments, documents, Salestrail calls, and deal records.
- Unit tests for recommendation logic with missing and partial data.
- Emulator tests for any callable that reads protected lead intelligence.
- A strict rule that AI can suggest actions before it can perform actions.

## Safe Implementation Sequence

### Stage 0: Audit only

Completed by this document.

### Stage 1: Derived context model

Create a read-only `LeadAIContext` type and builder. It should not change Firestore schema or production data.

### Stage 2: Fixtures and tests

Add fixtures covering complete, partial, empty, legacy, and imported lead data. Test that missing data is reported instead of guessed.

### Stage 3: UI integration

Use the derived context in lead sidebar and client profile recommendations. Preserve existing behaviour.

### Stage 4: Callable read model

If Salestrail call summaries or protected data are needed, add callable-only read access with emulator tests and no direct client reads.

### Stage 5: Schema proposal

Only after the derived model is proven, propose schema additions for timeline, status history, tasks, and recommendation envelopes.

## Blocked Work

The following must remain blocked until explicitly approved:

- Production Firebase reads or writes for this audit.
- Firestore schema changes.
- Firestore rules changes.
- Salestrail live sync.
- Phone normalisation writes.
- Migration scripts.
- Firebase deploys.
- AI-generated writes to lead records.

## Validation

This audit should be validated with:

- `git diff --check`
- Documentation dash scan for m-dash and en-dash characters
- Review of changed files before commit
