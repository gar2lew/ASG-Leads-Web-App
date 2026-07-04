# Development Standards

## General Standards

- Keep changes small and reversible.
- Prefer existing patterns over new abstractions.
- Do not expand large compatibility files unless no safer option exists.
- Prefer services and domain hooks over adding more logic to `src/hooks/useFirebase.ts`.
- Keep TypeScript strictness intact.
- Avoid hidden behaviour changes in refactors.
- Add comments only when they clarify non-obvious logic.

## Documentation Standards

- Use Australian business English.
- Be direct, practical, and specific to ASG CRM.
- Avoid secrets, customer data, and private incident details.
- Record assumptions and missing validation.
- Include rollback guidance for operational docs.

## App Code Standards

- Preserve current tab/page-key navigation unless a router migration goal is approved.
- Keep region handling explicit for Brisbane and Perth.
- Respect `allowedRegions` and `canAccessRegion()`.
- Avoid broad untested changes to lead, deal, commission, and admin workflows.
- For UI changes, include empty, loading, error, permission-denied, mobile, and desktop states.

## Firebase Function Standards

- Every callable should call `requireAuth(request)` first unless explicitly public and documented.
- Sensitive operations require role and region checks.
- Prefer lazy `getDb()` patterns.
- Do not import one-off migration functions into deployed exports unless the release plan explicitly allows it.
- Do not log secrets, PINs, backup passwords, tokens, or customer data.

## Data Standards

- Do not write production data without explicit approval.
- Use dry-run first for imports, migrations, and backfills.
- Record affected counts and sample transformations.
- Keep rollback or restore plans beside any data-changing proposal.
