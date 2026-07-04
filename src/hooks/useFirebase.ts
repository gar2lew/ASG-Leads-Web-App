/**
 * Custom Firebase Hooks
 *
 * Wraps Firestore operations with React state management:
 * - useLeads()          → real-time leads listener
 * - useSaveLead()       → save/update a lead
 * - useDeleteLead()     → delete a lead
 * - useCreateDeal()     → create a deal document when a lead is booked
 * - useDraps()          → real-time DRAPS listener
 * - useSaveDraps()      → save a DRAPS entry
 * - useDeleteDraps()    → delete a DRAPS entry
 * - useCommissions()    → real-time commissions listener
 * - useSaveCommission() → save a commission entry
 * - useDeleteCommission() → delete a commission entry
 * - useAuditLog()       → real-time audit log listener
 * - useAddAuditEntry()  → add audit log entry
 * - useKnockZones()     → real-time knock zone listener
 * - useSaveKnockZone()  → save a knock zone
 * - useDeleteKnockZone() → delete a knock zone
 * - useAppSettings()    → real-time settings/main doc listener
 * - useSaveSettings()   → merge-write to settings/main
 * - useTrainingSessions() → real-time listener for trainingSessions collection (AI Roleplay)
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  addDoc,
  orderBy,
  query,
  limit,
  startAfter,
  updateDoc,
  increment,
  getDocs,
  getCountFromServer,
  writeBatch,
  getDoc,
  where,
  documentId,
} from "firebase/firestore";
import type { Query, QueryDocumentSnapshot, QuerySnapshot, DocumentData } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAppStore } from "../stores/appStore";
import { useFirebaseAuthUser } from "./useFirebaseAuthUser";
import { DEFAULT_STATUS_COLORS, effectiveRegion } from "../types";
import {
  Lead,
  Rep,
  DrapsEntry,
  CommissionEntry,
  AuditEntry,
  InvoiceDraft,
  KnockZone,
  CustomPinType,
  AppSettings,
  ChatMessage,
  KBArticle,
  LibraryDocument,
  LeadFile,
  FormTemplate,
  DealUpdate,
  ServiceType,
  Appointment,
  LeadNote,
  RoleplaySession,
  DailyStats,
  UserDevice,
  DealDocument,
  DealDocumentType,
} from "../types";
import { deleteFile, uploadFile } from "../lib/storage";
import { reportPendingWrites, reportWriteResult } from "./useNetworkStatus";
import { currentPerthDate, getWorkflowState } from "../lib/workflowState";
import { normalizeDocumentSchema } from "../lib/documentSchema";
import {
  collectPagedSyncIndex,
  isPartialSyncIndex,
  pickSyncLeadIndexFields,
  SYNC_INDEX_BATCH_SIZE,
} from "../lib/sheetsSyncIndex";
import type { SyncLeadIndexEntry } from "../lib/sheetsSyncIndex";
import type { CanonicalLeadStatus } from "../lib/statusConfig";

// Firestore rejects `undefined` field values — strip them before writing (deep: handles nested objects + arrays)
function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [
        k,
        Array.isArray(v)
          ? v.map((item) => (item && typeof item === "object" ? stripUndefined(item as object) : item))
          : v && typeof v === "object"
            ? stripUndefined(v as object)
            : v,
      ]),
  ) as Partial<T>;
}

// ── Leads ─────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 100;
const OPERATIONAL_QUEUE_LIMIT = 500;

const EMPTY_CRM_STATUS_COUNTS: Record<CanonicalLeadStatus, number> = {
  DQ: 0,
  "No Answer": 0,
  Revisit: 0,
  Booked: 0,
  "Not Interested": 0,
  "Wrong Number": 0,
};

const CRM_STATUS_SUMMARY_ALIASES: Record<CanonicalLeadStatus, string[]> = {
  DQ: ["DQ", "dq", "lead", "leads", "new", "new lead", "new leads", "fresh", "Back to DQ", "back to dq"],
  "No Answer": ["No Answer", "no answer", "NA", "na", "No Ans", "no ans", "not answered", "No Reply", "no reply"],
  Revisit: ["Revisit", "revisit", "callback", "Callback", "call back", "cb", "follow up", "followup", "fu"],
  Booked: ["Booked", "booked", "Live", "LIVE", "live", "appointment booked", "Appointment Booked", "booking", "Appointment", "appt"],
  "Not Interested": ["Not Interested", "not interested", "NI", "ni", "not int", "n/i", "lost"],
  "Wrong Number": ["Wrong Number", "wrong number", "WN", "wn", "wrong no", "wrong num"],
};

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function chunks<T>(values: T[], size: number) {
  const output: T[][] = [];
  for (let i = 0; i < values.length; i += size) output.push(values.slice(i, i + size));
  return output;
}

async function countStatusAliases(aliases: string[]) {
  const base = collection(db, "leads");
  const uniqueAliases = uniqueValues(aliases);
  if (uniqueAliases.length === 0) return 0;
  if (uniqueAliases.length === 1) {
    const snap = await getCountFromServer(query(base, where("status", "==", uniqueAliases[0])));
    return snap.data().count;
  }

  const snaps = await Promise.all(
    chunks(uniqueAliases, 10).map((aliasChunk) =>
      getCountFromServer(query(base, where("status", "in", aliasChunk))),
    ),
  );
  return snaps.reduce((sum, snap) => sum + snap.data().count, 0);
}

export function useLeads() {
  const { setLeads: setStoreLeads, activeRegion } = useAppStore();
  const { currentUser, authLoading } = useFirebaseAuthUser();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasPendingWrites, setHasPendingWrites] = useState(false);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const queryRef = useMemo(
    () => query(
      collection(db, "leads"),
      where("region", "==", activeRegion),
      orderBy("updatedAt", "desc"),
      limit(PAGE_SIZE),
    ),
    [activeRegion],
  );
  const isReady = !authLoading && !!currentUser;

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!isReady || !queryRef) {
      setLoading(false);
      return;
    }

    // Reset cursor and hasMore when region changes so loadMore doesn't straddle regions
    setLoading(true);
    setLastDoc(null);
    setHasMore(true);

    const unsub = onSnapshot(
      queryRef,
      (snapshot) => {
        const leadsData = snapshot.docs.map((d) => ({
          id: Number(d.id),
          ...d.data(),
        })) as Lead[];
        // Server-side where("region","==",activeRegion) enforces strict isolation.
        // Client-side pass-through kept as a guard against any snapshot race.
        const filtered = leadsData.filter((l) => l.region === activeRegion);
        setLeads(filtered);
        setStoreLeads(filtered);
        setLoading(false);
        setLastDoc(snapshot.docs[snapshot.docs.length - 1] ?? null);
        setHasMore(snapshot.size === PAGE_SIZE);
        // Phase 5.3 — surface pending-writes (offline queue) via network status
        setHasPendingWrites(snapshot.metadata.hasPendingWrites);
        reportPendingWrites(snapshot.metadata.hasPendingWrites);
      },
      (err) => {
        console.error("[useLeads] Firestore error:", err);
        setError(err.message);
        setLoading(false);
      },
    );

    return () => unsub();
  }, [authLoading, isReady, queryRef, setStoreLeads, activeRegion]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !lastDoc) return;
    setLoadingMore(true);
    try {
      const nextQuery = query(
        collection(db, "leads"),
        where("region", "==", activeRegion),
        orderBy("updatedAt", "desc"),
        startAfter(lastDoc),
        limit(PAGE_SIZE),
      );
      const snapshot = await getDocs(nextQuery);
      setHasMore(snapshot.size === PAGE_SIZE);
      if (snapshot.empty) return;
      const newLeads = snapshot.docs.map((d) => ({
        id: Number(d.id),
        ...d.data(),
      })) as Lead[];
      const filtered = newLeads.filter((l) => l.region === activeRegion);
      setLeads((prev) => {
        const existingIds = new Set(prev.map((l) => l.id));
        const unique = filtered.filter((l) => !existingIds.has(l.id));
        const merged = [...prev, ...unique];
        setStoreLeads(merged);
        return merged;
      });
      setLastDoc(snapshot.docs[snapshot.docs.length - 1] ?? null);
    } catch (err) {
      console.error("[useLeads] loadMore error:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, lastDoc, activeRegion, setStoreLeads]);

  return { leads, loading, error, hasPendingWrites, loadMore, hasMore, loadingMore };
}

export function useFullCrmLeadSyncIndex() {
  const { currentUser, authLoading } = useFirebaseAuthUser();
  const [leads, setLeads] = useState<SyncLeadIndexEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadIndex = useCallback(async () => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!currentUser) {
      setLoading(false);
      setLeads([]);
      setLoadedCount(0);
      setTotalCount(0);
      return;
    }

    setLoading(true);
    setError(null);
    setLeads([]);
    setLoadedCount(0);
    try {
      const base = collection(db, "leads");
      const countSnap = await getCountFromServer(base);
      const count = countSnap.data().count;
      setTotalCount(count);

      const all = await collectPagedSyncIndex<SyncLeadIndexEntry>(
        count,
        async (cursor) => {
          const pageQuery: Query<DocumentData> = cursor
            ? query(
                base,
                orderBy(documentId()),
                startAfter(cursor as QueryDocumentSnapshot<DocumentData>),
                limit(SYNC_INDEX_BATCH_SIZE),
              )
            : query(base, orderBy(documentId()), limit(SYNC_INDEX_BATCH_SIZE));
          const snap: QuerySnapshot<DocumentData> = await getDocs(pageQuery);
          return {
            entries: snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => pickSyncLeadIndexFields(d.id, d.data())),
            nextCursor: snap.docs[snap.docs.length - 1] ?? null,
            done: snap.empty || snap.size < SYNC_INDEX_BATCH_SIZE,
          };
        },
        (nextLoadedCount, entries) => {
          setLeads(entries);
          setLoadedCount(nextLoadedCount);
        },
      );

      setLeads(all);
      setLoadedCount(all.length);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load CRM sync index";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [authLoading, currentUser]);

  useEffect(() => {
    void loadIndex();
  }, [loadIndex]);

  return {
    leads,
    totalCount,
    loadedCount,
    loading,
    error,
    isPartial: isPartialSyncIndex(loadedCount, totalCount),
    progressLabel:
      loading && totalCount > 0 && loadedCount >= totalCount
        ? "Loading CRM sync index complete"
        : totalCount > 0
          ? `Loading CRM sync index ${Math.min(loadedCount, totalCount)}/${totalCount}`
          : "Loading CRM sync index",
    reload: loadIndex,
  };
}

export function useCrmLeadTotalCount() {
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCount = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snap = await getCountFromServer(collection(db, "leads"));
      setTotalCount(snap.data().count);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load CRM lead count");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCount();
  }, [loadCount]);

  return { totalCount, loading, error, reload: loadCount };
}

export function useCrmLeadStatusSummary() {
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [statusCounts, setStatusCounts] = useState<Record<CanonicalLeadStatus, number>>(EMPTY_CRM_STATUS_COUNTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [totalSnap, dq, noAnswer, revisit, booked, notInterested, wrongNumber] = await Promise.all([
        getCountFromServer(collection(db, "leads")),
        countStatusAliases(CRM_STATUS_SUMMARY_ALIASES.DQ),
        countStatusAliases(CRM_STATUS_SUMMARY_ALIASES["No Answer"]),
        countStatusAliases(CRM_STATUS_SUMMARY_ALIASES.Revisit),
        countStatusAliases(CRM_STATUS_SUMMARY_ALIASES.Booked),
        countStatusAliases(CRM_STATUS_SUMMARY_ALIASES["Not Interested"]),
        countStatusAliases(CRM_STATUS_SUMMARY_ALIASES["Wrong Number"]),
      ]);

      setTotalCount(totalSnap.data().count);
      setStatusCounts({
        DQ: dq,
        "No Answer": noAnswer,
        Revisit: revisit,
        Booked: booked,
        "Not Interested": notInterested,
        "Wrong Number": wrongNumber,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load CRM lead status summary");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  return { totalCount, statusCounts, loading, error, reload: loadSummary };
}

export function useSaveLead() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (lead: Lead): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const { activeRegion } = useAppStore.getState();
      const leadWithRegion: Lead = { ...lead, region: lead.region ?? activeRegion, updatedAt: Date.now() };
      await setDoc(doc(db, "leads", String(lead.id)), stripUndefined(leadWithRegion), { merge: true });
      reportWriteResult(true);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Save failed";
      setError(message);
      reportWriteResult(false);
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { save, loading, error };
}

export function useDeleteLead() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async (leadId: number): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const leadDocRef = doc(db, "leads", String(leadId));
      // Delete subcollections first
      const subcollections = ["presence", "files"];
      for (const sub of subcollections) {
        const subSnap = await getDocs(collection(db, "leads", String(leadId), sub));
        if (!subSnap.empty) {
          const batch = writeBatch(db);
          subSnap.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      }
      // Delete the lead document itself
      await deleteDoc(leadDocRef);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Delete failed";
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { remove, loading, error };
}

// ── Create Deal (called when a lead is booked) ────────────────────────────────

export function useCreateDeal() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (params: {
    leadId: number;
    clientName: string;
    assignedTo: number;
    dealValue?: number;
  }): Promise<string | null> => {
    setLoading(true);
    setError(null);
    try {
      const now = Date.now();
      const dealRef = await addDoc(collection(db, "deals"), {
        clientName: params.clientName,
        status: "lead",
        dealValue: params.dealValue ?? 0,
        commissionTotal: 0,
        commissionPaid: 0,
        expectedSettlementDate: "",
        assignedTo: params.assignedTo,
        lastUpdate: now,
        notes: [],
        createdAt: now,
        createdBy: params.clientName,
        leadId: String(params.leadId),
      });

      // Sync guard — write dealId back to the lead document immediately so the
      // lead always points to its deal even if the calling component's onSave fails.
      try {
        await updateDoc(doc(db, "leads", String(params.leadId)), { dealId: dealRef.id });
      } catch (syncErr) {
        // Non-fatal — CallLogger will also write dealId via onSave. Log for visibility.
        console.warn("useCreateDeal: lead↔deal sync write failed (non-fatal)", syncErr);
      }

      return dealRef.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create deal";
      setError(message);
      console.error("useCreateDeal:", err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { create, loading, error };
}

// ── Reps ──────────────────────────────────────────────────────────────────────

/**
 * Syncs the Firestore `reps` collection to the Zustand store.
 * Doc IDs are the string version of the numeric rep.id.
 * Call once in AppShell so credentials (PIN, backupPassword, isSetup) set on
 * any device are immediately available on all other devices.
 */
