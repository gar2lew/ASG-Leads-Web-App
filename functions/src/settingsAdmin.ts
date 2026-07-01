import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { requireAuth, requireMinimumRole, type ServerAuthContext } from "./auth";

type SettingsAction = "update" | "rollback";

interface SettingsMutationPayload {
  updates?: unknown;
  previousSettings?: unknown;
  userName?: unknown;
  historyId?: unknown;
}

interface HistoryEntryOptions {
  previousSettings: unknown;
  newSettings: unknown;
  action: SettingsAction;
  actorName: string;
  auth: ServerAuthContext;
  serverTimestamp: unknown;
  rolledBackFrom?: string | null;
}

interface AuditEntryOptions {
  action: string;
  targetId: string;
  before: unknown;
  after: unknown;
  actorName: string;
  auth: ServerAuthContext;
  serverTimestamp: unknown;
}

const CONFIG_DOC_PATH = "appSettings/config";
const SETTINGS_SECTIONS = new Set(["dealSettings", "trainingSettings", "aiSettings", "featureFlags", "integrations"]);
const SECTION_FIELDS: Record<string, Set<string>> = {
  dealSettings: new Set(["stuckDaysThreshold", "atRiskDaysThreshold"]),
  trainingSettings: new Set(["weeklyTargetSessions", "minimumScoreTarget"]),
  aiSettings: new Set([
    "thinkingDelayMin",
    "thinkingDelayMax",
    "silenceTimeoutMin",
    "silenceTimeoutMax",
    "interruptionEnabled",
  ]),
  featureFlags: new Set([
    "enableVoiceMode",
    "enableReplay",
    "disableTraining",
    "disableVoice",
    "readOnlyMode",
  ]),
  integrations: new Set(["salestrail"]),
};

function getDb() {
  return admin.firestore();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanActorName(value: unknown, auth: ServerAuthContext): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim().slice(0, 120);
  }
  return auth.repId ? `Rep ${auth.repId}` : `uid:${auth.uid}`;
}

function optionalHistoryId(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim().slice(0, 120) : null;
}

export function validateSettingsPayload(value: unknown): Record<string, unknown> {
  if (!isPlainObject(value) || Object.keys(value).length === 0) {
    throw new HttpsError("invalid-argument", "Settings payload must be a non-empty object.");
  }

  for (const [section, sectionValue] of Object.entries(value)) {
    if (!SETTINGS_SECTIONS.has(section)) {
      throw new HttpsError("invalid-argument", `Unsupported settings section: ${section}.`);
    }
    if (!isPlainObject(sectionValue)) {
      throw new HttpsError("invalid-argument", `Settings section ${section} must be an object.`);
    }
    const allowedFields = SECTION_FIELDS[section];
    for (const field of Object.keys(sectionValue)) {
      if (!allowedFields.has(field)) {
        throw new HttpsError("invalid-argument", `Unsupported settings field: ${section}.${field}.`);
      }
    }
  }

  return value;
}

export function buildSettingsHistoryEntry(opts: HistoryEntryOptions): Record<string, unknown> {
  return {
    previousSettings: opts.previousSettings,
    newSettings: opts.newSettings,
    changedBy: opts.auth.repId ?? null,
    changedByName: opts.actorName,
    action: opts.action,
    timestamp: opts.serverTimestamp,
    authUid: opts.auth.uid,
    authRepId: opts.auth.repId ?? null,
    authRole: opts.auth.role ?? null,
    authProvider: opts.auth.signInProvider ?? null,
    rolledBackFrom: opts.rolledBackFrom ?? null,
    source: "callable",
  };
}

export function buildSettingsAuditEntry(opts: AuditEntryOptions): Record<string, unknown> {
  return {
    userId: opts.auth.repId ?? null,
    userName: opts.actorName,
    action: opts.action,
    targetType: "appSettings",
    targetId: opts.targetId,
    before: opts.before,
    after: opts.after,
    authUid: opts.auth.uid,
    authRepId: opts.auth.repId ?? null,
    authRole: opts.auth.role ?? null,
    authProvider: opts.auth.signInProvider ?? null,
    source: "callable",
    timestamp: opts.serverTimestamp,
  };
}

async function writeSettingsAudit(opts: AuditEntryOptions): Promise<void> {
  await getDb().collection("auditLogs").add(buildSettingsAuditEntry(opts));
}

export const updateAppSettingsCallable = onCall(async (request) => {
  const auth = requireAuth(request);
  requireMinimumRole(auth, "admin");

  const data = request.data as SettingsMutationPayload;
  const updates = validateSettingsPayload(data.updates);
  const actorName = cleanActorName(data.userName, auth);
  const db = getDb();
  const configRef = db.doc(CONFIG_DOC_PATH);
  const serverTimestamp = admin.firestore.FieldValue.serverTimestamp();
  let previousSettings: unknown = null;

  await db.runTransaction(async (tx) => {
    const previousSnap = await tx.get(configRef);
    previousSettings = previousSnap.exists ? previousSnap.data() ?? null : null;
    tx.set(configRef, updates, { merge: true });
    tx.create(
      db.collection("settingsHistory").doc(),
      buildSettingsHistoryEntry({
        previousSettings,
        newSettings: updates,
        action: "update",
        actorName,
        auth,
        serverTimestamp,
      }),
    );
  });

  await writeSettingsAudit({
    action: "settings_update",
    targetId: "config",
    before: previousSettings,
    after: updates,
    actorName,
    auth,
    serverTimestamp: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.info("[updateAppSettingsCallable] Settings update applied", {
    authUid: auth.uid,
    authRepId: auth.repId ?? null,
    authRole: auth.role ?? null,
    actorName,
    sections: Object.keys(updates),
    source: "callable",
  });

  return { ok: true };
});

export const rollbackAppSettingsCallable = onCall(async (request) => {
  const auth = requireAuth(request);
  requireMinimumRole(auth, "admin");

  const data = request.data as SettingsMutationPayload;
  const rollbackTarget = validateSettingsPayload(data.previousSettings);
  const actorName = cleanActorName(data.userName, auth);
  const historyId = optionalHistoryId(data.historyId);
  const db = getDb();
  const configRef = db.doc(CONFIG_DOC_PATH);
  const serverTimestamp = admin.firestore.FieldValue.serverTimestamp();
  let currentSettings: unknown = null;

  await db.runTransaction(async (tx) => {
    const currentSnap = await tx.get(configRef);
    currentSettings = currentSnap.exists ? currentSnap.data() ?? null : null;
    tx.set(configRef, rollbackTarget);
    tx.create(
      db.collection("settingsHistory").doc(),
      buildSettingsHistoryEntry({
        previousSettings: currentSettings,
        newSettings: rollbackTarget,
        action: "rollback",
        actorName,
        auth,
        serverTimestamp,
        rolledBackFrom: historyId,
      }),
    );
  });

  await writeSettingsAudit({
    action: "settings_rollback",
    targetId: historyId ?? "config",
    before: currentSettings,
    after: rollbackTarget,
    actorName,
    auth,
    serverTimestamp: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.info("[rollbackAppSettingsCallable] Settings rollback applied", {
    authUid: auth.uid,
    authRepId: auth.repId ?? null,
    authRole: auth.role ?? null,
    actorName,
    historyId,
    sections: Object.keys(rollbackTarget),
    source: "callable",
  });

  return { ok: true };
});
