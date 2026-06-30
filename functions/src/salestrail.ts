/**
 * salestrail.ts — Salestrail callable function wrappers
 *
 * Epic 1 scope:
 *   - syncSalestrailCallsCallable (admin-only manual sync)
 *   - getSalestrailConfig (read settings)
 *   - updateSalestrailConfig (admin-only config updates)
 *   - resetSalestrailSyncLock (admin-only stale lock override)
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { requireAuth, requireMinimumRole } from "./auth";
import { syncSalestrailCalls, salestrailUsername, salestrailPassword } from "./salestrailSync";

function getDb() {
  if (!admin.apps || admin.apps.length === 0) {
    admin.initializeApp();
  }
  return admin.firestore();
}

// ---------------------------------------------------------------------------
// syncSalestrailCallsCallable — manual sync trigger
// ---------------------------------------------------------------------------

export const syncSalestrailCallsCallable = onCall(
  { secrets: [salestrailUsername, salestrailPassword] },
  async (request) => {
    const auth = requireAuth(request);
    requireMinimumRole(auth, "admin");

    const { fullSync, dryRun, debugWindowDays } = (request.data ?? {}) as {
      fullSync?: boolean;
      dryRun?: boolean;
      debugWindowDays?: number;
    };

    const result = await syncSalestrailCalls({
      fullSync: fullSync ?? false,
      dryRun: dryRun ?? false,
      debugWindowDays,
      repId: auth.repId,
      repName: auth.repId ? `Rep ${auth.repId}` : "System",
    });

    if (!result.success && !result.dryRun) {
      throw new HttpsError("internal", `Sync failed: ${result.errors.join("; ")}`);
    }

    return result;
  },
);

// ---------------------------------------------------------------------------
// getSalestrailConfig — read-only settings access
// ---------------------------------------------------------------------------

export const getSalestrailConfig = onCall(async (request) => {
  requireAuth(request);

  const snap = await getDb().doc("appSettings/config").get();
  const data = snap.data() ?? {};
  const integrations = (data.integrations as Record<string, unknown> | undefined) ?? {};
  const salestrail = (integrations.salestrail as Record<string, unknown> | undefined) ?? {};

  return {
    enabled: salestrail.enabled ?? false,
    lastSyncAt: salestrail.lastSyncAt ?? null,
    lastSyncStatus: salestrail.lastSyncStatus ?? null,
    lastSyncError: salestrail.lastSyncError ?? null,
    lastSyncCallCount: salestrail.lastSyncCallCount ?? null,
    syncInProgress: salestrail.syncInProgress ?? false,
    syncStartedAt: salestrail.syncStartedAt ?? null,
  };
});

// ---------------------------------------------------------------------------
// updateSalestrailConfig — admin-only config update
// ---------------------------------------------------------------------------

export const updateSalestrailConfig = onCall(async (request) => {
  const auth = requireAuth(request);
  requireMinimumRole(auth, "admin");

  const { enabled } = (request.data ?? {}) as { enabled?: boolean };

  const configRef = getDb().doc("appSettings/config");
  const snap = await configRef.get();
  const data = snap.data() ?? {};
  const integrations = (data.integrations as Record<string, unknown> | undefined) ?? {};
  const salestrail = (integrations.salestrail as Record<string, unknown> | undefined) ?? {};

  const update: Record<string, unknown> = { ...salestrail as Record<string, unknown> };
  if (typeof enabled === "boolean") update.enabled = enabled;

  await configRef.set({
    integrations: {
      ...integrations as Record<string, unknown>,
      salestrail: update,
    },
  }, { merge: true });

  return { success: true, config: update };
});

// ---------------------------------------------------------------------------
// resetSalestrailSyncLock — admin-only stale lock override
// ---------------------------------------------------------------------------

export const resetSalestrailSyncLock = onCall(async (request) => {
  const auth = requireAuth(request);
  requireMinimumRole(auth, "admin");

  const configRef = getDb().doc("appSettings/config");
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
        syncStartedAt: null,
        syncBatchId: null,
        lastSyncStatus: null,
      },
    },
  }, { merge: true });

  return { success: true };
});
