# Platform Evolution Timeline

This document records the operational evolution of the ASG Leads platform. It is not a release changelog. Its purpose is institutional memory: why the platform changed, what operational weaknesses were being addressed, what architectural commitments were made, and what risks still need context in future engineering sessions.

## 1. Initial Operational Stabilization

**Approximate sequence:** Foundation phase, before deeper security and deployment hardening.

**Operational problem before:** The CRM was already business-critical, but much of the system behaved like a fast-moving internal tool: client-heavy workflows, Firestore listeners spread across hooks and pages, custom PIN-based rep identity, and many operational surfaces sharing mutable lead state.

**Symptoms observed:** Operators could use the platform, but confidence depended on local browser state, successful Firestore listeners, and implicit conventions. Developers had to infer workflow semantics from UI code rather than from shared operational definitions.

**Root cause:** The app had grown around immediate sales operations. Architecture favored speed of delivery over formal boundaries for auth, workflow state, deployment, and diagnostics.

**Changes implemented:** Stabilization focused on preserving daily workflows while making failure modes more visible and reducing high-risk behavior. Existing React, Zustand, Firebase, and Firestore patterns were kept rather than replacing the architecture.

**Result/outcome:** The platform remained usable while later hardening phases could happen incrementally.

**Remaining risks/tradeoffs:** Many workflows remained client-authoritative. The platform still depended heavily on browser runtime, Firebase listener health, and gradual migration rather than a clean backend authority layer.

**Validation performed:** Build and manual operational smoke checks were used as the primary safety net early on.

**Long-term significance:** This phase established the guiding rule for later work: stabilize production workflows first, then harden authority and semantics without breaking operator flow.

## 2. Firestore Auth Timing Fixes

**Approximate sequence:** Early stabilization, before full rules hardening.

**Operational problem before:** Firestore listeners could initialize before Firebase Auth had settled. The app used rep-based operational identity while Firebase rules increasingly expected `request.auth`.

**Symptoms observed:** Production listeners for leads, reps, and settings could fail with `permission-denied` even though the app appeared loaded. Operators saw partial app availability: shell loaded, data streams failed.

**Root cause:** Runtime identity had two layers that were not yet aligned: anonymous Firebase Auth for Firestore session access, and PIN/rep identity for operational authorization. Rules and hooks did not always wait for Firebase auth readiness.

**Changes implemented:** Firestore hooks were adjusted to respect auth readiness before subscribing. Anonymous-compatible operational access was preserved where needed, while elevated paths continued moving toward non-anonymous UID/claims authority.

**Result/outcome:** Operational listeners became more reliable under the current identity model without rolling back the security direction.

**Remaining risks/tradeoffs:** Anonymous auth remains a compatibility bridge. It should not become the final authorization model for privileged operations.

**Validation performed:** `npm run test:auth-boundaries`, Firestore rules dry-run validation, and production-flow reasoning around `useLeads`, `useReps`, and `useAppSettings`.

**Long-term significance:** This phase clarified the migration contract: Firebase Auth is the transport/session authority, rep identity remains the operational profile, and rules must bridge that reality until UID/claims coverage is complete.

## 3. Floating Calculator Hardening

**Approximate sequence:** Early operator tool stabilization.

**Operational problem before:** The floating calculator was a high-frequency operator tool embedded in the main CRM shell. Any instability in drag, resize, keyboard input, chained operations, or viewport placement could interrupt sales work.

**Symptoms observed:** Calculator workflows needed to tolerate mobile use, repeated equals, percent calculations, error recovery, panel movement, and persistent sizing/position behavior.

**Root cause:** A calculator inside an operational CRM is both a UI widget and a productivity tool. It needs stricter interaction semantics than decorative floating UI.

**Changes implemented:** Calculator logic and floating panel behavior were kept isolated in `src/components/FloatingCalculator/CalculatorPanel.tsx` and `src/components/FloatingCalculator/FloatingCalculator.tsx`, with viewport clamping, pointer capture guards, keyboard handling, history, and persistence-oriented sizing behavior.

