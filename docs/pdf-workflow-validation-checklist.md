# PDF Workflow Validation Checklist

Date: 2026-07-06
Branch: `security/pdf-dependency-remediation`

## Purpose

This checklist covers manual PDF workflow validation after the `jspdf` dependency update from `4.2.0` to `4.2.1`.

No automated PDF-specific test harness currently exists in this repository. TypeScript and production build validation confirm the PDF entry points still compile and bundle, but a human tester should still inspect generated files before release.

## Safety Rules

- Use local or emulator test data only.
- Do not use production Firebase data.
- Do not deploy.
- Do not run migrations.
- Do not run live Salestrail sync.
- Do not run phone backfill writes.
- Do not upload real customer documents during validation.

## PDF Entry Points Reviewed

| Workflow | File | Entry point | Expected output |
| --- | --- | --- | --- |
| Commission invoice PDF | `src/pages/Commissions.tsx` | `generateInvoicePdf` and `Download PDF` action | Downloaded invoice PDF with header, rep details, entity details, amounts, and bank details. |
| Commission monthly report PDF | `src/pages/Commissions.tsx` | `handleMonthlyReport` | Downloaded monthly commission report PDF with settlement rows and rep summary. |
| Builder form PDF saved to lead | `src/components/FormFillerModal.tsx` | `Generate & Save to Lead` | Generated PDF blob uploaded to lead files and Firestore file record created. |
| Document Centre generated PDF download | `src/pages/DocumentCentre.tsx` | `UseForLeadModal` download action | Generated PDF downloads to device with document name, generated metadata, and field values. |
| Document Centre generated PDF save to client | `src/pages/DocumentCentre.tsx` | `UseForLeadModal` save action | Generated PDF blob uploads to selected lead files and downloads after save. |
| Offer and Acceptance fallback PDF | `src/components/OADocumentEditor/oaPdfGenerator.ts` | `generateOAPdfFallback` through `generateOAPdf` fallback path | Generated Uint8Array opens as a readable O&A fallback PDF if the template path fails. |
| Offer and Acceptance download | `src/components/OADocumentEditor/OADocumentEditor.tsx` | `Generate PDF` | PDF downloads using template output or fallback output. |
| Offer and Acceptance upload to deal | `src/components/OADocumentEditor/OADocumentEditor.tsx` | `Upload to Deal` | Generated PDF uploads to deal documents with `application/pdf` metadata. |
| Offer and Acceptance send for signing preparation | `src/components/OADocumentEditor/OADocumentEditor.tsx` | `sendForSigning` preparation path | Generated PDF uploads before DocuSign handoff. Do not call live DocuSign in this validation unless separately approved. |
| Reports Dashboard PDF export | `src/pages/ReportsDashboard.tsx` | `handleExportPDF` | Downloaded reports PDF with KPI summary, risk section, forecast, and deal rows. |

## Manual Test Cases

### 1. Commission invoice PDF

1. Open the Commissions page with local or seeded test commission data.
2. Open the invoice action for a commission entry.
3. Generate the invoice PDF.
4. Confirm the file downloads.
5. Confirm the PDF opens and displays:
   - ASG header
   - representative name
   - entity and ABN details
   - GST and total amounts
   - bank details

Expected result: PDF downloads and opens without console errors.

### 2. Commission monthly report PDF

1. Open the Commissions page with more than one settlement in the current month.
2. Run the monthly report PDF action.
3. Confirm the file downloads.
4. Confirm settlement rows and rep summary totals are readable.

Expected result: report PDF downloads with current month naming and readable totals.

### 3. Builder form saved to lead

1. Open a builder form template from a lead or Document Centre.
2. Fill required fields with test data.
3. Add a signature if the template requires one.
4. Select `Generate & Save to Lead`.
5. Confirm the saved lead file has `application/pdf` metadata and a valid file size.

Expected result: generated PDF appears in the selected lead files and opens correctly.

### 4. Document Centre generated PDF download

1. Open Document Centre.
2. Select a builder form or generated document workflow.
3. Fill fields with test data.
4. Use the download action without saving to a lead.
5. Open the downloaded PDF.

Expected result: generated PDF contains the field labels, values, generated date, and ASG heading.

### 5. Document Centre generated PDF save to client

1. Open Document Centre.
2. Select a builder form or generated document workflow.
3. Search for and select a test lead.
4. Save the generated PDF to the client.
5. Confirm the file appears on the lead record and downloads.

Expected result: generated PDF saves to the selected test lead only.

### 6. Offer and Acceptance download

1. Open an O&A document editor for a test deal.
2. Fill enough required fields to pass validation.
3. Select `Generate PDF`.
4. Confirm the file downloads.
5. Open the downloaded file.

Expected result: generated PDF opens. If the REIWA template is unavailable, fallback output is still readable.

### 7. Offer and Acceptance upload to deal

1. Open an O&A document editor for a test deal.
2. Fill enough required fields to pass validation.
3. Use the upload-to-deal action.
4. Confirm the deal document entry is created with a PDF file.

Expected result: generated PDF uploads to the test deal and opens from deal documents.

### 8. Reports Dashboard PDF export

1. Open Reports Dashboard with local or test data.
2. Select each supported date preset that has data.
3. Export PDF.
4. Open the downloaded PDF.

Expected result: PDF contains the selected date range, KPI summary, and deal rows without layout breakage.

## Release Gate

Before production release, record:

- Browser and OS used for manual PDF checks.
- Test data source.
- Each workflow result.
- Any layout or data mismatch.
- Whether real production data was avoided.
