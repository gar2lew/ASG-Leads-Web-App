const assert = require("node:assert/strict");
const fs = require("node:fs");
const { initializeApp: initializeAdminApp, getApps } = require("firebase-admin/app");
const { getFirestore: getAdminFirestore } = require("firebase-admin/firestore");

const DEMO_PROJECT = "demo-asg-crm-emulator";
const PRODUCTION_PROJECT = "amplify-leads-2026";

function readFirebaseJson() {
  return JSON.parse(fs.readFileSync("firebase.json", "utf8"));
}

function parseHostPort(value, fallbackPort) {
  const [host, portText] = String(value || "").replace(/^https?:\/\//, "").split(":");
  const port = Number(portText || fallbackPort);
  assert.ok(host, "Emulator host must include a host.");
  assert.ok(Number.isInteger(port), "Emulator host must include a numeric port.");
  return { host, port };
}

function functionsEmulatorHost() {
  if (process.env.FUNCTIONS_EMULATOR_HOST) {
    return parseHostPort(process.env.FUNCTIONS_EMULATOR_HOST, 5001);
  }

  const firebaseJson = readFirebaseJson();
  const port = firebaseJson.emulators?.functions?.port;
  assert.ok(Number.isInteger(port), "Functions emulator port must be configured in firebase.json.");
  return { host: "127.0.0.1", port };
}

function assertDemoOnly() {
  assert.notEqual(process.env.GCLOUD_PROJECT, PRODUCTION_PROJECT, "Callable harness must not target production.");
  assert.notEqual(process.env.GCLOUD_PROJECT, undefined, "Callable harness must run inside firebase emulators:exec.");
  assert.equal(process.env.GCLOUD_PROJECT, DEMO_PROJECT, "Callable harness must use the demo emulator project.");
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "Firestore emulator host was not provided.");
  assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST, "Auth emulator host was not provided.");
  functionsEmulatorHost();
}

async function expectCallableError(label, expectedCode, action) {
  try {
    await action();
  } catch (error) {
    assert.equal(error?.code, `functions/${expectedCode}`, `${label} should fail with ${expectedCode}.`);
    return;
  }
  throw new Error(`${label} unexpectedly succeeded.`);
}

async function refreshUntilClaim(user, key, expected) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const token = await user.getIdTokenResult(true);
    if (token.claims?.[key] === expected) return token;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const token = await user.getIdTokenResult(true);
  assert.equal(token.claims?.[key], expected, `Expected refreshed token claim ${key}.`);
  return token;
}