**Result/outcome:** The calculator became a stable operator utility rather than a risky shell embellishment.

**Remaining risks/tradeoffs:** The calculator still lives client-side and should continue to be tested on mobile/touch devices when shell layout changes.

**Validation performed:** Calculator interaction QA focused on chained operations, percent behavior, repeated equals, error recovery, resizing, and mobile usability.

**Long-term significance:** This phase reinforced that productivity tools inside the CRM need operational hardening, not cosmetic treatment.

## 4. TypeScript and Build Stabilization

**Approximate sequence:** Continuous foundation work across stabilization phases.

**Operational problem before:** TypeScript errors and build instability made it harder to distinguish real platform regressions from incidental compile breakage.

**Symptoms observed:** Build checks could fail due to type drift between pages, hooks, generated metadata, and shared domain models.

**Root cause:** The app spans many operational domains: leads, deals, reps, documents, training, settings, calendar, region state, and workflow queues. Without build discipline, local changes could silently destabilize unrelated surfaces.

**Changes implemented:** `npm run build` remained the required final gate. New guard scripts were added for auth boundaries, observability, release metadata, workflow state, and region identity.

**Result/outcome:** Build and targeted scripts now provide faster regression detection for the highest-risk architectural surfaces.

**Remaining risks/tradeoffs:** The project still lacks a broad automated browser/e2e suite that can authenticate and exercise all production workflows.

**Validation performed:** `npm run build` and focused scripts in `package.json`.

**Long-term significance:** Build stability became the baseline contract for every hardening phase.

## 5. Deployment Governance Introduction

**Approximate sequence:** After runtime stabilization, before release metadata formalization.

**Operational problem before:** Deployment was production-first and easy to run through direct hosting deploy paths. Environment intent, rollback context, and Firebase target assumptions were not explicit enough.

**Symptoms observed:** Operators and developers could not easily tell what version was deployed, which Firebase project was targeted, or whether a deploy was a dry run, staging-labeled build, or production publish.

**Root cause:** Release process was encoded mostly in commands and local knowledge rather than governed scripts and generated metadata.

**Changes implemented:** `deploy.ps1` became the governed release path. Production deploys verify the expected Firebase project. Dry-run and environment flags were introduced. Rollback tags follow `pre-deploy-YYYYMMDD-HHMMSS`.

**Result/outcome:** Releases gained explicit environment intent, safer production targeting, and better rollback context.

**Remaining risks/tradeoffs:** `npm run deploy` still exists as a hosting-only shortcut. A true separate staging Firebase project remains a future need.

**Validation performed:** Release dry runs, Firebase target checks, and build validation.

**Long-term significance:** Deployment became an operational control surface, not just a publish command.

## 6. Firestore Rules Hardening

**Approximate sequence:** After server authorization foundations began.

**Operational problem before:** Firestore rules allowed too many direct client writes for privileged or audit-sensitive collections. Some admin actions were protected mostly by frontend permissions.

**Symptoms observed:** Settings history, audit logs, and app settings could be written from client paths that were difficult to distinguish from trusted system actions.

**Root cause:** The original model used Firestore as both operational database and write authority. As the platform matured, this was too broad for privileged surfaces.

**Changes implemented:** `firestore.rules` was tightened around elevated access, callable-authoritative collections, and explicit collection rules. Direct client creates were denied for `settingsHistory`, `auditLogs`, and legacy `audit`. Direct client writes to `appSettings/config` were denied.

**Result/outcome:** Privileged configuration and audit paths became materially safer while realtime operational collections stayed compatible.

**Remaining risks/tradeoffs:** Some admin metadata, document/template, training, and realtime operational writes remain client-authoritative by design until migrated safely.

**Validation performed:** `npx firebase deploy --only firestore:rules --dry-run` and `npm run test:auth-boundaries`.

**Long-term significance:** This phase marked the move from frontend-enforced trust to rule/function-enforced trust.

## 7. UID and Claims Identity Foundation

