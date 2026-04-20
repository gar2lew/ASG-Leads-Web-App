"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.triggerPerfAlert = exports.sendDailyReportNotification = exports.sendPushNotification = exports.aggregateDailyStats = exports.getPropertyInsights = exports.syncEnvelopeStatus = exports.voidDocuSignEnvelope = exports.resendDocuSignEnvelope = exports.docusignWebhook = exports.createDocuSignEnvelope = exports.onDailyStatsWritten = void 0;
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const notifications_1 = require("./notifications");
const docusign_1 = require("./docusign");
Object.defineProperty(exports, "createDocuSignEnvelope", { enumerable: true, get: function () { return docusign_1.createDocuSignEnvelope; } });
Object.defineProperty(exports, "docusignWebhook", { enumerable: true, get: function () { return docusign_1.docusignWebhook; } });
Object.defineProperty(exports, "resendDocuSignEnvelope", { enumerable: true, get: function () { return docusign_1.resendDocuSignEnvelope; } });
Object.defineProperty(exports, "voidDocuSignEnvelope", { enumerable: true, get: function () { return docusign_1.voidDocuSignEnvelope; } });
Object.defineProperty(exports, "syncEnvelopeStatus", { enumerable: true, get: function () { return docusign_1.syncEnvelopeStatus; } });
admin.initializeApp();
const db = admin.firestore();
// Re-export the Firestore-triggered notification function
var notifications_2 = require("./notifications");
Object.defineProperty(exports, "onDailyStatsWritten", { enumerable: true, get: function () { return notifications_2.onDailyStatsWritten; } });
// ── SMSF Financials ──
__exportStar(require("./smsfFinancials"), exports);
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Format a Date as YYYY-MM-DD in UTC.
 * Scheduled functions run in UTC; timezone offsets are handled by the
 * Cloud Scheduler trigger, not at runtime.
 */
function toDateString(date) {
    return date.toISOString().slice(0, 10);
}
/**
 * Return yesterday's date string (YYYY-MM-DD) in UTC.
 * The 23:59 AEST trigger fires at 13:59 UTC the same calendar day,
 * so subtracting one UTC day gives the correct "yesterday AEST" date.
 */
