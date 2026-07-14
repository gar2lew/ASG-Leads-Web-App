# Appointment Pack — CRM Integration Plan

## 1. Overview

Integrate the standalone Sales Appointment Capture PWA into the ASG CRM as a native React workflow called **Appointment Packs**. Staff will be able to create, view, download, and share appointment packs directly from a client's profile — with data pre-filled from the CRM and results persisted to Firebase.

---

## 2. Recommended Approach: Native React Component (not iframe)

The standalone PWA is a single-file IIFE (~3800 lines) with no module system, internal state held on DOM and global variables, and canvas-based PDF rendering. Wrapping it in an iframe (like PIA/SMSF calculators) would require a complex `postMessage` bridge to prefill client data and extract PDF blobs.

**Instead, port the standalone logic into React as composable modules.** The standalone app is ~3800 lines of well-factored vanilla JS. Porting the core modules (PDF pipeline, form model, builders, validation) into TypeScript gives us:
- Full type safety
- Direct React state management instead of DOM-global variables
- Reuse of CRM auth, Firestore, and UI components
- No `postMessage` bridge needed
- Clean separation of concerns with the existing CRM architecture

---

## 3. Firestore Schema

### 3.1 New Collection: `appointmentPacks`

**Root-level collection** (not a subcollection of clients):

```
appointmentPacks/{packId}
```

Rationale: Root-level collections are easier to query across clients and index. `clientId` is a field for filtering.

```typescript
interface AppointmentPack {
  id: string;                    // auto-generated
  clientId: string;              // references leads collection
  leadId?: string;               // optional lead reference
  clientNames: string;           // "John Smith & Jenny Smith"
  clientName1: string;
  clientName2?: string;
  propertySaleAddress: string;
  appointmentDate: string;       // ISO date string
  formsIncluded: string;         // "EOI+IA" | "EOI" | "IA" | "PDF"
  eoiTemplate?: string;          // "standard" | "laVidaHomes" | undefined
  pdfFileName: string;
  pdfStoragePath: string;        // Firebase Storage path
  pdfDownloadUrl?: string;       // generated signed URL (set on load)
  createdBy: string;             // rep ID
  createdAt: Timestamp;
  updatedAt: Timestamp;
  status: 'draft' | 'generated' | 'shared';
  staffName: string;             // staff member who created it
}
```

### 3.2 Indexes Required

```json
{
  "indexes": [
    {
      "collectionGroup": "appointmentPacks",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "clientId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "appointmentPacks",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "createdBy", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
  ]
}
```

---

## 4. Firebase Storage Path

```
clients/{clientId}/appointment-packs/{packId}/{fileName}
```

Example:
```
clients/12345/appointment-packs/abc123/Sales_Appointment_-_01-07-2026_-_John_Smith_-_G_Lewington.pdf
```

**Storage rules** (add to `firestore.rules` or `storage.rules`):

```
match /clients/{clientId}/appointment-packs/{packId}/{fileName} {
  allow read: if request.auth != null;
  allow create: if request.auth != null;
  allow delete: if request.auth != null && request.auth.token.admin == true;
}
```

---

## 5. Component Architecture

### 5.1 File Structure (new files only)

```
src/
  components/
    appointment-pack/
      AppointmentPackCard.tsx       # Single pack in list view
      AppointmentPackList.tsx       # List of packs for a client
      AppointmentPackForm.tsx       # Full form for creating/editing
      AppointmentPackModal.tsx      # Modal wrapper for creation
      useAppointmentPacks.ts        # Firestore hook: CRUD + upload
      types.ts                      # TypeScript types
  lib/
    appointmentPackBuilder.ts       # Ported PDF pipeline core
    appointmentPackValidation.ts    # Ported validation logic
    appointmentPackShare.ts         # Email subject/body + share logic
    appointmentPackDefaults.ts      # Ported admin settings shortcuts
  pages/
    AppointmentPacksPage.tsx        # Standalone list page (optional)
  stores/
    (extends appStore.ts)           # Add appointment pack state if needed
```

