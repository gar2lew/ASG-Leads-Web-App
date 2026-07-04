# Testing Standard

## Test Philosophy

Test the risk. The highest risk areas are auth, Firestore rules, data writes, imports, integrations, and release surfaces.

## Standard Commands

Documented standard commands:

```powershell
npm install
npm run typecheck
npm run lint
npm test
npm run build
```

Current practical commands in this repo:

```powershell
npx tsc --noEmit
npx tsc --noEmit -p functions\tsconfig.json
npm run build
npm run lint
npm run test:auth-boundaries
npm run test:workflow-state
npm run test:region-identity
npm run test:observability
npm run test:release-metadata
cd functions
npm run build
npm run test:settings-admin
cd ..
```

If a command is missing or failing, report it clearly.

## Firebase Testing

Before Firebase changes:

- Use emulator-only tests.
- Use a demo project such as `demo-asg-crm-emulator`.
- Use synthetic data only.
- Do not import production data.
- Do not use production service accounts.
- Do not call live Salestrail APIs.

Needed emulator coverage:

- Firestore rules for `salestrailCalls`, `leads`, `clientNotes`, `users`, `userProfiles`, `appSettings`, `settingsHistory`, `auditLogs`, `audit`, and SMSF collections.
- Callable auth boundaries for every exported callable.
- PIN setup, PIN verification, backup password, wrong PIN, and rate limiting.
- Settings admin update and rollback.
- Phone normalisation dry-run with no writes.
- Salestrail mocked dry-run with no writes.

## Release Testing

Before release:

- Typecheck client and functions.
- Build client and functions.
- Run targeted tests.
- Validate generated release metadata.
- Confirm Firebase project target.
- Confirm rollback path.
- Confirm no migrations or live integrations are bundled into the release unintentionally.
