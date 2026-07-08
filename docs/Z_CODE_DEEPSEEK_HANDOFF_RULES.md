# Z Code And DeepSeek Handoff Rules

These rules apply to Z Code, DeepSeek, or any other coding agent continuing work in this repository.

## First Reads

Read in this order:

1. `AGENTS.md`
2. `HANDOFF.md`
3. `PROJECT_STATE.md`
4. `docs/ENGINEERING_HANDBOOK.md`
5. Goal-specific docs

Do not start editing before reading the relevant instructions.

## Preflight

Run:

```powershell
git status --short
git branch --show-current
git log --oneline -5
```

Rules:

- Do not continue if the working tree is dirty.
- If the only dirty file is explicitly documented as human-owned, report it and leave it untouched.
- Create a new branch before changes.
- Create a savepoint before changes.
- Make small commits.

## Safety Boundaries

Do not:

- Deploy.
- Push.
- Merge.
- Alter production Firebase.
- Alter Firestore rules.
- Alter emulator configuration unless the human owner explicitly asks.
- Run migrations.
- Run Salestrail live sync.
- Run phone backfill writes.
- Change secrets.
- Run broad dependency upgrades.
- Print secrets.
- Guess when uncertain.

Stop if the fix requires any of:

- Production config.
- Secrets.
- Deploys.
- Migrations.
- Rules changes.
- Broad dependency upgrades.
- Live third-party API writes.

## Functions Emulator Investigation Rules

For Functions emulator startup issues:

- Reproduce before fixing.
- Separate user-code import time from Firebase CLI emulator startup time.
- Check top-level imports.
- Check top-level await.
- Check Admin SDK initialisation.
- Check environment-variable lookups.
- Check network calls.
- Check filesystem calls.
- Check singleton creation.
- Check module cycles.
- Prefer measurement over guesses.
- Apply only a minimal safe startup fix if root cause is clear.

## Validation Rules

Use `npm.cmd` if PowerShell blocks `npm.ps1`.

Required validation for broad handoff completion:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run test:emulator:preflight
npm run test:emulator:rules
npm run test:emulator:firestore-smoke
npm run test:emulator:callables-dry-run
cd functions
npm run build
npm run test:settings-admin
cd ..
git diff --check
```

For documentation-only changes, at minimum:

```powershell
git diff --check
git status --short
```

Also confirm only docs and state files changed.

## Reporting Rules

Report:

- What changed.
- Why it changed.
- Files changed.
- Validation run.
- Validation blocked.
- Risks.
- Rollback command.
- Recommended next action.

Report uncertainty instead of guessing.
