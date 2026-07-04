/**
 * notifications.ts — Reusable FCM notification helpers for Cloud Functions
 *
 * Exports:
 *  sendNotification(userId, title, body, data?)          — single user
 *  sendNotificationToMany(userIds, title, body, data?)   — multiple users (chunked)
 *  pruneInvalidTokens(tokens, failureDetails)            — removes stale device docs
 *  onDailyStatsWritten                                   — Firestore trigger that
 *                                                          fires performance alerts
 *                                                          when a dailyStats doc is
 *                                                          created or updated.
 */

import * as admin from "firebase-admin";
import { firestoreServerTimestamp } from "./firestoreCompat";
import { getMessaging, MulticastMessage } from "firebase-admin/messaging";
import { onDocumentWritten } from "firebase-functions/v2/firestore";

// db reference is initialised by the caller (index.ts calls admin.initializeApp()).
// We reference it lazily via admin.firestore() so this module is side-effect free.
function db() {
  return admin.firestore();
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SendResult {
  sent: number;
  failed: number;
  tokenErrors: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retrieve all valid FCM tokens for a single userId.
 * Returns an array of `{ docId, token }` pairs so callers can prune stale tokens.
 */
async function getDeviceTokensForUser(
  userId: number
): Promise<Array<{ docId: string; token: string }>> {
  const snap = await db()
    .collection("userDevices")
    .where("userId", "==", userId)
    .get();

  return snap.docs
    .map((d) => ({ docId: d.id, token: (d.data().token as string) || "" }))
    .filter((t) => t.token.length > 0);
}

/**
 * Retrieve tokens for multiple userIds in Firestore-safe 30-item chunks.
 */
async function getDeviceTokensForUsers(
  userIds: number[]
): Promise<Array<{ docId: string; token: string }>> {
  const results: Array<{ docId: string; token: string }> = [];
  for (let i = 0; i < userIds.length; i += 30) {
    const chunk = userIds.slice(i, i + 30);
    const snap = await db()
      .collection("userDevices")
      .where("userId", "in", chunk)
      .get();
    snap.docs.forEach((d) => {
      const token = (d.data().token as string) || "";
      if (token) results.push({ docId: d.id, token });
    });
  }
  return results;
}

/**
 * Remove Firestore userDevice docs whose FCM tokens are no longer valid.
 * Call this after a multicast send using the failureDetails from the response.
 */
export async function pruneInvalidTokens(
  devices: Array<{ docId: string; token: string }>,
  failureDetails: admin.messaging.SendResponse[]
): Promise<void> {
  const batch = db().batch();
  let pruneCount = 0;

  failureDetails.forEach((response, index) => {
    if (!response.success && response.error) {
      const code = response.error.code;
      // These error codes indicate the token is permanently invalid
      if (
        code === "messaging/invalid-registration-token" ||
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-argument"
      ) {
        const device = devices[index];
        if (device) {
          batch.delete(db().collection("userDevices").doc(device.docId));
          pruneCount++;
        }
      }
    }
  });

  if (pruneCount > 0) {
    await batch.commit();
    console.log(`[pruneInvalidTokens] Removed ${pruneCount} stale device token(s).`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send a push notification to a single user by their numeric userId.
 * Silently no-ops if the user has no registered devices.
 */
export async function sendNotification(
  userId: number,
  title: string,
  body: string,
  data: Record<string, string> = {}
): Promise<boolean> {
  const devices = await getDeviceTokensForUser(userId);
  if (devices.length === 0) return false;

  const tokens = devices.map((d) => d.token);

  const message: MulticastMessage = {
    tokens,
    notification: { title, body },
    data,
    webpush: {
      fcmOptions: { link: data.link ?? "/" },
      notification: { icon: "/asg-icon.png", badge: "/asg-icon.png" },
    },
    android: { priority: "normal" },
    apns: { payload: { aps: { sound: "default" } } },
  };

  try {
    const response = await getMessaging().sendEachForMulticast(message);

    // Prune invalid tokens in the background (don't await to avoid blocking)
    void pruneInvalidTokens(devices, response.responses);

    console.log(
      `[sendNotification] userId=${userId} sent=${response.successCount} failed=${response.failureCount}`
    );
    return response.successCount > 0;
  } catch (err) {
    console.error(`[sendNotification] Error for userId=${userId}:`, err);
    return false;
  }
}

/**
 * Send a push notification to multiple users.
 * Handles Firestore chunking (max 500 tokens per FCM multicast).
 * Returns total sent/failed counts.
 */
export async function sendNotificationToMany(
  userIds: number[],
  title: string,
  body: string,
  data: Record<string, string> = {}
): Promise<SendResult> {
  if (userIds.length === 0) return { sent: 0, failed: 0, tokenErrors: [] };

  const devices = await getDeviceTokensForUsers(userIds);
  if (devices.length === 0) return { sent: 0, failed: 0, tokenErrors: [] };

  let totalSent = 0;
  let totalFailed = 0;
  const tokenErrors: string[] = [];

  // FCM multicast supports up to 500 tokens per request
  for (let i = 0; i < devices.length; i += 500) {
    const chunk = devices.slice(i, i + 500);
    const tokens = chunk.map((d) => d.token);

    const message: MulticastMessage = {
      tokens,
      notification: { title, body },
      data,
      webpush: {
        fcmOptions: { link: data.link ?? "/" },
        notification: { icon: "/asg-icon.png", badge: "/asg-icon.png" },
      },
    };

    try {
      const response = await getMessaging().sendEachForMulticast(message);
      totalSent += response.successCount;
      totalFailed += response.failureCount;

      // Collect error codes for logging
      response.responses.forEach((r, idx) => {
        if (!r.success && r.error) {
          tokenErrors.push(
            `token[${i + idx}]: ${r.error.code}`
          );
        }
      });

      // Prune invalid tokens (fire-and-forget)
      void pruneInvalidTokens(chunk, response.responses);
    } catch (err) {
      console.error("[sendNotificationToMany] Chunk send error:", err);
      totalFailed += chunk.length;
    }
  }

  console.log(
    `[sendNotificationToMany] users=${userIds.length} tokens=${devices.length} sent=${totalSent} failed=${totalFailed}`
  );

  return { sent: totalSent, failed: totalFailed, tokenErrors };
}

// ─────────────────────────────────────────────────────────────────────────────
// Firestore trigger: dailyStats → performance alerts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * onDailyStatsWritten
 *
 * Fires whenever a `dailyStats/{docId}` document is created or updated.
 * Checks if the rep has alertsEnabled = true, then evaluates performance
 * thresholds and sends targeted push notifications for triggered alert types.
 *
 * Alert thresholds (conservative defaults — tune via appSettings in the future):
 *  - no_activity:    calls === 0 and current hour >= 12
 *  - low_activity:   calls < dailyTarget * 0.5 and current hour >= 15
 *  - target_nearing: calls >= dailyTarget * 0.8 and calls < dailyTarget
 *  - missed_target:  calls < dailyTarget and current hour >= 17
 */
export const onDailyStatsWritten = onDocumentWritten(
  "dailyStats/{docId}",
  async (event) => {
    const after = event.data?.after?.data();
    if (!after) return; // document was deleted — nothing to do

    const repId: number = after.repId;
    const date: string = after.date ?? "";
    const calls: number = after.metrics?.calls ?? 0;

    if (!repId || !date) return;

    // ── 1. Check if alerts are enabled for this rep ───────────────────────
    const repDoc = await db().collection("reps").doc(String(repId)).get();
    if (!repDoc.exists) return;

    const repData = repDoc.data() as Record<string, unknown>;
    if (!repData.alertsEnabled) return;

    // ── 2. Load repTargets from appSettings ───────────────────────────────
    const settingsDoc = await db().collection("settings").doc("config").get();
    const settings = settingsDoc.data() as Record<string, unknown> | undefined;
    const repTargets = (settings?.repTargets as Record<string, { weeklyDQ?: number }>) ?? {};
    const weeklyDQ = repTargets[String(repId)]?.weeklyDQ ?? 20;
    const dailyTarget = Math.ceil(weeklyDQ / 5);

    // ── 3. Determine which alerts should fire ─────────────────────────────
    // Use Perth/AEST time for hour-based thresholds
    const nowPerth = new Date(
      new Date().toLocaleString("en-AU", { timeZone: "Australia/Perth" })
    );
    const currentHour = nowPerth.getHours();

    // Only process stats for today (don't re-alert on historical backfills)
    const todayPerth = nowPerth.toISOString().slice(0, 10);
    if (date !== todayPerth) return;

    interface AlertSpec { type: string; title: string; body: string }
    const alertsToSend: AlertSpec[] = [];

    if (currentHour >= 12 && calls === 0) {
      alertsToSend.push({
        type: "no_activity",
        title: "Activity Check 👋",
        body: "No calls logged yet today — check in with your leads!",
      });
    }

    if (currentHour >= 15 && calls > 0 && calls < dailyTarget * 0.5) {
      alertsToSend.push({
        type: "low_activity",
        title: "Keep It Up 💪",
        body: `Only ${calls} call${calls === 1 ? "" : "s"} logged — ${dailyTarget - calls} more to hit today's target.`,
      });
    }

    if (calls >= dailyTarget * 0.8 && calls < dailyTarget) {
      alertsToSend.push({
        type: "target_nearing",
        title: "Almost There! 🎯",
        body: `${dailyTarget - calls} more call${dailyTarget - calls === 1 ? "" : "s"} to hit your target today.`,
      });
    }

    if (currentHour >= 17 && calls < dailyTarget) {
      alertsToSend.push({
        type: "missed_target",
        title: "Tomorrow's a New Day 📊",
        body: `Today's target missed — ${calls}/${dailyTarget} calls. Keep it up tomorrow!`,
      });
    }

    if (alertsToSend.length === 0) return;

    // ── 4. Deduplicate: don't re-send an alert that was already sent today ──
    const sentAlertsRef = db()
      .collection("sentAlerts")
      .where("repId", "==", repId)
      .where("date", "==", date);
    const sentSnap = await sentAlertsRef.get();
    const alreadySent = new Set(
      sentSnap.docs.map((d) => d.data().alertType as string)
    );

    const freshAlerts = alertsToSend.filter(
      (a) => !alreadySent.has(a.type)
    );
    if (freshAlerts.length === 0) return;

    // ── 5. Send notifications + record in sentAlerts ──────────────────────
    const batch = db().batch();

    for (const alert of freshAlerts) {
      await sendNotification(repId, alert.title, alert.body, {
        alertType: alert.type,
        date,
      });

      // Mark as sent so we don't fire again on the next stats update
      const sentRef = db().collection("sentAlerts").doc();
      batch.set(sentRef, {
        repId,
        date,
        alertType: alert.type,
        sentAt: firestoreServerTimestamp(),
      });
    }

    await batch.commit();
    console.log(
      `[onDailyStatsWritten] repId=${repId} date=${date} sent ${freshAlerts.length} alert(s)`
    );
  }
);