function assertSalestrailDryRunSourceContract() {
  const callableSource = fs.readFileSync("functions/src/salestrail.ts", "utf8");
  const syncSource = fs.readFileSync("functions/src/salestrailSync.ts", "utf8");

  assert.match(callableSource, /export const syncSalestrailCallsCallable = onCall/s);
  assert.match(callableSource, /const auth = requireAuth\(request\);/);
  assert.match(callableSource, /requireMinimumRole\(auth, "admin"\);/);
  assert.match(callableSource, /dryRun: dryRun \?\? false/);
  assert.match(syncSource, /if \(!dryRun\) \{\s*try \{\s*await acquireSyncLock/s);
  assert.match(syncSource, /if \(dryRun\) \{[\s\S]*result\.wouldImportCount = docs\.length;[\s\S]*return result;[\s\S]*\}/);
  assert.match(syncSource, /if \(!dryRun\) \{[\s\S]*const batchWriteStartedAt = Date\.now\(\);[\s\S]*await batchWriteCalls/s);
}

function assertPinSourceContract() {
  const pinSource = fs.readFileSync("functions/src/auth/verifyPin.ts", "utf8");

  assert.match(pinSource, /export const verifyPin = onCall\(async \(request\) => \{\s*const auth = requireAuth\(request\);/s);
  assert.match(pinSource, /export const setPin = onCall\(async \(request\) => \{\s*const auth = requireAuth\(request\);/s);
  assert.match(pinSource, /export const changePin = onCall\(async \(request\) => \{\s*const auth = requireAuth\(request\);/s);
  assert.match(pinSource, /export const verifyBackupPassword = onCall\(async \(request\) => \{\s*const auth = requireAuth\(request\);/s);
}

function assertSettingsAdminSourceContract() {
  const settingsSource = fs.readFileSync("functions/src/settingsAdmin.ts", "utf8");

  assert.match(
    settingsSource,
    /export const updateAppSettingsCallable = onCall\(async \(request\) => \{\s*const auth = requireAuth\(request\);\s*requireMinimumRole\(auth, "admin"\);/s,
  );
  assert.match(
    settingsSource,
    /export const rollbackAppSettingsCallable = onCall\(async \(request\) => \{\s*const auth = requireAuth\(request\);\s*requireMinimumRole\(auth, "admin"\);/s,
  );
}

async function main() {
  assertDemoOnly();
  assertPinSourceContract();
  assertSettingsAdminSourceContract();
  assertSalestrailDryRunSourceContract();

  const { initializeApp, deleteApp } = await import("firebase/app");
  const { getAuth, connectAuthEmulator, signInAnonymously } = await import("firebase/auth");
  const { getFunctions, connectFunctionsEmulator, httpsCallable } = await import("firebase/functions");

  if (getApps().length === 0) {
    initializeAdminApp({ projectId: DEMO_PROJECT });
  }
  const adminDb = getAdminFirestore();

  const runId = `callable-harness-${Date.now()}`;
  const adminRepId = 970001;
  const leadId = `${runId}-phone-lead`;

  await adminDb.collection("reps").doc(String(adminRepId)).set({
    name: "Callable Harness Admin",
    pin: "1234",
    role: "admin",
    active: true,
    primaryRegion: "brisbane",
    allowedRegions: ["brisbane"],
  });
  await adminDb.collection("leads").doc(leadId).set({
    name: "Callable Harness Lead",
    phone: "0400 123 456",
    region: "brisbane",
  });
  await adminDb.doc("appSettings/config").set({
    featureFlags: { enableVoiceMode: true },
    integrations: { salestrail: { enabled: false } },
  }, { merge: true });

  const app = initializeApp(
    { projectId: DEMO_PROJECT, apiKey: "demo-api-key", appId: "demo-app-id" },
    `asg-callable-harness-${Date.now()}`,
  );
  const auth = getAuth(app);
  const functions = getFunctions(app);
  const authHost = parseHostPort(process.env.FIREBASE_AUTH_EMULATOR_HOST, 9099);
  const functionsHost = functionsEmulatorHost();

  connectAuthEmulator(auth, `http://${authHost.host}:${authHost.port}`, { disableWarnings: true });
  connectFunctionsEmulator(functions, functionsHost.host, functionsHost.port);

  const verifyPin = httpsCallable(functions, "verifyPin");
  const backfillPhoneNormalization = httpsCallable(functions, "backfillPhoneNormalization");

  await expectCallableError("Unauthenticated phone dry-run callable", "unauthenticated", () =>
    backfillPhoneNormalization({ dryRun: true }),
  );

  const credential = await signInAnonymously(auth);
  const pinResult = await verifyPin({ repId: adminRepId, pin: "1234" });
  assert.equal(pinResult.data?.success, true, "verifyPin should accept seeded emulator PIN.");
  assert.equal(pinResult.data?.repId, adminRepId, "verifyPin should return the seeded rep ID.");

  await refreshUntilClaim(credential.user, "role", "admin");

  const auditBeforePhone = await adminDb.collection("auditLogs").get();
  const leadBefore = (await adminDb.collection("leads").doc(leadId).get()).data();
  const phoneResult = await backfillPhoneNormalization({ dryRun: true, preserveRaw: true });
  assert.equal(phoneResult.data?.success, true, "phone normalisation dry-run should report success.");
  assert.equal(phoneResult.data?.dryRun, true, "phone normalisation must remain in dry-run mode.");
  assert.ok(phoneResult.data?.updated >= 1, "phone dry-run should count the seeded lead as affected.");
  const leadAfter = (await adminDb.collection("leads").doc(leadId).get()).data();
  const auditAfterPhone = await adminDb.collection("auditLogs").get();
  assert.deepEqual(leadAfter, leadBefore, "phone dry-run must not mutate the seeded lead.");
  assert.equal(auditAfterPhone.size, auditBeforePhone.size, "phone dry-run must not write audit logs.");

  await deleteApp(app);
  console.log("Callable emulator dry-run harness checks passed");
  console.log("- PIN verify callable exercised against emulator data");
  console.log("- PIN setup/change/backup callables checked for source auth contracts");
  console.log("- Settings admin callables checked for source auth and admin role contracts");
  console.log("- Phone normalisation dry-run exercised with no lead or audit writes");
  console.log("- Salestrail dry-run source contract checked without invoking the live API path");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