function getYesterdayDateString() {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    return toDateString(d);
}
// ---------------------------------------------------------------------------
// 1. getPropertyInsights — original function (preserved)
// ---------------------------------------------------------------------------
exports.getPropertyInsights = (0, https_1.onCall)(async (request) => {
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
    const lastSoldPrice = null;
    const lastSoldDate = null;
    // ---- Resolve value ----
    let resolvedValue = baselineValue;
    let resolvedValueSource = "baseline";
    // ---- Equity calc ----
    let estimatedEquity = null;
    let equityMethod = "baseline_proxy";
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
    return Object.assign(Object.assign({}, propertyDoc), { propertyId: ref.id, fetchedAt: now });
});
// ---------------------------------------------------------------------------
// 2. aggregateDailyStats — runs daily at 11:59 PM AEST
// ---------------------------------------------------------------------------
exports.aggregateDailyStats = (0, scheduler_1.onSchedule)({
    schedule: "59 23 * * *",
    timeZone: "Australia/Sydney",
}, async () => {
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
    const leads = leadsSnap.docs.map((d) => (Object.assign({ id: d.id }, d.data())));
    const trainingSessions = trainingSnap.docs.map((d) => (Object.assign({ id: d.id }, d.data())));
    const commissions = commissionsSnap.docs.map((d) => (Object.assign({ id: d.id }, d.data())));
    const draps = drapsSnap.docs.map((d) => (Object.assign({ id: d.id }, d.data())));
    const reps = repsSnap.docs.map((d) => (Object.assign({ id: d.id }, d.data())));
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
            const history = lead.callHistory || [];
            calls += history.filter((h) => String(h.repId) === String(repId) && h.date === targetDate).length;
        }
        // ---- appointments: fc or fr appt booked by this rep on targetDate ----
        let appointments = 0;
        for (const lead of leads) {
            const fc = lead.fcAppt || {};
            const fr = lead.frAppt || {};
            if ((String(fc.repId) === String(repId) && fc.date === targetDate) ||
                (String(fr.repId) === String(repId) && fr.date === targetDate)) {
                appointments++;
            }
        }
        // ---- dealsCreated: leads DQ'd by this rep on targetDate ----
        const dealsCreated = leads.filter((l) => String(l.dqRep) === String(repId) && l.leadDate === targetDate).length;
        // ---- dealsClosed & commissionEarned ----
        let dealsClosed = 0;
        let commissionEarned = 0;
        for (const commission of commissions) {
            if (commission.settlementDate !== targetDate)
                continue;
            const allocations = commission.repAllocations || [];
            for (const alloc of allocations) {
                if (String(alloc.repId) === String(repId)) {
                    dealsClosed++;
                    commissionEarned += alloc.amount || 0;
                }
            }
        }
        // ---- trainingSessions & avgTrainingScore ----
        const repSessions = trainingSessions.filter((ts) => {
            if (String(ts.repId) !== String(repId))
                return false;
            if (ts.partial)
                return false;
            if (!ts.completedAt)
                return false;
            // completedAt is a ms epoch; derive date string and compare
            const sessionDate = toDateString(new Date(ts.completedAt));
            return sessionDate === targetDate;
        });
        const trainingSessionCount = repSessions.length;
        const avgTrainingScore = trainingSessionCount > 0
            ? repSessions.reduce((sum, ts) => { var _a; return sum + (((_a = ts.score) === null || _a === void 0 ? void 0 : _a.total) || 0); }, 0) / trainingSessionCount
            : 0;
        // ---- DRAPS entry for this rep on targetDate ----
        const drapsEntry = draps.find((d) => String(d.repId) === String(repId) && d.date === targetDate);
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
                dials: (drapsEntry === null || drapsEntry === void 0 ? void 0 : drapsEntry.dq) || 0,
                responses: (drapsEntry === null || drapsEntry === void 0 ? void 0 : drapsEntry.referrals) || 0,
                appointments: (drapsEntry === null || drapsEntry === void 0 ? void 0 : drapsEntry.appointments) || 0,
                presentations: (drapsEntry === null || drapsEntry === void 0 ? void 0 : drapsEntry.presentations) || 0,
                sales: (drapsEntry === null || drapsEntry === void 0 ? void 0 : drapsEntry.sold) || 0,
            },
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
    await batch.commit();
    console.log(`aggregateDailyStats: wrote stats for ${reps.length} reps on ${targetDate}`);
});
// ---------------------------------------------------------------------------
// 3. sendPushNotification — onCall HTTPS function
//    Callable by admin users to send a push notification to specific users.
// ---------------------------------------------------------------------------
exports.sendPushNotification = (0, https_1.onCall)(async (request) => {
    const { userIds, title, body, data, } = request.data;
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        throw new Error("userIds must be a non-empty array");
    }
    if (!title || !body) {
        throw new Error("title and body are required");
    }
    const result = await (0, notifications_1.sendNotificationToMany)(userIds, title, body, data !== null && data !== void 0 ? data : {});
    return { sent: result.sent, failed: result.failed };
});
// ---------------------------------------------------------------------------
// 4. sendDailyReportNotification — runs daily at 6:00 AM AEST
//    Sends "Daily Report Ready" push to all admin users.
// ---------------------------------------------------------------------------
exports.sendDailyReportNotification = (0, scheduler_1.onSchedule)({
    schedule: "0 18 * * *", // 6:00 PM Perth time (UTC+8 = 10:00 UTC)
    timeZone: "Australia/Perth",
}, async () => {
    // Notify admins AND managers — both roles have access to the daily report
    const repsSnap = await db.collection("reps").where("active", "==", true).get();
    const eligibleIds = repsSnap.docs
        .filter((d) => {
        const role = d.data().role;
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
    const result = await (0, notifications_1.sendNotificationToMany)(eligibleIds, "Daily Stats Ready 📊", "Today's performance report is ready — tap to view.", { link: "/", section: "daily-report" });
    console.log(`sendDailyReportNotification: sent=${result.sent} failed=${result.failed}`);
});
// ---------------------------------------------------------------------------
// 5. triggerPerfAlert — onCall HTTPS function
//    Sends a performance alert notification to a specific rep.
// ---------------------------------------------------------------------------
const ALERT_TITLES = {
    no_activity: "Activity Check 👋",
    low_activity: "Keep It Up 💪",
    target_nearing: "Almost There! 🎯",
    missed_target: "Tomorrow's a New Day 📊",
};
exports.triggerPerfAlert = (0, https_1.onCall)(async (request) => {
    var _a;
    const { repId, alertType, message, } = request.data;
    if (!repId || !alertType || !message) {
        throw new Error("repId, alertType, and message are required");
    }
    const title = (_a = ALERT_TITLES[alertType]) !== null && _a !== void 0 ? _a : "Performance Alert";
    const sent = await (0, notifications_1.sendNotification)(repId, title, message, { alertType });
    return { sent };
});
//# sourceMappingURL=index.js.map