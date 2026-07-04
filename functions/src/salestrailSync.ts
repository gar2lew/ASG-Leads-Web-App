/**
 * salestrailSync.ts — Salestrail call sync engine
 *
 * Callable-agnostic: can be invoked from onCall (manual Sync Now) or
 * onSchedule (future automated sync) without code duplication.
 *
 * Epic 1 scope:
 *   - Basic Auth via Firebase Secrets (SALESTRAIL_API_USERNAME, SALESTRAIL_API_PASSWORD)
 *   - GET /export/calls/byCreated/json?from=&to=
 *   - Incremental sync (default: last 24 hours)
 *   - Firestore sync lock via transaction
 *   - Idempotent imports (Salestrail callId as Firestore doc ID)
 *   - Batched writes (500 ops/batch) with CRM-field merge
 *   - Lead phone matching + assignedRepId matching
 *   - Internal call detection (both sides match reps)
 *   - Sanitised rawPayload storage
 *   - Audit logging
 */

import * as admin from "firebase-admin";
import { defineSecret } from "firebase-functions/params";

// ---------------------------------------------------------------------------
// Secrets
// ---------------------------------------------------------------------------

export const salestrailUsername = defineSecret("SALESTRAIL_API_USERNAME");
export const salestrailPassword = defineSecret("SALESTRAIL_API_PASSWORD");

// ---------------------------------------------------------------------------
// Lazy Firestore
// ---------------------------------------------------------------------------

function getDb() {
  if (!admin.apps || admin.apps.length === 0) {
    admin.initializeApp();
  }
  return admin.firestore();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SalestrailRawCall {
  answered?: boolean;
  callId?: string;
  createdAt?: string;
  duration?: number;
  formattedNumber?: string;
  inbound?: boolean;
  integrated?: boolean;
  number?: string;
  phonebookName?: string;
  recType?: string;
  recurId?: string;
  source?: string;
  sourceDetail?: string;
  startTime?: string;
  userEmail?: string;
  userId?: string | number;
  userName?: string;
  userPhone?: string;
  userTeams?: string[];
  [key: string]: unknown;
}

export interface SalestrailCallDoc {
  salestrailCallId: string;
  callerNumber: string;
  callerNumberNormalized: string;
  calleeNumber: string;
  calleeNumberNormalized: string;
  callerName: string | null;
  userEmail: string;
  userName: string;
  direction: "inbound" | "outbound" | "internal" | null;
  callType: string | null;
  durationSeconds: number | null;
  sourceCreatedAt: admin.firestore.Timestamp;
  sourceUpdatedAt: admin.firestore.Timestamp | null;
  recordingAvailable: boolean;
  recordingReference: string | null;
  matchedLeadId: string | null;
  matchedPhoneNumber: string | null;
  matchedOn: "caller" | "callee" | null;
  matchConfidence: "exact" | "partial" | "none";
  assignedRepId: number | null;
  region: "brisbane" | "perth" | null;
  importBatchId: string;
  importStatus: "new" | "matched" | "unmatched" | "error";
  importedAt: admin.firestore.Timestamp;
  rawPayload: Record<string, unknown>;
  createdAt: admin.firestore.FieldValue;
  updatedAt: admin.firestore.FieldValue;
}

export interface SyncResult {
  success: boolean;
  dryRun: boolean;
  fullSync: boolean;
  fetchedCount: number;
  wouldImportCount: number;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  errors: string[];
  batchId: string;
}

interface SalestrailConfigData {
  enabled: boolean;
  lastSyncAt: number | null;
  lastSyncStatus: "success" | "error" | "in_progress" | null;
  lastSyncError: string | null;
  lastSyncCallCount: number | null;
  syncInProgress: boolean;
  syncStartedAt: number | null;
  syncBatchId: string | null;
}

const DEFAULT_CONFIG: SalestrailConfigData = {
  enabled: false,
  lastSyncAt: null,
  lastSyncStatus: null,
  lastSyncError: null,
  lastSyncCallCount: null,
  syncInProgress: false,
  syncStartedAt: null,
  syncBatchId: null,
};

// ---------------------------------------------------------------------------
// Phone normalisation (copy of src/lib/utils.ts:normalizeAUPhone for server)
// ---------------------------------------------------------------------------

const PHONE_REGEX = /\D/g;

function normalizeAUPhone(raw: string): string {
  if (!raw) return raw;
  const digits = String(raw).replace(PHONE_REGEX, "");
  if (digits.length === 9 && digits.startsWith("4")) return `0${digits}`;
  if (digits.length === 11 && digits.startsWith("614")) return `0${digits.slice(2)}`;
  if (digits.length === 12 && digits.startsWith("6104")) return `0${digits.slice(3)}`;
  if (digits.length === 10) return digits;
  return String(raw).trim();
}

// ---------------------------------------------------------------------------
// Payload sanitisation
// ---------------------------------------------------------------------------

const SENSITIVE_KEYS = new Set([
  "apikey", "api_key", "token", "auth", "authorization",
  "password", "secret", "key", "credential", "bearer",
]);

const MAX_PAYLOAD_BYTES = 500_000;

function sanitizePayload(raw: Record<string, unknown>): Record<string, unknown> {
  const cleaned = stripSensitive(raw) as Record<string, unknown>;
  const json = JSON.stringify(cleaned);
  if (Buffer.byteLength(json, "utf8") <= MAX_PAYLOAD_BYTES) return cleaned;
  return { _truncated: true, _reason: "payload exceeded 500 KB", _originalKeys: Object.keys(cleaned) } as unknown as Record<string, unknown>;
}

function stripSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSensitive);
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase())) continue;
      result[k] = stripSensitive(v);
    }
    return result;
  }
  return value;
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

