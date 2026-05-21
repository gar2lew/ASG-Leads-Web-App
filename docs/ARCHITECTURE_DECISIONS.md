# Architecture Decisions

This document captures the major architectural and operational decisions behind the ASG Leads platform. It is intentionally practical: the goal is future engineering continuity, not ADR ceremony.

## Core Platform Principles

- **Operational truth over cosmetic metrics.** Queues, dashboards, and badges should reflect real work, not only currently loaded UI data.
- **Workflow consistency over feature expansion.** One definition of callback, follow-up, booked, stale, terminal, and done is more valuable than more surfaces with divergent logic.
- **Incremental hardening over destabilizing rewrites.** The CRM is production-operational; security and architecture improvements must preserve daily work.
- **Governed deployment over ad-hoc release.** Releases need environment intent, target checks, metadata, dry runs, and rollback context.
- **Operator cognition over visual novelty.** UI changes should reduce hesitation and context loss, not introduce new visual systems.
- **Workflow confidence over cosmetic responsiveness.** Fast-feeling UI is not enough; operators need visible persistence, recoverable destructive actions, and urgency signals that lead to work.
- **Truthful autosave over hybrid save theater.** A form must be true autosave or explicit save. If autosave is active, UI controls must describe flush, retry, saved, saving, dirty, or failed states honestly.
- **Deterministic action targeting over visual position.** Workflow actions must resolve by stable record identity, not row index, stale closure state, or adjacent list position.
- **Silent failure is operationally unsafe.** If a save, queue transition, or destructive recovery path cannot complete, the operator should see a clear state and retain recovery context.
- **One coherent platform over fragmented regional UX.** Brisbane and Perth need clear identity without separate applications, layouts, or themes.
- **Compatibility bridges are temporary architecture, not permanent philosophy.** Anonymous auth and rep-profile fallbacks exist to keep production running during migration.

## 1. Rep/PIN Operational Identity Model

**Problem Context:** The platform began as an internal operational CRM where reps selected their profile and authenticated through PIN/access-code flows. This model fit daily field operations before Firebase UID/claims were used as authorization primitives.

**Alternatives Considered:** Replace PIN auth immediately with Firebase Auth accounts; keep PIN auth indefinitely as the only identity system; run both models during migration.

**Decision Made:** Preserve rep/PIN operational identity while introducing Firebase identity foundations underneath it.

**Why This Approach Won:** Operators already depended on rep profiles for ownership, permissions, call attribution, targets, and workflow assignment. A hard auth replacement would risk blocking production usage.

**Tradeoffs Accepted:** Frontend rep permissions remain UX-facing in some places. Rep ID and Firebase UID are not yet fully unified.

**Risks Remaining:** PIN data and rep admin metadata need continued hardening. Rep activation, role, region, and UID linkage should move behind server authority.

**Long-Term Direction:** Firebase UID becomes the identity authority; rep documents remain operational profiles.

## 2. Firebase Anonymous Auth Compatibility Bridge

**Problem Context:** Firestore rules require `request.auth`, but the production app still relies on rep/PIN login and anonymous Firebase sessions for operational access.

**Alternatives Considered:** Require non-anonymous Firebase login immediately; loosen rules broadly; keep anonymous-compatible read/write bridges for operational collections only.

**Decision Made:** Keep anonymous Firebase Auth compatibility for core operational workflows while requiring non-anonymous/elevated authority for privileged paths.

**Why This Approach Won:** It restored production listener compatibility without undoing hardening. It also avoided emergency wildcard rules.

**Tradeoffs Accepted:** Anonymous sessions are not a strong final security boundary. Rules need explicit compatibility logic during migration.

**Risks Remaining:** The bridge can be mistaken for final architecture if not documented. Privileged operations must not rely on anonymous access.

**Long-Term Direction:** Phase out anonymous operational access after UID linking and claims coverage are reliable.

## 3. UID and Custom Claims Migration Foundation

**Problem Context:** Future Firestore rules and callable Functions need server-trusted role, region, active state, and rep linkage, but the existing app is rep-profile based.