export function useReps() {
  const { setReps } = useAppStore();
  const { currentUser, authLoading } = useFirebaseAuthUser();

  const queryRef = useMemo(() => collection(db, "reps"), []);
  const isReady = !authLoading && !!currentUser;

  useEffect(() => {
    if (!isReady || !queryRef) return;

    const unsub = onSnapshot(
      queryRef,
      (snapshot) => {
        if (snapshot.empty) return;
        const data = snapshot.docs.map((d) => ({ ...d.data(), id: Number(d.id) })) as Rep[];
        setReps(data);
      },
      (err) => {
        console.error("[useReps] Firestore error:", err);
      },
    );

    return () => unsub();
  }, [isReady, queryRef, setReps]);
}

/** Writes a single rep to Firestore `reps/{id}` (merge). */
export function useSaveRep() {
  const save = async (rep: Rep): Promise<boolean> => {
    try {
      await setDoc(doc(db, "reps", String(rep.id)), stripUndefined(rep), { merge: true });
      return true;
    } catch (err) {
      console.error("useSaveRep:", err);
      return false;
    }
  };
  return { save };
}

/** Deletes a rep from Firestore `reps/{id}`. */
export function useDeleteRep() {
  const remove = async (repId: number): Promise<boolean> => {
    try {
      await deleteDoc(doc(db, "reps", String(repId)));
      return true;
    } catch (err) {
      console.error("useDeleteRep:", err);
      return false;
    }
  };
  return { remove };
}

