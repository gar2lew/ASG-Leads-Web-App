# Project Memory

## Stable Context

- ASG CRM React is a mortgage broking / financial services CRM for lead capture, door-knocking operations, client/deal management, commissions, reporting, training, documents, and internal communication.
- Root-level files are the source of truth. `asg_crm_react/asg_crm_react/` is a nested mirror copy and should not drive audits or edits.
- Firebase project: `amplify-leads-2026`.
- Firebase Hosting site: `amplify-leads-2026`.
- Client build output: `dist/`.
- Firebase Functions build output: `functions/lib/`.
- The app uses tab/page-key navigation with URL mapping in `src/router/routeConfig.ts`; it does not use React Router components for rendering.
- Vercel is not currently wired into the app. There is no `vercel.json`, `.vercel/` project config, or package script for Vercel deploys in the root app.

## Important Surfaces

- Shell and routing: `src/layouts/AppShell.tsx`, `src/layouts/Sidebar.tsx`, `src/layouts/Topbar.tsx`, `src/router/routeConfig.ts`, `src/layouts/pageConfig.ts`.
- Login/auth: `src/layouts/LoginScreen.tsx`, `src/hooks/usePinLogin.ts`, `src/lib/firebase.ts`, `src/lib/authClaims.ts`, `src/lib/authIdentity.ts`, `functions/src/auth/verifyPin.ts`, `functions/src/auth.ts`.
- Core Firebase hooks/services: `src/hooks/useFirebase.ts`, `src/services/*`, `src/hooks/domain/*`.
- Firestore rules: `firestore.rules`.
- Functions exports: `functions/src/index.ts`.
- Deployment source of truth: `deploy.ps1`, `DEPLOYMENT.md`, `firebase.json`, `.firebaserc`.

## Durable Audit Findings

- 2026-06-15: `functions/src/aggregateStats.ts` contains `const db = admin.firestore()` at module top level. It is not exported from `functions/src/index.ts` right now, but it conflicts with the repo rule to avoid top-level admin Firestore access.
- 2026-06-15: Several exported callable functions in `functions/src/index.ts` and `functions/src/smsfFinancials.ts` do not call `requireAuth(request)` first: `getPropertyInsights`, `sendPushNotification`, `triggerPerfAlert`, `saveSmsfFinancials`, and `getSmsfFinancials`.
- 2026-06-15: Firestore rules remain broad for operational collections such as `leads`, `deals`, `settings`, `draps`, `commissions`, `appointments`, training content, team chat, and reports. Current model relies heavily on anonymous Firebase Auth plus app/client-side rep identity, with partial custom-claim enforcement.
- 2026-06-15: The codebase is mid-migration from a large compatibility hook (`src/hooks/useFirebase.ts`) to smaller domain hooks/services. New work should prefer `src/services/*` and `src/hooks/domain/*` where possible.
- 2026-06-15: Existing tests cover selected utilities, auth/roles, lead identity/reset/snapshots, saved views, Sheets sync reliability, settings admin, migrate auth fields, and lead snapshots. Major page-level workflows and Firebase emulator-backed rule tests are still thin or missing.

## Operating Rules

- Before substantial work, read this file, `.codex/architecture.md`, `.codex/tech-stack.md`, `.codex/project-overview.md`, `.codex/known-issues.md`, and `.codex/decisions.md`.
- Keep durable discoveries here only when they will help future sessions.
- Prefer short, dated notes over long transcripts.
- Do not store secrets, tokens, credentials, customer data, or private incident details.

## Environment Notes

- 2026-06-15: Local GitHub CLI exists at `C:\Program Files\GitHub CLI\gh.exe`; a fresh terminal may be needed before bare `gh` resolves from PATH.
