import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as bcrypt from "bcryptjs";
import { requireAuth } from "../auth";

interface PinVerificationAttempt {
  count: number;
  lastAttempt: number;
  lockedUntil: number;
}

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const BCRYPT_ROUNDS = 10;

const rateLimitMap = new Map<string, PinVerificationAttempt>();

function checkRateLimit(key: string): void {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry) {
    rateLimitMap.set(key, { count: 1, lastAttempt: now, lockedUntil: 0 });
    return;
  }

  if (entry.lockedUntil > now) {
    const remainingMins = Math.ceil((entry.lockedUntil - now) / 60000);
    throw new HttpsError(
      "resource-exhausted",
      `Too many attempts. Try again in ${remainingMins} minute${remainingMins > 1 ? "s" : ""}.`,
    );
  }

  if (now - entry.lastAttempt > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(key, { count: 1, lastAttempt: now, lockedUntil: 0 });
    return;
  }

  entry.count++;
  entry.lastAttempt = now;
  if (entry.count > MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_DURATION_MS;
    throw new HttpsError("resource-exhausted", `Too many attempts. Try again in ${LOCKOUT_DURATION_MS / 60000} minutes.`);
  }
}

function clearRateLimit(key: string): void {
  rateLimitMap.delete(key);
}

function getDb() {
  try {
    admin.app();
  } catch {
    admin.initializeApp();
  }
  return admin.firestore();
}

function asRole(value: unknown): "rep" | "manager" | "admin" | "director" {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "manager" || normalized === "admin" || normalized === "director" ? normalized : "rep";
}

function asRegions(value: unknown): Array<"brisbane" | "perth"> {
  return Array.isArray(value)
    ? value.filter((item): item is "brisbane" | "perth" => item === "brisbane" || item === "perth")
    : [];
}

async function setRepSessionClaims(uid: string, repId: number, repData: admin.firestore.DocumentData): Promise<void> {
  const role = asRole(repData.role);
  const claims: Record<string, unknown> = {
    repId,
    role,
    active: repData.active !== false,
    allowedRegions: asRegions(repData.allowedRegions),
  };

  if (repData.primaryRegion === "brisbane" || repData.primaryRegion === "perth") {
    claims.region = repData.primaryRegion;
  }
  if (role === "admin") claims.admin = true;
  if (role === "director") claims.director = true;

  await admin.auth().setCustomUserClaims(uid, claims);
  console.info("[verifyPin] Custom claims set after PIN verification", {
    authUid: uid,
    repId,
    decodedRole: role,
    admin: claims.admin === true,
    director: claims.director === true,
    region: claims.region ?? null,
    allowedRegions: claims.allowedRegions,
  });
}

