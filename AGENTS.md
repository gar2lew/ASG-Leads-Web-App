# ASG CRM Codex Operating Contract

This file is the first instruction source for Codex work in this repository. It applies to the root project at `C:\dev\ASG_LEADS_WEBAPP\asg_crm_react`.

## Prime Directive

- Stability first. Protect login, lead operations, client data, reporting, admin settings, and Firebase production resources.
- Reversibility first. Every goal starts from a clean branch and a savepoint tag unless the user explicitly asks for audit-only work.
- No direct work on `main`.
- No destructive changes without explicit approval.
- No production Firebase, security, data, migration, or deployment changes without explicit approval.
- Never expose, print, request, write, or commit secrets.
- Never claim something passed unless the command or manual check actually ran.

## Repository Identity

- Project: ASG CRM React.
- Purpose: CRM for mortgage broking and financial services operations.
- Firebase project and hosting site: `amplify-leads-2026`. Treat as production-like.
- Root source of truth: repository root. The nested `asg_crm_react/asg_crm_react/` folder is a mirror and must not drive edits.
- Client build output: `dist/`.
- Functions build output: `functions/lib/`.

## Standard Codex Workflow

Before editing:

1. Run `git status --short`.
2. Run `git branch --show-current`.
3. If clean, create a goal branch such as `goal/<goal-name>`.
4. Create a savepoint tag such as `savepoint-before-<goal-name>`.
5. If not clean, stop and report the dirty files.

During work:

- Keep changes small and scoped.
- Use documentation branches for docs-only work.
- Use `apply_patch` for manual edits.
- Do not install dependencies unless required and reported first.
- Do not modify Firebase config, security rules, production environment files, or deployment scripts unless the goal explicitly asks for that surface.
- Make small commits after validation.

Before completion:

1. Run the relevant validation commands.
2. Check `git status --short`.
3. Summarise files changed.
4. Report rollback command.
5. State what remains unverified.

## Branch Names

- Goals: `goal/<goal-name>`
- Fixes: `fix/<issue-name>`
- Documentation: `docs/<doc-name>`
- Releases: `release/<release-name>`

## Savepoint Tags

- Goal savepoint: `savepoint-before-<goal-name>`
- CRM upgrade baseline: `savepoint-baseline-before-crm-upgrade`

## Goal Structure

Every goal should define:

- Objective
- Scope
- Non-goals
- Branch name
- Savepoint tag
- Expected deliverables
- Validation commands
- Rollback command
- Quality gate
- Exit criteria

## Standard Validation Commands

Preferred commands where scripts exist:

```powershell
npm install
npm run typecheck
npm run lint
npm test
npm run build
npx tsc --noEmit
npx tsc --noEmit -p functions\tsconfig.json
cd functions
npm run build
cd ..
```

Current repo note: `package.json` does not currently define `typecheck` or `test`. Use the available targeted scripts and report missing scripts rather than pretending the standard commands exist.

Available targeted scripts include:

```powershell
npm run test:auth-boundaries
npm run test:workflow-state
npm run test:region-identity
npm run test:observability
npm run test:release-metadata
cd functions
npm run test:settings-admin
cd ..
```

## Firebase Safety

- Inspect `.firebaserc` before any Firebase work.
- Use emulator-only project IDs for local emulator execution, such as `demo-asg-crm-emulator`.
- Do not run `firebase deploy` or any scoped deploy command without explicit approval.
- Do not run live Salestrail sync without explicit approval.
- Do not run phone normalisation with `dryRun:false` without explicit approval.
- Do not run Firebase leads migration scripts against live data without explicit approval.
- Do not change Firestore rules, indexes, Functions exports, or Firebase config unless the goal explicitly includes that work.

## Critical Engineering Rules

- Every callable function should call `requireAuth(request)` first unless explicitly public and documented.
- Do not write auth-sensitive fields directly from the client.
- PIN, backup password, role, active status, permissions, Firebase UID, and region access changes must go through server-authoritative paths.
- Preserve plaintext PIN fallback behaviour in `verifyPin` until migration is fully complete.
- Always respect `allowedRegions` and `canAccessRegion()`.
- Client notes live in the top-level `clientNotes` collection, not lead subcollections.
- Avoid top-level `admin.initializeApp()` and `admin.firestore()` in Functions modules. Prefer lazy `getDb()` patterns for new work.

## Documentation Map

- Handbook: `docs/ENGINEERING_HANDBOOK.md`
- Codex playbook: `docs/CODEX_PLAYBOOK.md`
- Development standards: `docs/DEVELOPMENT_STANDARDS.md`
- Git strategy: `docs/GIT_STRATEGY.md`
- Testing standard: `docs/TESTING_STANDARD.md`
- Release process: `docs/RELEASE_PROCESS.md`
- Security guidelines: `docs/SECURITY_GUIDELINES.md`
- Architecture notes: `docs/ARCHITECTURE.md`
- Roadmap and goals: `docs/ROADMAP.md`, `docs/GOALS.md`
- Decision, change, and risk logs: `docs/DECISION_LOG.md`, `docs/CHANGELOG_INTERNAL.md`, `docs/RISK_REGISTER.md`
