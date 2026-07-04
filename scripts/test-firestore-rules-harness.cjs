const assert = require("node:assert/strict");
const fs = require("node:fs");
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require("@firebase/rules-unit-testing");
const {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
} = require("firebase/firestore");

const DEMO_PROJECT = "demo-asg-crm-emulator";
const PRODUCTION_PROJECT = "amplify-leads-2026";

function parseHost(value) {
  const [host, portText] = String(value || "").split(":");
  const port = Number(portText);
  assert.ok(host, "FIRESTORE_EMULATOR_HOST must include a host.");
  assert.ok(Number.isInteger(port), "FIRESTORE_EMULATOR_HOST must include a numeric port.");
  return { host, port };
}

function claims(role) {
  return {
    repId: `${role}-rep`,
    role,
    region: "brisbane",
    active: true,
    allowedRegions: ["brisbane"],
    firebase: {
      sign_in_provider: "password",
    },
  };
}

function userDb(testEnv, role) {
  return testEnv.authenticatedContext(`${role}-uid`, claims(role)).firestore();
}

async function main() {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "Rules harness must run inside the Firestore emulator.");
  assert.notEqual(process.env.GCLOUD_PROJECT, PRODUCTION_PROJECT, "Rules harness must not target production.");

  const { host, port } = parseHost(process.env.FIRESTORE_EMULATOR_HOST);
  const testEnv = await initializeTestEnvironment({
    projectId: DEMO_PROJECT,
    firestore: {
      host,
      port,
      rules: fs.readFileSync("firestore.rules", "utf8"),
    },
  });

  try {
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    const repDb = userDb(testEnv, "rep");
    const managerDb = userDb(testEnv, "manager");
    const adminDb = userDb(testEnv, "admin");

    await assertFails(getDoc(doc(unauthDb, "leads", "lead-1")));
    await assertFails(setDoc(doc(unauthDb, "leads", "lead-1"), { name: "Unauth Lead" }));
    await assertFails(getDoc(doc(unauthDb, "salestrailCalls", "call-1")));
    await assertFails(setDoc(doc(unauthDb, "salestrailCalls", "call-1"), { importedAt: Date.now() }));
    await assertFails(getDoc(doc(unauthDb, "appSettings", "config")));
    await assertFails(setDoc(doc(unauthDb, "settings", "general"), { enabled: true }));

    await assertSucceeds(getDoc(doc(repDb, "leads", "lead-1")));
    await assertSucceeds(setDoc(doc(repDb, "leads", "lead-1"), { name: "Rep Lead", region: "brisbane" }));
    await assertSucceeds(getDoc(doc(repDb, "settings", "general")));
    await assertSucceeds(setDoc(doc(repDb, "settings", "general"), { enabled: true }));
    await assertSucceeds(getDoc(doc(repDb, "appSettings", "config")));
    await assertFails(setDoc(doc(repDb, "appSettings", "config"), { salestrail: { enabled: true } }));
    await assertFails(getDoc(doc(repDb, "salestrailCalls", "call-1")));
    await assertFails(setDoc(doc(repDb, "salestrailCalls", "call-1"), { importedAt: Date.now() }));
    await assertFails(getDoc(doc(repDb, "auditLogs", "audit-1")));
    await assertFails(setDoc(doc(repDb, "settingsHistory", "history-1"), { changedAt: Date.now() }));

    await assertSucceeds(getDoc(doc(managerDb, "leads", "lead-1")));
    await assertSucceeds(setDoc(doc(managerDb, "leads", "lead-2"), { name: "Manager Lead", region: "brisbane" }));
    await assertFails(getDoc(doc(managerDb, "salestrailCalls", "call-1")));
    await assertFails(getDoc(doc(managerDb, "auditLogs", "audit-1")));

    await assertSucceeds(getDoc(doc(adminDb, "leads", "lead-1")));
    await assertSucceeds(setDoc(doc(adminDb, "leads", "lead-3"), { name: "Admin Lead", region: "brisbane" }));
    await assertSucceeds(getDoc(doc(adminDb, "auditLogs", "audit-1")));
    await assertSucceeds(getDoc(doc(adminDb, "settingsHistory", "history-1")));
    await assertFails(setDoc(doc(adminDb, "auditLogs", "audit-1"), { changedAt: Date.now() }));
    await assertFails(deleteDoc(doc(adminDb, "auditLogs", "audit-1")));
    await assertFails(getDoc(doc(adminDb, "salestrailCalls", "call-1")));
    await assertFails(setDoc(doc(adminDb, "salestrailCalls", "call-1"), { importedAt: Date.now() }));

    console.log("Authenticated Firestore rules harness checks passed");
  } finally {
    await testEnv.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