**Alternatives Considered:** Store all authority only in rep docs; use custom claims immediately and block users without claims; introduce claim helpers with rep fallback.

**Decision Made:** Establish UID/custom claims as the target authority while falling back to linked rep profiles during migration.

**Why This Approach Won:** It provides a clear endpoint without breaking current operators. It lets future rules/functions trust claims once rollout is complete.

**Tradeoffs Accepted:** Authorization is temporarily dual-sourced. Missing claims must be interpreted carefully.

**Risks Remaining:** Claims can drift from rep docs until admin tooling owns updates consistently.

**Long-Term Direction:** Claims carry `repId`, `role`, `region`, `allowedRegions`, and `active`; rep docs carry operational/profile data.

## 4. Callable-Authoritative Privileged Operations

**Problem Context:** Settings updates, rollback, settings history, and audit writes are too sensitive to remain direct client-authored documents.

**Alternatives Considered:** Keep direct Firestore writes with stricter rules; move all writes to Functions immediately; migrate low-risk privileged flows first.

**Decision Made:** Move settings, rollback, and structured audit operations behind callable Functions first.

**Why This Approach Won:** These operations are high-value, relatively bounded, and benefit from server timestamps, attribution, validation, and structured logs.

**Tradeoffs Accepted:** The platform now has mixed write authority: callable-authoritative for privileged settings/audit, client-authoritative for many realtime operational workflows.

**Risks Remaining:** Rep admin metadata, documents/templates, training administration, commissions, and some audit side-effects still need future server authority.

**Long-Term Direction:** Use the same callable-first pattern for each privileged domain: migrate, observe, remove fallback, tighten rules.

## 5. Firestore Rules Hardening Philosophy

**Problem Context:** Earlier rules allowed broad authenticated client writes, including areas that became privileged as the platform matured.

**Alternatives Considered:** Lock down all collections immediately; keep broad rules for operational convenience; tighten only migrated/high-risk surfaces.

**Decision Made:** Harden explicit privileged collections while preserving operational collections until safe migration paths exist.

**Why This Approach Won:** It reduces real risk without interrupting lead, appointment, inbox, dashboard, and sales workflows.

**Tradeoffs Accepted:** Security posture is uneven by design during migration. Some collections remain client-authoritative.

**Risks Remaining:** Client-authoritative admin-like surfaces need review and migration. Rules must continue to avoid broad wildcard allowances.

**Long-Term Direction:** Collection-by-collection authority map: public/operational, authenticated-client, elevated-client, callable-authoritative, and server-only.

## 6. Shared Workflow-State Semantic Layer

**Problem Context:** Dashboard, Inbox, Leads, badges, notifications, reminders, and next-action logic had different interpretations of callback/follow-up/booked state.

**Alternatives Considered:** Patch each surface independently; move all workflow logic server-side immediately; centralize semantics in a shared client library first.

**Decision Made:** Create a shared workflow-state layer in `src/lib/workflowState.ts` and align UI surfaces around it.

**Why This Approach Won:** It fixes semantic divergence quickly without a backend rewrite. It gives every surface one operational definition.

**Tradeoffs Accepted:** The shared layer is still client-side. Server enforcement of workflow semantics remains future work.

**Risks Remaining:** Older surfaces may still contain local logic until touched. New features must resist duplicating workflow decisions.

**Long-Term Direction:** Keep client semantics centralized; move authoritative task lifecycle operations server-side only when operationally justified.

## 7. Operational Queue Truth Model

**Problem Context:** Dashboard and Inbox queues cannot be trusted if derived only from the first loaded lead page.

**Alternatives Considered:** Load all leads everywhere; accept loaded-window metrics; introduce focused operational queue queries.

**Decision Made:** Separate browsing/windowed lead data from authoritative operational queue data via focused queue loading.

**Why This Approach Won:** Operators need overdue work to appear even if it is outside the visible lead page. At the same time, the app must avoid indiscriminate Firestore load amplification.

**Tradeoffs Accepted:** More query paths exist, and queue queries require performance discipline and indexing awareness.

