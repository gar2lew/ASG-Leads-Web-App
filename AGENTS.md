# ASG CRM React

## Project identity

- Name: asg-leads-react
- Purpose: CRM for mortgage broking / financial services
- Firebase project: amplify-leads-2026
- Repo root: C:\dev\ASG_LEADS_WEBAPP\asg_crm_react
- Build outputs: dist/ for client, functions/lib/ for server
- Tests: Vitest, located in src/**/*.test.ts
- Nested mirror: asg_crm_react/asg_crm_react/ is a mirror copy. Use root-level files as source of truth.

## Token efficiency

- Prefer targeted file reads over repository-wide scans.
- Use `rg`/`rg --files` before opening broad file sets.
- Read only files directly relevant to the task.
- Do not repeatedly reread files already inspected unless they changed.
- Summarise findings instead of reproducing large files.
- Reference paths and line numbers where possible.
- Modify the minimum number of files necessary.
- Avoid broad refactors unless explicitly requested.

## Project memory

- Before substantial work, read:
  - `.codex/memory.md`
  - `.codex/architecture.md`
  - `.codex/tech-stack.md`
  - `.codex/project-overview.md`
  - `.codex/known-issues.md`
  - `.codex/decisions.md`
- Update these files when discovering durable project information.
- Keep memory concise and free of secrets, credentials, customer data, or transient logs.
- Use `.codex/workflows/qa-review.md` before claiming completion.
- Use `.codex/workflows/deploy.md` before any push or deploy.

## Stack

- React 18.2
- Zustand 4.5
- Tailwind CSS 3.4
- Zod 3.25
- firebase 10.8
- firebase-admin 13.0.2
- firebase-functions 6.3.1
- bcryptjs 3.0.3
- jsonwebtoken 9.0.2
- @react-google-maps/api 2.20
- pdf-lib, jspdf, pdfjs-dist
- Vite 5.1
- TypeScript 5.3 client strict, 5.0+ server strict
- Node.js 22 for functions

## Critical rules

- Never call `admin.initializeApp()` or `admin.firestore()` at module top-level in functions.
- Always use a lazy `getDb()` pattern.
- Every callable function must call `requireAuth(request)` first.
- Never write auth-sensitive fields directly from the client.
- PIN, backup password, role, and permission changes must go through server callables.
- Do not import `migrateAuthFields.ts` into `index.ts`. It is deployed separately.
- `routeConfig.ts` is active for URL-to-page mapping, but the app still renders via tab/page-key navigation rather than React Router components.
- Do not change region isolation rules. Always respect `allowedRegions` and `canAccessRegion()`.
- Client notes live in the top-level `clientNotes` collection, not lead subcollections.
- Preserve plaintext PIN fallback behavior in `verifyPin` until migration is fully complete.

## Auth model

- Authentication is anonymous Firebase Auth plus custom PIN verification.
- Client signs in with `signInAnonymously()`.
- Login flow lives in `src/layouts/LoginScreen.tsx`.
- Server auth logic lives in `functions/src/auth/verifyPin.ts`.
- Custom claims include `repId`, `role`, `region`, `active`, `allowedRegions`.
- Roles are ranked `rep`, `manager`, `admin`, `director`.
- Regions are `brisbane` and `perth`.

## Key server files

- `functions/src/index.ts`
- `functions/src/auth.ts`
- `functions/src/auth/verifyPin.ts`
- `functions/src/docusign.ts`
- `functions/src/settingsAdmin.ts`
- `functions/src/leadSnapshots.ts`
- `functions/src/aggregateStats.ts`
- `functions/src/migrateAuthFields.ts`

## Key client files

- `src/App.tsx`
- `src/main.tsx`
- `src/types/index.ts`
- `src/stores/appStore.ts`
- `src/lib/firebase.ts`
- `src/lib/authClaims.ts`
- `src/lib/authIdentity.ts`
- `src/lib/authMigrationService.ts`
- `src/lib/validators.ts`
- `src/layouts/AppShell.tsx`
- `src/layouts/LoginScreen.tsx`
- `src/hooks/useFirebase.ts`
- `src/hooks/useUserRole.ts`
- `src/hooks/useAppSettings.ts`
- `src/hooks/useOfflineQueue.ts`
- `src/hooks/useClientNotes.ts`
- `src/hooks/useDocuSign.ts`
- `src/hooks/useDashboard.ts`
- `src/hooks/useScripts.ts`
- `src/hooks/useTrainingLibrary.ts`

## Data model anchors

- Lead is the core entity.
- Rep owns auth, region, role, and permissions.
- Deal tracks lead-to-settlement workflow.
- Commission tracks settlement and rep allocations.
- DailyStats tracks daily performance metrics.
- DRAPS tracks dials, responses, appointments, presentations, sales.

## Build and test

- Client: `npm run dev`, `npm run build`, `npm run test`, `npm run lint`
- Server: `cd functions && npm run build`, `npm run serve`, `npm run deploy`
- Full deploy: `npm run release:deploy` or `npm run release:dry-run`

## GitHub safety

- Allowed: `git status`, `git diff`, `git add`, `git commit`, `git push`, feature branches, draft PRs.
- Prefer creating a feature branch.
- Prefer PRs over direct pushes to `main`.
- Direct push to `main` requires explicit user instruction.
- Never force push.
- Never delete remote branches.
- Never change repository visibility or branch protection rules.
- Always show `git status` before pushing.
- Always summarise changed files before committing.

## Firebase deployment safety

- Confirm project with `firebase use` or `.firebaserc` before deploy.
- Confirm the active Firebase project ID.
- Prefer scoped deploys:
  - `firebase deploy --only hosting`
  - `firebase deploy --only functions`
  - `firebase deploy --only firestore:rules`
- Production-sensitive Firebase commands require explicit confirmation:
  - deploying functions
  - deploying Firestore rules
  - deploying storage rules
  - deleting or rewriting data
- Do not deploy functions and rules together unless requested.

## Vercel deployment safety

- Vercel is not currently configured for this repo. Do not run Vercel deploys unless a project link/config has been intentionally added and the target is confirmed.
- If Vercel is later configured, use preview deploys by default.
- Use `vercel --prod` only with explicit production wording such as "deploy to production", "deploy live", or "run vercel --prod".
- Before production, run the known build/test command when practical.
- Confirm project name/team if visible.
- Never print `VERCEL_TOKEN`.
- Never change project ownership/team settings.
- Never modify environment variables without explicit instruction.

## Deployment preflight

Before any deploy or push, run:

1. `git status`
2. `git branch --show-current`
3. Relevant test/build command if known
4. Confirm:
   - target branch
   - target platform
   - target environment
   - changed files summary

## Secrets

- Use locally authenticated CLI tools only.
- Never request, echo, print, expose, write, or commit secrets.
- Never commit `.env`, `.env.local`, service account JSON files, or Vercel/Firebase credential files.
- If credentials are missing, tell the user which CLI login/setup command is required.

## Verification

- Run available tests when practical.
- Check linting issues when relevant.
- Check build errors when relevant.
- Verify changed functionality.
- Summarise any unverified assumptions.
- Never claim something works unless it has been verified.

## Working rules

- Preserve existing structure.
- Prefer targeted diffs over full rewrites.
- State assumptions before coding if any file content is unknown.
- Ask before changing auth, security rules, or deployment-sensitive logic.
- Note edge cases and failure modes for auth, security, and Firestore changes.
- Keep TypeScript strictness intact.
- Do not introduce undocumented features.