const BASE_URL = "https://standalone-api.salestrail.io";

async function fetchSalestrailCalls(
  username: string,
  password: string,
  fromISO: string,
  toISO: string,
): Promise<SalestrailRawCall[]> {
  const auth = Buffer.from(`${username}:${password}`).toString("base64");
  const safeUrl = `${BASE_URL}/export/calls/byCreated/json?from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`;
  const url = safeUrl; // identical — no credentials in query string

  console.log("[salestrail] request URL (no credentials):", safeUrl);
  console.log("[salestrail] date range:", { from: fromISO, to: toISO });

  const response = await fetch(url, {
    headers: { Authorization: `Basic ${auth}` },
  });

  console.log("[salestrail] HTTP status:", response.status, response.statusText);
  console.log("[salestrail] Content-Type:", response.headers.get("content-type") ?? "none");

  const responseText = await response.text();

  if (!response.ok) {
    console.error("[salestrail] response body:", responseText.slice(0, 500));
    throw new Error(`Salestrail API returned ${response.status}: ${responseText.slice(0, 200)}`);
  }

  if (!responseText || responseText.trim().length === 0) {
    console.error("[salestrail] response body is empty (0 bytes)");
    throw new Error("Salestrail API returned empty response body");
  }

  let data: unknown;
  try {
    data = JSON.parse(responseText);
  } catch {
    console.error("[salestrail] response body (first 300 chars):", responseText.slice(0, 300));
    throw new Error(`Salestrail API returned non-JSON response: ${responseText.slice(0, 100)}`);
  }

  if (!Array.isArray(data)) {
    console.error("[salestrail] response type:", typeof data, "— expected array");
    console.error("[salestrail] response keys:", typeof data === "object" && data !== null ? Object.keys(data as Record<string, unknown>) : "N/A");
    throw new Error(`Salestrail API returned non-array response: ${typeof data}`);
  }

  const calls = data as SalestrailRawCall[];
  console.log(`[salestrail] received ${calls.length} calls`);

  if (calls.length > 0) {
    const first = calls[0];
    const mask = (s: unknown) => typeof s === "string" && s.length > 4
      ? s.slice(0, 2) + "****" + s.slice(-2)
      : String(s ?? "null");
    console.log("[salestrail] first call sample:", {
      callId: first.callId,
      answered: first.answered,
      inbound: first.inbound,
      startTime: first.startTime,
      createdAt: first.createdAt,
      duration: first.duration,
      number: mask(first.number),
      userPhone: mask(first.userPhone),
      userEmail: first.userEmail ? `${first.userEmail.split("@")[0]}@***` : "null",
      userName: first.userName,
      recType: first.recType,
    });
  } else {
    console.warn("[salestrail] returned 0 calls for the requested date range");
    console.warn("[salestrail] hint: check if Salestrail has calls in this window, or try a wider range");
  }

  return calls;
}

// ---------------------------------------------------------------------------
// Transform
// ---------------------------------------------------------------------------