**Risks Remaining:** Data growth may expose query/index limits. Queue derivation should be monitored as regions and teams grow.

**Long-Term Direction:** Treat operational queues as first-class work streams, with authoritative query strategy and clear truncation/degraded-state messaging.

## 8. Release-Governed Deployment Model

**Problem Context:** Production deployment was too dependent on local command knowledge and Firebase target assumptions.

**Alternatives Considered:** Keep `npm run deploy` as the release path; adopt a full external CI/CD system immediately; introduce governed local release scripts first.

**Decision Made:** Use `deploy.ps1` as the governed deployment entrypoint with environment checks, dry-run mode, release metadata, and rollback tagging.

**Why This Approach Won:** It improves safety immediately without requiring a broader infrastructure migration.

**Tradeoffs Accepted:** Release governance is still local-script based. A true staging project is not yet available.

**Risks Remaining:** Operators can still use hosting-only shortcuts if they bypass guidance.

**Long-Term Direction:** Add separate staging Firebase resources and eventually move governed release checks into CI/CD.

## 9. Regional Workspace Identity Approach

**Problem Context:** Brisbane/Perth separation is operationally meaningful, but the old selector felt like a secondary filter.

**Alternatives Considered:** Separate apps per region; separate layouts/themes; keep region as a small filter; promote region as workspace identity.

**Decision Made:** Promote region selection to a persistent workspace control under the ASG CRM brand and add lightweight region context signals.

**Why This Approach Won:** Operators need instant workspace awareness without context hunting. The app can reinforce region identity without fragmenting workflows.

**Tradeoffs Accepted:** Region identity adds visual state to the shell and must stay subtle.

**Risks Remaining:** Region styling can drift into theming if not kept constrained. Authenticated mobile/sidebar validation still needs real data coverage.

**Long-Term Direction:** Region remains a primary workspace dimension across queues, dashboards, badges, and future permission claims.

## 10. Single Design-System / Multi-Region Strategy

**Problem Context:** Multi-region operations need distinction, but separate visual systems would increase maintenance and cognitive overhead.

**Alternatives Considered:** Full themes per region; separate region-specific shells; CSS-variable accent identity within one shell.

**Decision Made:** Use one design system with region identity expressed through restrained CSS variables and shared metadata.

**Why This Approach Won:** It preserves platform coherence. Operators can recognize region context peripherally without learning a different UI.

**Tradeoffs Accepted:** Visual distinction is intentionally subtle, so it relies on placement and persistence as much as color.

**Risks Remaining:** Accent contrast and meaning need periodic review. Region identity should not become decorative noise.

**Long-Term Direction:** Continue one-platform UI, with region identity as an operational context layer.

## 11. Operational Observability Philosophy

**Problem Context:** Raw Firebase errors and console-only logs do not help operators recover from failed saves, listeners, or callable operations.

**Alternatives Considered:** Build a full diagnostics dashboard immediately; leave logging as developer-only; add classification helpers and targeted messages first.

**Decision Made:** Introduce lightweight operational diagnostics that classify failures and provide user-safe actionable messages.

**Why This Approach Won:** It improves trust without adding dashboard clutter or large observability infrastructure.

**Tradeoffs Accepted:** Observability is incremental and uneven across hooks until each path is reviewed.

**Risks Remaining:** Silent catches and local-only errors still exist. Runtime health is not yet fully surfaced in-app.

**Long-Term Direction:** Standardize listener/callable diagnostics and add an operator-safe system health surface when enough signals are meaningful.

## 12. Incremental Stabilization Over Major Rewrites

**Problem Context:** The app is production-operational and broad: leads, inbox, dashboard, admin, documents, training, calendar, calculator, commissions, and regional workflows.

**Alternatives Considered:** Rewrite auth, routing, backend authority, or data model in one major phase; continue targeted stabilization.

**Decision Made:** Prefer narrow, validated hardening phases over framework or architecture rewrites.

**Why This Approach Won:** Operational continuity matters more than architectural purity. Each phase can improve safety while preserving the team’s daily work.

**Tradeoffs Accepted:** Transitional complexity remains visible: bridges, fallbacks, mixed authority, and incremental tests.