**Approximate sequence:** Alongside rules hardening and before deeper RBAC enforcement.

**Operational problem before:** The app used custom PIN login and numeric rep IDs, while Firebase security needed UID and claim-compatible identity.

**Symptoms observed:** There was no single server-trusted identity shape for role, region, active status, or rep linkage.

**Root cause:** Rep identity had been designed as an operational profile, not a Firebase authorization primitive.

**Changes implemented:** `docs/AUTH_CLAIMS_FOUNDATION.md`, `src/lib/authIdentity.ts`, `src/lib/authClaims.ts`, and related hooks established the model: Firebase UID is the future identity authority, rep docs remain operational profiles, and claims will eventually carry role, region, allowed regions, active state, and rep ID.

**Result/outcome:** Future rule and callable migrations have a defined identity target without forcing an immediate auth rewrite.

**Remaining risks/tradeoffs:** Missing claims still fall back to linked rep profile. Anonymous sessions remain part of the compatibility bridge.

**Validation performed:** Auth-boundary tests and runtime checks around linked rep resolution.

**Long-term significance:** This phase created the identity migration map that prevents future security work from becoming a disruptive auth redesign.

## 8. Callable-Authoritative Settings and Audit Operations

**Approximate sequence:** Server authorization phases 1-3.

**Operational problem before:** Settings updates, rollbacks, settings history, and audit records were too sensitive to remain direct client writes.

**Symptoms observed:** Admin configuration changes needed stronger attribution, rollback confidence, and server-side validation.

**Root cause:** The frontend could author privileged documents directly. Firestore rules alone could not provide rich validation or consistent audit attribution.

**Changes implemented:** Cloud Functions were introduced for `appendAuditEvent`, `updateAppSettingsCallable`, and `rollbackAppSettingsCallable`. `src/lib/settingsService.ts` moved settings and rollback flows to callable authority. Server records include Firebase UID, rep ID claim, role claim, provider, source, and server timestamp.

**Result/outcome:** Settings and audit flows gained server authority, consistent attribution, and a safer rollback story.

**Remaining risks/tradeoffs:** Rep admin metadata, document/template administration, training administration, and some operational audit side-effects remain candidates for future callables.

**Validation performed:** `npm run test:auth-boundaries`, `npm run test:observability`, callable logging review, and rules dry-run validation.

**Long-term significance:** This phase established the migration pattern for future privileged operations: callable first, observe, then tighten rules.

## 9. Operational Observability Improvements

**Approximate sequence:** After callable/rule hardening exposed more permission and listener failure modes.

**Operational problem before:** Failures were often raw Firebase errors, console-only logs, or silent catches. Operators lacked actionable recovery guidance.

**Symptoms observed:** Settings save failures, rollback failures, listener failures, and callable failures could be difficult to interpret.

**Root cause:** Error handling was distributed and technical. The system had logging, but not enough operational classification.

**Changes implemented:** `src/lib/operationalDiagnostics.ts` introduced diagnostic classification for auth denied, unauthenticated, validation, callable unavailable, network, listener, degraded behavior, and unknown failures. Admin settings and history surfaces received safer, more actionable messaging.

**Result/outcome:** Operators get clearer failure messages, and developers get more consistent diagnostic logs.

**Remaining risks/tradeoffs:** Many non-fatal paths still use local catches. A full in-app diagnostics panel has not been introduced.

**Validation performed:** `npm run test:observability`.

**Long-term significance:** Diagnostics became workflow tooling: the platform now treats error clarity as part of operational trust.

## 10. Release Engineering Foundations

**Approximate sequence:** After deployment governance and observability foundations.

**Operational problem before:** Runtime version visibility and environment context were mostly external to the app.

**Symptoms observed:** Operators could deploy successfully but had limited in-app or artifact-level traceability for version, commit, deploy time, Firebase project, and environment.

**Root cause:** Build metadata was not generated as a first-class artifact.

