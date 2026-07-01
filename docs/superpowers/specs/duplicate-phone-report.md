# Duplicate Phone Report

**Date**: 2026-06-16
**Method**: Code-path analysis (not live data scan)
**Context**: Pre-migration assessment for phone normalization backfill

---

## Summary

After normalization, phone numbers that were stored in different formats will resolve to the same digits-only format. This creates **no new duplicates** (the lead documents remain separate), but **exposes existing duplicates** that were previously hidden by formatting differences.

The backfill does NOT merge or deduplicate leads. It only normalizes the `phone` field and stores the original in `phoneRaw`.

---

## Duplicate Risk Analysis

### Scenario 1: Same lead, different phone format → separate docs

**Example**:
```
Lead A: { phone: "0412 345 678", name: "John Smith" }   ← from AddLeadModal
Lead B: { phone: "0412345678",   name: "John Smith" }   ← from DQImport
```

After normalization, both will have `phone: "0412345678"`.

**Risk**: Two CRM records for the same person. A Salestrail query for `"0412345678"` will return 2 leads.

**Existing behavior**: These were always separate documents. The app's identity matching (`leadIdentityService`) already handles this to some degree, but relies on more than just phone.

**Mitigation**: The backfill does not merge. A separate deduplication pass (outside scope) using name + phone + address matching could address this later.

### Scenario 2: Different people, same phone → shared line

**Example**:
```
Lead A: { phone: "0892345678", name: "Alice" }
Lead B: { phone: "0892345678", name: "Bob" }
```

**Risk**: Salestrail matches the call to the first lead found. The second lead is never matched.

**Existing behavior**: Pre-existing — shared phone numbers were always a matching ambiguity.

**Mitigation**: The matching engine (`matchCallsToLeads` in the Salestrail design) should log a warning when a normalized phone matches multiple leads. For v1, it picks the first match by Firestore query order (which is stable per query but not semantically meaningful).

### Scenario 3: Salon/staff phones from Salestrail

**Risk**: Staff members make calls from the office line. Those calls will match office leads, not the staff member.

**Existing behavior**: The Salestrail matching engine checks `reps.phone` first to identify internal calls. If the office line is NOT on any rep's record, it will match the first lead with that phone.

**Mitigation**: Ensure office/shared phones are set on rep records so they're caught by the rep-matching step.

---

## Estimate: How Many Leads Share a Phone?

Without live data, we can reason about likely patterns:

| Pattern | Likelihood | Duplicate Type |
|---------|-----------|----------------|
| Same person, different format (space vs digits) | HIGH | True duplicate — same lead imported twice |
| Same person, Google Sheets vs manual | MEDIUM | Same lead, different import paths |
| Office number shared by 2+ leads | LOW | Work colleagues, couples |
| Void/stale leads with same phone as active lead | MEDIUM | Old DQ leads still in system |

**Conservative estimate**: 5-15% of leads may share a normalized phone with at least one other lead.

---

## Recommended Actions

1. **Before migration**: Run a dedicated de-duplication query to count and flag leads with identical normalized phones. This is:

```javascript
// In Firebase Console or admin script:
const leads = await db.collection("leads").get();
const phoneMap = new Map();
for (const doc of leads.docs) {
  const norm = normalizeAUPhone(doc.data().phone || "");
  if (!norm) continue;
  if (!phoneMap.has(norm)) phoneMap.set(norm, []);
  phoneMap.get(norm).push(doc.id);
}
const dupes = [...phoneMap.entries()].filter(([_, ids]) => ids.length > 1);
console.log(`Found ${dupes.length} duplicate phone groups`);
```

2. **During migration**: The backfill does NOT merge. This is intentional — merging requires human judgment (which lead is correct?).

3. **After migration**: Run the Salestrail matching engine and monitor for `matchConfidence: "partial"` where multiple leads match. Add admin UI to review these.

4. **Long term**: Consider adding a `duplicateGroupId` field and a merge workflow.