### 5.2 Component Details

#### `AppointmentPackList`
- Props: `clientId: string`
- Fetches packs via `useAppointmentPacks(clientId)`
- Renders a list of `AppointmentPackCard` components
- Shows empty state with "Create Appointment Pack" button

#### `AppointmentPackCard`
- Props: `pack: AppointmentPack`, `onDownload: () => void`, `onShare: () => void`
- Displays: date, client names, forms included, template used
- Actions: Download button, Share/Email button

#### `AppointmentPackForm`
- Full form component replicating the standalone form layout
- Pre-fills from CRM client data when `clientId` is provided
- Uses ported validation logic
- Generates PDF in-browser via ported pipeline
- Uploads to Firebase Storage on generation
- Saves metadata to Firestore

#### `useAppointmentPacks` hook
```typescript
function useAppointmentPacks(clientId?: string) {
  // Queries: appointmentPacks where clientId == clientId, ordered by createdAt desc
  // Mutations: createPack, deletePack
  // Upload: uploadPackPdf(clientId, packId, blob)
  // Download: getPackDownloadUrl(storagePath)
  return { packs, loading, error, createPack, deletePack, downloadPdf, sharePdf };
}
```

### 5.3 Client Profile Integration

Add an **"Appointment Packs"** tab to `ClientProfilePage.tsx`:

```typescript
// Add to TABS array:
{ key: "appointment-packs", label: "Appointment Packs", icon: ClipboardCheck }
```

The tab renders `AppointmentPackList` with a "New Appointment Pack" button that opens `AppointmentPackForm` in a modal or inline.

---

## 6. Porting Strategy: What to Extract from the Standalone App

### 6.1 Core Modules to Port (by section)

| Standalone Section | Port To | Effort |
|---|---|---|
| A: CONFIG object | `lib/appointmentPackDefaults.ts` | Low |
| B: date helpers (`formatDisplayDate`, `formatISODate`, etc.) | Reuse existing `lib/dates.ts` or create new | Low |
| B: `safePart`, `pdfFileName` | `lib/appointmentPackBuilder.ts` | Low |
| B: validation (`validateBeforePdf`, `requireField`, etc.) | `lib/appointmentPackValidation.ts` | Medium |
| C-F: form binding/UI state | **Discard** — React handles form state | N/A |
| J: image loading (`loadImage`, `ensurePageLogo`) | `lib/appointmentPackBuilder.ts` | Low |
| K: PDF primitives (`drawPageFrame`, `drawLineValue`, `drawImageContain`, `drawPhotoPage`) | `lib/appointmentPackBuilder.ts` | Medium |
| K: date/pricing (`formatPrice`, `updateHLTotal`, etc.) | `lib/appointmentPackBuilder.ts` | Low |
| L: IA page drawing (`drawIAPage`) | `lib/appointmentPackBuilder.ts` | Medium |
| M: EOI/La Vida drawing (`drawStandardEoiPage`, `drawLaVidaEoiPage`) | `lib/appointmentPackBuilder.ts` | Medium |
| M: La Vida field rects and helpers | `lib/appointmentPackBuilder.ts` | Low |
| M: signature drawing (`drawSignatureBox`) | `lib/appointmentPackBuilder.ts` | Low |
| N: PDF pipeline (`outputPlan`, `drawOutputPage`, `makePDF`, `buildPdf`) | `lib/appointmentPackBuilder.ts` | High |
| O: share/email (`buildShareEmailContent`, `sharePdf`) | `lib/appointmentPackShare.ts` | Low |
| K: `drawSmallPageLogo` | `lib/appointmentPackBuilder.ts` | Low |
| EOI_BUILDERS registry | `lib/appointmentPackBuilder.ts` | Low |

### 6.2 What NOT to Port

