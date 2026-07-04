import { onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { sendNotification, sendNotificationToMany } from "./notifications";
import {
  createDocuSignEnvelope,
  docusignWebhook,
  resendDocuSignEnvelope,
  voidDocuSignEnvelope,
  syncEnvelopeStatus,
} from "./docusign";

admin.initializeApp();
const db = admin.firestore();

// Re-export the Firestore-triggered notification function
export { onDailyStatsWritten } from "./notifications";

// ── DocuSign Integration ──
export { createDocuSignEnvelope, docusignWebhook, resendDocuSignEnvelope, voidDocuSignEnvelope, syncEnvelopeStatus };

// ── SMSF Financials ──
export * from "./smsfFinancials";

// ── Auth ──
export { verifyPin, setPin, changePin, verifyBackupPassword } from "./auth/verifyPin";

// ── Follow-up Engine ──
export { followUpEngine } from "./followups";

// Server-authoritative foundations
export { appendAuditEvent } from "./audit";
export { updateAppSettingsCallable, rollbackAppSettingsCallable } from "./settingsAdmin";

// ── Migration Utilities ──
export { backfillPhoneNormalization } from "./phoneMigration";

// ── Salestrail Integration ──
export { syncSalestrailCallsCallable, getSalestrailConfig, updateSalestrailConfig, resetSalestrailSyncLock } from "./salestrail";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a Date as YYYY-MM-DD in UTC.
 * Scheduled functions run in UTC; timezone offsets are handled by the
 * Cloud Scheduler trigger, not at runtime.
 */
function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Return yesterday's date string (YYYY-MM-DD) in UTC.
 * The 23:59 AEST trigger fires at 13:59 UTC the same calendar day,
 * so subtracting one UTC day gives the correct "yesterday AEST" date.
 */
function getYesterdayDateString(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return toDateString(d);
}

// ---------------------------------------------------------------------------
// 1. getPropertyInsights — original function (preserved)
// ---------------------------------------------------------------------------

export const getPropertyInsights = onCall(async (request) => {
  const { address, suburb } = request.data;

  if (!address || !suburb) {
    throw new Error("Missing address or suburb");
  }

  const now = Date.now();

  // ---- Defaults / assumptions ----
  const assumedLVR = 0.8;
  const assumedRate = 0.06;
  const assumedTerm = 30;

  // ---- Placeholder baseline lookup ----
  const baselineValue = 800000; // replace later with suburb lookup

  // ---- Placeholder last sale ----
  const lastSoldPrice: number | null = null;
  const lastSoldDate: string | null = null;

  // ---- Resolve value ----
  const resolvedValue: number | null = baselineValue;
  const resolvedValueSource: "api" | "appreciation_model" | "baseline" | null = "baseline";

  // ---- Equity calc ----
  let estimatedEquity: number | null = null;
  const equityMethod: "full_model" | "appreciation_model" | "baseline_proxy" = "baseline_proxy";

  if (resolvedValue) {
    estimatedEquity = resolvedValue * 0.2; // proxy for now
  }

  // ---- Build document ----
  const propertyDoc = {
    address,
    suburb,

    resolvedValue,
    resolvedValueSource,

    estimatedEquity,
    equityMethod,

    assumedLVR,
    assumedRate,
    assumedTerm,

    lastSoldPrice,
    lastSoldDate,

    dataMode: "estimated",

    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    fetchedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const ref = await db.collection("properties").add(propertyDoc);

  return {
    ...propertyDoc,
    propertyId: ref.id,
    fetchedAt: now,
  };
});

// ---------------------------------------------------------------------------
// 2. aggregateDailyStats — runs daily at 11:59 PM AEST
// ---------------------------------------------------------------------------

export const aggregateDailyStats = onSchedule(
  {
    schedule: "59 23 * * *",
    timeZone: "Australia/Sydney",
  },
  async () => {
    const targetDate = getYesterdayDateString();
    console.log(`aggregateDailyStats: aggregating for date=${targetDate}`);

    // ------------------------------------------------------------------
    // Fetch all source collections in parallel
    // ------------------------------------------------------------------
    const [leadsSnap, trainingSnap, commissionsSnap, drapsSnap, repsSnap] = await Promise.all([
      db.collection("leads").get(),
      db.collection("trainingSessions").get(),
      db.collection("commissions").get(),
      db.collection("draps").get(),
      db.collection("reps").where("active", "==", true).get(),
    ]);

    const leads = leadsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as any);
    const trainingSessions = trainingSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as any);
    const commissions = commissionsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as any);
    const draps = drapsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as any);
    const reps = repsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as any);

    // ------------------------------------------------------------------
    // Build one Firestore batch (Firestore limit: 500 ops per batch).
    // If your org ever exceeds ~499 active reps, split into multiple batches.
    // ------------------------------------------------------------------
    const batch = db.batch();

    for (const rep of reps) {
      const repId = rep.id;

      // ---- calls: count callHistory entries for this rep on targetDate ----
      let calls = 0;
      for (const lead of leads) {
        const history: any[] = lead.callHistory || [];
        calls += history.filter((h) => String(h.repId) === String(repId) && h.date === targetDate).length;
      }

      // ---- appointments: fc or fr appt booked by this rep on targetDate ----
      let appointments = 0;
      for (const lead of leads) {
        const fc = lead.fcAppt || {};
        const fr = lead.frAppt || {};
        if (
          (String(fc.repId) === String(repId) && fc.date === targetDate) ||
          (String(fr.repId) === String(repId) && fr.date === targetDate)
        ) {
          appointments++;
        }
      }

      // ---- dealsCreated: leads DQ'd by this rep on targetDate ----
      const dealsCreated = leads.filter((l) => String(l.dqRep) === String(repId) && l.leadDate === targetDate).length;

      // ---- dealsClosed & commissionEarned ----
      let dealsClosed = 0;
      let commissionEarned = 0;
      for (const commission of commissions) {
        if (commission.settlementDate !== targetDate) continue;
        const allocations: any[] = commission.repAllocations || [];
        for (const alloc of allocations) {
          if (String(alloc.repId) === String(repId)) {
            dealsClosed++;
            commissionEarned += alloc.amount || 0;
          }
        }
      }

      // ---- trainingSessions & avgTrainingScore ----
      const repSessions = trainingSessions.filter((ts: any) => {
        if (String(ts.repId) !== String(repId)) return false;
        if (ts.partial) return false;
        if (!ts.completedAt) return false;
        // completedAt is a ms epoch; derive date string and compare
        const sessionDate = toDateString(new Date(ts.completedAt));
        return sessionDate === targetDate;
      });

      const trainingSessionCount = repSessions.length;
      const avgTrainingScore =
        trainingSessionCount > 0
          ? repSessions.reduce((sum: number, ts: any) => sum + (ts.score?.total || 0), 0) / trainingSessionCount
          : 0;

      // ---- DRAPS entry for this rep on targetDate ----
      const drapsEntry = draps.find((d: any) => String(d.repId) === String(repId) && d.date === targetDate);

      // ---- Write to dailyStats/{repId}_{targetDate} ----
      const docId = `${repId}_${targetDate}`;
      const ref = db.collection("dailyStats").doc(docId);
      batch.set(ref, {
        repId,
        repName: rep.name || "",
        date: targetDate,
        metrics: {
          calls,
          appointments,
          dealsCreated,
          dealsClosed,
          commissionEarned,
          trainingSessions: trainingSessionCount,
          avgTrainingScore,
        },
        draps: {
          dials: drapsEntry?.dq || 0,
          responses: drapsEntry?.referrals || 0,
          appointments: drapsEntry?.appointments || 0,
          presentations: drapsEntry?.presentations || 0,
          sales: drapsEntry?.sold || 0,
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();
    console.log(`aggregateDailyStats: wrote stats for ${reps.length} reps on ${targetDate}`);
  },
);

// ---------------------------------------------------------------------------
// 3. sendPushNotification — onCall HTTPS function
//    Callable by admin users to send a push notification to specific users.
// ---------------------------------------------------------------------------

export const sendPushNotification = onCall(async (request) => {
  const {
    userIds,
    title,
    body,
    data,
  }: {
    userIds: number[];
    title: string;
    body: string;
    data?: Record<string, string>;
  } = request.data;

  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    throw new Error("userIds must be a non-empty array");
  }
  if (!title || !body) {
    throw new Error("title and body are required");
  }

  const result = await sendNotificationToMany(userIds, title, body, data ?? {});
  return { sent: result.sent, failed: result.failed };
});

// ---------------------------------------------------------------------------
// 4. sendDailyReportNotification — runs daily at 6:00 AM AEST
//    Sends "Daily Report Ready" push to all admin users.
// ---------------------------------------------------------------------------

export const sendDailyReportNotification = onSchedule(
  {
    schedule: "0 18 * * *", // 6:00 PM Perth time (UTC+8 = 10:00 UTC)
    timeZone: "Australia/Perth",
  },
  async () => {
    // Notify admins AND managers — both roles have access to the daily report
    const repsSnap = await db.collection("reps").where("active", "==", true).get();

    const eligibleIds: number[] = repsSnap.docs
      .filter((d) => {
        const role = d.data().role as string | undefined;
        return role === "admin" || role === "manager";
      })
      .map((d) => {
        // Rep IDs are stored as numeric in our schema
        const data = d.data();
        return typeof data.id === "number" ? data.id : parseInt(d.id, 10);
      })
      .filter((id) => !isNaN(id));

    if (eligibleIds.length === 0) {
      console.log("sendDailyReportNotification: no admin/manager reps found");
      return;
    }

    const result = await sendNotificationToMany(
      eligibleIds,
      "Daily Stats Ready 📊",
      "Today's performance report is ready — tap to view.",
      { link: "/", section: "daily-report" },
    );

    console.log(`sendDailyReportNotification: sent=${result.sent} failed=${result.failed}`);
  },
);

// ---------------------------------------------------------------------------
// 5. triggerPerfAlert — onCall HTTPS function
//    Sends a performance alert notification to a specific rep.
// ---------------------------------------------------------------------------

const ALERT_TITLES: Record<string, string> = {
  no_activity: "Activity Check 👋",
  low_activity: "Keep It Up 💪",
  target_nearing: "Almost There! 🎯",
  missed_target: "Tomorrow's a New Day 📊",
};

export const triggerPerfAlert = onCall(async (request) => {
  const {
    repId,
    alertType,
    message,
  }: {
    repId: number;
    alertType: string;
    message: string;
  } = request.data;

  if (!repId || !alertType || !message) {
    throw new Error("repId, alertType, and message are required");
  }

  const title = ALERT_TITLES[alertType] ?? "Performance Alert";
  const sent = await sendNotification(repId, title, message, { alertType });
  return { sent };
});
