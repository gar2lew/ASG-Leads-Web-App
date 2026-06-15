# Tech Stack

## Source Of Truth

- Use root-level project files as source of truth.
- `asg_crm_react/asg_crm_react/` is a mirror copy and should not drive stack decisions.
- Package manager lockfile present: `package-lock.json`.
- npm is the active package manager for scripts.

## Client App

- Runtime: React `^18.2.0` with React DOM `^18.2.0`.
- Build tool: Vite `^5.1.4` with `@vitejs/plugin-react` `^4.2.1`.
- Language: TypeScript `^5.3.3`, strict mode enabled.
- Module type: ESM via root `package.json` `"type": "module"`.
- JSX runtime: `react-jsx`.
- Vite dev server port: `5173`.
- Client build output: `dist`.
- SPA shell entry: `src/main.tsx` -> `src/App.tsx` -> `src/layouts/AppShell.tsx`.

## Styling And UI

- Tailwind CSS `^3.4.1`.
- PostCSS with `tailwindcss` and `autoprefixer`.
- Tailwind dark mode: class-based.
- Tailwind typography plugin: `@tailwindcss/typography`.
- Icons: `lucide-react`.
- Configured fonts: `Instrument Sans` for sans, `Syne` for display.
- Theme includes ASG-specific gold/brass/panel/sidebar colors.

## Firebase And Backend

- Firebase Web SDK: `firebase` `^10.8.0`.
- Firebase project: `amplify-leads-2026`.
- Firebase Hosting public directory: `dist`.
- Firebase Functions source directory: `functions`.
- Functions runtime: Node.js `22`.
- Functions entrypoint output: `functions/lib/index.js`.
- Functions module system: CommonJS.
- Functions TypeScript target: `es2017`.
- Server dependencies:
  - `firebase-admin` `^13.0.2`
  - `firebase-functions` `^6.3.1`
  - `bcryptjs` `^3.0.3`
  - `jsonwebtoken` `^9.0.2`
- Firebase products used: Auth, Firestore, Storage, Functions, Hosting, Cloud Scheduler, Firestore triggers, FCM/web push.

## External APIs And Browser APIs

- Google Maps via `@react-google-maps/api` and `@googlemaps/markerclusterer`.
- Google Sheets API is called from `AppShell`/Sheets sync flows.
- DocuSign integration is implemented in Firebase Functions and client hooks.
- Browser APIs used include IndexedDB-backed Firestore persistence, Notifications, Service Worker, Speech Recognition, Speech Synthesis, Geolocation, and local/session storage.

## Data, Validation, And State

- App state: Zustand `^4.5.0`.
- Runtime validation: Zod `^3.25.76`.
- PDF/document tooling: `pdf-lib`, `jspdf`, and `pdfjs-dist`.
- Client storage helpers include `src/lib/storage.ts`, Firebase Storage, localStorage, and sessionStorage.
- Main type model lives in `src/types/index.ts`.

## Testing

- Test runner: Vitest `^1.6.0`.
- Vite test environment: `node`.
- Test include pattern: `src/**/*.test.{ts,tsx}`.
- Test setup file: `src/tests/setup.ts`.
- Testing libraries:
  - `@testing-library/react`
  - `@testing-library/jest-dom`
  - `@testing-library/user-event`
  - `jsdom`
- Root test command: `npm run test`.
- Scripted smoke/unit checks:
  - `npm run test:auth-boundaries`
  - `npm run test:workflow-state`
  - `npm run test:region-identity`
  - `npm run test:observability`
  - `npm run test:release-metadata`
- Functions tests exist under `functions/test/*.test.cjs`.
- Functions build command: `cd functions && npm run build`.

## Linting And Build

- ESLint `^8.57.0`.
- Parser: `@typescript-eslint/parser`.
- Extends:
  - `eslint:recommended`
  - `plugin:@typescript-eslint/recommended`
  - `plugin:react-hooks/recommended`
- React refresh rule is enabled as a warning.
- `@typescript-eslint/no-explicit-any` is a warning.
- Root lint command: `npm run lint`.
- Root build command: `npm run build`, which runs `tsc && vite build`.
- `prebuild` generates release metadata with `scripts/write-release-metadata.cjs`.

## Deployment Commands

- Client hosting deploy: `npm run deploy` runs `npm run build && firebase deploy --only hosting`.
- Full release deploy wrapper: `npm run release:deploy`.
- Dry-run release wrapper: `npm run release:dry-run`.
- Functions deploy command exists in `functions/package.json`: `firebase deploy --only functions`.
- Firebase validation command: `npm run validate:firebase`.
- Firebase hosting rewrites include:
  - `/smsf/**` to `/smsf/index.html`
  - `/pia/**` to `/pia/index.html`
  - `/docusignWebhook` to function `docusignWebhook`
  - SPA fallback to `/index.html`

## Vercel

- Vercel CLI is available in the developer environment, but the repository does not contain root app Vercel configuration.
- No `vercel.json`, `.vercel/`, or root package scripts reference Vercel.
- Treat Vercel deploys as unsupported for this app until a project link/config is intentionally added.