- **Form UI rendering**: React handles this with JSX. The standalone app's dynamic form rendering (`renderConfigurableFields`, dropdown controls, etc.) is replaced by React components.
- **Draft save/load**: Replaced by Firestore persistence. `localStorage` drafts not needed.
- **Settings management**: CRM admin settings replace the standalone PIN-gated settings. Share defaults, template options can reference CRM settings or be hardcoded initially.
- **Photo upload UI**: Replace with CRM's existing file upload patterns.
- **Signature canvas**: Replace with a React component wrapping the same canvas logic.
- **Service worker**: Not needed — the CRM app has its own SW.
- **Toast/status system**: Replace with CRM's existing `useToast()`.
- **Global state (`lastPdfBlob`, `lastPdfName`, `photos`, etc.)**: Replace with React `useState`/`useReducer` or Zustand.
- **Event wiring/initialisation**: React's lifecycle handles this.

### 6.3 Key Functions to Port as Pure Modules

These are the functions with zero DOM dependencies (easy to port as-is):

```
C:\dev\Irrevoccable Authority CHECKLIST\index.html

From the standalone app, extract:
- Section A: CONFIG, EOI_BUILDERS, helpers (isChecked, mergedClientNames, etc.)
- Section B: formatDisplayDate, formatISODate, formatDisplayDateTime, safePart, pdfFileName
- Section B: validateBeforePdf, requireField, requireValidDate
- Section K: drawRoundRect, wrapText, drawPageFrame, drawLineValue, drawImageContain, drawSmallPageLogo
- Section K: formatPrice, stripCurrency, applyPriceFormat, updateHLTotal
- Section K: generatedFooterText, drawGeneratedFooter
- Section L: drawIAPage (with nested helpers: whiteOut, overlayText, overlayFitText, drawTemplateLineValue)
- Section M: eoiValue, hasSecondClientData, eoiClient2Value, eoiSaleAddressValue
- Section M: drawStandardEoiPage, drawEoiPage, drawLaVidaEoiPage
- Section M: laVidaFieldRects, pdfRectToCanvas, drawLaVidaField, drawLaVidaCheckbox
- Section M: laVidaDefaultValue, laVidaOwnershipText, laVidaClientData
- Section M: drawSmallCheck, drawSignatureBox
- Section N: outputPlan, drawOutputPage, dataURLToBytes, makePDF, buildPdf
- Section N: drawPhotoPage
- Section O: buildShareEmailContent
```

---

## 7. Detailed PDF Pipeline Porting

The PDF pipeline is the most complex module to port. Here's the strategy:

### Step 1: Make it DOM-independent

The current pipeline accesses DOM elements via `$(id)`, `fieldText(id)`, `isChecked(id)`. Refactor these to accept a **form data object** parameter:

```typescript
interface AppointmentPackFormData {
  date: string;
  teamMember: string;
  clientName: string;
  client2Name?: string;
  clientAddress: string;
  propertySaleAddress: string;
  // ... all form fields
  includeEOI: boolean;
  includeIA: boolean;
  eoiTemplate: string;
  iaForm: string;
  // ... signatures as data URLs
  signature1?: string;
  signature2?: string;
  // ... photos as { dataURL, rotation, label }[]
  photos: PhotoData[];
  // ... pricing
  eoiPriceLand: string;
  eoiPriceHouse: string;
  eoiPriceTotal: string;
  // ... etc
}
```

Then each function reads from `formData` instead of the DOM:
```typescript
function fieldText(id: keyof AppointmentPackFormData): string {
  return String(formData[id] ?? '').trim();
}
function isChecked(id: keyof AppointmentPackFormData): boolean {
  return !!formData[id];
}
```

### Step 2: Handle template images

The standalone app loads template images from URLs (`lavida-template-page-1.jpg`, IA form images). In the CRM app, these are served as static assets. The `loadImage()` function works identically — just ensure the image files are deployed with the CRM build.

**Option A:** Copy template images to `public/appointment-pack-templates/` and reference them from there.

**Option B:** Keep them at the root level and add to `firebase.json` hosting config to serve them.

### Step 3: Handle company logo

The `drawSmallPageLogo()` uses `icons/asg_logo.png`. This already exists in the CRM's `public/` directory (used elsewhere). Re-use it.