**Risks Remaining:** Transitional systems can accumulate if not retired deliberately.

**Long-Term Direction:** Keep a migration ledger and retire bridges once their replacement is deployed, monitored, and validated.

## 13. Operational-Truth-First Dashboard Philosophy

**Problem Context:** Dashboards can become attractive but misleading if they summarize incomplete or stale data.

**Alternatives Considered:** Optimize dashboard visuals first; display loaded-window metrics; make dashboard signals depend on authoritative operational state.

**Decision Made:** Dashboard signals must prioritize operational truth, stale/overdue surfacing, and queue parity with Inbox.

**Why This Approach Won:** Managers and operators need dashboards to tell them what requires action, not merely what is currently loaded.

**Tradeoffs Accepted:** Some metrics may need more careful querying and explicit degraded/truncated states.

**Risks Remaining:** Dashboard clutter and false urgency remain risks if new signals are added without queue semantics.

**Long-Term Direction:** Dashboard should remain a signal system: actionable, region-aware, and consistent with Inbox/task lifecycle definitions.

## 14. Build-and-Deploy Governance Approach

**Problem Context:** A mature operational platform needs repeatable validation before release, not only successful local development.

**Alternatives Considered:** Rely on manual QA; rely only on TypeScript build; add targeted guard scripts for high-risk architecture surfaces.

**Decision Made:** Keep `npm run build` as the baseline and add focused tests for auth boundaries, workflow state, region identity, observability, and release metadata.

**Why This Approach Won:** These tests are cheap, targeted, and aligned with real platform risk.

**Tradeoffs Accepted:** Guard scripts are not full integration tests and can miss browser/auth/data issues.

**Risks Remaining:** Full authenticated e2e coverage is still missing.

**Long-Term Direction:** Keep focused architecture guards and add authenticated Playwright flows for core operational journeys.

## 15. Operational Trust Semantics

**Problem Context:** Workflow surfaces could be technically functional while still causing operator doubt: dirty sidebar edits could be lost during navigation, auto-save could skip invalid records without enough feedback, and failed persistence did not always preserve the operator's working context.

**Alternatives Considered:** Keep relying on toast-only feedback; block all navigation behind modal confirmations; make save state a first-class workflow signal.

**Decision Made:** Treat dirty state, save progress, save failure, and successful persistence as explicit operational states that must be visible at the point of work.

**Why This Approach Won:** Operators need confidence while moving quickly. Inline save state reduces hesitation without creating modal friction, and failed saves preserve context for recovery.

**Tradeoffs Accepted:** More UI surfaces must honor the save success/failure contract. Client-side trust semantics are still not a substitute for server authority.

**Risks Remaining:** Some older workflows may still use local save patterns until touched. Authenticated browser tests are needed to prevent regressions across sidebar entry points.

**Long-Term Direction:** Make persistence state and recovery context standard for all high-frequency operational forms.

## 16. Non-Blocking Save Philosophy

**Problem Context:** Blocking overlays during auto-save protected against double actions, but they interrupted operators during routine background persistence and made the app feel less predictable.

**Alternatives Considered:** Keep full-screen blocking overlays; remove save feedback entirely; use non-blocking inline/background indicators with explicit failure handling.

**Decision Made:** Prefer non-blocking save indicators for auto-save and reserve blocking UI for genuinely destructive or irreversible actions.

**Why This Approach Won:** Auto-save should increase confidence, not stop work. The critical requirement is not visual dominance; it is truthful state, actionable failure feedback, and preservation of dirty context.

**Tradeoffs Accepted:** Operators can continue interacting while persistence is pending, so save handlers must be careful about dirty-state transitions and failed-save recovery.

**Risks Remaining:** Complex concurrent edits remain client-side and may need deeper conflict handling in future.

**Long-Term Direction:** Standardize subtle save-state indicators and make failed persistence recoverable before considering heavier synchronization controls.

## 17. Queue Truth Integrity and Actionable Urgency Signals

**Problem Context:** Badges and counts influence operator priorities. If urgency indicators do not resolve into actionable queues, they become anxiety signals rather than workflow tools.

