# CRM Operational Platform Evolution Timeline

This timeline is scoped to the CRM Operational Platform. Document Transaction Platform history and doctrine belong under `docs/platforms/document-engine/`.

## 2026-05-22 - Operational QA Stabilization and Governance Separation

**Context:** Workflow semantics, centralized queue derivation, operator workflow acceleration, and render lifecycle stabilization had already established the CRM as a governed operational subsystem. The next risk was operational drift: retry lifecycle gaps, unclear subsystem ownership, and technical debt accumulating around now-centralized workflow semantics.

**Subsystem governance:** CRM governance is now separated from document-engine governance. CRM documentation owns operational doctrine: queues, counters, autosave truth, retry visibility, deterministic targeting, bulk mutation safety, and operator workflow stability. Document-engine governance owns schemas, resolvers, template nodes, and document transaction architecture.

**Operational QA doctrine:** Stabilization work must preserve `workflowState.ts` as the CRM source of truth. Queue routing, shell badges, Dashboard shortcuts, Inbox traversal, and bulk actions must consume centralized semantics instead of reinterpreting callback/follow-up status locally.

**Render lifecycle doctrine:** Shared CRM shells must keep hook order deterministic. Conditional rendering is allowed after hooks run; conditional hook execution is not. Any early return added to shell-level components requires a hook-order audit.

**Lifecycle hardening:** Offline queue replay was hardened so reconnect processing uses current online state through a ref rather than a stale render closure. Replay completion now merges against the freshest persisted queue, preserving writes added during replay while retaining retry metadata for attempted items.

**Technical debt philosophy:** CRM cleanup should remove only high-confidence dead paths and stale helpers. Stabilization phases should prefer narrow lifecycle fixes, guardrail tests, and doctrine updates over broad rewrites.

**Observability refinement:** CRM status surfaces should remain lightweight and truthful. Operators need to know when work is pending, retrying, failed, offline, or safely synced. Diagnostics should clarify degraded operation without creating noise or blocking normal flow.

**Validation expectation:** Every CRM stabilization phase should run build, typecheck, workflow-state, auth-boundary, observability, region-identity, release-metadata, and whitespace validation. Browser QA should focus on rapid queue traversal, autosave interruption, bulk workflow safety, mobile operational flows, offline/retry semantics, and queue refresh correctness.

**Remaining risk:** Some older CRM surfaces may still need classification as true autosave or explicit save. Future cleanup should continue migrating duplicated workflow decisions into `workflowState.ts` without touching document-engine architecture.

## 2026-05-22 - Operational Performance and Render Efficiency Pass

**Context:** With workflow truth centralized and subsystem governance separated, the CRM entered an operational refinement phase. The goal shifted from correcting semantics to reducing avoidable recomputation and making high-frequency operator surfaces feel smoother.

**Render-efficiency doctrine:** CRM optimization should target measurable or high-confidence churn. Large surfaces such as Dashboard, Leads, Inbox, and DataTable should avoid rebuilding the same workflow state repeatedly, but should not become harder to read through indiscriminate memoization.

**Queue derivation consolidation:** A shared operational queue snapshot was added to `workflowState.ts`. Dashboard now consumes one centralized snapshot for actionable items, callbacks, overdue callbacks, follow-ups, overdue follow-ups, due-today follow-ups, and queue counters instead of repeatedly filtering and sorting the same queue data.

**Lifecycle ownership clarification:** Listener architecture was reviewed as a performance concern, but broad realtime ownership changes were deferred. The phase documented that new listeners need explicit ownership, stable dependencies, and cleanup, while performance passes should first remove duplicate derivation work before reshaping Firestore subscriptions.

**Operational responsiveness:** Dashboard queue cards and priority work sections now share a single queue derivation pass, preserving deterministic ordering while reducing repeated computation under larger datasets. This supports smoother Dashboard interaction without changing workflow semantics.

**Subsystem boundary reinforcement:** The performance pass remained CRM-only. Document schema, template node, resolver, and document transaction architecture were not changed.

**Remaining risk:** Some listener duplication may still exist between shell-level data hydration and page-level hooks. That should be handled as a dedicated listener-ownership phase, not opportunistically inside render optimization work.
