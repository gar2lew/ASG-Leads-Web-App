#!/usr/bin/env node

import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import {
  buildExistingIndexes,
  buildFullReplaceImpact,
  buildUnmatchedExistingReport,
  excludedTabReason,
  leadHeaderScore,
  mapSheetRows,
  mapSheetTabs,
  normalizeTabTitle,
  quoteSheetTabName,
} from "./firebase-leads-sheet-migration.mjs";

const headers = ["LeadID", "Name", "Contact Number", "Email", "Address", "Suburb", "Status"];
const rows = [
  headers,
  ["", "John", "0400 000 001", "", "1 Test St Perth 6000", "Perth", "DQ"],
  ["", "John", "0400 000 002", "", "2 Test St Perth 6000", "Perth", "DQ"],
  ["", "Ryan", "0400 000 003", "", "3 Test St Perth 6000", "Perth", "DQ"],
  ["", "Ryan", "0400 000 004", "", "4 Test St Perth 6000", "Perth", "DQ"],
  ["", "Jane", "0400 000 005", "", "5 Test St Perth 6000", "Perth", "DQ"],
  ["", "Jane Other", "0400 000 005", "", "6 Test St Perth 6000", "Perth", "DQ"],
  ["12345", "Alex", "0400 000 006", "", "7 Test St Perth 6000", "Perth", "DQ"],
  ["12345", "Alex Other", "0400 000 007", "", "8 Test St Perth 6000", "Perth", "DQ"],
];

const result = mapSheetRows(rows, buildExistingIndexes([]), new Map(), {
  fallbackStatus: "DQ",
  defaultRegion: "perth",
  defaultRepId: 1,
});

assert.equal(result.importLeads.length, 6, "John and Ryan rows with different phones should import; only true duplicates skip");
assert.equal(result.skippedRows.length, 2, "Only same phone and same LeadID rows should skip");
assert.deepEqual(
  result.duplicates.map((duplicate) => duplicate.duplicateKeyType),
  ["phone", "leadId"],
  "Duplicate report should identify phone and LeadID duplicates",
);

const importedPhones = new Set(result.importLeads.map((item) => item.lead.phone));
assert(importedPhones.has("0400000001"), "First John should import");
assert(importedPhones.has("0400000002"), "Second John should import");
assert(importedPhones.has("0400000003"), "First Ryan should import");
assert(importedPhones.has("0400000004"), "Second Ryan should import");
assert.equal(result.nameOnlySimilarities.length, 2, "Repeated John and Ryan names should be warnings, not duplicates");

const allTabsResult = mapSheetTabs(
  [
    {
      tab: "LEADS",
      rows: [
        headers,
        ["", "Tab One", "0400 100 001", "", "1 Multi St Perth 6000", "Perth", ""],
        ["", "Same Name", "0400 100 002", "", "2 Multi St Perth 6000", "Perth", ""],
        ["", "Legacy Live", "0400 100 005", "", "5 Multi St Perth 6000", "Perth", "Live"],
        ["", "Return DQ", "0400 100 006", "", "6 Multi St Perth 6000", "Perth", "Back to DQ"],
      ],
    },
    {
      tab: "NO ANSWER",
      rows: [
        headers,
        ["", "Tab Two", "0400 100 003", "", "3 Multi St Perth 6000", "Perth", ""],
        ["", "Same Name", "0400 100 004", "", "4 Multi St Perth 6000", "Perth", ""],
        ["", "Duplicate Phone", "0400 100 001", "", "5 Multi St Perth 6000", "Perth", ""],
      ],
    },
    {
      tab: "BOOKED",
      rows: [
        headers,
        ["", "Booked Tab", "0400 100 007", "", "7 Multi St Perth 6000", "Perth", ""],
      ],
    },
  ],
  buildExistingIndexes([]),
  new Map(),
  {
    fallbackStatus: "DQ",
    defaultRegion: "perth",
    defaultRepId: 1,
  },
);

assert.equal(allTabsResult.totalSheetRows, 8, "All-tabs report should count rows across tabs");
assert.equal(allTabsResult.importLeads.length, 7, "Only the cross-tab same-phone duplicate should skip");
assert.equal(allTabsResult.skippedRows.length, 1, "Cross-tab duplicate should be skipped");
assert.equal(allTabsResult.duplicates[0].sourceTab, "NO ANSWER", "Duplicate report should preserve duplicate source tab");
assert.equal(allTabsResult.duplicates[0].firstSourceTab, "LEADS", "Duplicate report should preserve first source tab");
assert.equal(allTabsResult.rowsPerTab.LEADS.validImportCount, 4, "Rows per tab should report valid LEADS imports");
assert.equal(allTabsResult.rowsPerTab["NO ANSWER"].validImportCount, 2, "Rows per tab should report valid NO ANSWER imports");
assert.equal(allTabsResult.statusBreakdown.DQ, 3, "Blank status in LEADS and Back to DQ should normalize to DQ");
assert.equal(allTabsResult.statusBreakdown["No Answer"], 2, "Blank status in NO ANSWER should fall back to tab status");
assert.equal(allTabsResult.statusBreakdown.Booked, 2, "Live and BOOKED tab fallback should normalize to Booked");
assert.equal(allTabsResult.statusBreakdown.Live, undefined, "Final status breakdown should not contain Live");
assert.equal(
  allTabsResult.importLeads.find((item) => item.lead.name === "Legacy Live")?.lead.status,
  "Booked",
  "Live should normalize to Booked",
);
assert.equal(
  allTabsResult.importLeads.find((item) => item.lead.name === "Booked Tab")?.lead.status,
  "Booked",
  "BOOKED tab should import as Booked",
);
assert.equal(
  allTabsResult.importLeads.find((item) => item.lead.name === "Return DQ")?.lead.status,
  "DQ",
  "Back to DQ should normalize to DQ",
);
assert(allTabsResult.importLeads.every((item) => item.sourceTab), "Each import item should preserve sourceTab");
assert(allTabsResult.importLeads.every((item) => item.lead.sourceTab), "Each lead should preserve sourceTab");
assert.equal(allTabsResult.nameOnlySimilarities.some((item) => item.name === "same name"), true, "Name-only repeats should remain warnings");