**Changes implemented:** `scripts/write-release-metadata.cjs` generates `src/generated/releaseMetadata.ts`. `src/lib/releaseMetadata.ts` exposes helpers for environment labels and production detection. `npm run prebuild` generates metadata automatically. `npm run release:metadata`, `release:deploy`, and `release:dry-run` formalized release commands.

**Result/outcome:** Builds carry explicit release context that can be surfaced and validated.

**Remaining risks/tradeoffs:** Metadata is build-time information, not a server-trusted deployment attestation.

**Validation performed:** `npm run test:release-metadata` and `npm run build`.

**Long-term significance:** Release state became inspectable and testable, supporting safer operations and future incident review.

## 11. Operator Productivity Refinement

**Approximate sequence:** After platform stability, auth, rules, observability, and release foundations.

**Operational problem before:** Operators had functional workflows, but high-frequency actions still carried friction: repeated navigation, buried context, inconsistent feedback, modal interruption, and limited power-user affordances.

**Symptoms observed:** Day-to-day speed depended on operator memory. Some diagnostics and state transitions were visible only after something went wrong.

**Root cause:** Earlier phases prioritized correctness and hardening. Productivity polish had not yet been treated as operational cost reduction.

**Changes implemented:** Audit and QA phases focused on excessive clicks, repetitive workflows, loading states, sidebar friction, mobile pain points, dashboard signal quality, and keyboard/power-user flows. The implementation approach favored small workflow accelerators and clarity improvements over feature expansion.

**Result/outcome:** The platform direction shifted from merely stable to operationally efficient.

**Remaining risks/tradeoffs:** Productivity work must stay disciplined; convenience features can create dashboard noise or modal complexity if not tied to high-frequency workflows.

**Validation performed:** Build checks, exploratory operational QA, and focused workflow review.

**Long-term significance:** Operator time became an explicit design constraint.

## 12. Workflow Consistency Hardening

**Approximate sequence:** After productivity QA identified inconsistent operational semantics.

**Operational problem before:** Dashboard, Inbox, badges, notifications, next-action logic, and sidebar indicators could interpret callback/follow-up state differently.

**Symptoms observed:** Completing a task did not always resolve all operational state. Booked leads could still appear as follow-up work. Dashboard and Inbox could disagree about urgency.

**Root cause:** Workflow eligibility logic lived in multiple places and evolved independently.

**Changes implemented:** `src/lib/workflowState.ts` centralized queue type, priority, due date, overdue logic, terminal status, booked state, and Inbox completion patch semantics. `src/lib/nextAction.ts`, Dashboard, Inbox, Leads, reminders, and badges were aligned around shared workflow state.

**Result/outcome:** Callback, follow-up, booked, terminal, and no-action states now have a single operational definition.

**Remaining risks/tradeoffs:** More UI surfaces should continue migrating away from local interpretations as they are touched.

**Validation performed:** `npm run test:workflow-state`, build validation, and parity checks across Dashboard, Inbox, next action, and badges.

**Long-term significance:** The platform moved from UI-derived workflow meaning to shared operational truth.

## 13. Operational Queue Truth Fixes

**Approximate sequence:** During workflow consistency hardening.

**Operational problem before:** Dashboard and Inbox queue metrics could be derived from the first loaded page of leads rather than the full authoritative operational queue.

**Symptoms observed:** Overdue callbacks or follow-ups outside the loaded window could silently disappear from operator queues and metrics.

**Root cause:** Performance-oriented paged lead loading was reused for operational truth. Loaded-window data and authoritative queue data were not clearly separated.

**Changes implemented:** `useOperationalQueueLeads` was introduced for authoritative queue derivation without amplifying every general lead load. Dashboard, Inbox, and app badges were adjusted to use operational queue state where queue truth mattered.

**Result/outcome:** Operational counts and queues better reflect real work rather than the current UI page.

**Remaining risks/tradeoffs:** Firestore query design still needs continued monitoring as data volume grows. Operational queries should remain focused and indexed.

**Validation performed:** `npm run test:workflow-state`, build checks, and Dashboard/Inbox queue parity scenarios.

**Long-term significance:** This phase separated browsing data from work-queue truth, a critical distinction for manager/operator trust.

