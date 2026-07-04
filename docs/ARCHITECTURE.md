# Architecture

## Application Shape

ASG CRM is a React 18 and Vite single-page application backed by Firebase. The app uses tab/page-key navigation with URL mapping rather than React Router rendering.

## Main Areas

- Lead management and DQ import.
- Client hub and client profile.
- Deal dashboard and commissions.
- DRAPS, reporting, and daily stats.
- Admin settings and system health.
- Training, team chat, documents, PIA, SMSF, and calculators.
- Integrations including DocuSign, Google Sheets/Firebase import tooling, and Salestrail.

## Client Architecture

- Root app: `src/App.tsx`.
- Global store: `src/stores/appStore.ts`.
- Firebase initialisation: `src/lib/firebase.ts`.
- Legacy compatibility hook: `src/hooks/useFirebase.ts`.
- Preferred direction: smaller services in `src/services/*` and domain hooks where available.

## Firebase Architecture

- Firestore rules: `firestore.rules`.
- Firestore indexes: `firestore.indexes.json`.
- Functions source: `functions/src`.
- Functions exports: `functions/src/index.ts`.
- Hosting and rewrites: `firebase.json`.

## Auth Model

- Client signs in anonymously.
- PIN verification upgrades operational identity through server claims.
- Roles: `rep`, `manager`, `admin`, `director`.
- Regions: `brisbane`, `perth`.
- Region access must respect `allowedRegions`.

## Known Architecture Risks

- Several operational collections still have broad anonymous-auth-compatible rules.
- Some exported callables need stronger auth and role checks.
- Large UI files concentrate business logic and increase regression risk.
- Emulator coverage for rules and callables is still incomplete.
- Salestrail and phone normalisation require dry-run and reconciliation gates before live use.

## Architecture Direction

1. Harden callables.
2. Add emulator tests.
3. Move sensitive writes server-side.
4. Tighten Firestore rules in small steps.
5. Split large UI and data modules by workflow.
6. Improve reporting and performance with scoped queries and tested aggregation.
