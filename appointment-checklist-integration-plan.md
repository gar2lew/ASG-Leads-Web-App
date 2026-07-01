# Appointment Checklist Integration Plan

## Executive Summary

Integrate the standalone Appointment Checklist as a CRM-native workflow connected to calendar appointments, leads, staff identity, draft persistence, and client document storage.

Recommended approach: **port or wrap the standalone checklist into a native CRM React page**, rather than exposing it as a disconnected static calculator-style tool. A native integration gives the checklist access to authenticated staff context, appointment and lead prefill, Firestore draft saves, role-based review, and PDF storage in the existing client/document workflow.

Discovery note: a clearly named standalone Appointment Checklist application was not found in the current workspace. This plan therefore treats the standalone app as an external artifact to be reviewed before implementation. If it is later supplied, run a source audit against this plan before coding.

## Current CRM Context

Relevant existing CRM foundations:

- Calendar appointments are already modeled in Firestore through the `appointments` collection.
- Appointment creation already links to leads via `linkedLeadId`.
- Appointment notes can already create centralized client notes.
- Authentication uses Firebase anonymous auth plus custom PIN verification and custom claims.
- Staff access is role and region aware through `rep`, `manager`, `admin`, and `director` style claims.
- PDF generation already exists in the CRM through `jsPDF`, `pdf-lib`, and Document Centre patterns.
- Static standalone tools already exist for SMSF and PIA through Firebase Hosting rewrites, but Appointment Checklist needs deeper CRM state than those calculators.

The Appointment Checklist should be treated as an operational CRM workflow, not just an embedded utility.

## Integration Recommendation

### Option A: Native CRM Page, Recommended

Build the checklist as a CRM page/component using the existing React, Firebase, Tailwind, and document tooling.

Benefits:

- Uses current staff authentication and claims.
- Can prefill from appointment, lead, rep, service type, and region.
- Supports reliable Firestore draft storage.
- Enables manager/admin review.
- Works with existing mobile shell and sidebar navigation.
- Can save generated PDFs into the client/deal document workflow.
- Avoids iframe limitations around mobile layout, auth handoff, file generation, and autosave.

### Option B: Embedded Standalone App With Bridge

Use only if the standalone app is large, stable, and cannot be ported in the first release.

Required bridge:

- CRM opens `/standalone/appointment-checklist/index.html` inside a controlled wrapper.
- CRM sends appointment, lead, staff, permissions, and draft payload through `postMessage`.
- Standalone app sends draft updates, completion events, validation results, and PDF payloads back through `postMessage`.
- CRM remains the system of record for saving drafts, generating/uploading PDFs, and navigation.

This is faster initially but weaker for authentication, mobile polish, versioning, and debugging.

### Option C: Static Standalone Tool Only

Not recommended. A public or semi-public standalone checklist would not satisfy CRM requirements for authenticated staff workflow, draft continuity, matched appointment context, document storage, or manager oversight.

## Sidebar Navigation

Add a new sidebar entry named **Appointment Checklists** or **Checklists**.

Recommended placement:

- Primary: near `Calendar`, because staff will usually start a checklist from a booked appointment.
- Secondary contextual entry points:
  - Appointment modal: `Start Checklist` / `Continue Checklist`.
  - Calendar appointment card: checklist status indicator and quick launch.
  - Lead/client profile: appointment history row with checklist status.
  - Document Centre: generated checklist PDFs visible as client documents.

Navigation behavior:

- Sidebar opens the checklist dashboard/list view.
- Calendar/contextual launch opens a specific appointment checklist.
- If an appointment has no checklist, launch creates or resumes the canonical draft.

Suggested sidebar states:

- No badge by default.
- Optional manager/admin badge for checklists needing review.
- Optional rep badge for incomplete drafts due today.

## Routing Design

Current branch appears to use page-key navigation through the main app shell rather than fully declarative React Router files. If the split route files are restored later, mirror this route in route config as well.

Recommended page keys and routes:

- Page key: `appointment-checklists`
- List route: `/appointment-checklists`
- Detail route, future router-compatible: `/appointment-checklists/:checklistId`
- Appointment contextual route, future router-compatible: `/appointments/:appointmentId/checklist`

For the current page-key model:

- Add an app page entry for `appointment-checklists`.
- Preserve selected checklist state through URL query params, Zustand state, or a small route adapter.
- Support direct opening by checklist ID when the route layer supports it.