**Alternatives Considered:** Leave badges as passive counters; make badges link to broad pages; route urgency directly into filtered actionable queues with clearer count scope.

**Decision Made:** Urgency signals should navigate to the work they represent, and counts should either reflect the active filter/search context or clearly identify themselves as in-view metrics.

**Why This Approach Won:** Operators trust the platform when signals close the loop: see urgency, click urgency, land on the relevant work. Ambiguous counts and dead-end badges erode confidence even when the underlying data is correct.

**Tradeoffs Accepted:** Some counts are scoped to the current view rather than global authority, so labels and routing must stay honest.

**Risks Remaining:** New dashboards or badges can regress into passive metrics if they bypass shared workflow semantics.

**Long-Term Direction:** Treat every urgency indicator as an entry point into an actionable queue, backed by shared workflow-state definitions.

## 18. Consistent Destructive-Action Recovery

**Problem Context:** Single delete and bulk delete recovery behaved differently. Bulk operations carried higher operational risk but weaker recovery semantics.

**Alternatives Considered:** Require heavy confirmations for every destructive action; keep single-item undo only; capture rollback snapshots for destructive/bulk actions where practical.

**Decision Made:** Destructive actions should follow a consistent undo/recovery model, with bulk delete and practical bulk updates preserving enough state for meaningful rollback.

**Why This Approach Won:** Operators work faster when recovery is predictable. Consistent undo reduces hesitation without adding confirmation fatigue.

**Tradeoffs Accepted:** Undo windows are still time-bound and client-driven. Snapshot recovery adds local state complexity to bulk workflows.

**Risks Remaining:** Recovery is not yet a universal server-side transaction log. Browser loss during an undo window can still limit recovery.

**Long-Term Direction:** Keep client undo for fast operational recovery, and consider server-side recovery/audit trails for higher-risk bulk administration later.

## 19. Operational Semantics Consolidation Doctrine

**Problem Context:** Live exploratory QA showed that operator trust can fail even when underlying data models mostly exist. Callback scheduling, Inbox Done, autosave/discard, delete confirmation, and sync status all touched the same deeper issue: the UI must describe and target operational truth exactly.

**Alternatives Considered:** Patch each defect as a local UI bug; introduce a new workflow system; consolidate the semantics doctrine while keeping implementation scoped to P0 trust surfaces.

**Decision Made:** Treat operational semantics as architecture. Workflow truth, save semantics, deterministic action targeting, truthful autosave, destructive-action lifecycle, and queue semantic alignment are now platform-level constraints.

**Why This Approach Won:** The highest-risk failures were not feature gaps; they were trust gaps. Operators need to know that "Call Back" saves a real callback, "Done" completes the intended lead only, save indicators represent actual persistence state, destructive confirmations expire when context changes, and queue badges/status labels align with real workflow state.

**Save Semantics Doctrine:** Each editable surface must choose one model. In a true autosave model, dirty/saving/saved/error states are shown honestly, explicit controls mean Save now or Retry save, and Discard is not shown if the change may already be persisted. In an explicit save model, changes should not silently persist underneath.

**Deterministic Action Targeting Doctrine:** Workflow actions must bind to stable lead identity and resolve against the latest authoritative queue/list state at execution time. Index-based targeting, stale row closures, and adjacent-record mutation risk are not acceptable for operational actions.

**Queue Semantic Alignment Doctrine:** Callback, follow-up, booked, terminal, and done states must continue to align with `workflowState`. A callback action must persist as callback work. Completing an Inbox task must clear the scheduling fields that made that task actionable while preserving the target lead id.

**Truthful Autosave Philosophy:** Autosave is not just a convenience feature. It is an operator contract: the system must communicate when data is dirty, saving, saved, or failed, and it must not offer rollback language that cannot be guaranteed.

**Tradeoffs Accepted:** The doctrine is stronger than the current implementation coverage. Some older surfaces still need classification and cleanup as they are touched.

