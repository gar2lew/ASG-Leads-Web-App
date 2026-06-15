# QA Review Workflow

Use this before claiming a change is complete.

1. Read the request, changed files, and relevant memory files.
2. Run `git status` and inspect the focused diff.
3. Identify risk areas: auth, permissions, Firestore writes, region isolation, data migration, UI regressions, and deployment scripts.
4. Run the most relevant tests or builds:
   - Client: `npm run test`, `npm run lint`, `npm run build`
   - Functions: `cd functions && npm run build`
5. For frontend changes, verify the affected screen in a browser when practical.
6. Report what passed, what failed, and what remains unverified.

Never claim functionality works without a verification command or an explicit manual check.
