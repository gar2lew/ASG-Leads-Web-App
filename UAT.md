Issue ID: UAT-ISS-001
Severity: High
Role: Sales Rep / Admin
Workflow: Lead loading / Quick Pull / Google Sheets import
Page: Lead list / Dashboard

Issue:
No leads were present on initial app load. Running Quick Pull imported leads, but some leads had no date and the import stopped at 100 leads again.

Expected result:
CRM should load the current working lead set automatically or clearly explain why no leads are visible. Quick Pull should import all eligible leads, preserve/import lead dates correctly, and clearly report whether any limits were reached.

Actual result:
No leads appeared initially. Quick Pull was required. Imported leads included missing dates. Import stopped at 100 leads.

Business impact:
Staff may believe there are no leads to work. Lead recency, reporting, follow-up priority and daily workflow may be unreliable. The 100-lead limit may hide valid leads.

Suggested fix:
Investigate lead loading, Quick Pull pagination/limit behaviour, date mapping from Google Sheets/Firebase import, and empty-state messaging. Add clear import result reporting showing imported count, skipped count, failed rows and whether a limit was reached.
