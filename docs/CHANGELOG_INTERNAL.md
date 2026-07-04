# Internal Changelog

This changelog tracks engineering process and internal operating changes. Product-facing release notes belong elsewhere.

## 2026-07-04

- Established the validation baseline on `fix/validation-baseline`.
- Added root `typecheck`, `test`, and `lint:report` scripts.
- Scoped root linting to source-of-truth `src` and `functions/src` paths, excluding the nested mirror.
- Restored passing workflow-state and region-identity guardrail tests by updating stale fixtures and sidebar expectations.
- Cleared blocking ESLint errors while leaving warning-level type and hook dependency cleanup for later targeted work.
- Added emulator validation baseline scripts and documentation.
- Added Firestore emulator smoke test scaffolding for demo-project direct-read denial checks.
- Documented Java and explicit emulator config blockers for full emulator execution.
- Added explicit Firestore emulator config and authenticated rules harness scaffolding.
- Added Windows Java setup documentation for Firebase emulator validation.
- Added callable emulator dry-run harness scaffolding for PIN, settings/admin, phone dry-run, and Salestrail dry-run source contract checks.
- Added explicit Auth and Functions emulator ports for callable validation.
- Added emulator harness execution report showing non-emulator validation passes and emulator startup remains blocked because Java is not visible on PATH.
- Fixed callable emulator host detection and verified emulator preflight, rules, Firestore smoke, and callable dry-run harness execution.
- Added ASG CRM Engineering Handbook structure.
- Added Codex operating playbook and prompt templates.
- Added roadmap, goal structure, development standards, git strategy, UI guidelines, testing standard, release process, security guidelines, architecture summary, decision log, and risk register.
- Updated `AGENTS.md` as the root Codex operating contract.

## Entry Template

```text
## YYYY-MM-DD

- Change:
- Reason:
- Validation:
- Follow-up:
```
