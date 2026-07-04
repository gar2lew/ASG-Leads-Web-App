# Security Guidelines

## Security Principle

Assume CRM data is sensitive. Staff identity, client records, lead history, commissions, documents, SMSF data, and integration payloads must be protected by server-side checks wherever possible.

## Secrets

- Do not print, request, write, or commit secrets.
- Do not commit `.env`, `.env.local`, service account JSON files, Firebase credentials, or Vercel credentials.
- Reference Firebase secrets by name only.
- Salestrail secret names are `SALESTRAIL_API_USERNAME` and `SALESTRAIL_API_PASSWORD`.

## Authentication

- Current model uses anonymous Firebase Auth plus PIN verification.
- Server claims include `repId`, `role`, `region`, `active`, and `allowedRegions`.
- Preserve the plaintext PIN fallback until the migration is complete.
- PIN, backup password, role, active status, Firebase UID, permissions, and allowed regions must not be updated directly from the client.

## Cloud Functions

- Every callable must call `requireAuth(request)` first unless explicitly public and documented.
- Admin actions require role checks.
- Region-sensitive actions require region checks.
- Do not log secrets, PINs, backup passwords, tokens, or customer data.
- Treat unauthenticated callables as production blockers until reviewed.

## Firestore Rules

- Treat broad anonymous-compatible access as a temporary compatibility state.
- Add emulator tests before tightening rules.
- Move sensitive writes to callables before blocking direct client writes.
- `salestrailCalls` must remain callable-only.
- Audit and settings history writes must remain server-authoritative.

## Firebase Operations

- `.firebaserc` points to `amplify-leads-2026`, which is production-like.
- Use demo emulator projects for local validation.
- Do not deploy without explicit approval.
- Do not run live migrations or backfills without explicit approval.
