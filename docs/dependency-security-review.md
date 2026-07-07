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
| `undici` | No | High | Transitive Firebase dependency | Root Firebase SDK tree. Browser app bundle exposure was not found, but Node, local tooling, and emulator paths keep the package installed. | Defer. Target through Firebase major SDK upgrade only. | High | Path includes Firebase Auth, Firestore, Functions, and Storage packages under root `firebase@10.14.1`. Firebase 10.14.1 pins `undici@6.19.7` exactly. |
| `@grpc/grpc-js` | No | High | Transitive Firebase and Google dependency | Root Firebase Admin and Firestore dependency paths. | Remediated for the root Firebase Firestore path. Functions path remains separate. | Low | Root Firebase Firestore path was updated from `1.9.15` to `1.9.16` through the lockfile. Admin SDK and Functions dependency paths remain out of scope for this goal. |
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

## PDF Remediation Update

Date: 2026-07-06
Branch: `security/pdf-dependency-remediation`

- `jspdf` was updated from `4.2.0` to `4.2.1`.
- `4.2.1` was the smallest same-major patched version available from npm during this goal.
- The direct `jspdf` audit advisory no longer appears in root audit output.
- Root audit changed from 29 advisories to 28 advisories.
- Root critical count changed from 2 to 1.
- Remaining root critical advisory is `vitest`, which is dev tooling and remains deferred to the tooling remediation stage.
- Transitive `dompurify@3.3.3` moderate advisories remain under `jspdf` and need a separate targeted review.

## DOMPurify PDF Transitive Update

Date: 2026-07-06
Branch: `security/dompurify-pdf-transitive-review`

- `dompurify` was introduced as an optional dependency of `jspdf@4.2.1`.
- The current ASG CRM code does not import `dompurify` directly.
- Runtime reachability is indirect through `jspdf` HTML and sanitisation paths. The current PDF workflows mainly use jsPDF text, drawing, image, blob, arraybuffer, and save APIs, but the optional dependency is still bundled as part of the PDF dependency surface.
- `jspdf@4.2.1` declares `dompurify` as optional with range `^3.3.1`.
- `dompurify@3.4.11` is within that range and is the patched version available from npm during this goal.
- `npm update dompurify` changed only the transitive lockfile entry from `3.3.3` to `3.4.11`.
- No override was required because the patched version satisfies `jspdf`'s optional dependency range.
- The `dompurify` advisory no longer appears in root audit output.
- Root audit changed from 28 advisories to 27 advisories.
- Root moderate count changed from 21 to 20.

## Firebase Web SDK Remediation Update

Date: 2026-07-06
Branch: `security/firebase-web-sdk-remediation`

- Direct root Firebase SDK remains `firebase@10.14.1`.
- `10.14.1` was the latest Firebase 10.x version available when checked during this goal, so no same-major Firebase SDK update was available.
- Root Firebase subpackages under `firebase@10.14.1` still pin `undici@6.19.7` exactly through Auth, Firestore, Functions, and Storage packages.
- A patched `undici` 6.x line exists, but forcing it would require an override against exact Firebase subpackage dependency declarations. That is deferred to a separate explicit Firebase compatibility goal.
- Root Firebase Firestore's `@grpc/grpc-js` dependency accepts the patched `1.9.16` release through its declared `~1.9.0` range.
- `package-lock.json` was updated from `@grpc/grpc-js@1.9.15` to `@grpc/grpc-js@1.9.16` for the root Firebase Firestore path.
- No direct root dependency was added, no Firebase config changed, and no Functions Admin SDK dependency was upgraded.
- Root audit changed from 27 advisories to 26 advisories.
- Root high count changed from 5 to 4.
- Remaining Firebase web SDK audit risk is the `undici` path under `firebase@10.14.1`.

## Firebase Undici Compatibility Review

Date: 2026-07-07
Branch: `security/firebase-undici-compatibility-review`

- `undici@6.19.7` is introduced by exact dependency declarations in Firebase 10.14.1 subpackages:
  - `@firebase/auth@1.7.9`
  - `@firebase/auth-compat@0.5.14`
  - `@firebase/firestore@4.7.3`
  - `@firebase/functions@0.11.8`
  - `@firebase/storage@0.13.2`
- `@firebase/rules-unit-testing@3.0.4` peers on `firebase@^10.0.0`, so the emulator rules test surface also retains the Firebase 10 dependency graph.
- The Vite build uses Firebase browser export conditions. No built `dist/assets` JavaScript or module asset contained the string `undici` during this review, so direct browser bundle reachability was not found.
- Node, package-install, audit, and emulator surfaces remain exposed because `undici` is installed in `node_modules` and selected by Firebase node export conditions.
- `firebase@10.14.1` remains the final stable Firebase 10.x release found during this review.
- Firebase 11 and Firebase 12 package metadata no longer lists `undici` in the reviewed Auth, Firestore, Functions, and Storage subpackage dependencies, but adopting either line is a semver-major Firebase web SDK upgrade.
- A direct npm override to `undici@6.27.0` would force a different package version than the exact Firebase 10.14.1 declarations. That is not classified as clearly safe for this production-like CRM because it changes Firebase's Node and emulator transport dependency outside Firebase's published compatibility set.
- No package files were changed in this review.
- Root audit remains at 26 advisories, including 1 critical and 4 high.
- The remaining Firebase web SDK `undici` risk is accepted as deferred until a dedicated Firebase 11 or 12 upgrade compatibility goal runs full auth, Firestore, Functions callable, Storage, and emulator validation.