Avoid using `/appointment-checklist/**` as a static hosting rewrite if this becomes a CRM route. If iframe hosting is required, place standalone files under `/standalone/appointment-checklist/**` to avoid future route collisions.

## Authentication And Permissions

Use the existing CRM identity model:

- Firebase anonymous auth session.
- PIN-verified custom claims.
- `repId`, `role`, `region`, `active`, and `allowedRegions`.

Permission model:

- `rep`: create and edit own checklist drafts for appointments/leads they can access.
- `manager`: view team/region checklists, review completed checklists, reopen drafts where policy allows.
- `admin` and `director`: full operational access, including cross-staff review where region rules permit.

Access constraints:

- Respect `allowedRegions` and existing region isolation.
- Do not trust client-provided auth-sensitive fields.
- Store `createdBy`, `updatedBy`, `completedBy`, `repId`, and `region` from authenticated CRM context.
- Do not allow unauthenticated standalone access to customer or appointment data.

Firestore rules should eventually enforce ownership, role, and region access for checklist documents. If current operational rules are broad, implementation should still write the correct metadata now so stricter rules can be introduced safely later.

## Draft Storage Strategy

Use Firestore as the canonical draft store.

Recommended collection:

```text
appointmentChecklists/{checklistId}
```

Recommended document fields:

```ts
{
  id: string;
  appointmentId: string;
  linkedLeadId?: string;
  clientId?: string;
  clientGroupId?: string;
  repId: string;
  region: "brisbane" | "perth";
  serviceTypeId?: string;
  checklistType: "first-consult" | "finance-run" | "property-sale" | "smsf" | "general";
  status: "draft" | "completed" | "locked" | "archived";
  schemaVersion: number;
  templateVersion: string;
  answers: Record<string, unknown>;
  sectionStatus: Record<string, "not-started" | "in-progress" | "complete">;
  completionPercent: number;
  validationErrors?: Record<string, string>;
  pdfUrl?: string;
  pdfStoragePath?: string;
  source: "crm" | "standalone-import";
  createdBy: string;
  createdAt: Timestamp;
  updatedBy: string;
  updatedAt: Timestamp;
  completedBy?: string;
  completedAt?: Timestamp;
}
```

Checklist ID strategy:

- Use one active checklist per appointment by default.
- Prefer deterministic IDs when the business rule is one checklist per appointment, such as `appointmentChecklist_{appointmentId}_{templateVersion}`.
- Use generated IDs only if multiple checklist types can exist for the same appointment.

Autosave behavior:

- Create the Firestore draft once an appointment or lead context exists.
- Debounce draft saves to avoid excessive writes.
- Maintain a local transient cache in IndexedDB or localStorage for mobile interruption recovery.
- Show visible autosave state: `Saving`, `Saved`, `Offline`, `Conflict`.
- Resolve conflicts using `updatedAt`, `updatedBy`, and a lightweight stale-draft warning.

Do not store canonical drafts only in browser storage. Staff may start on desktop, continue on mobile, and managers may need review access.

## PDF Generation Strategy

PDF output should become part of the CRM document record, not just a downloaded browser file.

Recommended V1:

- Generate checklist summary PDF in the CRM using existing `jsPDF` patterns.
- Include appointment metadata, lead/client details, staff name, checklist answers, completion timestamp, and status.
- Upload the PDF to Firebase Storage.
- Store `pdfUrl` and `pdfStoragePath` on the checklist document.
- Create or link a client/deal document record so it appears in the existing document workflow.

Recommended V2:

- Use `pdf-lib` for template-based branded or compliance forms if exact layout is required.
- Consider a callable function for final locked PDF generation if compliance policy requires server-side timestamping, immutable generation, or stricter audit controls.

PDF rules:

- Draft PDFs should be clearly marked `DRAFT`.
- Completed PDFs should include checklist version and completion timestamp.
- Locked PDFs should not be regenerated silently; create a new version instead.
- Generated PDFs should never expose data outside staff authorization boundaries.

## Mobile Usage

Mobile should be a first-class workflow because staff may complete the checklist during or immediately before an appointment.

Design requirements:

- Single-column layout on phones.
- Section accordion or stepper flow.
- Sticky bottom actions: `Save Draft`, `Continue`, `Complete`.
- Large touch targets for yes/no, checklist, and outcome controls.
- Minimal typing where possible through segmented controls and pickers.
- Autosave indicator always visible.
- Offline/interrupted state should be explicit.
- Resume banner for incomplete checklist linked to today's appointment.
- PDF generation can be allowed on mobile, but should not block completion if upload is temporarily unavailable.

