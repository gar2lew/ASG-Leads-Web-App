import assert from "node:assert/strict";
import {
  createQuickPullSummary,
  findQuickPullColumn,
  formatQuickPullSummary,
  parseQuickPullLeadDate,
  QUICK_PULL_DATE_ALIASES,
  resolveQuickPullLeadDate,
} from "../src/lib/quickPullImport.ts";

assert.equal(findQuickPullColumn(["Name", "Lead Date", "Phone"], QUICK_PULL_DATE_ALIASES), 1);
assert.equal(findQuickPullColumn(["Customer", "DQ Date", "Mobile"], QUICK_PULL_DATE_ALIASES), 1);

assert.equal(parseQuickPullLeadDate("2026-07-06"), "2026-07-06");
assert.equal(parseQuickPullLeadDate("6/7/2026"), "2026-07-06");
assert.equal(parseQuickPullLeadDate("06.07.26"), "2026-07-06");
assert.equal(parseQuickPullLeadDate("45845"), "2025-07-07");

assert.deepEqual(resolveQuickPullLeadDate("", "2026-07-07"), {
  leadDate: "2026-07-07",
  source: "fallback",
  warning: "missing",
});
assert.deepEqual(resolveQuickPullLeadDate("not a date", "2026-07-07"), {
  leadDate: "2026-07-07",
  source: "fallback",
  warning: "invalid",
});

const summary = createQuickPullSummary(100);
summary.added = 98;
summary.skipped = 2;
summary.fallbackDates = 1;

assert.equal(
  formatQuickPullSummary(summary),
  "100 rows read, 98 new, 0 updated, 2 skipped, 1 date fallback, possible 100-row source limit",
);

console.log("Quick Pull import helper tests passed");
