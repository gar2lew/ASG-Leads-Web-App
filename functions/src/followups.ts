import * as admin from "firebase-admin";
import { firestoreServerTimestamp } from "./firestoreCompat";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { sendNotification } from "./notifications";

export const followUpEngine = onSchedule(
  {
    schedule: "every 24 hours",
    timeZone: "Australia/Perth",
  },
  async () => {
    const db = admin.firestore();
    const today = new Date().toISOString().slice(0, 10);

    const leads = await db
      .collection("leads")
      .where("nextContactDate", "<=", today)
      .get();

    if (leads.empty) {
      console.log(`[followUpEngine] No follow-ups due on ${today}`);
      return;
    }

    const batch = db.batch();

    for (const doc of leads.docs) {
      const lead = doc.data();

      batch.set(db.collection("activities").doc(), {
        type: "followup_due",
        leadId: doc.id,
        leadName: lead.name ?? null,
        dqRep: lead.dqRep ?? null,
        nextContactDate: lead.nextContactDate ?? today,
        createdAt: firestoreServerTimestamp(),
      });

      batch.set(db.collection("notifications").doc(), {
        userId: lead.dqRep ?? null,
        message: `Follow-up due: ${lead.name ?? "Unknown"}`,
        leadId: doc.id,
        read: false,
        createdAt: firestoreServerTimestamp(),
      });
    }

    await batch.commit();

    // Push notifications — one per affected rep (deduplicated)
    const repIds = [
      ...new Set(
        leads.docs
          .map((d) => d.data().dqRep as number | undefined)
          .filter((id): id is number => typeof id === "number"),
      ),
    ];

    const dueByRep = new Map<number, number>();
    for (const doc of leads.docs) {
      const repId = doc.data().dqRep as number | undefined;
      if (repId != null) dueByRep.set(repId, (dueByRep.get(repId) ?? 0) + 1);
    }

    await Promise.allSettled(
      repIds.map((repId) => {
        const count = dueByRep.get(repId) ?? 1;
        return sendNotification(
          repId,
          "Follow-ups Due",
          `You have ${count} follow-up${count === 1 ? "" : "s"} due today.`,
          { link: "/", section: "leads", filter: "follow-up" },
        );
      }),
    );

    console.log(
      `[followUpEngine] date=${today} leads=${leads.size} reps=${repIds.length}`,
    );
  },
);