// ── DRAPS ─────────────────────────────────────────────────────────────────────

export function useDraps() {
  const { currentUser, authLoading } = useFirebaseAuthUser();
  const [entries, setEntries] = useState<DrapsEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const queryRef = useMemo(() => query(collection(db, "draps"), orderBy("date", "desc")), []);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!currentUser || !queryRef) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = onSnapshot(
      queryRef,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ id: Number(d.id), ...d.data() })) as DrapsEntry[];
        setEntries(data);
        setLoading(false);
      },
      (err) => {
        console.error("[useDraps] Firestore error:", err);
        setError(err.message);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [authLoading, currentUser, queryRef]);

  return { entries, loading, error };
}

export function useSaveDraps() {
  const save = async (entry: DrapsEntry): Promise<boolean> => {
    try {
      await setDoc(doc(db, "draps", String(entry.id)), entry);
      return true;
    } catch (err) {
      console.error("Save DRAPS error:", err);
      return false;
    }
  };
  return { save };
}

export function useDeleteDraps() {
  const remove = async (id: number): Promise<boolean> => {
    try {
      await deleteDoc(doc(db, "draps", String(id)));
      return true;
    } catch (err) {
      console.error("Delete DRAPS error:", err);
      return false;
    }
  };
  return { remove };
}

// ── Commissions ───────────────────────────────────────────────────────────────

export function useCommissions() {
  const { currentUser, authLoading } = useFirebaseAuthUser();
  const [entries, setEntries] = useState<CommissionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const queryRef = useMemo(() => query(collection(db, "commissions"), orderBy("createdAt", "desc")), []);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!currentUser || !queryRef) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = onSnapshot(
      queryRef,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as CommissionEntry[];
        setEntries(data);
        setLoading(false);
      },
      (err) => {
        console.error("[useCommissions] Firestore error:", err);
        setError(err.message);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [authLoading, currentUser, queryRef]);

  return { entries, loading, error };
}

export function useSaveCommission() {
  const save = async (entry: CommissionEntry): Promise<boolean> => {
    try {
      // stripUndefined required — Firestore rejects undefined fields
      await setDoc(doc(db, "commissions", entry.id), stripUndefined(entry));
      return true;
    } catch (err) {
      console.error("Save commission error:", err);
      return false;
    }
  };
  return { save };
}

export function useDeleteCommission() {
  const remove = async (id: string): Promise<boolean> => {
    try {
      await deleteDoc(doc(db, "commissions", id));
      return true;
    } catch (err) {
      console.error("Delete commission error:", err);
      return false;
    }
  };
  return { remove };
}

// ── Invoice Drafts ────────────────────────────────────────────────────────────

export function useInvoiceDrafts() {
  const { currentUser, authLoading } = useFirebaseAuthUser();
  const [drafts, setDrafts] = useState<InvoiceDraft[]>([]);
  const [loading, setLoading] = useState(true);

  const queryRef = useMemo(() => query(collection(db, "invoiceDrafts"), orderBy("createdAt", "desc")), []);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!currentUser || !queryRef) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      queryRef,
      (snap) => {
        setDrafts(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as InvoiceDraft[]);
        setLoading(false);
      },
      (err) => {
        console.error("[useInvoiceDrafts] Firestore error:", err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [authLoading, currentUser, queryRef]);

  return { drafts, loading };
}

export function useSaveInvoiceDraft() {
  const save = async (draft: InvoiceDraft): Promise<boolean> => {
    try {
      await setDoc(doc(db, "invoiceDrafts", draft.id), stripUndefined(draft));
      return true;
    } catch (err) {
      console.error("Save invoice draft error:", err);
      return false;
    }
  };
  return { save };
}

export function useDeleteInvoiceDraft() {
  const remove = async (id: string): Promise<boolean> => {
    try {
      await deleteDoc(doc(db, "invoiceDrafts", id));
      return true;
    } catch (err) {
      console.error("Delete invoice draft error:", err);
      return false;
    }
  };
  return { remove };
}

// ── Audit Log ─────────────────────────────────────────────────────────────────

export function useAuditLog(limitCount = 200) {
  const { currentUser, authLoading } = useFirebaseAuthUser();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const queryRef = useMemo(
    () => query(collection(db, "audit"), orderBy("timestamp", "desc"), limit(limitCount)),
    [limitCount],
  );

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!currentUser || !queryRef) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = onSnapshot(
      queryRef,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as AuditEntry[];
        setEntries(data);
        setLoading(false);
      },
      (err) => {
        console.error("[useAuditLog] Firestore error:", err);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [authLoading, currentUser, queryRef]);

  return { entries, loading };
}

export function useAddAuditEntry() {
  const add = async (entry: Omit<AuditEntry, "id">): Promise<void> => {
    try {
      const { activeRegion } = useAppStore.getState();
      await addDoc(collection(db, "audit"), { ...entry, region: activeRegion });
    } catch (err) {
      console.error("Audit log error:", err);
    }
  };
  return { add };
}

// ── Knock Zones ───────────────────────────────────────────────────────────────

export function useKnockZones() {
  const { currentUser, authLoading } = useFirebaseAuthUser();
  const [zones, setZones] = useState<KnockZone[]>([]);
  const [loading, setLoading] = useState(true);

  const queryRef = useMemo(() => query(collection(db, "knockZones"), orderBy("date", "desc")), []);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!currentUser || !queryRef) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = onSnapshot(
      queryRef,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ ...d.data() })) as KnockZone[];
        setZones(data);
        setLoading(false);
      },
      (err) => {
        console.error("[useKnockZones] Firestore error:", err);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [authLoading, currentUser, queryRef]);

  return { zones, loading };
}

export function useSaveKnockZone() {
  const save = async (zone: KnockZone): Promise<boolean> => {
    try {
      await setDoc(doc(db, "knockZones", zone.id), stripUndefined(zone));
      return true;
    } catch (err) {
      console.error("Save knock zone error:", err);
      return false;
    }
  };
  return { save };
}

