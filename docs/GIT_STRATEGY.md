# Git Strategy

## Branching

Use:

- `goal/<goal-name>` for planned work.
- `fix/<issue-name>` for targeted defects.
- `docs/<doc-name>` for documentation-only work.
- `release/<release-name>` for release preparation.

Do not work directly on `main`. Prefer `codex-foundation` or another approved integration branch as the base for Codex goals.

## Savepoints

Create savepoint tags before substantial work:

```powershell
git tag savepoint-before-<goal-name>
```

Baseline tag:

```powershell
git tag savepoint-baseline-before-crm-upgrade
```

## Commit Rules

- Commit small, coherent changes.
- Stage only intended files.
- Use clear messages such as `docs: add ASG CRM engineering handbook`.
- Do not commit generated build drift unless it is intentional.
- Never commit `.env`, service account files, Firebase credentials, Vercel credentials, or secrets.

## Pre-Commit Check

```powershell
git status --short
git diff --cached --name-only
git diff --cached --stat
git diff --cached --check
```

## Rollback Patterns

Abandon a failed branch:

```powershell
git switch codex-foundation
git branch -D <failed-branch>
```

Return a branch to a savepoint, only with explicit approval:

```powershell
git reset --hard savepoint-before-<goal-name>
```

Abort a failed merge:

```powershell
git merge --abort
git status --short
```

Revert a bad merged commit:

```powershell
git revert <commit>
```
