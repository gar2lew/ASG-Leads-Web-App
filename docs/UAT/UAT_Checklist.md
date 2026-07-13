# v1.0 UAT Checklist

Release: v1.0 Internal Production Release
Owner: Product Owner and Release Manager

## Entry Criteria

| Check | Owner | Status | Notes |
| --- | --- | --- | --- |
| Release candidate commit identified. | Release Manager | Pending |  |
| Working tree clean before UAT validation. | Engineering | Pending |  |
| Validation baseline reviewed. | Engineering | Pending |  |
| Test environment approved. | Release Manager | Pending |  |
| Test data approved. | Release Manager | Pending |  |
| Rep tester assigned. | Product Owner | Pending |  |
| Manager tester assigned. | Product Owner | Pending |  |
| Admin tester assigned. | Product Owner | Pending |  |
| Director reviewer assigned. | Product Owner | Pending |  |
| No deploy, migration, live Salestrail sync, or phone write action included. | Release Manager | Pending |  |

## Role Coverage

| Area | Sales Rep | Manager | Admin | Director | Status |
| --- | --- | --- | --- | --- | --- |
| Login | Required | Required | Required | Required | Pending |
| Dashboard | Required | Required | Required | Required | Pending |
| Lead management | Required | Required | Required | Review | Pending |
| Searching | Required | Required | Required | Review | Pending |
| Notes | Required | Required | Required | Review | Pending |
| Appointments | Required | Required | Required | Review | Pending |
| Documents | Required | Required | Required | Review | Pending |
| Reports | Personal or role view | Required | Support view | Required | Pending |
| Salestrail | If visible | If visible | Required control review | Release posture review | Pending |
| Settings | Personal settings | Role-appropriate settings | Required | Release posture review | Pending |
| Logout | Required | Required | Required | Required | Pending |

## Issue Severity Matrix

| Severity | Definition | Examples | Release Impact |
| --- | --- | --- | --- |
| Critical | Blocks login, core lead work, data safety, security, permissions, or release approval. | Cannot log in, lead saves fail, unauthorised admin access, production-risk action can be run accidentally. | No-Go until fixed or formally accepted by release owner with explicit rationale. |
| High | Blocks a major staff workflow or creates material risk of incorrect CRM records. | Call logging fails, appointments cannot be created, manager report is misleading, admin setting is unclear and risky. | No-Go unless workaround is approved, documented, and retested. |
| Medium | Causes repeated confusion, slows staff, affects mobile usability, or reduces confidence. | Labels unclear, extra clicks, confusing filter state, non-critical guide mismatch. | Can proceed only with tracked issue and accepted workaround or backlog item. |
| Low | Cosmetic, minor wording, minor layout, or isolated preference issue. | Typo, minor spacing, low-impact label polish. | Can proceed if tracked. |

## v1.0 Exit Criteria

| Criteria | Required Result | Status | Evidence |
| --- | --- | --- | --- |
| Rep workflow | Rep can log in, find a lead, update safe test data, add notes, create appointment, review documents, understand settings, and logout. | Pending |  |
| Manager workflow | Manager can review team dashboard, leads, notes, appointments, documents, reports, Salestrail context if visible, settings, and logout. | Pending |  |
| Admin workflow | Admin can review roster, settings, system health, Salestrail controls, documents, reports, and risky controls without running blocked actions. | Pending |  |
| Director workflow | Director can review dashboard, pipeline, reports, Salestrail posture, release controls, and sign-off material. | Pending |  |
| Severity gate | Zero unresolved Critical issues and zero unresolved High issues without approved workaround. | Pending |  |
| Data safety | No production data action, migration, live sync, phone write, or deploy occurred during UAT. | Pending |  |
| Documentation accuracy | Any staff guide mismatch affecting core workflow is corrected or logged before go/no-go. | Pending |  |
| Mobile smoke | At least one core rep lead workflow passes on phone-sized viewport or has accepted workaround. | Pending |  |
| Signoff | Rep, manager, admin, director, product owner, and release manager decisions captured. | Pending |  |

## Final Decision

| Decision | Conditions |
| --- | --- |
| Go | All exit criteria pass, no unresolved Critical or High issues, release owner signs off. |
| Conditional Go | Medium or Low issues remain, workarounds are documented, and release owner accepts risk. |
| No-Go | Any unresolved Critical issue, any High issue without workaround, failed data safety gate, or required production-risk action. |