---

## 8. Client Profile UI Changes

### 8.1 Tab Addition

In `ClientProfilePage.tsx`, add to the `TABS` array:

```typescript
{ key: "appointment-packs", label: "Appointment Packs", icon: ClipboardCheck }
```

### 8.2 Tab Content

```tsx
{activeTab === "appointment-packs" && (
  <AppointmentPackList clientId={clientId} />
)}
```

### 8.3 "New Appointment Pack" Flow

1. User clicks "New Appointment Pack" from the tab
2. `AppointmentPackForm` opens as a full-screen modal or inline form
3. Form pre-fills from CRM client data:
   - `clientName` → Client 1 Name
   - `clientPhone` → Client 1 Phone
   - `clientEmail` → Client 1 Email
   - `clientAddress` → Client Current Address (if available on lead)
   - `propertySaleAddress` → Address of Property Sale (if available)
4. Staff fill remaining fields, attach photos, capture signatures
5. "Generate PDF" → `buildPdf()` runs, produces Blob
6. Blob uploaded to Firebase Storage at `clients/{clientId}/appointment-packs/{packId}/{fileName}`
7. `AppointmentPack` document created in Firestore
8. Pack appears in the list

---

## 9. Email/Share Workflow

### 9.1 Subject/Body Logic

Reuse `buildShareEmailContent()` from the standalone app:

```
Subject: {Staff Name} - Sales Appointment - {Forms} Forms - {Client Names} - {Property} - {Date}
Body: Hey team,

Please see the PDF attached for {Client Names} - {Property} - {Date}. If you need anything else, please let me know!

Regards,
{Staff Name}
```

### 9.2 Share Button Behaviour

1. **If Web Share API with files is available** (Chrome on HTTPS):
   - Generate signed download URL from Firebase Storage
   - Attempt `navigator.share()` with the PDF file
   - On failure, fall back to mailto

2. **Fallback (all browsers):**
   - Open `mailto:` link with To/CC/subject/body
   - Trigger PDF download so staff can attach manually
   - Show toast: "Email draft opened. Attach downloaded PDF to send."

### 9.3 Email Recipients

Hardcoded for now (from `CONFIG.share` in the standalone app):
- To: `<appointment-pack-primary-recipient>`
- CC: `<appointment-pack-cc-recipient>`

Future: make configurable via CRM admin settings.

---

## 10. Security

### 10.1 Authentication

Respect existing CRM auth:
- Only authenticated staff (`currentUser !== null`) can create/view packs
- Use `canSee('appointment-packs')` for page-level access control
- Add `appointment-packs` to the permissions system if role-based access is needed

### 10.2 Firestore Rules

```
match /appointmentPacks/{packId} {
  allow read: if request.auth != null;
  allow create: if request.auth != null;
  allow update: if request.auth != null
    && (request.auth.uid == resource.data.createdBy
        || request.auth.token.admin == true);
  allow delete: if request.auth.token.admin == true;
}
```

### 10.3 Storage Rules

```
match /clients/{clientId}/appointment-packs/{packId}/{fileName} {
  allow read: if request.auth != null;
  allow create: if request.auth != null;
  allow delete: if request.auth.token.admin == true;
}
```

### 10.4 Data Validation

- PDF filenames sanitised before Storage upload (no path traversal)
- Client ID validated against existing `leads` collection
- File size limits enforced (e.g., 25 MB max)

---

## 11. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| PDF pipeline port introduces rendering differences | Medium | High | Run side-by-side comparison tests; generate PDFs from same data in both standalone and CRM |
| Template images not loading in CRM context | Low | Medium | Verify asset paths during build; add to `firebase.json` rewrites |
| Signature canvas broken in React lifecycle | Medium | Medium | Wrap in `useEffect` with proper cleanup; test thoroughly |
| Large PDF blobs cause memory issues | Low | Low | Stream upload via Firebase Storage `uploadBytesResumable` |
| Firestore costs for frequent pack creation | Low | Low | Each pack is ~1 KB; negligible at current scale |
| Browser storage quota for images/signatures | Low | Medium | Compress photos before saving; use JPEG quality setting |
| Staff confusion about standalone vs CRM workflow | Medium | Medium | Keep standalone as backup; document migration path; add in-app notice |