export function useDeleteKnockZone() {
  const remove = async (id: string): Promise<boolean> => {
    try {
      await deleteDoc(doc(db, "knockZones", id));
      return true;
    } catch (err) {
      console.error("Delete knock zone error:", err);
      return false;
    }
  };
  return { remove };
}

// ── App Settings ──────────────────────────────────────────────────────────────

/** Real-time listener for the single `settings/main` doc */
export function useAppSettings(): { settings: AppSettings | null; loading: boolean } {
  const { currentUser, authLoading } = useFirebaseAuthUser();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const setStatusColors = useAppStore((s) => s.setStatusColors);

  const queryRef = useMemo(() => doc(db, "settings", "main"), []);
  const isReady = !authLoading && !!currentUser;

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!isReady || !queryRef) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = onSnapshot(
      queryRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as AppSettings;
          setSettings(data);
          if (data.statusColors) {
            setStatusColors({ ...DEFAULT_STATUS_COLORS, ...data.statusColors });
          }
        } else {
          setSettings(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error("[useAppSettings] Firestore error on settings/main:", err);
        setSettings(null);
        setLoading(false);
      },
    );

    return () => unsub();
  }, [authLoading, isReady, queryRef, setStatusColors]);

  return { settings, loading };
}

/** Merge-writes partial settings to `settings/main` */
export function useSaveSettings(): { save: (s: Partial<AppSettings>) => Promise<boolean> } {
  const save = async (s: Partial<AppSettings>): Promise<boolean> => {
    try {
      await setDoc(doc(db, "settings", "main"), stripUndefined(s), { merge: true });
      reportWriteResult(true);
      return true;
    } catch (err) {
      console.error("Save settings error:", err);
      reportWriteResult(false);
      return false;
    }
  };
  return { save };
}

// ── Custom Pin Types ──────────────────────────────────────────────────────────

export function useCustomPinTypes() {
  const { currentUser, authLoading } = useFirebaseAuthUser();
  const [customPinTypes, setCustomPinTypes] = useState<CustomPinType[]>([]);
  const [loading, setLoading] = useState(true);

  const queryRef = useMemo(() => query(collection(db, "customPinTypes"), orderBy("createdAt", "asc")), []);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!currentUser || !queryRef) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = onSnapshot(
      queryRef,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ ...d.data() })) as CustomPinType[];
        setCustomPinTypes(data);
        setLoading(false);
      },
      (err) => {
        console.error("[useCustomPinTypes] Firestore error:", err);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [authLoading, currentUser, queryRef]);

  return { customPinTypes, loading };
}

export function useSaveCustomPinType() {
  const save = async (pin: CustomPinType): Promise<boolean> => {
    try {
      await setDoc(doc(db, "customPinTypes", pin.id), stripUndefined(pin));
      return true;
    } catch (err) {
      console.error("Save custom pin type error:", err);
      return false;
    }
  };
  return { save };
}

export function useDeleteCustomPinType() {
  const remove = async (id: string): Promise<boolean> => {
    try {
      await deleteDoc(doc(db, "customPinTypes", id));
      return true;
    } catch (err) {
      console.error("Delete custom pin type error:", err);
      return false;
    }
  };
  return { remove };
}

// ── Team Chat ─────────────────────────────────────────────────────────────────

/** Real-time listener for the group chat channel (latest 150 messages, oldest first) */
export function useTeamChat(): { messages: ChatMessage[]; loading: boolean } {
  const { currentUser, authLoading } = useFirebaseAuthUser();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const queryRef = useMemo(
    () => query(collection(db, "teamChat"), orderBy("timestamp", "asc"), limit(150)),
    [],
  );

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!currentUser || !queryRef) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = onSnapshot(
      queryRef,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as ChatMessage[];
        setMessages(data);
        setLoading(false);
      },
      (err) => {
        console.error("Team chat error:", err);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [authLoading, currentUser, queryRef]);

  return { messages, loading };
}

/** Send a message to the group chat */
export function useSendChatMessage(): { send: (msg: Omit<ChatMessage, "id">) => Promise<void> } {
  const send = async (msg: Omit<ChatMessage, "id">): Promise<void> => {
    try {
      await addDoc(collection(db, "teamChat"), msg);
    } catch (err) {
      console.error("Send chat message error:", err);
    }
  };
  return { send };
}

/** Real-time listener for a DM channel sub-collection (latest 150 messages, oldest first) */
export function useDirectMessages(channelId: string): { messages: ChatMessage[]; loading: boolean } {
  const { currentUser, authLoading } = useFirebaseAuthUser();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const queryRef = useMemo(() => {
    if (!channelId) return null;
    return query(collection(db, "dmChannels", channelId, "messages"), orderBy("timestamp", "asc"), limit(150));
  }, [channelId]);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!currentUser || !queryRef) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = onSnapshot(
      queryRef,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as ChatMessage[];
        setMessages(data);
        setLoading(false);
      },
      (err) => {
        console.error("DM channel error:", err);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [authLoading, currentUser, queryRef]);

  return { messages, loading };
}

/** Send a message to a specific DM channel */
export function useSendDirectMessage(): { send: (channelId: string, msg: Omit<ChatMessage, "id">) => Promise<void> } {
  const send = async (channelId: string, msg: Omit<ChatMessage, "id">): Promise<void> => {
    try {
      await addDoc(collection(db, "dmChannels", channelId, "messages"), msg);
    } catch (err) {
      console.error("Send DM error:", err);
    }
  };
  return { send };
}

/** Toggle an emoji reaction on a group chat or DM message */
export function useToggleReaction() {
  const toggle = useCallback(
    async (messageId: string, emoji: string, repId: number, isDm: boolean, dmChannelId?: string): Promise<void> => {
      let msgRef;
      if (isDm && dmChannelId) {
        msgRef = doc(db, "dmChannels", dmChannelId, "messages", messageId);
      } else {
        msgRef = doc(db, "teamChat", messageId);
      }
      const snap = await getDoc(msgRef);
      if (!snap.exists()) return;
      const reactions: Record<string, number[]> = (snap.data()?.reactions as Record<string, number[]>) ?? {};
      const existing = reactions[emoji] ?? [];
      const alreadyReacted = existing.includes(repId);
      const updated = alreadyReacted ? existing.filter((id) => id !== repId) : [...existing, repId];
      if (updated.length === 0) {
        const { [emoji]: _removed, ...rest } = reactions;
        await updateDoc(msgRef, { reactions: rest });
      } else {
        await updateDoc(msgRef, { [`reactions.${emoji}`]: updated });
      }
    },
    [],
  );
  return { toggle };
}

// ── Knowledge Base hooks ────────────────────────────────────────────────────

export function useKBArticles(): { articles: KBArticle[]; loading: boolean } {
  const { currentUser, authLoading } = useFirebaseAuthUser();
  const [articles, setArticles] = useState<KBArticle[]>([]);
  const [loading, setLoading] = useState(true);

  // Single-field orderBy avoids needing a composite Firestore index.
  // Pinned-first sort is done client-side after the snapshot arrives.
  const queryRef = useMemo(() => query(collection(db, "knowledgeBase"), orderBy("createdAt", "desc")), []);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!currentUser || !queryRef) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      queryRef,
      (snap) => {
        const raw = snap.docs.map((d) => ({ ...d.data(), id: d.id }) as KBArticle);
        // Sort: pinned first, then by createdAt desc
        raw.sort((a, b) => {
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
          return b.createdAt - a.createdAt;
        });
        setArticles(raw);
        setLoading(false);
      },
      (err) => {
        console.error("[useKBArticles] Firestore error on knowledgeBase:", err);
        setArticles([]);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [authLoading, currentUser, queryRef]);

  return { articles, loading };
}

