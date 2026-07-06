# Dependency Security Review

Date: 2026-07-06
Branch: `security/dependency-review`
Savepoint: `savepoint-before-dependency-review`

## Objective

Review root and Functions dependency advisories and define safe remediation without running broad audit fixes, changing package ranges blindly, touching Firebase production resources, or deploying.

## Safety Position

- No `npm audit fix` or `npm audit fix --force` was run.
- No dependency versions were changed.
- No lockfiles or package manifests were edited.
- No Firebase deploy, migration, live Salestrail sync, phone backfill write, or production data write was run.
- This review is documentation only.

## Commands Reviewed

| Command | Result | Notes |
| --- | --- | --- |
| `npm audit --json` | Completed with advisories | Exit code `1` because vulnerabilities were found. |
| `cd functions; npm audit --json` | Completed with advisories | Exit code `1` because vulnerabilities were found. |
| `npm ls jspdf vitest vite firebase firebase-admin postcss undici @grpc/grpc-js flatted picomatch dompurify --all --depth=4` | Completed | Used to confirm direct and transitive root paths. |
| `cd functions; npm ls firebase-admin @grpc/grpc-js form-data fast-xml-builder @google-cloud/firestore @google-cloud/storage google-gax retry-request uuid --all --depth=5` | Completed | Used to confirm Functions runtime paths. |

## Root Audit Summary

| Severity | Count |
| --- | ---: |
| Critical | 2 |
| High | 5 |
| Moderate | 21 |
| Low | 1 |
| Total | 29 |

## Functions Audit Summary

| Severity | Count |
| --- | ---: |
| Critical | 0 |
| High | 3 |
| Moderate | 12 |
| Low | 1 |
| Total | 16 |

## Root Critical And High Advisories

| Package | Direct | Severity | Exposure | Runtime surface | Automated fix safety | Breaking change risk | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `jspdf` | Yes | Critical | App runtime | PDF generation and document workflows can load user or CRM data into generated PDFs. | Do not auto-fix in release work. | Medium | Installed `jspdf@4.2.0`; advisory range is `<=4.2.0`. Fix is reported available, but PDF output and document workflows require compatibility checks. |
| `vitest` | Yes | Critical | Dev tooling | Test runner and Vitest UI server only. App runtime is not directly exposed. | Do not auto-fix. | High | Fix available is `vitest@4.1.10`, a semver-major upgrade from `1.6.1`. Requires test harness compatibility review. |
| `vite` | Yes | High | Dev and build tooling | Local dev server and build pipeline. Production static bundle is not the same exposure as an exposed dev server. | Do not auto-fix. | High | Fix available is `vite@8.1.3`, a semver-major upgrade from resolved `5.4.21`. Requires Vite, plugin, build, and emulator workflow validation. |
| `undici` | No | High | Transitive Firebase dependency | Root Firebase SDK tree. Browser app exposure is indirect, but Node-based tooling and emulator paths may use it. | Target through Firebase SDK update only. | Medium | Path includes Firebase Auth, Firestore, Functions, and Storage packages under root `firebase@10.14.1`. |
| `@grpc/grpc-js` | No | High | Transitive Firebase and Google dependency | Root Firebase Admin and Firestore dependency paths. | Target through Firebase or Google dependency updates only. | Medium | Root tree includes older `@grpc/grpc-js@1.9.15` under Firebase Firestore and `1.14.4` under Admin SDK dependencies. |
| `flatted` | No | High | Dev tooling | ESLint cache dependency path. | Target through ESLint tooling update only. | Medium | Path is `eslint` to `file-entry-cache` to `flat-cache` to `flatted`. |
| `picomatch` | No | High | Dev tooling | Tailwind, glob, and build tooling paths. | Target through toolchain updates only. | Medium | Paths include Tailwind and glob dependencies. |

## Root Direct Moderate And Low Advisories