---

## 12. Staged Rollout Plan

### Phase 1: Foundation (Week 1-2)

**Goal:** PDF pipeline works in React, Firestore schema in place.

- [ ] Port core PDF pipeline functions to `lib/appointmentPackBuilder.ts`
- [ ] Create `appointmentPackValidation.ts`
- [ ] Create `appointmentPackDefaults.ts` with CONFIG
- [ ] Create `appointmentPackShare.ts`
- [ ] Set up Firestore `appointmentPacks` collection with indexes
- [ ] Set up Firebase Storage rules
- [ ] Write unit tests for PDF pipeline (generate known-input PDF, verify byte count)
- [ ] Verify side-by-side: standalone vs CRM PDF output identical

### Phase 2: UI Integration (Week 2-3)

**Goal:** Staff can create and view packs from client profile.

- [ ] Create `AppointmentPackForm.tsx` with all form sections
- [ ] Create `AppointmentPackList.tsx` and `AppointmentPackCard.tsx`
- [ ] Add "Appointment Packs" tab to `ClientProfilePage.tsx`
- [ ] Implement client data pre-fill from CRM
- [ ] Implement PDF generation + Firebase Storage upload flow
- [ ] Implement `useAppointmentPacks` hook
- [ ] Add "New Appointment Pack" button flow
- [ ] Signature canvas React component

### Phase 3: Share & Polish (Week 3-4)

**Goal:** Full email/share workflow, download, and final UI polish.

- [ ] Implement share/email workflow (Web Share + mailto fallback)
- [ ] Implement download from Storage (signed URL)
- [ ] Add delete pack functionality (admin only)
- [ ] Add pack status badges (draft/generated/shared)
- [ ] UI responsive testing
- [ ] Error states and loading skeletons
- [ ] Smoke test full workflow: create → generate → download → share

### Phase 4: Standalone Deprecation Decision (Post-Launch)

- [ ] Monitor CRM usage vs standalone usage
- [ ] If CRM adoption is high, consider:
  - Adding a deprecation notice to standalone
  - Redirecting standalone users to CRM
  - Keeping standalone as offline backup only

---

## 13. Estimated Complexity

| Module | Complexity | Notes |
|--------|-----------|-------|
| PDF pipeline port | **High** | ~30 functions to extract, refactor to accept data object instead of DOM |
| Validation port | **Medium** | ~10 functions, mostly self-contained |
| Form UI (React) | **Medium** | ~15 form sections, signature canvas, photo uploader |
| Firestore integration | **Low** | Simple CRUD hook pattern already established in CRM |
| Firebase Storage upload | **Low** | Pattern exists in `lib/piaReports.ts` (PIA PDF upload) |
| Share/email workflow | **Low** | Logic already exists, just adapt to CRM's toast system |
| Client profile tab | **Low** | Extend existing tab pattern, drop in new components |
| `useAppointmentPacks` hook | **Low** | Follow existing `useClientNotes` / `useLeadAppointments` patterns |
| Responsive testing | **Low** | Form component needs mobile-friendly layout |
| **Total** | **Medium-High** | Highest effort is PDF pipeline port; rest is standard React/CRUD |

---

## 14. Key Architectural Decisions

1. **Root-level Firestore collection** (not subcollection of leads) — easier cross-client queries
2. **PDF generated client-side** (not in Cloud Functions) — keeps standalone logic portable, no cold-start latency
3. **No iframe** — direct React integration avoids the postMessage bridge complexity
4. **Storage path mirrors file structure** — `clients/{clientId}/appointment-packs/{packId}/` for clean organisation
5. **Keep standalone app alive** — no breaking changes to the existing PWA during migration
6. **Reuse CRM toast/auth/UI conventions** — consistent UX across the platform