function resolveSourceTimestamp(raw: SalestrailRawCall): Date {
  const iso = raw.startTime ?? raw.createdAt;
  if (iso) {
    const d = new Date(iso);
    if (!isNaN(d.getTime())) {
      const now = Date.now();
      return d.getTime() > now ? new Date(now) : d;
    }
  }
  return new Date();
}

function deriveCallType(raw: SalestrailRawCall): string | null {
  if (raw.answered === false) return "missed";
  if (raw.recType) return raw.recType;
  if (raw.answered === true && (raw.duration ?? 0) === 0) return "no-answer";
  if (raw.answered === true) return "answered";
  return null;
}

function deriveDirection(raw: SalestrailRawCall): "inbound" | "outbound" | null {
  if (raw.inbound === true) return "inbound";
  if (raw.inbound === false) return "outbound";
  return null;
}

function transformCall(
  raw: SalestrailRawCall,
  batchId: string,
): SalestrailCallDoc {
  const callId = String(raw.callId ?? "");
  const dir = deriveDirection(raw);
  const userPhone = raw.userPhone ?? "";
  const externalNumber = raw.number ?? "";

  let callerNumber: string;
  let calleeNumber: string;

  if (dir === "inbound") {
    callerNumber = externalNumber;
    calleeNumber = userPhone;
  } else {
    callerNumber = userPhone;
    calleeNumber = externalNumber;
  }

  const callerNumberNormalized = normalizeAUPhone(callerNumber);
  const calleeNumberNormalized = normalizeAUPhone(calleeNumber);

  return {
    salestrailCallId: callId,
    callerNumber,
    callerNumberNormalized,
    calleeNumber,
    calleeNumberNormalized,
    callerName: raw.phonebookName ?? null,
    userEmail: raw.userEmail ?? "",
    userName: raw.userName ?? "Unknown",
    direction: dir,
    callType: deriveCallType(raw),
    durationSeconds: typeof raw.duration === "number" ? raw.duration : null,
    sourceCreatedAt: admin.firestore.Timestamp.fromDate(resolveSourceTimestamp(raw)),
    sourceUpdatedAt: null,
    recordingAvailable: false,
    recordingReference: callId || null,
    matchedLeadId: null,
    matchedPhoneNumber: null,
    matchedOn: null,
    matchConfidence: "none",
    assignedRepId: null,
    region: null,
    importBatchId: batchId,
    importStatus: "new",
    importedAt: admin.firestore.Timestamp.now(),
    rawPayload: sanitizePayload(raw),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

interface PhoneMatchResult {
  matchedLeadId: string | null;
  matchedPhoneNumber: string | null;
  matchedOn: "caller" | "callee" | null;
  matchConfidence: "exact" | "partial" | "none";
  leadRegion: string | null;
}

async function matchCallToLeads(
  doc: SalestrailCallDoc,
  leadsByPhone: Map<string, { id: string; region?: string }[]>,
  repsByPhone: Map<string, unknown[]>,
): Promise<PhoneMatchResult> {
  const callerNorm = doc.callerNumberNormalized;
  const calleeNorm = doc.calleeNumberNormalized;
  const callerLeads = leadsByPhone.get(callerNorm) ?? [];
  const calleeLeads = leadsByPhone.get(calleeNorm) ?? [];
  const callerIsRep = repsByPhone.has(callerNorm);
  const calleeIsRep = repsByPhone.has(calleeNorm);

  // Internal call: both sides are reps
  if (callerIsRep && calleeIsRep) {
    return { matchedLeadId: null, matchedPhoneNumber: null, matchedOn: null, matchConfidence: "none", leadRegion: null };
  }

  // Prefer callee match (outbound call to a lead)
  if (calleeLeads.length > 0) {
    const lead = calleeLeads[0];
    return {
      matchedLeadId: lead.id,
      matchedPhoneNumber: doc.calleeNumber,
      matchedOn: "callee",
      matchConfidence: "exact",
      leadRegion: lead.region ?? null,
    };
  }

  // Fallback: caller match (inbound call from a lead)
  if (callerLeads.length > 0) {
    const lead = callerLeads[0];
    return {
      matchedLeadId: lead.id,
      matchedPhoneNumber: doc.callerNumber,
      matchedOn: "caller",
      matchConfidence: "exact",
      leadRegion: lead.region ?? null,
    };
  }

  // Partial: either side matches with 9- or 11-digit variation?
  // For v1, only exact matches. Partial matching can be added later.
  return { matchedLeadId: null, matchedPhoneNumber: null, matchedOn: null, matchConfidence: "none", leadRegion: null };
}

async function lookupLeadsByPhone(
  db: FirebaseFirestore.Firestore,
  phones: string[],
): Promise<Map<string, { id: string; region?: string }[]>> {
  const map = new Map<string, { id: string; region?: string }[]>();
  if (phones.length === 0) return map;

  // Chunk into groups of 10 (Firestore "in" limit)
  for (let i = 0; i < phones.length; i += 10) {
    const chunk = phones.slice(i, i + 10);
    const snap = await db.collection("leads").where("phone", "in", chunk).get();
    for (const leadDoc of snap.docs) {
      const data = leadDoc.data();
      const phone = data.phone as string | undefined;
      if (!phone) continue;
      const entry = { id: leadDoc.id, region: data.region as string | undefined };
      const existing = map.get(phone) ?? [];
      existing.push(entry);
      map.set(phone, existing);
    }
  }
  return map;
}

async function lookupRepsByPhone(
  db: FirebaseFirestore.Firestore,
  phones: string[],
): Promise<Map<string, unknown[]>> {
  const map = new Map<string, unknown[]>();
  if (phones.length === 0) return map;

  for (let i = 0; i < phones.length; i += 10) {
    const chunk = phones.slice(i, i + 10);
    const snap = await db.collection("reps").where("phone", "in", chunk).get();
    for (const repDoc of snap.docs) {
      const data = repDoc.data();
      const phone = data.phone as string | undefined;
      if (!phone) continue;
      const existing = map.get(phone) ?? [];
      existing.push(data);
      map.set(phone, existing);
    }
  }
  return map;
}

async function lookupRepsByEmail(
  db: FirebaseFirestore.Firestore,
  emails: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (emails.length === 0) return map;

  for (let i = 0; i < emails.length; i += 10) {
    const chunk = emails.slice(i, i + 10);
    const snap = await db.collection("reps").where("email", "in", chunk).get();
    for (const repDoc of snap.docs) {
      const data = repDoc.data();
      const email = data.email as string | undefined;
      const id = data.id;
      if (!email || typeof id !== "number") continue;
      map.set(email, id);
    }
  }

  return map;
}

// ---------------------------------------------------------------------------
// Batch write
// ---------------------------------------------------------------------------

async function batchWriteCalls(
  db: FirebaseFirestore.Firestore,
  docs: SalestrailCallDoc[],
): Promise<{ imported: number; updated: number; skipped: number; errors: number }> {
  let imported = 0;
  let updated = 0;
  const skipped = 0;
  let errors = 0;

  for (let i = 0; i < docs.length; i += 500) {
    const chunk = docs.slice(i, i + 500);
    const callIds = chunk.map((d) => d.salestrailCallId);

    // Read existing docs for merge
    const existingDocs = new Map<string, FirebaseFirestore.DocumentData>();
    if (callIds.length > 0) {
      const refs = callIds.map((id) => db.collection("salestrailCalls").doc(id));
      const snap = await db.getAll(...refs);
      for (const docSnap of snap) {
        if (docSnap.exists) {
          existingDocs.set(docSnap.id, docSnap.data() ?? {});
        }
      }
    }

    const batch = db.batch();
    let chunkImported = 0;
    let chunkUpdated = 0;

    for (const doc of chunk) {
      const ref = db.collection("salestrailCalls").doc(doc.salestrailCallId);
      const existing = existingDocs.get(doc.salestrailCallId);

      if (existing) {
        // Merge: preserve CRM fields, overwrite API-source fields
        const merged: Record<string, unknown> = { ...doc };
        const crmFields = [
          "matchedLeadId", "matchedPhoneNumber", "matchedOn",
          "matchConfidence", "assignedRepId", "region",
        ] as const;
        for (const field of crmFields) {
          const existingVal = existing[field];
          if (existingVal !== null && existingVal !== undefined) {
            // Only preserve non-null CRM matches; don't overwrite with null
            const newVal = (doc as unknown as Record<string, unknown>)[field];
            if (newVal === null || newVal === undefined) {
              merged[field] = existingVal;
            }
          }
        }
        // Upgrade match confidence, never downgrade
        const existingConf = existing.matchConfidence as string | undefined;
        const newConf = merged.matchConfidence as string;
        const rank: Record<string, number> = { none: 0, partial: 1, exact: 2 };
        if ((rank[existingConf ?? "none"] ?? 0) > (rank[newConf] ?? 0)) {
          merged.matchConfidence = existingConf ?? "none";
        }

        batch.set(ref, merged, { merge: true });
        chunkUpdated++;
      } else {
        batch.set(ref, doc);
        chunkImported++;
      }
    }

    try {
      await batch.commit();
      imported += chunkImported;
      updated += chunkUpdated;
    } catch (err) {
      errors += chunk.length;
      console.error(`[salestrail] batch commit failed for chunk starting at index ${i}:`, err);
    }
  }

  return { imported, updated, skipped, errors };
}

// ---------------------------------------------------------------------------
// Sync lock
// ---------------------------------------------------------------------------

async function acquireSyncLock(db: FirebaseFirestore.Firestore, batchId: string): Promise<void> {
  const configRef = db.doc("appSettings/config");
  const STALE_TIMEOUT_MS = 15 * 60 * 1000;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(configRef);
    const data = snap.data() ?? {};
    const integrations = (data.integrations as Record<string, unknown> | undefined) ?? {};
    const salestrail = (integrations.salestrail as Record<string, unknown> | undefined) ?? {};

    if (salestrail.syncInProgress === true) {
      const startedAt = (salestrail.syncStartedAt as number) ?? 0;
      if (Date.now() - startedAt < STALE_TIMEOUT_MS) {
        throw new Error("Sync already in progress");
      }
      console.log("[salestrail] overriding stale sync lock");
    }

    tx.set(configRef, {
      integrations: {
        ...integrations as Record<string, unknown>,
        salestrail: {
          ...salestrail,
          syncInProgress: true,
          syncStartedAt: Date.now(),
          syncBatchId: batchId,
          lastSyncStatus: "in_progress",
        },
      },
    }, { merge: true });
  });
}