| Package | Severity | Exposure | Notes |
| --- | --- | --- | --- |
| `firebase` | Moderate | App runtime and emulator tooling | Direct root dependency. Advisories are through Firebase subpackages and `undici`. Update needs Firebase compatibility validation. |
| `firebase-admin` | Moderate | Root tooling and shared Functions typecheck path | Direct root dependency resolved to `14.1.0`. Audit suggests a semver-major downgrade-like fix to `10.3.0`, so do not apply automatically. |
| `postcss` | Moderate | Build tooling | Direct root dependency resolved to `8.5.8`; fix appears available. Treat as a candidate low-risk patch update only in an isolated dependency branch. |
| `@babel/core` | Low | Dev tooling | Transitive tooling advisory. |
| `dompurify` | Moderate | PDF or HTML sanitisation dependency path | Transitive through `jspdf`. Review with PDF remediation. |

## Functions Critical And High Advisories

| Package | Direct | Severity | Exposure | Runtime surface | Automated fix safety | Breaking change risk | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `@grpc/grpc-js` | No | High | Functions runtime | Google Firestore client transport through `firebase-admin`. | Do not auto-fix. | Medium | Resolved through `firebase-admin@13.7.0` to `@google-cloud/firestore` and `google-gax`. |
| `form-data` | No | High | Functions runtime | Google Cloud Storage and retry request dependency path. | Do not auto-fix. | Medium | Path is through `@google-cloud/storage`, `retry-request`, and `@types/request`. |
| `fast-xml-builder` | No | High | Functions runtime | Google Cloud Storage XML parsing dependency path. | Do not auto-fix. | Medium | Path is through `@google-cloud/storage` and `fast-xml-parser`. |

## Functions Direct Advisory

| Package | Severity | Exposure | Notes |
| --- | --- | --- | --- |
| `firebase-admin` | Moderate | Functions runtime | Direct Functions dependency resolved to `13.7.0`; audit fix available is `14.1.0`, a semver-major update from the declared `^13.0.2` range. Requires callable emulator and settings/admin validation before adoption. |

## Exposure Assessment

| Area | Exposure summary | Current release impact |
| --- | --- | --- |
| App runtime | `jspdf` and Firebase web SDK dependencies affect app-shipped workflows. | Production release should remain blocked until targeted remediation or explicit risk acceptance. |
| Functions runtime | Functions Admin SDK transitive paths include high advisories. | Functions deploy remains blocked until dependency remediation is validated or risk is accepted by release owner. |
| Dev-only tooling | `vite`, `vitest`, `flatted`, `picomatch`, `postcss`, and Babel advisories mainly affect local build, dev server, lint, or test tooling. | Do not expose dev servers. Remediate in isolated toolchain goals with full validation. |
| Firebase production resources | No production Firebase resources were touched. | Firebase deploys remain approval-gated. |

## Findings

1. Root dependency risk is release-blocking because direct `jspdf` runtime advisories include critical severity and the CRM has document/PDF workflows.
2. Root test/build tooling risk is high but mostly local because `vitest` and `vite` fixes require semver-major upgrades and should not be mixed into release preparation.
3. Functions runtime risk is high because transitive Google/Firebase libraries include high advisories under the deployed Functions dependency graph.
4. Firebase SDK remediation needs targeted compatibility validation across auth, Firestore listeners, Functions callables, emulator harnesses, and build output.
5. Broad automated fixes are not safe for this repository because they may downgrade or major-upgrade Firebase/Admin/Vite/Vitest surfaces and change release behaviour.

## Release Recommendation

Current recommendation is no production release until dependency remediation is either completed in targeted branches or formally accepted by the release owner with compensating controls.

At minimum, remediate or accept:

- Direct `jspdf` critical app runtime advisories.
- Functions high transitive advisories under `firebase-admin` and Google libraries.
- Vite and Vitest dev-tooling advisories with clear local development exposure controls.