assert.equal(normalizeTabTitle(" no   answer "), "NO ANSWER", "Tab title matching should trim, uppercase, and collapse whitespace");
assert.equal(quoteSheetTabName("Sam's Leads"), "'Sam''s Leads'", "A1 ranges should escape single quotes in sheet titles");
assert.equal(
  leadHeaderScore(["Lead Name", "Contact Number", "Lead Status", "Call Result", "LeadID"]).isLeadLike,
  true,
  "Header discovery should identify lead-like tabs",
);
assert.equal(
  leadHeaderScore(["Lead Name", "Contact Number"]).isLeadLike,
  false,
  "Header discovery should require more than name and phone",
);
assert.equal(
  leadHeaderScore(["Invoice", "Amount", "Paid"]).isLeadLike,
  false,
  "Header discovery should skip non-lead tabs",
);
assert.equal(excludedTabReason("Dedup Audit Log"), "explicit excluded tab", "Dedup Audit Log should be excluded");
assert.equal(excludedTabReason("Date Fix Log"), "explicit excluded tab", "Date Fix Log should be excluded");
assert.equal(Boolean(excludedTabReason("Random Audit Export")), true, "Tabs containing audit should be excluded");

const tempReportDir = "migration-reports/test-unmatched-existing";
rmSync(tempReportDir, { recursive: true, force: true });
const unmatchedReport = buildUnmatchedExistingReport(
  [
    { __docId: "matched", id: 1, name: "Matched Existing", phone: "0400 100 001", email: "", suburb: "Perth", status: "DQ" },
    { __docId: "unmatched", id: 2, name: "Unmatched Existing", phone: "0499 999 999", email: "", suburb: "Perth", status: "Live" },
  ],
  allTabsResult,
  { reportDir: tempReportDir },
  "fixture",
);
assert.equal(unmatchedReport.unmatchedExistingCount, 1, "Only existing leads without incoming strong-key matches should be reported");
assert.equal(unmatchedReport.unmatchedExistingStatusBreakdown.Live, 1, "Unmatched status breakdown should count existing statuses");
assert.equal(unmatchedReport.sampleUnmatchedExistingLeads[0].docId, "unmatched", "Sample should include unmatched existing lead details");
assert(unmatchedReport.unmatchedExistingJsonPath.endsWith("unmatched-existing-leads-fixture.json"), "JSON artifact path should be reported");
assert(unmatchedReport.unmatchedExistingCsvPath.endsWith("unmatched-existing-leads-fixture.csv"), "CSV artifact path should be reported");
rmSync(tempReportDir, { recursive: true, force: true });

const tempImpactDir = "migration-reports/test-full-replace-impact";
rmSync(tempImpactDir, { recursive: true, force: true });
const impactSheetAnalysis = {
  ...allTabsResult,
  importLeads: allTabsResult.importLeads.map((item, index) =>
    index === 0 ? { ...item, existingDocId: "matched", action: "update", idSource: "existing-match" } : item,
  ),
};
const impactReport = buildFullReplaceImpact(
  [
    { __docId: "matched", id: 1, name: "Matched Existing", phone: "0400 100 001", email: "", suburb: "Perth", status: "DQ" },
    { __docId: "duplicate", id: 2, name: "Duplicate Existing", phone: "0400 100 001", email: "", suburb: "Perth", status: "DQ" },
    { __docId: "unmatched-impact", id: 3, name: "Unmatched Impact", phone: "0499 000 000", email: "", suburb: "Perth", status: "Booked" },
  ],
  impactSheetAnalysis,
  { reportDir: tempImpactDir },
  "fixture",
);
assert.equal(impactReport.existingLeadCount, 3, "Impact report should count existing docs");
assert.equal(impactReport.incomingValidImportCount, impactSheetAnalysis.importLeads.length, "Impact report should count incoming valid imports");
assert.equal(impactReport.existingDocsDirectlyMatchedForUpdate, 1, "One existing doc should be directly selected for update");
assert.equal(impactReport.existingDocsNotDirectlyReimported, 2, "Not directly reimported should reconcile from existing minus direct matches");
assert.equal(impactReport.existingDocsUnmatchedByAnyStrongKey, 1, "One existing doc should have no incoming strong-key match");
assert.equal(impactReport.existingDocsMatchedByStrongKeyButNotSelected, 1, "One duplicate existing doc should match but not be selected");
assert.equal(impactReport.duplicateExistingDocGroups > 0, true, "Duplicate existing doc groups should be reported");
assert(impactReport.jsonPath.endsWith("full-replace-impact-fixture.json"), "Full replace impact JSON path should be reported");
assert(impactReport.csvPath.endsWith("full-replace-impact-fixture.csv"), "Full replace impact CSV path should be reported");
assert(impactReport.duplicateCsvPath.endsWith("duplicate-existing-firebase-docs-fixture.csv"), "Duplicate existing docs CSV path should be reported");
rmSync(tempImpactDir, { recursive: true, force: true });

console.log("Lead migration duplicate fixture passed.");
