# CRM Operational Platform Architecture Decisions

This file governs the CRM Operational Platform only. Document schema, template node, resolver, and document transaction engine decisions belong under `docs/platforms/document-engine/`.

## Subsystem Boundary

- CRM owns lead workflow truth, operational queues, counters, callback/follow-up lifecycle, Inbox traversal, bulk lead operations, autosave truth, offline/retry visibility, and operator-facing CRM ergonomics.
- Document Engine owns document schemas, template/resolver semantics, PDF/form transaction flows, and document-generation architecture.
- Shared contracts are limited to persisted CRM data types needed by both systems, such as lead identity, rep identity, client metadata, and generated document references.
- CRM governance must not redefine document schema behavior. Document Engine governance must not redefine CRM queue semantics.

## Operational Truth Source

`src/lib/workflowState.ts` is the source of truth for CRM workflow classification. New CRM surfaces must consume this layer for callback, follow-up, booked, terminal, actionable, and counter semantics.

Local components may format, sort, or display workflow results, but they must not introduce alternate definitions of what is actionable.

## Deterministic Lifecycle Semantics

CRM lifecycle states must be deterministic and truthful:

- Autosave states describe real persistence: dirty, saving, saved, failed, or retrying.
- Retry states must not be skipped because of stale render closures.
- Pending writes must not be overwritten by stale queue replay snapshots.
- Undo applies only to the exact records captured at mutation time.
- Modal close behavior must preserve recovery context when persistence fails.
- Queue traversal and Done actions resolve by stable lead identity, not visible row position alone.

## Render Lifecycle Governance

Hooks in shared CRM shells and high-traffic workflow surfaces must run unconditionally. Conditional behavior belongs inside hook bodies, derived values, event handlers, or render branches after all hooks have executed.

Any new early return in an operational shell must be audited for hooks below it.

## Technical Debt Consolidation Philosophy

Remove dead code only when it is high confidence: unused imports, obsolete local queue derivations replaced by `workflowState.ts`, stale save-state remnants, or fallback paths that no active surface can reach.

Avoid speculative cleanup during stabilization phases. A small lifecycle correction with tests is preferred over broad reshaping.

## Observability Philosophy

CRM observability should be truthful and lightweight:

- Show failed, retrying, pending, offline, and synced states when they affect operator confidence.
- Avoid debug spam and large overlays.
- Prefer inline or compact status indicators that explain whether work is safe to continue.
- Diagnostics should clarify degraded operation without blocking normal work.

## Current QA Stabilization Decision

Offline queue replay now uses ref-backed online state so reconnect replay cannot no-op because of stale `isOnline` closure state. Replay completion rebuilds from the freshest persisted queue so writes enqueued during replay are preserved while attempted items retain updated retry metadata.

## Operational Responsiveness Doctrine

CRM performance work should make high-frequency operator flows feel smoother without changing workflow meaning. Responsiveness improvements must be grounded in observable churn: repeated queue derivation, oversized render dependencies, redundant listeners, or mobile interactions that make normal work feel sticky.

## Render-Efficiency Philosophy

- Prefer fewer, more meaningful derived objects over repeated local filtering and sorting.
- Memoize expensive workflow derivations at ownership boundaries such as Dashboard, Inbox, and Leads, not around every small JSX fragment.
- Keep props stable when they cross large render surfaces, but avoid memoization that hides simple logic.
- Render optimization must not alter queue membership, action targeting, or save semantics.

## Recalculation Strategy

Operational queue calculations should be centralized in `workflowState.ts`. When a surface needs several queue slices from the same lead set, derive a shared snapshot once and consume its sorted subsets and counters. This avoids rebuilding the same workflow states while keeping the source of truth centralized.

## Listener Governance

Realtime listener ownership should be explicit. New listeners need a clear owning surface or hook, stable dependencies, and cleanup. Avoid adding parallel listeners for the same CRM data unless the lifecycle difference is intentional and documented. Performance phases should prefer reducing duplicate derivation before reshaping Firestore subscription architecture.
