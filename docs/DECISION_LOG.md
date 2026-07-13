# Decision Log

## 2026-07-04: Engineering Handbook And Codex Structure

- Adopted stability first and reversibility first as the engineering prime directive.
- Standardised goal branches as `goal/<goal-name>`.
- Standardised savepoint tags as `savepoint-before-<goal-name>`.
- Required every substantial goal to include objective, scope, non-goals, branch, savepoint, deliverables, validation, rollback, quality gate, and exit criteria.
- Confirmed production Firebase, security rules, migrations, backfills, and deployments require explicit approval.

## 2026-06-15: Developer Environment Guardrails

- Prefer feature branches and pull requests over direct pushes to `main`.
- Never force push or delete remote branches.
- Preview deploys are allowed when requested.
- Production deploys require explicit wording.
- Before push or deploy, run `git status`, `git branch --show-current`, and relevant validation.
- Never request, print, expose, write, or commit secrets.

## Decision Template

```text
Date:
Decision:
Context:
Options considered:
Chosen path:
Consequences:
Rollback or review date:
```
