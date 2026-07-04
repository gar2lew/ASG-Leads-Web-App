const assert = require("node:assert/strict");
const fs = require("node:fs");
const { execSync } = require("node:child_process");

const DEMO_PROJECT = "demo-asg-crm-emulator";
const PRODUCTION_PROJECT = "amplify-leads-2026";

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function commandAvailable(command, args = ["--version"]) {
  try {
    execSync([command, ...args].join(" "), { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function hasScript(pkg, name) {
  return typeof pkg.scripts?.[name] === "string";
}

const packageJson = readJson("package.json");
const functionsPackageJson = readJson("functions/package.json");
const firebaseJson = readJson("firebase.json");
const firebaserc = readJson(".firebaserc");
const rules = fs.readFileSync("firestore.rules", "utf8");

assert.equal(firebaserc.projects?.default, PRODUCTION_PROJECT, "Default Firebase project should remain documented as production-like.");
assert.equal(firebaseJson.firestore?.rules, "firestore.rules", "Firestore rules path should be configured.");
assert.equal(firebaseJson.firestore?.indexes, "firestore.indexes.json", "Firestore indexes path should be configured.");
assert.equal(firebaseJson.functions?.source, "functions", "Functions source should be configured.");

assert.ok(hasScript(packageJson, "test:emulator:preflight"), "Root package should expose emulator preflight.");
assert.ok(hasScript(packageJson, "test:emulator:firestore-smoke"), "Root package should expose Firestore emulator smoke validation.");
assert.ok(hasScript(packageJson, "test:emulator:rules"), "Root package should expose authenticated Firestore rules validation.");
assert.ok(hasScript(packageJson, "test:emulator:callables-dry-run"), "Root package should expose callable emulator dry-run validation.");
assert.match(
  packageJson.scripts["test:emulator:firestore-smoke"],
  new RegExp(`--project ${DEMO_PROJECT}`),
  "Firestore emulator smoke command must use the demo project.",
);
assert.ok(!packageJson.scripts["test:emulator:firestore-smoke"].includes(PRODUCTION_PROJECT), "Emulator smoke must not target production.");
assert.match(
  packageJson.scripts["test:emulator:rules"],
  new RegExp(`--project ${DEMO_PROJECT}`),
  "Authenticated rules command must use the demo project.",
);
assert.ok(!packageJson.scripts["test:emulator:rules"].includes(PRODUCTION_PROJECT), "Authenticated rules command must not target production.");
assert.match(
  packageJson.scripts["test:emulator:callables-dry-run"],
  new RegExp(`--project ${DEMO_PROJECT}`),
  "Callable emulator dry-run command must use the demo project.",
);
assert.ok(!packageJson.scripts["test:emulator:callables-dry-run"].includes(PRODUCTION_PROJECT), "Callable emulator dry-run command must not target production.");

assert.ok(hasScript(functionsPackageJson, "serve"), "Functions package should expose an emulator serve command.");
assert.equal(firebaseJson.emulators?.auth?.port, 9099, "Auth emulator port should be explicit.");
assert.equal(firebaseJson.emulators?.firestore?.port, 8080, "Firestore emulator port should be explicit.");
assert.equal(firebaseJson.emulators?.functions?.port, 5001, "Functions emulator port should be explicit.");
assert.equal(firebaseJson.emulators?.ui?.port, 4000, "Emulator UI port should be explicit.");
assert.equal(firebaseJson.emulators?.singleProjectMode, true, "Emulator singleProjectMode should be enabled.");
assert.ok(
  /match \/salestrailCalls\/\{callId\} \{\s*allow read, write: if false;/s.test(rules),
  "salestrailCalls must deny direct client access.",
);
assert.ok(
  /match \/leads\/\{leadId\} \{\s*allow read, write: if canUseOperationalApp\(\);/s.test(rules),
  "leads operational access rule should be explicit.",
);
assert.ok(/match \/appSettings\/\{docId\}/s.test(rules), "appSettings rule coverage should be present.");

const firebaseCliAvailable = commandAvailable("firebase", ["--version"]);
const javaAvailable = commandAvailable("java", ["-version"]);
const hasExplicitEmulatorConfig = Boolean(firebaseJson.emulators);

console.log("Firebase emulator preflight");
console.log(`- Demo project: ${DEMO_PROJECT}`);
console.log(`- Firebase CLI: ${firebaseCliAvailable ? "available" : "missing"}`);
console.log(`- Java runtime: ${javaAvailable ? "available" : "missing"}`);
console.log(`- Explicit firebase.json emulators block: ${hasExplicitEmulatorConfig ? "present" : "missing"}`);
console.log(`- Production default project remains: ${PRODUCTION_PROJECT}`);

if (!firebaseCliAvailable || !javaAvailable || !hasExplicitEmulatorConfig) {
  console.log("Emulator startup is not fully ready. See docs/emulator-validation-baseline.md for blockers.");
}
