# Release Process

## Release Principle

Release one surface at a time where practical. Do not bundle hosting, functions, Firestore rules, indexes, migrations, and integrations unless explicitly approved.

## Firebase Surfaces

- Hosting
- Functions
- Firestore rules
- Firestore indexes
- Migration scripts
- Phone normalisation backfill
- Salestrail sync and integration

## Release Gates

### Before Any Release

- Confirm branch and HEAD.
- Confirm working tree is clean.
- Confirm target Firebase project.
- Run relevant build and tests.
- Review changed files.
- Confirm rollback path.
- Confirm explicit approval.

### Hosting

- Run client typecheck and build.
- Smoke test login, dashboard, leads, admin settings, and high-risk UI.
- Confirm UI does not expose unsafe live actions.

### Functions

- Run functions build.
- Compare exported functions with expected deployed surface.
- Validate callable auth.
- Confirm secrets by name only.
- Confirm migration and backfill callables are not invoked.

### Firestore Rules

- Run emulator rules tests.
- Confirm `salestrailCalls` direct reads and writes are denied.
- Confirm app settings and audit write paths are callable-authoritative.
- Confirm current app compatibility paths still work.

### Firestore Indexes

- Map queries to indexes.
- Deploy indexes before releasing features that depend on them.
- Monitor index build status after approved deployment.

### Data And Integration

- Dry-run first.
- Record counts and samples.
- Reconcile returned counts against emulator or production evidence as approved.
- Live writes require explicit approval.

## Production Release Blockers

- Failing typecheck or build.
- Unreviewed Firebase target.
- Missing rollback plan.
- Missing emulator evidence for rules or callables.
- Unauthenticated callable gaps.
- Broad data migration without backup/export.
- Live Salestrail or phone backfill without dry-run and approval.