async function releaseSyncLock(
  db: FirebaseFirestore.Firestore,
  status: "success" | "error",
  errorMsg: string | null,
  lastSyncAt: number,
  callCount: number,
): Promise<void> {
  const configRef = db.doc("appSettings/config");
  const snap = await configRef.get();
  const data = snap.data() ?? {};
  const integrations = (data.integrations as Record<string, unknown> | undefined) ?? {};
  const salestrail = (integrations.salestrail as Record<string, unknown> | undefined) ?? {};

  await configRef.set({
    integrations: {
      ...integrations as Record<string, unknown>,
      salestrail: {
        ...salestrail,
        syncInProgress: false,
        lastSyncStatus: status,
        lastSyncError: errorMsg,
        lastSyncAt,
        lastSyncCallCount: callCount,
      },
    },
  }, { merge: true });
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

async function writeAuditLog(
  db: FirebaseFirestore.Firestore,
  result: SyncResult,
  repId: number | undefined,
  repName: string,
): Promise<void> {
  await db.collection("auditLogs").add({
    userId: repId ?? null,
    userName: repName,
    action: "salestrail.sync",
    targetType: "salestrailCalls",
    summary: {
      fetchedCount: result.fetchedCount,
      wouldImportCount: result.wouldImportCount,
      importedCount: result.importedCount,
      updatedCount: result.updatedCount,
      skippedCount: result.skippedCount,
      errorCount: result.errorCount,
      batchId: result.batchId,
      fullSync: result.fullSync,
      dryRun: result.dryRun,
    },
    authUid: `salestrail-sync-${result.batchId}`,
    authRole: "system",
    source: "salestrail.sync",
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

async function readConfig(db: FirebaseFirestore.Firestore): Promise<SalestrailConfigData> {
  const snap = await db.doc("appSettings/config").get();
  const data = snap.data() ?? {};
  const integrations = (data.integrations as Record<string, unknown> | undefined) ?? {};
  const raw = (integrations.salestrail as Record<string, unknown> | undefined) ?? {};
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : DEFAULT_CONFIG.enabled,
    lastSyncAt: typeof raw.lastSyncAt === "number" ? raw.lastSyncAt : DEFAULT_CONFIG.lastSyncAt,
    lastSyncStatus: typeof raw.lastSyncStatus === "string" ? raw.lastSyncStatus as SalestrailConfigData["lastSyncStatus"] : DEFAULT_CONFIG.lastSyncStatus,
    lastSyncError: typeof raw.lastSyncError === "string" ? raw.lastSyncError : DEFAULT_CONFIG.lastSyncError,
    lastSyncCallCount: typeof raw.lastSyncCallCount === "number" ? raw.lastSyncCallCount : DEFAULT_CONFIG.lastSyncCallCount,
    syncInProgress: typeof raw.syncInProgress === "boolean" ? raw.syncInProgress : DEFAULT_CONFIG.syncInProgress,
    syncStartedAt: typeof raw.syncStartedAt === "number" ? raw.syncStartedAt : DEFAULT_CONFIG.syncStartedAt,
    syncBatchId: typeof raw.syncBatchId === "string" ? raw.syncBatchId : DEFAULT_CONFIG.syncBatchId,
  };
}

// ---------------------------------------------------------------------------
// Main sync engine (callable-agnostic)
// ---------------------------------------------------------------------------

interface SyncOptions {
  fullSync?: boolean;
  dryRun?: boolean;
  repId?: number;
  repName?: string;
  /** Override the default sync window (in days), for debugging only */
  debugWindowDays?: number;
}

export async function syncSalestrailCalls(opts: SyncOptions = {}): Promise<SyncResult> {
  const { fullSync = false, dryRun = false, repId, repName = "System", debugWindowDays } = opts;
  const db = getDb();
  const batchId = `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const DEFAULT_WINDOW_HOURS = 24;
  const syncStartedAt = Date.now();
  const logTiming = (stage: string, startedAt: number) => {
    console.log(`[salestrail] timing ${stage}: ${Date.now() - startedAt}ms`);
  };

  const result: SyncResult = {
    success: false,
    dryRun,
    fullSync,
    fetchedCount: 0,
    wouldImportCount: 0,
    importedCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    errorCount: 0,
    errors: [],
    batchId,
  };

  try {
    // ── Read config ──
    const config = await readConfig(db);
    if (!config.enabled && !dryRun) {
      result.errors.push("Salestrail integration is disabled in settings");
      return result;
    }

    // ── Acquire sync lock (skip for dry-run) ──
    if (!dryRun) {
      try {
        await acquireSyncLock(db, batchId);
      } catch (err) {
        result.errors.push(`Sync lock: ${(err as Error).message}`);
        return result;
      }
    }

    // ── Resolve secrets ──
    const username = salestrailUsername.value();
    const password = salestrailPassword.value();

    if (!username || !password) {
      result.errors.push("SALESTRAIL_API_USERNAME or SALESTRAIL_API_PASSWORD secret not configured");
      if (!dryRun) await releaseSyncLock(db, "error", "Secrets not configured", config.lastSyncAt ?? Date.now(), 0);
      return result;
    }

    // ── Build date range ──
    const now = new Date();
    let from: Date;
    if (fullSync) {
      from = new Date(0);
      console.log("[salestrail] full sync requested — from epoch");
    } else if (debugWindowDays && debugWindowDays > 0) {
      from = new Date(now.getTime() - debugWindowDays * 24 * 60 * 60 * 1000);
      console.log(`[salestrail] debug window: last ${debugWindowDays} days`);
    } else if (config.lastSyncAt) {
      from = new Date(config.lastSyncAt);
      console.log(`[salestrail] incremental sync from lastSyncAt=${new Date(config.lastSyncAt).toISOString()}`);
    } else {
      // First run: default to last 24 hours, not epoch
      from = new Date(now.getTime() - DEFAULT_WINDOW_HOURS * 60 * 60 * 1000);
      console.log(`[salestrail] first run — defaulting to last ${DEFAULT_WINDOW_HOURS}h`);
    }
    const to = now;

    const fromISO = from.toISOString();
    const toISO = to.toISOString();

    // ── Fetch from API ──
    let rawCalls: SalestrailRawCall[] = [];
    const fetchStartedAt = Date.now();
    try {
      rawCalls = await fetchSalestrailCalls(username, password, fromISO, toISO);
      logTiming("fetch", fetchStartedAt);
      result.fetchedCount = rawCalls.length;
    } catch (err) {
      const msg = (err as Error).message;
      result.errors.push(`API fetch failed: ${msg}`);
      if (!dryRun) await releaseSyncLock(db, "error", msg, config.lastSyncAt ?? Date.now(), 0);
      return result;
    }

    if (rawCalls.length === 0) {
      result.success = true;
      if (!dryRun) await releaseSyncLock(db, "success", null, config.lastSyncAt ?? Date.now(), 0);
      return result;
    }

    // ── Transform ──
    const transformStartedAt = Date.now();
    const docs = rawCalls.map((raw) => transformCall(raw, batchId));
    logTiming("transform", transformStartedAt);
    result.skippedCount = 0;

    if (dryRun) {
      result.wouldImportCount = docs.length;
      result.success = true;
      logTiming("total", syncStartedAt);
      return result;
    }

    // ── Collect unique phones for matching ──
    const uniquePhones = new Set<string>();
    const uniqueUserEmails = new Set<string>();
    for (const doc of docs) {
      if (doc.callerNumberNormalized) uniquePhones.add(doc.callerNumberNormalized);
      if (doc.calleeNumberNormalized) uniquePhones.add(doc.calleeNumberNormalized);
      if (doc.userEmail) uniqueUserEmails.add(doc.userEmail);
    }

    // ── Batch lookup leads and reps ──
    const leadLookupStartedAt = Date.now();
    const leadsByPhone = await lookupLeadsByPhone(db, [...uniquePhones]);
    logTiming("lead lookup", leadLookupStartedAt);

    const repPhoneLookupStartedAt = Date.now();
    const repsByPhone = await lookupRepsByPhone(db, [...uniquePhones]);
    logTiming("rep phone lookup", repPhoneLookupStartedAt);

    const repEmailLookupStartedAt = Date.now();
    const repsByEmail = await lookupRepsByEmail(db, [...uniqueUserEmails]);
    logTiming("rep email lookup", repEmailLookupStartedAt);

    // ── Match calls ──
    const assignedRepMatchingStartedAt = Date.now();
    for (const doc of docs) {
      // Check for internal call first
      const callerIsRep = repsByPhone.has(doc.callerNumberNormalized);
      const calleeIsRep = repsByPhone.has(doc.calleeNumberNormalized);
      if (callerIsRep && calleeIsRep) {
        doc.direction = "internal";
        doc.importStatus = "unmatched";
        continue;
      }

      // Match to leads
      const match = await matchCallToLeads(doc, leadsByPhone, repsByPhone);
      doc.matchedLeadId = match.matchedLeadId;
      doc.matchedPhoneNumber = match.matchedPhoneNumber;
      doc.matchedOn = match.matchedOn;
      doc.matchConfidence = match.matchConfidence;
      doc.region = match.leadRegion as "brisbane" | "perth" | null;

      // Assigned rep matching via userEmail
      doc.assignedRepId = repsByEmail.get(doc.userEmail) ?? null;

      doc.importStatus = match.matchedLeadId ? "matched" : "unmatched";
    }
    logTiming("assigned rep matching", assignedRepMatchingStartedAt);

    // ── Write to Firestore (skip if dry-run) ──
    if (!dryRun) {
      const batchWriteStartedAt = Date.now();
      const writeResult = await batchWriteCalls(db, docs);
      logTiming("batch writes", batchWriteStartedAt);
      result.importedCount = writeResult.imported;
      result.updatedCount = writeResult.updated;
      result.skippedCount = writeResult.skipped;
      result.errorCount = writeResult.errors;
    }

    // ── Determine latest source timestamp for lastSyncAt ──
    const maxSourceTs = docs.reduce((max, d) => {
      const ms = d.sourceCreatedAt.toMillis();
      return ms > max ? ms : max;
    }, 0);
    const lastSyncAt = Math.min(maxSourceTs, Date.now());

    // ── Release lock and update config ──
    if (!dryRun) {
      await releaseSyncLock(db, "success", null, lastSyncAt, result.importedCount + result.updatedCount);
      await writeAuditLog(db, result, repId, repName);
    }

    result.success = true;
    logTiming("total", syncStartedAt);
  } catch (err) {
    const msg = (err as Error).message;
    result.errors.push(msg);
    try {
      const db2 = getDb();
      await releaseSyncLock(db2, "error", msg, Date.now(), 0);
    } catch { /* best-effort */ }
  }

  return result;
}
