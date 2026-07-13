import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { firestoreServerTimestamp } from "./firestoreCompat";
import { requireAuth } from "./auth";

interface AuditPayload {
  userId?: number;
  userName?: string;
  action?: string;
  targetType?: string;
  targetId?: string | number | null;
  before?: unknown;
  after?: unknown;
}

function getDb() {
  return admin.firestore();
}

function cleanString(value: unknown, field: string, maxLength = 120): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpsError("invalid-argument", `${field} is required.`);
  }
  return value.trim().slice(0, maxLength);
}

function optionalString(value: unknown, maxLength = 120): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim().slice(0, maxLength) : null;
}

function optionalTargetId(value: unknown): string | number | null {
  return typeof value === "string" || typeof value === "number" ? value : null;
}

export function buildAuditEvent(data: AuditPayload, auth: ReturnType<typeof requireAuth>, action: string, userName: string) {
  const targetType = optionalString(data.targetType);
  const targetId = optionalTargetId(data.targetId);

  return {
    event: {
      userId: typeof data.userId === "number" ? data.userId : auth.repId ?? null,
      userName,
      action,
      targetType,
      targetId,
      before: data.before ?? null,
      after: data.after ?? null,
      authUid: auth.uid,
      authRepId: auth.repId ?? null,
      authRole: auth.role ?? null,
      authProvider: auth.signInProvider ?? null,
      source: "callable",
      timestamp: firestoreServerTimestamp(),
    },
    log: {
      action,
      targetType,
      targetId,
      authUid: auth.uid,
      authRepId: auth.repId ?? null,
      authRole: auth.role ?? null,
      source: "callable",
    },
  };
}

export const appendAuditEvent = onCall(async (request) => {
  const auth = requireAuth(request);
  const data = request.data as AuditPayload;
  const action = cleanString(data.action, "action");
  const userName = cleanString(data.userName ?? `uid:${auth.uid}`, "userName");
  const auditEvent = buildAuditEvent(data, auth, action, userName);

  await getDb().collection("auditLogs").add(auditEvent.event);

  console.info("[appendAuditEvent] Audit event appended", auditEvent.log);

  return { ok: true };
});
