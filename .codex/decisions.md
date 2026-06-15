# Decision Log

## 2026-06-15: Developer Environment Guardrails

- Prefer feature branches and pull requests over direct pushes to `main`.
- Never force push or delete remote branches.
- Preview deploys are allowed when requested; production deploys require explicit wording.
- Before push or deploy, run `git status`, `git branch --show-current`, and the relevant known build/test command.
- Summarise changed files before committing or deploying.
- Never request, print, expose, write, or commit secrets.

## 2026-06-15: Project Memory

- Keep long-lived project facts in `.codex/memory.md`, `.codex/architecture.md`, and `.codex/decisions.md`.
- Keep workflow checklists in `.codex/workflows/`.
- Keep files concise so future Codex sessions can load them cheaply.