export function useSaveKBArticle(): { save: (article: KBArticle) => Promise<boolean> } {
  const save = async (article: KBArticle): Promise<boolean> => {
    try {
      await setDoc(doc(db, "knowledgeBase", article.id), stripUndefined(article), { merge: true });
      return true;
    } catch {
      return false;
    }
  };
  return { save };
}

export function useDeleteKBArticle(): { remove: (id: string) => Promise<boolean> } {
  const remove = async (id: string): Promise<boolean> => {
    try {
      await deleteDoc(doc(db, "knowledgeBase", id));
      return true;
    } catch {
      return false;
    }
  };
  return { remove };
}

export function useIncrementKBViews(): { increment: (id: string) => Promise<void> } {
  const incrementViews = async (id: string): Promise<void> => {
    try {
      await updateDoc(doc(db, "knowledgeBase", id), { views: increment(1) });
    } catch {
      /* ignore */
    }
  };
  return { increment: incrementViews };
}

// ── Document Library hooks ──────────────────────────────────────────────────

export function useDocumentLibrary(): { documents: LibraryDocument[]; loading: boolean } {
  const { currentUser, authLoading } = useFirebaseAuthUser();
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const queryRef = useMemo(() => query(collection(db, "documentLibrary"), orderBy("uploadedAt", "desc")), []);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!currentUser || !queryRef) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      queryRef,
      (snap) => {
        const raw = snap.docs.map((d) => ({ ...d.data(), id: d.id }) as LibraryDocument);
        // Respect explicit sortOrder when any item has it set; otherwise keep uploadedAt desc
        const hasSortOrder = raw.some((d) => d.sortOrder !== undefined);
        if (hasSortOrder) {
          raw.sort((a, b) => {
            const ao = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
            const bo = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
            return ao !== bo ? ao - bo : (b.uploadedAt ?? 0) - (a.uploadedAt ?? 0);
          });
        }
        setDocuments(raw);
        setLoading(false);
      },
      (err) => {
        console.error("[useDocumentLibrary] Firestore error:", err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [authLoading, currentUser, queryRef]);

  return { documents, loading };
}

export function useSaveLibraryDocument(): { save: (doc_: LibraryDocument) => Promise<boolean> } {
  const save = async (doc_: LibraryDocument): Promise<boolean> => {
    try {
      await setDoc(doc(db, "documentLibrary", doc_.id), stripUndefined(doc_), { merge: true });
      return true;
    } catch {
      return false;
    }
  };
  return { save };
}

export function useDeleteLibraryDocument(): { remove: (doc_: LibraryDocument) => Promise<boolean> } {
  const remove = async (doc_: LibraryDocument): Promise<boolean> => {
    try {
      await deleteDoc(doc(db, "documentLibrary", doc_.id));
      if (doc_.storagePath) await deleteFile(doc_.storagePath);
      return true;
    } catch {
      return false;
    }
  };
  return { remove };
}

// ── Lead File hooks ─────────────────────────────────────────────────────────

export function useLeadFiles(leadId: string): { files: LeadFile[]; loading: boolean } {
  const { currentUser, authLoading } = useFirebaseAuthUser();
  const [files, setFiles] = useState<LeadFile[]>([]);
  const [loading, setLoading] = useState(true);

  const queryRef = useMemo(() => {
    if (!leadId) return null;
    return query(collection(db, "leads", leadId, "files"), orderBy("uploadedAt", "desc"));
  }, [leadId]);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!currentUser || !queryRef) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      queryRef,
      (snap) => {
        setFiles(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as LeadFile));
        setLoading(false);
      },
      (err) => {
        console.error("[useLeadFiles] Firestore error:", err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [authLoading, currentUser, queryRef]);

  return { files, loading };
}

export function useDeleteLeadFile(): { remove: (leadId: string, file: LeadFile) => Promise<boolean> } {
  const remove = async (leadId: string, file: LeadFile): Promise<boolean> => {
    try {
      await deleteDoc(doc(db, "leads", leadId, "files", file.id));
      if (file.storagePath) await deleteFile(file.storagePath);
      return true;
    } catch {
      return false;
    }
  };
  return { remove };
}

// ── Form Template hooks ──────────────────────────────────────────────────────

export function useFormTemplates(): { templates: FormTemplate[]; loading: boolean } {
  const { currentUser, authLoading } = useFirebaseAuthUser();
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const queryRef = useMemo(() => query(collection(db, "formTemplates"), orderBy("createdAt", "desc")), []);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!currentUser || !queryRef) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      queryRef,
      (snap) => {
        const raw = snap.docs.map((d) => {
          const template = { ...d.data(), id: d.id } as FormTemplate;
          return { ...template, schema: normalizeDocumentSchema(template) };
        });
        // Respect explicit sortOrder when any item has it set; otherwise keep createdAt desc
        const hasSortOrder = raw.some((t) => t.sortOrder !== undefined);
        if (hasSortOrder) {
          raw.sort((a, b) => {
            const ao = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
            const bo = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
            return ao !== bo ? ao - bo : (b.createdAt ?? 0) - (a.createdAt ?? 0);
          });
        }
        setTemplates(raw);
        setLoading(false);
      },
      (err) => {
        console.error("[useFormTemplates] Firestore error:", err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [authLoading, currentUser, queryRef]);

  return { templates, loading };
}

export function useSaveFormTemplate(): { save: (t: FormTemplate) => Promise<boolean> } {
  const save = async (t: FormTemplate): Promise<boolean> => {
    try {
      const template = { ...t, schema: normalizeDocumentSchema(t) };
      await setDoc(doc(db, "formTemplates", template.id), stripUndefined(template), { merge: true });
      return true;
    } catch {
      return false;
    }
  };
  return { save };
}

export function useDeleteFormTemplate(): { remove: (id: string) => Promise<boolean> } {
  const remove = async (id: string): Promise<boolean> => {
    try {
      await deleteDoc(doc(db, "formTemplates", id));
      return true;
    } catch {
      return false;
    }
  };
  return { remove };
}

// ── Deal Update hooks (per-lead message board) ────────────────────────────────

export function useDealUpdates(leadId: number | null): { updates: DealUpdate[]; loading: boolean } {
  const { currentUser, authLoading } = useFirebaseAuthUser();
  const [updates, setUpdates] = useState<DealUpdate[]>([]);
  const [loading, setLoading] = useState(true);

  const queryRef = useMemo(() => {
    if (!leadId) return null;
    return query(collection(db, "leads", String(leadId), "dealUpdates"), orderBy("timestamp", "asc"));
  }, [leadId]);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!currentUser || !queryRef) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      queryRef,
      (snap) => {
        setUpdates(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as DealUpdate));
        setLoading(false);
      },
      (err) => {
        console.error("[useDealUpdates] Firestore error:", err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [authLoading, currentUser, queryRef]);

  return { updates, loading };
}

export function useAddDealUpdate(): { add: (leadId: number, update: Omit<DealUpdate, "id">) => Promise<boolean> } {
  const add = async (leadId: number, update: Omit<DealUpdate, "id">): Promise<boolean> => {
    try {
      await addDoc(collection(db, "leads", String(leadId), "dealUpdates"), stripUndefined(update as object));
      return true;
    } catch (e) {
      console.error("addDealUpdate failed", e);
      return false;
    }
  };
  return { add };
}

