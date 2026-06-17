import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { requireAuth, requireMinimumRole } from "./auth";

function getDb() {
  if (!admin.apps || admin.apps.length === 0) {
    admin.initializeApp();
  }
  return admin.firestore();
}

/**
 * Normalise an Australian phone number for storage.
 * Strips non-digits, fixes Google Sheets dropped leading 0,
 * handles international prefixes.
 */
function normalizeAUPhone(raw: string): string {
  if (!raw) return raw;
  const digits = String(raw).replace(/\D/g, "");

  if (digits.length === 9 && digits.startsWith("4")) return `0${digits}`;

  if (digits.length === 11 && digits.startsWith("614")) return `0${digits.slice(2)}`;
  if (digits.length === 12 && digits.startsWith("6104")) return `0${digits.slice(3)}`;

  if (digits.length === 10) return digits;

  return String(raw).trim();
}

interface BackfillResult {
  success: boolean;
  dryRun: boolean;
  totalScanned: number;
  updated: number;
  skippedAlreadyNormalized: number;
  skippedEmptyPhone: number;
  skippedInvalidFormat: number;
  errors: number;
  errorDetails: string[];
}

/**
 * Backfill lead phone numbers: normalise existing `phone` values and
 * optionally preserve the original value in `phoneRaw`.
 *
 * Supports `dryRun: true` — scans and reports without writing.
 * Admin-only.
 */
export const backfillPhoneNormalization = onCall(async (request) => {
  const auth = requireAuth(request);
  requireMinimumRole(auth, "admin");

  const dryRun = request.data.dryRun === true;
  const preserveRaw = request.data.preserveRaw !== false;

  const db = getDb();
  const batchSize = 450;

  const result: BackfillResult = {
    success: false,
    dryRun,
    totalScanned: 0,
    updated: 0,
    skippedAlreadyNormalized: 0,
    skippedEmptyPhone: 0,
    skippedInvalidFormat: 0,
    errors: 0,
    errorDetails: [],
  };

  try {
    const snapshot = await db.collection("leads").get();
    result.totalScanned = snapshot.size;

    let batch = db.batch();
    let batchOps = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const phone = data.phone as string | undefined;

      // Skip docs with no phone field
      if (!phone || String(phone).trim() === "") {
        result.skippedEmptyPhone++;
        continue;
      }

      const normalized = normalizeAUPhone(phone);

      // Skip already-normalized (exact match after normalisation)
      if (normalized === phone) {
        result.skippedAlreadyNormalized++;
        continue;
      }

      // Skip if normalisation produced garbage (unchanged non-AU format)
      if (normalized === String(phone).trim() && !/^\d{9,10}$/.test(normalized)) {
        result.skippedInvalidFormat++;
        continue;
      }

      if (!dryRun) {
        const update: Record<string, unknown> = { phone: normalized };
        if (preserveRaw) {
          update.phoneRaw = phone;
        }
        batch.update(doc.ref, update);
        batchOps++;
      }

      result.updated++;

      // Commit batch when approaching Firestore's 500-op limit
      if (batchOps >= batchSize) {
        if (!dryRun) {
          try {
            await batch.commit();
          } catch (err) {
            result.errors++;
            result.errorDetails.push(
              `Batch commit failed after ${result.updated} updates: ${(err as Error).message}`,
            );
          }
        }
        batch = db.batch();
        batchOps = 0;
      }
    }

    // Commit final batch
    if (batchOps > 0 && !dryRun) {
      try {
        await batch.commit();
      } catch (err) {
        result.errors++;
        result.errorDetails.push(
          `Final batch commit failed: ${(err as Error).message}`,
        );
      }
    }

    result.success = result.errors === 0;

    // Write audit log
    if (!dryRun) {
      await db.collection("auditLogs").add({
        userId: auth.repId ?? null,
        userName: `uid:${auth.uid}`,
        action: "backfill.phoneNormalization",
        targetType: "leads",
        summary: {
          totalScanned: result.totalScanned,
          updated: result.updated,
          skippedAlreadyNormalized: result.skippedAlreadyNormalized,
          skippedEmptyPhone: result.skippedEmptyPhone,
          skippedInvalidFormat: result.skippedInvalidFormat,
          errors: result.errors,
        },
        authUid: auth.uid,
        authRepId: auth.repId ?? null,
        authRole: auth.role ?? null,
        source: "callable",
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return result;
  } catch (err) {
    console.error("[backfillPhoneNormalization] Fatal error:", err);
    throw new HttpsError("internal", (err as Error).message);
  }
});
