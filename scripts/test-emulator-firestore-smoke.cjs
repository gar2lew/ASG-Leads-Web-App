const assert = require("node:assert/strict");

const DEMO_PROJECT = "demo-asg-crm-emulator";

function parseHost(value) {
  const [host, portText] = String(value || "").split(":");
  const port = Number(portText);
  assert.ok(host, "FIRESTORE_EMULATOR_HOST must include a host.");
  assert.ok(Number.isInteger(port), "FIRESTORE_EMULATOR_HOST must include a numeric port.");
  return { host, port };
}

async function expectPermissionDenied(label, action) {
  try {
    await action();
  } catch (error) {
    if (error?.code === "permission-denied") return;
    throw error;
  }
  throw new Error(`${label} unexpectedly succeeded.`);
}

async function main() {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "Firestore emulator host was not provided.");
  assert.notEqual(process.env.GCLOUD_PROJECT, "amplify-leads-2026", "Smoke test must not target production.");

  const { initializeApp, deleteApp } = await import("firebase/app");
  const { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc } = await import("firebase/firestore");

  const { host, port } = parseHost(process.env.FIRESTORE_EMULATOR_HOST);
  const app = initializeApp({ projectId: DEMO_PROJECT }, `asg-emulator-smoke-${Date.now()}`);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, host, port);

  await expectPermissionDenied("Unauthenticated salestrailCalls read", () => getDoc(doc(db, "salestrailCalls", "smoke")));
  await expectPermissionDenied("Unauthenticated salestrailCalls write", () =>
    setDoc(doc(db, "salestrailCalls", "smoke"), { createdAt: Date.now() }),
  );
  await expectPermissionDenied("Unauthenticated leads read", () => getDoc(doc(db, "leads", "smoke")));

  await deleteApp(app);
  console.log("Firestore emulator smoke checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