**Risks Remaining:** Hybrid save semantics can reappear if future forms copy old patterns. Queue actions can regress if new components resolve actions from visible order rather than stable identity. Authenticated browser/e2e coverage is still needed for callback and Inbox rapid-interaction cases.

**Long-Term Direction:** Keep operational semantics centralized, extend save doctrine to every editable workflow, add regression coverage for callback scheduling and Inbox Done identity, and treat queue alignment as a required architecture review item.

## Current Architectural State

ASG Leads is a React/Vite/Firebase operational CRM with a client-heavy realtime architecture, Zustand state, Firestore listeners, Firebase Hosting, Cloud Functions for selected privileged flows, custom rep/PIN operational identity, and a migration path toward Firebase UID/custom claims.

Privileged settings/audit flows are callable-authoritative. Core realtime operational workflows remain mostly client-authoritative for compatibility and speed. Workflow semantics and operational queue truth are now centralized enough to support consistent Dashboard/Inbox behavior. The platform also treats operator trust semantics, including visible save state, failed-save recovery, actionable urgency routing, deterministic action targeting, truthful autosave, queue semantic alignment, and destructive-action undo, as part of workflow architecture rather than surface polish.

## Transitional Systems Still In Progress

- Anonymous Firebase Auth compatibility bridge.
- Rep-profile fallback when claims are missing.
- Client-authoritative rep admin metadata.
- Client-authoritative document/template/training administration.
- Operational collections that still write directly to Firestore.
- Local-script release governance before full CI/CD.
- Build-time release metadata before server-trusted deployment attestation.
- Partial diagnostics coverage across listeners and non-fatal workflows.
- Client-side save/undo trust semantics before broader server-side recovery guarantees.
- Operational semantics doctrine before full implementation coverage across every legacy form.

## Known Long-Term Risks

- Security hardening can regress if compatibility bridges are treated as permanent.
- Queue truth can regress if new surfaces use paged lead data for operational metrics.
- Dashboard noise can increase if signals are added without task-lifecycle semantics.
- Region identity can fragment if future work introduces separate layouts/themes.
- Mixed authority can confuse developers unless collection ownership is documented.
- Lack of authenticated e2e tests leaves some production-only auth/data flows under-verified.
- Silent or inconsistent save/undo behavior can reappear if new surfaces bypass established trust semantics.
- Hybrid autosave/explicit-save messaging can reappear if new forms are not classified up front.
- Wrong-record action bugs can reappear if future queue actions resolve from indexes or stale row closures.

## Recommended Future Architectural Direction

1. Complete UID linking and claims rollout for active reps.
2. Move rep admin metadata behind callables, then tighten `reps` rules.
3. Document Firestore collection authority levels and migration status.
4. Add separate staging Firebase resources and move release governance toward CI/CD.
5. Expand authenticated e2e coverage for Leads, Inbox, Dashboard, Admin settings, region switching, and calculator workflows.
6. Continue consolidating workflow semantics into `workflowState`.
7. Add an operator-safe diagnostics surface for release metadata, auth state, listener health, and degraded queue behavior.
8. Review document/template/training writes with Storage rules before server-authority migration.
9. Add authenticated e2e coverage for dirty-sidebar close, failed auto-save, bulk undo, filtered tab counts, badge-to-queue routing, and touch export.
10. Audit remaining editable surfaces for the save semantics doctrine and remove hybrid autosave/discard patterns.
11. Add regression coverage for callback scheduling, Call Back Today, existing callback edits, and Inbox Done stable identity.

## Remaining Documentation Gaps

- Auth migration runbook for UID linking, claims assignment, rollback, and support procedures.
- Firestore rules intent map by collection.
- Workflow semantics reference for queues, badges, notifications, Inbox, Dashboard, and next action.
- Operational trust semantics reference for save state, dirty navigation, failed persistence, undo windows, and bulk rollback expectations.
- Operational semantics consolidation doctrine for workflow truth, save semantics, deterministic action targeting, truthful autosave, and queue alignment.
- Release and rollback runbook for operators.
- Regional operations guide for Brisbane/Perth ownership and allowed-region policy.
- Callable migration ledger showing completed, transitional, and future server-authoritative domains.