// ── Calendar: Service Types ─────────────────────────────────────────────────

export function useServiceTypes(): { serviceTypes: ServiceType[]; loading: boolean } {
  const { currentUser, authLoading } = useFirebaseAuthUser();
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [loading, setLoading] = useState(true);

  const queryRef = useMemo(() => query(collection(db, "calendarServiceTypes"), orderBy("sortOrder", "asc")), []);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!currentUser || !queryRef) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      queryRef,
      (snap) => {
        const raw = snap.docs.map((d) => ({ ...d.data(), id: d.id }) as ServiceType);
        // Client-side sort fallback in case sortOrder is missing on some docs
        raw.sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
        setServiceTypes(raw);
        setLoading(false);
      },
      (err) => {
        console.error("[useServiceTypes] Firestore error on calendarServiceTypes:", err);
        setServiceTypes([]);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [authLoading, currentUser, queryRef]);

  return { serviceTypes, loading };
}

export function useSaveServiceType(): { save: (st: ServiceType) => Promise<boolean> } {
  const save = async (st: ServiceType): Promise<boolean> => {
    try {
      await setDoc(doc(db, "calendarServiceTypes", st.id), stripUndefined(st), { merge: true });
      return true;
    } catch (e) {
      console.error("useSaveServiceType error:", e);
      return false;
    }
  };
  return { save };
}

export function useDeleteServiceType(): { remove: (id: string) => Promise<boolean> } {
  const remove = async (id: string): Promise<boolean> => {
    try {
      await deleteDoc(doc(db, "calendarServiceTypes", id));
      return true;
    } catch (e) {
      console.error("useDeleteServiceType error:", e);
      return false;
    }
  };
  return { remove };
}

// ── Calendar: Appointments ──────────────────────────────────────────────────

export function useAppointments(dateRange?: { from: string; to: string }): {
  appointments: Appointment[];
  loading: boolean;
} {
  const { currentUser, authLoading } = useFirebaseAuthUser();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  // Default: today → today + 59 days
  const today = new Date().toISOString().split("T")[0];
  const defaultTo = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 59);
    return d.toISOString().split("T")[0];
  })();

  const from = dateRange?.from ?? today;
  const to = dateRange?.to ?? defaultTo;

  // Order by date + startTime; client-side date range filter avoids
  // complex Firestore range query composite index requirements
  const queryRef = useMemo(
    () => query(collection(db, "appointments"), orderBy("date", "asc"), orderBy("startTime", "asc")),
    [],
  );

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!currentUser || !queryRef) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      queryRef,
      (snap) => {
        const all = snap.docs.map((d) => ({ ...d.data(), id: d.id }) as Appointment);
        setAppointments(all.filter((a) => a.date >= from && a.date <= to));
        setLoading(false);
      },
      (err) => {
        console.error("[useAppointments] Firestore error on appointments:", err);
        setAppointments([]);
        setLoading(false);
      },
    );
    return () => unsub();

  }, [authLoading, currentUser, queryRef, from, to]);

  return { appointments, loading };
}

export function useSaveAppointment(): { save: (appt: Appointment) => Promise<boolean> } {
  const save = async (appt: Appointment): Promise<boolean> => {
    try {
      await setDoc(doc(db, "appointments", appt.id), stripUndefined(appt), { merge: true });
      return true;
    } catch (e) {
      console.error("useSaveAppointment error:", e);
      return false;
    }
  };
  return { save };
}

export function useDeleteAppointment(): { remove: (id: string) => Promise<boolean> } {
  const remove = async (id: string): Promise<boolean> => {
    try {
      await deleteDoc(doc(db, "appointments", id));
      return true;
    } catch (e) {
      console.error("useDeleteAppointment error:", e);
      return false;
    }
  };
  return { remove };
}

// ── Lead Notes (subcollection: leads/{leadId}/notes) ──────────────────────────

/**
 * Real-time listener for a lead's note subcollection.
 * Returns notes sorted newest-first (orderBy createdAt desc).
 */
export function useLeadNotes(leadId: string): { notes: LeadNote[]; loading: boolean } {
  const { currentUser, authLoading } = useFirebaseAuthUser();
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [loading, setLoading] = useState(true);

  const queryRef = useMemo(() => {
    if (!leadId) return null;
    return query(collection(db, "leads", leadId, "notes"), orderBy("createdAt", "desc"));
  }, [leadId]);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!currentUser || !queryRef) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      queryRef,
      (snap) => {
        setNotes(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as LeadNote));
        setLoading(false);
      },
      (err) => {
        console.error("useLeadNotes error:", err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [authLoading, currentUser, queryRef]);

  return { notes, loading };
}

/** Adds a new note document to leads/{leadId}/notes */
export function useAddLeadNote(): { add: (leadId: string, note: Omit<LeadNote, "id">) => Promise<boolean> } {
  const add = async (leadId: string, note: Omit<LeadNote, "id">): Promise<boolean> => {
    try {
      await addDoc(collection(db, "leads", leadId, "notes"), note);
      return true;
    } catch (e) {
      console.error("useAddLeadNote error:", e);
      return false;
    }
  };
  return { add };
}

/** Deletes a single note from leads/{leadId}/notes/{noteId} */
export function useDeleteLeadNote(): { remove: (leadId: string, noteId: string) => Promise<boolean> } {
  const remove = async (leadId: string, noteId: string): Promise<boolean> => {
    try {
      await deleteDoc(doc(db, "leads", leadId, "notes", noteId));
      return true;
    } catch (e) {
      console.error("useDeleteLeadNote error:", e);
      return false;
    }
  };
  return { remove };
}

// ── Lead-linked Appointments ──────────────────────────────────────────────────

/**
 * Real-time listener for all appointments linked to a specific lead.
 * Queries appointments where linkedLeadId === leadId.
 * Results are sorted client-side by date → startTime (ascending).
 */
export function useLeadAppointments(leadId: number | null): { appointments: Appointment[]; loading: boolean } {
  const { currentUser, authLoading } = useFirebaseAuthUser();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  const queryRef = useMemo(() => {
    if (!leadId) return null;
    return query(collection(db, "appointments"), where("linkedLeadId", "==", leadId));
  }, [leadId]);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!currentUser || !queryRef) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      queryRef,
      (snap) => {
        const data = snap.docs.map((d) => ({ ...d.data(), id: d.id }) as Appointment);
        // Sort: soonest first
        data.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
        setAppointments(data);
        setLoading(false);
      },
      (err) => {
        console.error("useLeadAppointments error:", err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [authLoading, currentUser, queryRef]);

  return { appointments, loading };
}

// ── Training Sessions (AI Roleplay) ──────────────────────────────────────────

/**
 * useTrainingSessions — real-time listener for the `trainingSessions` Firestore collection.
 *
 * Pass `repId` to scope results to a single rep.
 * Pass `null` to get all sessions (admin view).
 * Sessions are returned newest-first (sorted by completedAt desc).
 */