Avoid iframe-first mobile integration unless there is no alternative. Embedded standalone apps often create viewport, keyboard, scroll, and file-generation issues inside CRM shells.

## Staff Workflow

### Rep Workflow

1. Rep opens Calendar.
2. Rep selects appointment.
3. Appointment modal shows checklist status.
4. Rep selects `Start Checklist` or `Continue Checklist`.
5. Checklist preloads appointment, lead, client, rep, region, and service type details.
6. Rep completes sections during appointment.
7. Rep saves draft or marks checklist complete.
8. CRM generates/stores PDF and links it to client/deal documents.
9. Appointment status can be updated separately according to existing calendar workflow.

### Manager Workflow

1. Manager opens Appointment Checklists list.
2. Filters by staff, date, status, region, and service type.
3. Reviews completed or incomplete checklists.
4. Follows links back to appointment, lead, and generated PDF.
5. Optionally reopens checklist if policy allows.

### Admin/Director Workflow

1. Admin reviews checklist usage and completion quality.
2. Admin audits template versions and PDF outputs.
3. Admin exports or investigates records where needed.

## Checklist Dashboard

The sidebar destination should be a list/dashboard, not a blank form.

Recommended views:

- `Today`: appointments with checklist status.
- `My Drafts`: current user's incomplete drafts.
- `Needs Review`: manager/admin queue.
- `Completed`: recent completed checklists.

Recommended filters:

- Date range.
- Staff/rep.
- Region.
- Service type.
- Status.
- Linked lead/client.
- Checklist type.

Recommended columns:

- Appointment date/time.
- Client name.
- Lead link.
- Rep.
- Service type.
- Checklist status.
- Completion percent.
- Last updated.
- PDF status.

## Firestore Query Strategy

Core queries:

```ts
// Rep daily workflow
where("repId", "==", currentRepId)
where("status", "in", ["draft", "completed"])
orderBy("updatedAt", "desc")

// Today by appointment date mirror field, if denormalized
where("repId", "==", currentRepId)
where("appointmentDate", ">=", startOfDay)
where("appointmentDate", "<=", endOfDay)
orderBy("appointmentDate", "asc")

// Manager review
where("region", "in", allowedRegions)
where("status", "==", "completed")
orderBy("completedAt", "desc")

// Lead/client context
where("linkedLeadId", "==", leadId)
orderBy("updatedAt", "desc")

// Appointment context
where("appointmentId", "==", appointmentId)
limit(1)
```

Denormalize these fields onto checklist documents for query performance:

- `appointmentDate`
- `clientName`
- `leadName`
- `repName`
- `serviceTypeName`
- `region`
- `status`

Denormalized names are for display only. Source entities remain appointments, leads, reps, and service types.

## Index Review

Expected Firestore composite indexes:

```json
[
  {
    "collectionGroup": "appointmentChecklists",
    "queryScope": "COLLECTION",
    "fields": [
      { "fieldPath": "repId", "order": "ASCENDING" },
      { "fieldPath": "updatedAt", "order": "DESCENDING" }
    ]
  },
  {
    "collectionGroup": "appointmentChecklists",
    "queryScope": "COLLECTION",
    "fields": [
      { "fieldPath": "repId", "order": "ASCENDING" },
      { "fieldPath": "appointmentDate", "order": "ASCENDING" }
    ]
  },
  {
    "collectionGroup": "appointmentChecklists",
    "queryScope": "COLLECTION",
    "fields": [
      { "fieldPath": "region", "order": "ASCENDING" },
      { "fieldPath": "status", "order": "ASCENDING" },
      { "fieldPath": "completedAt", "order": "DESCENDING" }
    ]
  },
  {
    "collectionGroup": "appointmentChecklists",
    "queryScope": "COLLECTION",
    "fields": [
      { "fieldPath": "linkedLeadId", "order": "ASCENDING" },
      { "fieldPath": "updatedAt", "order": "DESCENDING" }
    ]
  },
  {
    "collectionGroup": "appointmentChecklists",
    "queryScope": "COLLECTION",
    "fields": [
      { "fieldPath": "appointmentId", "order": "ASCENDING" },
      { "fieldPath": "updatedAt", "order": "DESCENDING" }
    ]
  }
]
```

Final indexes should be confirmed against the actual implemented query shapes before deployment.

