# Safe Deploy Workflow

Use this before any push or deployment.

## Required Preflight

1. Run `git status`.
2. Run `git branch --show-current`.
3. Run the relevant known build/test command.
4. Summarise changed files and intended target.
5. Confirm target branch, platform, and environment.

## GitHub

- Prefer feature branches and pull requests.
- Do not push directly to `main` unless explicitly requested.
- Never force push.
- Use `gh auth status` to verify auth without exposing tokens.

## Firebase

- Confirm project with `firebase use` or `.firebaserc`.
- Confirm project ID before deploy.
- Prefer scoped deploys:
  - `firebase deploy --only hosting`
  - `firebase deploy --only functions`
  - `firebase deploy --only firestore:rules`
- Deploying functions, Firestore rules, storage rules, or data-affecting changes requires explicit confirmation.

## Vercel

- This repo currently has no app-level Vercel configuration (`vercel.json`, `.vercel/`, or npm deploy script).
- Do not run Vercel deploys until a Vercel project link/config is intentionally added and the target project/team is confirmed.
- If Vercel is later configured, use preview deploys by default.
- Use `vercel --prod` only after explicit production wording.
- Confirm project/team before production.

## Secrets

- Never print, write, commit, or request tokens.
- Never commit `.env`, `.env.local`, service account JSON files, or CLI credential files.