export function useTrainingSessions(repId: number | null): {
  sessions: RoleplaySession[];
  loading: boolean;
} {
  const { currentUser, authLoading } = useFirebaseAuthUser();
  const [sessions, setSessions] = useState<RoleplaySession[]>([]);
  const [loading, setLoading] = useState(true);

  // repId filter — new sessions write numeric `repId`; legacy sessions wrote string `userId`.
  // We query by repId (numeric) here; the RoleplayDashboard falls back to userId matching client-side if needed.
  const queryRef = useMemo(() => {
    if (repId !== null) {
      return query(
        collection(db, "trainingSessions"),
        where("repId", "==", repId),
        orderBy("completedAt", "desc"),
        limit(200),
      );
    }
    return query(collection(db, "trainingSessions"), orderBy("completedAt", "desc"), limit(500));
  }, [repId]);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!currentUser || !queryRef) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      queryRef,
      (snap) => {
        const data = snap.docs.map((d) => ({ ...d.data(), id: d.id }) as RoleplaySession);
        setSessions(data);
        setLoading(false);
      },
      (err) => {
        console.error("useTrainingSessions error:", err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [authLoading, currentUser, queryRef]);

  return { sessions, loading };
}

// ── Deals (read-only list, used by RepDashboard) ──────────────────────────────

export interface Deal {
  id: string;
  leadId?: string;
  clientName: string;
  status: "lead" | "conditional" | "unconditional" | "settled" | "lost";
  dealValue: number;
  commissionTotal: number;
  commissionPaid: number;
  expectedSettlementDate: string;
  contractSignedDate?: string;
  financeApprovedDate?: string;
  assignedTo: number; // rep id
  lastUpdate: number;
  createdAt: number;
  createdBy: string;
  notes: DealNote[];
}

export function useOperationalQueueLeads() {
  const { activeRegion } = useAppStore();
  const { currentUser, authLoading } = useFirebaseAuthUser();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  const isReady = !authLoading && !!currentUser;

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!isReady) {
      setLoading(false);
      setLeads([]);
      return;
    }

    const today = currentPerthDate();
    const staleCutoff = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const byQuery: Array<Lead[]> = [[], [], [], []];
    const seenSnapshots = new Set<number>();
    const queries = [
      query(collection(db, "leads"), where("callbackDate", "<=", today), orderBy("callbackDate", "asc"), limit(OPERATIONAL_QUEUE_LIMIT)),
      query(collection(db, "leads"), where("nextContactDate", "<=", today), orderBy("nextContactDate", "asc"), limit(OPERATIONAL_QUEUE_LIMIT)),
      query(collection(db, "leads"), where("lastCall", "<=", staleCutoff), orderBy("lastCall", "asc"), limit(OPERATIONAL_QUEUE_LIMIT)),
      query(collection(db, "leads"), where("status", "in", ["new", "DQ", "No Answer"]), orderBy("leadDate", "desc"), limit(OPERATIONAL_QUEUE_LIMIT)),
    ];

    setLoading(true);
    setError(null);
    setTruncated(false);

    const publish = () => {
      const byId = new Map<number, Lead>();
      let anyTruncated = false;
      byQuery.forEach((items) => {
        if (items.length >= OPERATIONAL_QUEUE_LIMIT) anyTruncated = true;
        items.forEach((lead) => {
          if (effectiveRegion(lead.region) === activeRegion && getWorkflowState(lead).isActionable) {
            byId.set(lead.id, lead);
          }
        });
      });
      setLeads(Array.from(byId.values()));
      setTruncated(anyTruncated);
      if (seenSnapshots.size === queries.length) setLoading(false);
    };

    const unsubs = queries.map((q, index) =>
      onSnapshot(
        q,
        (snapshot) => {
          seenSnapshots.add(index);
          byQuery[index] = snapshot.docs.map((d) => ({
            id: Number(d.id),
            ...d.data(),
          })) as Lead[];
          publish();
        },
        (err) => {
          console.error("[useOperationalQueueLeads] Firestore error:", err);
          setError(err instanceof Error ? err.message : "Failed to load operational queue");
          setLoading(false);
        },
      ),
    );

    return () => unsubs.forEach((unsub) => unsub());
  }, [activeRegion, authLoading, isReady, currentUser]);

  return { leads, loading, error, truncated };
}

export interface DealNote {
  id: string;
  text: string;
  createdAt: number;
  createdBy: string;
  createdById: number;
}

/**
 * useDeals — Real-time listener for the `deals` collection.
 *
 * Query strategy:
 *  1. Try scoped query: where("assignedTo", "==", repId) + orderBy
 *  2. If that fails (permissions/index): state flips useFallback → basic query takes over
 *  3. Exactly ONE listener is active at any time — cleanup runs before the next attach
 *
 * useFallback persists until the component unmounts, which is correct:
 * if the index is missing, all scoped queries will fail anyway.
 */
export function useDeals(repId: number | null = null): {
  deals: Deal[];
  loading: boolean;
  error: string | null;
} {
  const { currentUser, authLoading } = useFirebaseAuthUser();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [useFallback, setUseFallback] = useState(false);

  const queryRef = useMemo(() => {
    if (repId != null && (typeof repId !== "number" || isNaN(repId))) return null;
    const base = collection(db, "deals");
    if (repId != null && !useFallback) {
      console.log("[useDeals] Building scoped query: assignedTo ==", repId);
      return query(base, where("assignedTo", "==", repId), orderBy("createdAt", "desc"), limit(50));
    }
    console.log("[useDeals] Building basic query (no where filter)");
    return query(base, orderBy("createdAt", "desc"), limit(50));
  }, [repId, useFallback]);

  useEffect(() => {
    if (repId != null && (typeof repId !== "number" || isNaN(repId))) {
      console.error("[useDeals] Invalid repId:", repId, typeof repId);
      setError("Invalid user context — repId is not a valid number.");
      setLoading(false);
      return;
    }

    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!currentUser || !queryRef) {
      setLoading(false);
      return;
    }

    setLoading(true);
    console.log("[useDeals] Attaching onSnapshot listener");

    const handleSnapshot = (snap: import("firebase/firestore").QuerySnapshot) => {
      console.log("[useDeals] Snapshot received — doc count:", snap.docs.length);
      const loaded: Deal[] = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data && typeof data === "object" && "clientName" in data) {
          loaded.push({ id: d.id, ...(data as Omit<Deal, "id">) });
        } else {
          console.warn("[useDeals] Skipping invalid deal document:", d.id, data);
        }
      });
      setDeals(loaded);
      setError(useFallback ? "Unable to apply rep filter — showing all deals." : null);
      setLoading(false);
    };

    const handleError = (err: unknown) => {
      const code = (err as { code?: string })?.code;
      const message = (err as { message?: string })?.message || "unknown error";
      console.error("[useDeals] Query error — code:", code, "message:", message);

      // Scoped query failed — flip to fallback (triggers queryRef recalc → new effect run)
      if (!useFallback && repId != null) {
        console.warn("[useDeals] Switching to basic query fallback");
        setUseFallback(true);
        return;
      }

      // Basic query also failed
      if (code === "permission-denied") {
        setError("You do not have permission to view deals.");
      } else if (code === "failed-precondition") {
        setError("A required Firestore index is missing. Check the console for details.");
      } else if (code === "unavailable") {
        setError("Firestore is currently unavailable. Check your connection.");
      } else {
        setError(message);
      }
      setLoading(false);
    };

    const unsub = onSnapshot(queryRef, handleSnapshot, handleError);

    return () => {
      unsub();
      console.log("[useDeals] onSnapshot listener cleaned up");
    };
  }, [authLoading, currentUser, queryRef, repId, useFallback]);

  return { deals, loading, error };
}

// ── User Devices (FCM token store) ───────────────────────────────────────────

/**
 * useUserDevices — Real-time listener for a user's registered FCM devices.
 * Used by the notification system to display which devices are registered.
 */
