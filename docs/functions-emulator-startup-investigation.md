# Functions Emulator Startup Investigation

Date: 2026-07-08
Branch: `fix/functions-emulator-startup-investigation`
Scope: investigation only. No Firestore rules, emulator configuration, or application behaviour changes.

## Issue

The Functions emulator has been reported to start and then fail backend discovery with:

```text
User code failed to load.
Cannot determine backend specification.
Timeout after 10000.
```

The investigation focused on why the Functions project may fail to initialise before the Firebase CLI backend specification timeout.

## Summary

The Functions user code is not the primary startup blocker in the current branch.

Directly requiring the compiled Functions entrypoint loaded all exported functions in about `234 ms` and exposed `26` exports. No top-level await, top-level network requests, top-level filesystem operations, or module cycles were found in the active `functions/src` startup path.

The slow path is the Firebase emulator toolchain startup and backend discovery process. A no-op Functions emulator startup measured about `9.1 s`, which is close to the Firebase CLI's `10000 ms` backend-spec timeout. The full callable dry-run command measured about `30.5 s`, but that includes emulator boot, test harness setup, callable execution, and shutdown.

## Startup Dependency Graph

Active source entrypoint:

```text
functions/src/index.ts
├─ firebase-functions/v2/https
├─ firebase-functions/v2/scheduler
├─ firebase-admin
├─ ./firestoreCompat
├─ ./notifications
│  ├─ firebase-admin
│  ├─ firebase-admin/messaging
│  ├─ firebase-functions/v2/firestore
│  └─ ./firestoreCompat
├─ ./docusign
│  ├─ firebase-functions/v2/https
│  ├─ firebase-admin
│  ├─ jsonwebtoken
│  ├─ crypto
│  ├─ path
│  └─ ./firestoreCompat
├─ ./smsfFinancials
│  ├─ crypto
│  ├─ firebase-functions/v2/https
│  └─ firebase-functions/params
├─ ./auth/verifyPin
│  ├─ firebase-functions/v2/https
│  ├─ firebase-admin
│  ├─ bcryptjs
│  ├─ ../firestoreCompat
│  └─ ../auth
├─ ./followups
│  ├─ firebase-admin
│  ├─ firebase-functions/v2/scheduler
│  ├─ ./notifications
│  └─ ./firestoreCompat
├─ ./audit
│  ├─ firebase-functions/v2/https
│  ├─ firebase-admin
│  ├─ ./auth
│  └─ ./firestoreCompat
├─ ./settingsAdmin
│  ├─ firebase-functions/v2/https
│  ├─ firebase-admin
│  ├─ ./auth
│  └─ ./firestoreCompat
├─ ./phoneMigration
│  ├─ firebase-functions/v2/https
│  ├─ firebase-admin
│  ├─ ./auth
│  └─ ./firestoreCompat
└─ ./salestrail
   ├─ firebase-functions/v2/https
   ├─ firebase-admin
   ├─ ./auth
   └─ ./salestrailSync
      ├─ firebase-admin
      ├─ firebase-functions/params
      └─ ./firestoreCompat
```

No import cycle back into `index.ts` was found. The only notable shared dependency is `notifications`, imported by both `index.ts` and `followups`.

## Startup Timing

Measured on this workstation using temporary Java 21 and Firebase CLI tooling:

| Check | Result |
| --- | ---: |
| Direct `require("./functions/lib/index.js")` | `234 ms` |
| Export count from compiled entrypoint | `26` |
| `firestoreCompat` import in a warm single process | `114 ms` |
| `notifications` import after `firestoreCompat` | `28 ms` |
| `docusign` import after prior core imports | `83 ms` |
| Remaining active modules after prior imports | `0-2 ms` each |
| No-op Functions emulator startup, then invalid no-op script | about `9.1 s` |
| Full callable dry-run emulator command | about `30.5 s` |

The no-op emulator startup timing is the most relevant signal for the reported `Timeout after 10000`: backend discovery is near the 10-second threshold even when user code itself is fast.

## Findings By Requested Area

### Slow Top-Level Imports

No individual project module is slow enough to explain a 10-second timeout.

Largest measured active imports:

- `firestoreCompat` plus Admin Firestore package path: about `114 ms`.
- `docusign`: about `83 ms`.
- `notifications`: about `28 ms`.

These are noticeable but not blocking by themselves.

### Long-Running Startup Code

No long-running project startup code was found in active source modules.

The entrypoint does eagerly run:

```ts
admin.initializeApp();
const db = admin.firestore();
```

That is safe in the current emulator run, but it is still an eager singleton and should remain on the watch list if startup gets worse after dependency changes.

### Top-Level Await Usage

No top-level await was found in `functions/src`.

All `await` operations found are inside function handlers, helper functions, or scheduled/trigger callbacks.

### Admin SDK Initialisation Problems

No immediate Admin SDK initialisation failure was reproduced.

Observed patterns:

- `index.ts` eagerly initialises the Admin app once.
- Several modules use lazy `getDb()` wrappers.
- `auth/verifyPin.ts`, `phoneMigration.ts`, `salestrail.ts`, and `salestrailSync.ts` defensively initialise Admin only if no apps exist.

This mixed pattern is not the current timeout cause, but future work should prefer one lazy Admin helper to reduce startup coupling.