async function writeAudit(event: {
  userId: number | null;
  userName: string;
  action: string;
  authUid: string;
  authRepId: number | null;
  authRole: string | null;
  authProvider: string | null;
  targetId?: number;
  success: boolean;
  detail?: string;
}): Promise<void> {
  try {
    await getDb().collection("auditLogs").add({
      userId: event.userId,
      userName: event.userName,
      action: event.action,
      targetType: "rep",
      targetId: event.targetId ?? null,
      detail: event.detail ?? null,
      success: event.success,
      authUid: event.authUid,
      authRepId: event.authRepId ?? null,
      authRole: event.authRole ?? null,
      authProvider: event.authProvider ?? null,
      source: "callable",
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch {
    console.warn("[verifyPin] Failed to write audit log");
  }
}

export const verifyPin = onCall(async (request) => {
  const auth = requireAuth(request);
  const { repId, pin } = request.data as { repId: number; pin: string };

  if (!repId || typeof repId !== "number") {
    throw new HttpsError("invalid-argument", "repId is required and must be a number.");
  }
  if (!pin || typeof pin !== "string" || !/^\d{4,6}$/.test(pin)) {
    throw new HttpsError("invalid-argument", "PIN must be 4-6 digits.");
  }

  const rateLimitKey = `pin:${repId}`;
  checkRateLimit(rateLimitKey);

  const repSnap = await getDb().collection("reps").doc(String(repId)).get();
  if (!repSnap.exists) {
    throw new HttpsError("not-found", "Rep not found.");
  }

  const repData = repSnap.data()!;
  const pinHash = repData.pinHash as string | undefined;
  const plaintextPin = repData.pin as string | undefined;

  if (!pinHash && !plaintextPin) {
    throw new HttpsError("failed-precondition", "No PIN set for this account.");
  }

  const valid = pinHash ? await bcrypt.compare(pin, pinHash) : pin === plaintextPin;

  await writeAudit({
    userId: repId,
    userName: repData.name ?? `rep:${repId}`,
    action: "pin_verify",
    authUid: auth.uid,
    authRepId: auth.repId ?? null,
    authRole: auth.role ?? null,
    authProvider: auth.signInProvider ?? null,
    targetId: repId,
    success: valid,
    detail: valid ? undefined : "Incorrect PIN",
  });

  if (!valid) {
    throw new HttpsError("unauthenticated", "Incorrect PIN.");
  }

  await setRepSessionClaims(auth.uid, repId, repData);
  clearRateLimit(rateLimitKey);
  return { success: true, repId };
});

export const setPin = onCall(async (request) => {
  const auth = requireAuth(request);
  const { repId, pin, backupPassword } = request.data as { repId: number; pin: string; backupPassword?: string };

  if (!repId || typeof repId !== "number") {
    throw new HttpsError("invalid-argument", "repId is required and must be a number.");
  }
  if (!pin || typeof pin !== "string" || !/^\d{4,6}$/.test(pin)) {
    throw new HttpsError("invalid-argument", "PIN must be 4-6 digits.");
  }
  if (backupPassword !== undefined && typeof backupPassword !== "string") {
    throw new HttpsError("invalid-argument", "Backup password must be a string.");
  }
  if (backupPassword !== undefined && backupPassword.length < 6) {
    throw new HttpsError("invalid-argument", "Backup password must be at least 6 characters.");
  }

  const db = getDb();
  const repRef = db.collection("reps").doc(String(repId));
  const repSnap = await repRef.get();

  if (!repSnap.exists) {
    throw new HttpsError("not-found", "Rep not found.");
  }

  const repData = repSnap.data()!;
  const existingPinHash = repData.pinHash as string | undefined;

  if (existingPinHash) {
    if (!backupPassword) {
      throw new HttpsError(
        "failed-precondition",
        "PIN already set. Use changePin to update or provide backupPassword for recovery.",
      );
    }

    const backupHash = repData.backupPasswordHash as string | undefined;
    if (!backupHash) {
      throw new HttpsError("failed-precondition", "No backup password set for this account.");
    }

    const backupValid = await bcrypt.compare(backupPassword, backupHash);
    if (!backupValid) {
      throw new HttpsError("unauthenticated", "Incorrect backup password.");
    }
  }

  const pinHash = await bcrypt.hash(pin, BCRYPT_ROUNDS);
  const update: Record<string, unknown> = {
    pinHash,
    isSetup: true,
    pinUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    pinUpdatedBy: auth.uid,
  };

  if (backupPassword) {
    update.backupPasswordHash = await bcrypt.hash(backupPassword, BCRYPT_ROUNDS);
  }

  await repRef.update(update);
  await setRepSessionClaims(auth.uid, repId, repData);

  await writeAudit({
    userId: repId,
    userName: repData.name ?? `rep:${repId}`,
    action: "pin_set",
    authUid: auth.uid,
    authRepId: auth.repId ?? null,
    authRole: auth.role ?? null,
    authProvider: auth.signInProvider ?? null,
    targetId: repId,
    success: true,
    detail: backupPassword ? "PIN and backup password set" : "PIN set (no backup)",
  });

  return { success: true, repId };
});

export const changePin = onCall(async (request) => {
  const auth = requireAuth(request);
  const { repId, currentPin, newPin } = request.data as { repId: number; currentPin: string; newPin: string };

  if (!repId || typeof repId !== "number") {
    throw new HttpsError("invalid-argument", "repId is required and must be a number.");
  }
  if (!currentPin || typeof currentPin !== "string") {
    throw new HttpsError("invalid-argument", "Current PIN is required.");
  }
  if (!newPin || typeof newPin !== "string" || !/^\d{4,6}$/.test(newPin)) {
    throw new HttpsError("invalid-argument", "New PIN must be 4-6 digits.");
  }

  const rateLimitKey = `pinchange:${repId}`;
  checkRateLimit(rateLimitKey);

  const db = getDb();
  const repSnap = await db.collection("reps").doc(String(repId)).get();
  if (!repSnap.exists) {
    throw new HttpsError("not-found", "Rep not found.");
  }

  const repData = repSnap.data()!;
  const pinHash = repData.pinHash as string | undefined;
  if (!pinHash) {
    throw new HttpsError("failed-precondition", "No PIN set for this account.");
  }

  const valid = await bcrypt.compare(currentPin, pinHash);

  await writeAudit({
    userId: repId,
    userName: repData.name ?? `rep:${repId}`,
    action: "pin_change",
    authUid: auth.uid,
    authRepId: auth.repId ?? null,
    authRole: auth.role ?? null,
    authProvider: auth.signInProvider ?? null,
    targetId: repId,
    success: valid,
    detail: valid ? "PIN changed successfully" : "Current PIN incorrect",
  });

  if (!valid) {
    throw new HttpsError("unauthenticated", "Current PIN is incorrect.");
  }

  await db.collection("reps").doc(String(repId)).update({
    pinHash: await bcrypt.hash(newPin, BCRYPT_ROUNDS),
    pinUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    pinUpdatedBy: auth.uid,
  });

  clearRateLimit(rateLimitKey);
  return { success: true, repId };
});

export const verifyBackupPassword = onCall(async (request) => {
  const auth = requireAuth(request);
  const { repId, backupPassword } = request.data as { repId: number; backupPassword: string };

  if (!repId || typeof repId !== "number") {
    throw new HttpsError("invalid-argument", "repId is required and must be a number.");
  }
  if (!backupPassword || typeof backupPassword !== "string" || backupPassword.length < 6) {
    throw new HttpsError("invalid-argument", "Backup password must be at least 6 characters.");
  }

  const rateLimitKey = `backup:${repId}`;
  checkRateLimit(rateLimitKey);

  const repSnap = await getDb().collection("reps").doc(String(repId)).get();
  if (!repSnap.exists) {
    throw new HttpsError("not-found", "Rep not found.");
  }

  const repData = repSnap.data()!;
  const backupPasswordHash = repData.backupPasswordHash as string | undefined;
  if (!backupPasswordHash) {
    throw new HttpsError("failed-precondition", "No backup password set for this account.");
  }

  const valid = await bcrypt.compare(backupPassword, backupPasswordHash);

  await writeAudit({
    userId: repId,
    userName: repData.name ?? `rep:${repId}`,
    action: "backup_verify",
    authUid: auth.uid,
    authRepId: auth.repId ?? null,
    authRole: auth.role ?? null,
    authProvider: auth.signInProvider ?? null,
    targetId: repId,
    success: valid,
    detail: valid ? "Backup password verified" : "Incorrect backup password",
  });

  if (!valid) {
    throw new HttpsError("unauthenticated", "Incorrect backup password.");
  }

  clearRateLimit(rateLimitKey);
  return { success: true, repId };
});