export function useUserDevices(userId: number | null): {
  devices: UserDevice[];
  loading: boolean;
} {
  const { currentUser, authLoading } = useFirebaseAuthUser();
  const [devices, setDevices] = useState<UserDevice[]>([]);
  const [loading, setLoading] = useState(true);

  const queryRef = useMemo(() => {
    if (userId == null) return null;
    return query(collection(db, "userDevices"), where("userId", "==", userId));
  }, [userId]);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!currentUser || !queryRef) {
      setDevices([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      queryRef,
      (snap) => {
        setDevices(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as UserDevice));
        setLoading(false);
      },
      (err) => {
        console.error("[useUserDevices] Firestore error:", err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [authLoading, currentUser, queryRef]);

  return { devices, loading };
}

// ── Daily Stats ───────────────────────────────────────────────────────────────

/**
 * useDailyStatsFirebase — Real-time listener for the `dailyStats` collection.
 * Complements useDailyStats.ts (which has richer query options).
 * This lightweight version is used in DailyReportDashboard for a date-scoped view.
 */
export function useDailyStatsFirebase(date: string): {
  stats: DailyStats[];
  loading: boolean;
} {
  const { currentUser, authLoading } = useFirebaseAuthUser();
  const [stats, setStats] = useState<DailyStats[]>([]);
  const [loading, setLoading] = useState(true);

  const queryRef = useMemo(() => {
    if (!date) return null;
    return query(collection(db, "dailyStats"), where("date", "==", date), orderBy("repName", "asc"));
  }, [date]);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!currentUser || !queryRef) {
      setStats([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      queryRef,
      (snap) => {
        setStats(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DailyStats));
        setLoading(false);
      },
      (err) => {
        console.error("[useDailyStatsFirebase] Firestore error:", err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [authLoading, currentUser, queryRef]);

  return { stats, loading };
}

// ── Deal Documents ────────────────────────────────────────────────────────────

/** Allowed file types for deal documents */
const ALLOWED_DOC_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

/** Max file size: 10 MB */
const MAX_DOC_SIZE = 10 * 1024 * 1024;

/** Validate a file before upload. Returns error message or null if valid. */
function validateDealFile(file: File): string | null {
  if (file.size > MAX_DOC_SIZE) {
    return "File too large. Maximum size is 10 MB.";
  }
  if (!ALLOWED_DOC_TYPES.includes(file.type)) {
    return "Invalid file type. Only PDF, PNG, JPG, DOC, and DOCX files are allowed.";
  }
  return null;
}

export type DealDocumentUploadResult = { success: true } | { success: false; error: string };

/**
 * useDealDocuments — Real-time listener for deal-scoped documents.
 * Returns documents list, loading state, upload and delete functions.
 * Documents are stored in Firestore collection `dealDocuments` and
 * files in Firebase Storage at `/deals/{dealId}/{fileName}`.
 */
export function useDealDocuments(dealId: string) {
  const { currentUser: firebaseUser, authLoading } = useFirebaseAuthUser();
  const [documents, setDocuments] = useState<DealDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { currentUser } = useAppStore();

  const queryRef = useMemo(() => {
    if (!dealId) return null;
    return query(collection(db, "dealDocuments"), where("dealId", "==", dealId), orderBy("createdAt", "desc"));
  }, [dealId]);

  // Real-time listener
  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!firebaseUser || !queryRef) {
      setDocuments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      queryRef,
      (snap) => {
        const loaded: DealDocument[] = [];
        snap.forEach((d) => {
          const data = d.data() as Omit<DealDocument, "id">;
          // Skip documents missing required fileUrl
          if (data && data.fileUrl) {
            loaded.push({ id: d.id, ...data });
          }
        });
        setDocuments(loaded);
        setLoading(false);
      },
      (err) => {
        console.error("[useDealDocuments] Firestore error:", err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [authLoading, firebaseUser, queryRef]);

  const uploadDocument = useCallback(
    async (file: File, docType: DealDocumentType, clientId?: string): Promise<DealDocumentUploadResult> => {
      if (!dealId || !currentUser) {
        return { success: false, error: "No deal or user context available." };
      }

      // Validate file before attempting upload
      const validationError = validateDealFile(file);
      if (validationError) {
        return { success: false, error: validationError };
      }

      setUploading(true);
      let uploadedStoragePath: string | null = null;

      try {
        // Sanitise filename
        const sanitised = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `deals/${dealId}/${Date.now()}_${sanitised}`;

        // Upload to Firebase Storage
        const downloadUrl = await uploadFile(storagePath, file);
        uploadedStoragePath = storagePath;

        // Save metadata to Firestore
        await addDoc(collection(db, "dealDocuments"), {
          dealId,
          clientId: clientId || "",
          name: file.name,
          type: docType,
          fileUrl: downloadUrl,
          storagePath,
          fileType: file.type || "application/octet-stream",
          fileSize: file.size,
          uploadedBy: currentUser.name || "Unknown",
          createdAt: Date.now(),
        });

        return { success: true };
      } catch (err) {
        console.error("[useDealDocuments] Upload failed:", err);

        // Rollback: if storage upload succeeded but firestore failed, delete the storage file
        if (uploadedStoragePath) {
          try {
            await deleteFile(uploadedStoragePath);
          } catch (rollbackErr) {
            console.error("[useDealDocuments] Rollback delete failed:", rollbackErr);
          }
        }

        const message = (err as Error)?.message || "Unknown error during upload.";
        return { success: false, error: message };
      } finally {
        setUploading(false);
      }
    },
    [dealId, currentUser],
  );

  const deleteDocument = useCallback(async (dealDoc: DealDocument): Promise<{ success: boolean; error?: string }> => {
    try {
      // Delete from Storage first
      if (dealDoc.storagePath) {
        try {
          await deleteFile(dealDoc.storagePath);
        } catch {
          // Storage file may already be deleted — continue to remove Firestore doc
        }
      }
      // Delete Firestore document
      await deleteDoc(doc(db, "dealDocuments", dealDoc.id));
      return { success: true };
    } catch (err) {
      console.error("[useDealDocuments] Delete failed:", err);
      return { success: false, error: (err as Error)?.message || "Failed to delete document." };
    }
  }, []);

  return { documents, loading, uploading, deletingId, uploadDocument, deleteDocument, setDeletingId };
}

// ── Client Deal Documents (by clientId) ───────────────────────────────────────

export interface LinkedDocument {
  id: string;
  name: string;
  type: string;
  fileUrl: string;
  storagePath?: string;
  createdAt: number;
  clientId?: string;
}

/**
 * useClientDealDocuments — Real-time listener for all deal documents linked to a client.
 * Queries `dealDocuments` where clientId matches. No orderBy to avoid composite index requirements.
 */
export function useClientDealDocuments(clientId: string | number | null): {
  documents: LinkedDocument[];
  loading: boolean;
} {
  const { currentUser, authLoading } = useFirebaseAuthUser();
  const [documents, setDocuments] = useState<LinkedDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const queryRef = useMemo(() => {
    if (clientId === null) return null;
    return query(collection(db, "dealDocuments"), where("clientId", "==", String(clientId)));
  }, [clientId]);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!currentUser || !queryRef) {
      setDocuments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      queryRef,
      (snap) => {
        setDocuments(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as LinkedDocument));
        setLoading(false);
      },
      (err) => {
        console.error("useClientDealDocuments error:", err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [authLoading, currentUser, queryRef]);

  return { documents, loading };
}


