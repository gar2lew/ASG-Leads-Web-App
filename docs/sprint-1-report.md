# Sprint 1 Report: CRM Stabilisation

Date: 5 July 2026

Branch: `goal/sprint-validation`

Latest commit before this report: `f738ef0 perf: split heavy vendor chunks`

Savepoint: `savepoint-before-sprint-validation`

## Summary

Sprint 1 established a safer CRM foundation before larger product work. The sprint completed validation baselines, emulator harnesses, safe cleanup, UI audit planning, design system documentation, component audit planning, shared UI primitives, scoped UI polish, and a low-risk build chunking optimisation.

No production Firebase resources were modified. No deploy, push, migration, live Salestrail sync, phone backfill write, or production data write was performed.

## Files Changed

Major documentation deliverables:

- `docs/ui-audit.md`
- `docs/ui-redesign-plan.md`
- `docs/design-system.md`
- `docs/design-system-adoption-backlog.md`
- `docs/component-audit.md`
- `docs/component-refactor-plan.md`

Shared UI primitives added:

- `src/components/ui/Button.tsx`
- `src/components/ui/Card.tsx`
- `src/components/ui/Dialog.tsx`
- `src/components/ui/FormField.tsx`
- `src/components/ui/Badge.tsx`
- `src/components/ui/Loading.tsx`
- `src/components/ui/Table.tsx`
- `src/components/ui/index.ts`

UI surfaces polished:

- `src/components/navigation/SidebarItem.tsx`
- `src/components/navigation/SidebarSection.tsx`
- `src/components/navigation/SidebarUserCard.tsx`
- `src/components/navigation/WorkspaceSwitcher.tsx`
- `src/pages/Dashboard.tsx`
- `src/pages/Leads.tsx`
- `src/components/LeadSidebar.tsx`
- `src/pages/ReportsDashboard.tsx`
- `src/pages/Admin.tsx`
- `src/components/RepSettingsPanel.tsx`
- `src/components/SystemSettingsPanel.tsx`

Performance configuration:

- `vite.config.ts`

## Performance Gains

The production build now uses explicit Vite manual chunks for heavy stable dependency groups:

- `vendor-react`
- `vendor-firebase`
- `vendor-pdf`
- `vendor-maps`
- `vendor-icons`
- `vendor-state`

Measured build change:

- Previous main app chunk was about `526 kB`.
- New main app chunk is about `302.5 kB`.
- Large chunk warnings remain for Firebase and PDF vendor chunks. This is expected because those libraries are still large, but they are now isolated from the main app bundle.

## Technical Debt Removed

- Added shared UI primitives to reduce future duplication in buttons, cards, dialogs, form fields, badges, loading states, and tables.
- Improved keyboard focus visibility and stable touch target sizing across core navigation and high-use CRM surfaces.
- Reduced layout inconsistency across Dashboard, Leads, Lead Details, Reports, Admin, My Settings, and System Controls.
- Isolated heavy vendor dependencies so future bundle optimisation has clearer targets.

## Validation Results

All Sprint Validation commands passed:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:emulator:preflight`
- `npm run test:emulator:rules`
- `npm run test:emulator:firestore-smoke`
- `npm run test:emulator:callables-dry-run`
- `cd functions && npm run build`
- `cd functions && npm run test:settings-admin`

Notes:

- Firestore emulator rules tests intentionally log permission denied messages for negative access checks. The harness exited successfully.
- Callable emulator dry-run tests used `demo-asg-crm-emulator` only.
- Client build regenerated `src/generated/releaseMetadata.ts`; it was restored before reporting and committing.

## Remaining Issues

- Firebase and PDF vendor chunks remain larger than `500 kB`.
- `firebase-functions` emulator output warns that the Functions SDK is outdated. This was not changed during Sprint 1.
- Shared UI primitives are additive. Existing pages are not fully migrated to them yet.
- Some large operational components remain oversized, including Admin, Lead Details, and DataTable surfaces.
- No production release should proceed until the Firebase release plan and emulator validation gates remain current.

## Recommendations

- Continue with a focused component migration goal that adopts the shared primitives one surface at a time.
- Plan a dedicated bundle optimisation pass for PDF tooling, document centre loading, Firebase import boundaries, and report export paths.
- Keep emulator validation mandatory before Firebase, callable, Salestrail, phone normalisation, or rules work.
- Treat production deployment as blocked until a release manager approves the Firebase surface plan.

## Sprint 1 Status

Sprint 1 is complete from a local validation perspective.

Do not deploy or push from this branch without explicit approval.
