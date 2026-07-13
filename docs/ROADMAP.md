# ASG CRM Roadmap

## Roadmap Principle

The CRM roadmap favours production stability, reversible change, and strong Firebase safety over speed. Each stage should finish with documented validation and a rollback path.

## Recommended Goal Sequence

| Stage | Name | Outcome |
| --- | --- | --- |
| 0 | Environment and Codex Setup | Reliable local setup, Codex operating rules, savepoint discipline. |
| 1 | Repository Standards | Branch, commit, docs, validation, and review standards established. |
| 2 | AGENTS.md Operating Contract | Repository-specific Codex rules kept current. |
| 3 | Development Rules and Safety | Safety gates for app, Firebase, data, and integrations. |
| 4 | Roadmap and Goals | Prioritised goal list with owners and exit criteria. |
| 5 | Baseline Audit and Savepoints | Known baseline, tags, risks, and rollback paths. |
| 6 | Foundation Audit | Current app behaviour, scripts, and deploy surfaces audited. |
| 7 | Architecture Review | Data flow, auth model, page structure, and Firebase surfaces documented. |
| 8 | Technical Debt Audit | Large files, weak tests, broad rules, and fragile workflows ranked. |
| 9 | Safe Refactoring | Small refactors with tests and no behaviour drift. |
| 10 | Performance Optimisation | Reduce broad reads, large bundles, expensive renders, and slow workflows. |
| 11 | UI/UX Redesign | Improve CRM workflows with stable navigation and accessible states. |
| 12 | Lead Management Upgrade | Safer lead lifecycle, queueing, ownership, region handling, and history. |
| 13 | Google Sheets/Firebase Import Stability | Dry-run first imports, duplicate checks, reports, and rollback. |
| 14 | Salestrail Integration | Mocked, dry-run, reconciled integration with callable-only access. |
| 15 | Reporting Upgrade | Reliable dashboards, daily stats, commission, and operations reports. |
| 16 | Admin Settings | Server-authoritative settings, audit logs, and safe rollback. |
| 17 | Security Review | Callable auth, Firestore rules, secrets, roles, and region controls. |
| 18 | Testing and QA | Emulator tests, unit tests, smoke tests, and regression gates. |
| 19 | Documentation | Handbook, runbooks, decisions, risks, and onboarding. |
| 20 | Beta Release | Controlled release candidate with feedback and rollback. |
| 21 | Production Readiness | Final go/no-go, release notes, support plan, and backups. |
| 22 | Deployment | Approved scoped deploys only. |
| 23 | Post-Deployment Review | Validate production behaviour and capture incidents. |
| 24 | Continuous Improvement | Ongoing improvements based on usage and risk. |
| 25 | ASG-X Online Platform | Future platform expansion after CRM foundation is stable. |

## Near-Term Priorities

1. Complete handbook and Codex structure.
2. Fix or document failing baseline tests.
3. Add Firebase emulator harnesses for rules and callables.
4. Close callable auth gaps.
5. Tighten Firestore rules collection by collection.
6. Stabilise Salestrail and phone normalisation behind dry-run evidence.

## Version-Based Planning Layer

Future roadmap work should connect goals to product versions where practical:

| Version | Focus | Planning File |
| --- | --- | --- |
| v1.0 | Internal Production Release | `docs/VERSION_PLAN_V1.md` |
| v1.1 | Salestrail | `docs/PRODUCT_RELEASES.md` |
| v1.2 | Reporting | `docs/PRODUCT_RELEASES.md` |
| v1.3 | AI Assistant | `docs/PRODUCT_RELEASES.md` |
| v1.4 | Document Centre | `docs/PRODUCT_RELEASES.md` |
| v1.5 | Client Timeline | `docs/PRODUCT_RELEASES.md` |
| v2.0 | ASG-X Online | `docs/PRODUCT_RELEASES.md` |

Operational planning files:

- `PROJECT_STATE.md`
- `docs/KNOWN_ISSUES.md`
- `docs/DECISIONS_PENDING.md`
- `docs/IDEAS.md`
- `docs/FEATURE_BACKLOG.md`
- `docs/PRODUCT_RELEASES.md`
- `docs/DOCUMENTATION_INDEX.md`