## Required CRM Touchpoints

Likely files or modules for a future implementation:

- `src/App.tsx` or restored route/sidebar config files: page key and sidebar navigation.
- `src/pages/Calendar.tsx`: contextual checklist launch and status display.
- `src/components/AppointmentModal.tsx`: `Start Checklist` / `Continue Checklist` actions.
- `src/pages/AppointmentChecklists.tsx`: list/dashboard page.
- `src/pages/AppointmentChecklistDetail.tsx`: checklist form/detail page.
- `src/hooks/useAppointmentChecklists.ts`: Firestore reads/writes.
- `src/types/index.ts`: checklist types.
- `src/lib/appointmentChecklistPdf.ts`: PDF generation helper.
- `src/pages/DocumentCentre.tsx` or document service hooks: PDF linking/storage pattern.
- `firestore.rules`: checklist read/write permissions.
- `firestore.indexes.json`: required composite indexes.

If embedded standalone integration is chosen:

- `public/standalone/appointment-checklist/index.html`
- `public/standalone/appointment-checklist/assets/**`
- CRM wrapper component with a strict `postMessage` allowlist.
- Standalone-to-CRM event contract documentation.

## Standalone App Review Checklist

Before implementation, review the standalone app for:

- Framework and build output compatibility with Vite/Firebase Hosting.
- Whether it assumes public unauthenticated use.
- Whether it stores drafts locally only.
- Whether it can accept initial appointment/lead/staff data.
- Whether PDF generation is client-side, server-side, or download-only.
- Whether styling is responsive inside CRM layout constraints.
- Whether it depends on global CSS that could collide with CRM styles.
- Whether it uses route paths that conflict with CRM paths.
- Whether it can emit structured completion data instead of only rendering a PDF.

## Implementation Phases

### Phase 1: Contract And Data Model

- Obtain and review the standalone Appointment Checklist source/build.
- Confirm checklist sections, required fields, validation, and PDF requirements.
- Confirm whether one checklist or multiple checklist types can exist per appointment.
- Finalize Firestore document schema and permission matrix.

### Phase 2: CRM Navigation And Dashboard

- Add sidebar entry.
- Add checklist list/dashboard page.
- Add calendar and appointment modal entry points.
- Add filters for date, staff, status, region, and service type.

### Phase 3: Draft Workflow

- Implement Firestore-backed draft creation.
- Add debounced autosave.
- Add local interruption recovery.
- Add conflict and stale draft warnings.

### Phase 4: Checklist Form

- Port or integrate standalone checklist UI.
- Prefill appointment, lead, and staff context.
- Add completion validation.
- Add mobile-first layout behavior.

### Phase 5: PDF And Documents

- Generate draft and completed PDFs.
- Upload to Firebase Storage.
- Link generated output to checklist and client/deal documents.
- Add version and locked-state handling.

### Phase 6: Permissions And Review

- Add role-aware list visibility.
- Add manager/admin review filters.
- Tighten Firestore rules if needed.
- Add audit metadata and completion history.

### Phase 7: QA And Rollout

- Test rep, manager, admin, and director access.
- Test Brisbane/Perth region isolation.
- Test desktop and mobile flows.
- Test draft resume across devices.
- Test PDF generation and storage.
- Test calendar-to-checklist and client-to-checklist navigation.

## Risks And Decisions Needed

Open decisions:

- Is the checklist one-per-appointment or can multiple checklist types exist for one appointment?
- Is the PDF a compliance artifact requiring immutable server-side generation?
- Should completing a checklist update appointment status automatically?
- Should managers be able to edit completed checklists or only reopen them?
- Should checklist templates be hardcoded initially or managed as versioned Firestore templates?

Risks:

- A static standalone app may not support CRM auth, autosave, or mobile workflow cleanly.
- Broad Firestore operational rules may allow access beyond the final desired checklist policy unless tightened.
- PDF output can become a compliance risk if versioning and locked-state behavior are unclear.
- Local-only drafts would create staff workflow failures across devices.
- Route conflicts are likely if standalone hosting uses future CRM route names.

## Final Recommendation

Proceed with a **native CRM checklist integration** anchored to appointments and leads, with Firestore as the draft source of truth and generated PDFs linked into the existing client document workflow.

Use iframe/static hosting only as a temporary compatibility bridge if the standalone app cannot be ported immediately. Even then, CRM should remain responsible for authentication, draft persistence, final PDF storage, and staff navigation.