## 14. Regional Workspace Identity Refinement

**Approximate sequence:** After region-aware queues and workflow consistency existed.

**Operational problem before:** Brisbane/Perth separation existed functionally, but region identity was not visually obvious enough. The selector felt like a secondary filter rather than a workspace identity layer.

**Symptoms observed:** Operators could switch regions, but current workspace awareness required attention. Region context was easy to miss during rapid navigation or mobile use.

**Root cause:** Region state had operational significance but was presented as a small control in the sidebar footer.

**Changes implemented:** `src/lib/regionIdentity.ts` introduced shared Brisbane/Perth identity metadata. The workspace switcher moved directly under the ASG CRM brand in the sidebar. Region accent variables now style active nav, queue badges, topbar region badge, and primary lead action accents. Region switching shows a short status message and persists via `asg-crm:active-region`.

**Result/outcome:** Region is now a persistent workspace signal rather than a buried filter.

**Remaining risks/tradeoffs:** Authenticated mobile/sidebar visual validation still needs production or seeded local data. Region accents should remain subtle and accessible, not drift into separate themes.

**Validation performed:** `npm run test:region-identity`, `npm run build`, responsive smoke screenshots, and source checks for sidebar placement and persistence.

**Long-term significance:** Regional separation became part of operator cognition, not just query filtering.

## 15. Operational Trust and Queue Integrity Hardening

**Approximate sequence:** After workflow semantics, queue truth, and regional workspace identity were established.

**Operational problem before:** Several high-frequency workflows were technically functional but not fully trustworthy under interruption, failed persistence, touch use, or rapid queue navigation. Operators could make edits, change tasks, delete records, or respond to urgency signals without always receiving clear confirmation that the system had preserved their intent.

**Symptoms observed:** Dirty sidebar edits could be lost when navigating away. Auto-save could silently skip when required lead identity fields were empty. Save progress used blocking feedback in places where operators expected background persistence. Callback/follow-up badges signaled urgency but did not always resolve directly into the actionable work queue. Bulk delete recovery was inconsistent with single-delete undo behavior. Tab counts could imply global truth while reflecting a filtered or loaded view. Touch/mobile export flows and notification warnings created avoidable hesitation.

**Root cause:** Earlier hardening had made workflow state more correct, but trust semantics were still distributed across UI surfaces. Save state, dirty state, destructive recovery, urgency routing, and filtered-count meaning were treated as local component behavior rather than operational confidence contracts.

**Changes implemented:** Sidebar persistence gained explicit dirty, saving, saved, and failed states. Closing a dirty sidebar now attempts persistence first and preserves operator context on validation or save failure. Empty-name auto-save paths became visible errors rather than silent skips. Auto-save feedback moved from blocking overlays toward inline/non-blocking indicators. Bulk delete now captures recovery state for multiple leads. Bulk update flows gained rollback snapshots where practical. Callback and follow-up urgency badges route into actionable filtered queues. Lead tab counts now respect active search/filter scope and label visible counts as in-view. Export menus received touch-friendly click targets, and unsupported mobile notification states were suppressed.

**Workflow trust improvements:** Operators now receive immediate evidence of whether changes are draft, saving, saved, or failed. Failed saves keep the work surface open, preserving recovery context. Destructive actions follow a more consistent undo model, reducing the mental cost of bulk operations.

**Queue-semantic improvements:** Urgency indicators now behave as navigation into work rather than passive decoration. Counts are less likely to imply more authority than they have, and actionable callback/follow-up routing better aligns shell badges, Leads filters, and queue semantics.

**Remaining risks/tradeoffs:** Save trust is still implemented client-side and depends on each save surface honoring the success/failure contract. Full authenticated browser coverage remains incomplete. Some filter preset and tab-reset behaviors may still need refinement, but were intentionally kept out of this phase to avoid broad UX churn.

**Validation performed:** `npm run build`, `npm run test:auth-boundaries`, `npm run test:observability`, `npm run test:workflow-state`, `git diff --check`, source-path review of save/undo flows, and mobile/touch interaction review for export semantics.