### Environment-Variable Lookups

Environment reads found:

- `docusign.ts` reads `process.env` inside `getDocuSignConfig()`, not at module import time.
- `salestrailSync.ts` defines Firebase secrets at module import time with `defineSecret(...)`, but does not call `.value()` at import time.
- `smsfFinancials.ts` defines `SMSF_SECRET` at module import time, but does not call `.value()` at import time.

No secret value lookup or required environment validation blocks module import.

### Network Requests During Startup

No project network request runs during module import.

Network requests are present only inside invoked handlers:

- DocuSign API calls and document URL fetches.
- Salestrail API fetch.
- FCM sends through Admin messaging.

The emulator/tooling path can perform its own metadata lookup during callable execution. The callable dry-run produced a non-fatal `MetadataLookupWarning`, but completed successfully.

### Filesystem Operations During Startup

No project filesystem operation runs during Functions source module import.

Filesystem operations observed during validation were test harness reads and Firebase emulator internals, not production startup code.

### Blocking Singleton Creation

The only blocking singleton-style creation in the active startup path is:

- `admin.initializeApp()` in `index.ts`.
- `const db = admin.firestore()` in `index.ts`.
- Firebase secret definitions via `defineSecret(...)`.

These do not explain the timeout on their own. Direct compiled entrypoint load remained about `234 ms`.

### Module Cycles

No active startup cycle was found.

Important non-cycle:

```text
index.ts -> followups.ts -> notifications.ts
index.ts -> notifications.ts
```

This is fan-in to `notifications`, not a circular import.

## Blocking Modules

No single application module currently blocks backend discovery.

The practical blocker is the startup environment/toolchain:

1. Firebase CLI backend discovery runs close to the `10000 ms` timeout on this machine.
2. `functions/package.json` requests Node `22`, while the host run reported Node `24`.
3. The PowerShell profile emits an `fnm` missing error in elevated shells.
4. Firebase Tools 15 requires Java 21 or newer. Java absence or older Java blocks emulator execution before useful backend discovery.
5. Cold `npx firebase-tools` startup can add network/cache overhead if the Firebase CLI is not installed locally or globally.

Any one of those may not fail alone, but together they leave little headroom before the backend-spec timeout.

## Root Cause Assessment

Current evidence does not support a slow or stuck top-level app import as the root cause.

Most likely cause:

```text
Firebase CLI backend discovery is timing out because local toolchain startup is too slow or inconsistent, not because the Functions code performs blocking work at import time.
```

The clearest evidence is:

- Direct compiled user-code load: `234 ms`.
- All `26` Functions exports are visible from `functions/lib/index.js`.
- Emulator no-op startup: about `9.1 s`, close to the `10 s` timeout.
- Callable emulator dry-run passed once Java 21 and Firebase CLI were available.

## Recommended Fixes

Recommended local/tooling fixes:

1. Use Java 21 or newer for Firebase Tools 15.
2. Install Firebase CLI locally or globally instead of relying on cold `npx` resolution during emulator runs.
3. Run the Functions emulator under Node 22 to match `functions/package.json`.
4. Fix or remove the broken PowerShell profile `fnm` line so elevated shells do not emit startup errors.
5. Keep running `npm run test:emulator:preflight` before callable emulator checks.

Recommended code cleanup for a separate goal only:

1. Move `admin.initializeApp()` and `admin.firestore()` in `index.ts` behind a shared lazy Admin helper.
2. Consider splitting infrequently used integration functions, such as DocuSign and Salestrail, into separately exported modules if backend discovery becomes slow after package upgrades.
3. Remove stale compiled files in `functions/lib` only through a clean build/output hygiene goal, not in this investigation.

## Safe Fix Decision

No application code fix was applied.

Reason:

- The current Functions code loads quickly.
- The reported failure is not reproducible after using compatible temporary Java 21 and Firebase CLI tooling.
- A code change would be speculative and could alter deployed Functions behaviour.

## Validation Evidence

Commands run during this investigation:

```text
node -e "require('./functions/lib/index.js') ..."
```

Result:

```text
require functions/lib/index.js ms 234
exports 26
```

No-op Functions emulator startup timing:

```text
TotalSeconds: 9.1044932
```

Callable dry-run timing:

```text
TotalSeconds: 30.5204776
```

The full required validation command is run again before completion:

```text
npm run test:emulator:callables-dry-run
```

## Risk Assessment

| Risk | Rating | Notes |
| --- | --- | --- |
| Emulator backend discovery remains close to 10 seconds on slow or cold machines. | High | Current no-op timing leaves little margin before the Firebase CLI timeout. |
| Node version mismatch changes emulator behaviour. | Medium | Functions request Node 22 but this host reported Node 24 during emulator startup. |
| Java/Firebase CLI availability blocks validation. | High | Firebase Tools 15 requires Java 21 or newer. Missing Java made emulator validation impossible until temporary Java 21 was used. |
| Eager Admin SDK initialisation may become a future startup drag. | Medium | Not the current root cause, but centralising lazy Admin initialisation would reduce risk. |
| Splitting integrations without tests could regress production workflows. | High | Defer integration/module splitting to a dedicated backend refactor goal. |
| Firestore rules or emulator config changes could mask the startup issue. | High | No rules or emulator config changes were made. |