**Long-term significance:** This phase marked a shift from technically functional workflows to cognitively trustworthy workflows. Operator confidence, recovery clarity, and queue/action alignment became platform maturity concerns, not polish.

## Current Platform State

The ASG Leads platform is a production Firebase/React operational CRM with stabilized deployment flow, hardened privileged settings/audit paths, compatibility-aware auth migration foundations, shared workflow-state semantics, authoritative operational queue direction, visible regional workspace identity, and explicit operator trust semantics around saving, urgency, counts, and destructive recovery.

The architecture remains intentionally incremental: realtime lead and operational workflows are still mostly client/Firebase-driven, while privileged configuration and audit surfaces are moving behind callable authority.

## Major Architectural Pillars

- **React/Vite SPA shell:** in-memory tab navigation, Zustand state, Firestore listeners.
- **Firestore as operational database:** leads, reps, settings, deals, audit, documents, training, and regional workflow data.
- **Compatibility identity bridge:** Firebase Auth session plus rep profile operational identity, moving toward UID/custom-claims authority.
- **Callable-authoritative privileged operations:** settings, rollback, and audit foundations.
- **Shared workflow semantics:** centralized callback/follow-up/booked/terminal logic.
- **Governed release path:** build metadata, dry-run deploys, production target checks, rollback tagging.
- **Operational diagnostics:** user-safe error classification and structured callable/listener logging foundations.
- **Regional workspace awareness:** Brisbane/Perth identity surfaced as persistent context.
- **Operational trust semantics:** dirty-state preservation, inline save feedback, actionable urgency routing, and consistent undo recovery.

## Current Operational Priorities

- Keep production workflows stable while continuing authority migration.
- Preserve anonymous-compatible operational access only as a bridge, not a final security model.
- Expand shared workflow-state usage as more surfaces are touched.
- Keep Dashboard and Inbox truthful without broad Firestore load amplification.
- Improve operator confidence through visible context, clear errors, and deterministic task lifecycle behavior.
- Treat save visibility, undo consistency, and actionable queue routing as part of workflow correctness.

## Remaining Long-Term Risks

- Rep admin metadata is not fully callable-authoritative.
- Document/template/training administration still has client-authoritative areas.
- A true staging Firebase project is not yet separated from production-shaped local environment assumptions.
- Anonymous auth and rep-profile fallback remain migration dependencies.
- Full authenticated e2e coverage is still missing.
- Some non-fatal operational errors are still local catches or console-only logs.
- Save/undo trust behavior is improved but still needs browser-level authenticated regression coverage.

## Recommended Future Evolution Path

1. Complete Firebase UID linking and custom claims rollout for active reps.
2. Move rep admin metadata changes behind dedicated callables, then tighten `reps` rules.
3. Add a true staging Firebase project and staging hosting target.
4. Add authenticated Playwright/e2e coverage for Leads, Inbox, Dashboard, Admin settings, region switching, and calculator workflows.
5. Continue migrating duplicated workflow decisions to `workflowState`.
6. Add an operator-safe diagnostics surface for listener health, release metadata, auth state, and degraded behavior.
7. Review document/template/training writes with Storage rules before moving them behind server authority.
8. Add authenticated e2e coverage for dirty-sidebar navigation, failed save recovery, bulk undo, badge-to-queue routing, and mobile export.

## Documentation Gaps To Close

- A live auth migration runbook covering UID linking, claim setting, rollback, and support procedures.
- A Firestore rules intent map by collection, including which paths are client-authoritative, callable-authoritative, and migration candidates.
- A queue semantics reference for Dashboard, Inbox, notifications, badges, and next-action behavior.
- A save/undo trust reference covering dirty state, failed persistence, recovery windows, and bulk action rollback expectations.
- A release/runbook page for production deploy, rollback, dry run, and Firebase console checks.
- A regional operations guide for Brisbane/Perth data ownership, allowed-region policy, and backfill expectations.
