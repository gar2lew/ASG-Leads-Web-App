/**
 * useDailyStats.ts — Hook for the dailyStats Firestore collection
 *
 * Provides real-time snapshot of aggregated daily performance data per rep.
 * Collection: dailyStats
 * Document shape: DailyStats (see types/index.ts)
 */

import { useState, useEffect } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  QueryConstraint,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { handleError } from "../lib/errorHandler";
import { useFirebaseAuthUser } from "./useFirebaseAuthUser";

// ── DailyStats type (also exported for external consumers) ────────────────────

export interface DailyStats {
  id?: string;
  repId: number;
  repName: string;
  date: string; // "YYYY-MM-DD"
  metrics: {
    calls: number;
    appointments: number;
    dealsCreated: number;
    dealsClosed: number;
    commissionEarned: number;
    trainingSessions: number;
    avgTrainingScore: number;
  };
  draps: {
    dials: number;
    responses: number;
    appointments: number;
    presentations: number;
    sales: number;
  };
  createdAt?: number;
  updatedAt?: number;
}

// ── Query params ──────────────────────────────────────────────────────────────

export interface UseDailyStatsParams {
  repId?: number;
  date?: string;
  dateFrom?: string;
  dateTo?: string;
}

// ── useDailyStats ─────────────────────────────────────────────────────────────

/**
 * Real-time listener for the `dailyStats` collection.
 *
 * Optional filters:
 *  - repId    : restrict to a single rep
 *  - date     : exact date match (YYYY-MM-DD)
 *  - dateFrom : lower bound (inclusive) on the `date` field
 *  - dateTo   : upper bound (inclusive) on the `date` field
 *
 * `date` takes priority over `dateFrom`/`dateTo` when both are supplied.
 */
export function useDailyStats(params?: UseDailyStatsParams): {
  stats: DailyStats[];
  loading: boolean;
  error: string | null;
} {
  const { currentUser, authLoading } = useFirebaseAuthUser();
  const [stats, setStats] = useState<DailyStats[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!currentUser) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const constraints: QueryConstraint[] = [];

    if (params?.repId !== undefined) {
      constraints.push(where("repId", "==", params.repId));
    }

    if (params?.date) {
      // Exact date match takes priority
      constraints.push(where("date", "==", params.date));
    } else {
      if (params?.dateFrom) {
        constraints.push(where("date", ">=", params.dateFrom));
      }
      if (params?.dateTo) {
        constraints.push(where("date", "<=", params.dateTo));
      }
    }

    // Always sort chronologically so callers get a predictable order
    constraints.push(orderBy("date", "desc"));

    const q = query(collection(db, "dailyStats"), ...constraints);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs: DailyStats[] = snapshot.docs.map((d) => ({
          ...(d.data() as Omit<DailyStats, "id">),
          id: d.id,
        }));
        setStats(docs);
        setLoading(false);
        setError(null);
      },
      (err) => {
        const appError = handleError(err, "useDailyStats");
        setError(appError.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
    // Re-subscribe whenever any param changes (stringify for stable dep comparison)

  }, [
    authLoading,
    currentUser,
    params?.repId,
    params?.date,
    params?.dateFrom,
    params?.dateTo,
  ]);

  return { stats, loading, error };
}

// ── useSaveDailyStats ─────────────────────────────────────────────────────────

/**
 * Returns a `save` function that upserts a DailyStats document.
 *
 * Document ID is `${repId}_${date}` (e.g. "3_2025-07-14").
 * Uses `setDoc` with `merge: true` so partial updates are safe.
 * Always injects `updatedAt: Date.now()` and `createdAt` on first write
 * (merge means createdAt won't be overwritten on subsequent calls).
 */
export function useSaveDailyStats(): {
  save: (
    stats: Partial<DailyStats> & { repId: number; date: string }
  ) => Promise<void>;
} {
  const save = async (
    stats: Partial<DailyStats> & { repId: number; date: string }
  ): Promise<void> => {
    const docId = `${stats.repId}_${stats.date}`;
    const docRef = doc(db, "dailyStats", docId);

    const payload: Partial<DailyStats> = {
      ...stats,
      updatedAt: Date.now(),
    };

    // Only stamp createdAt if caller hasn't already supplied it.
    // Because we use merge:true, an existing doc will keep its original createdAt.
    if (!payload.createdAt) {
      payload.createdAt = Date.now();
    }

    try {
      await setDoc(docRef, payload, { merge: true });
    } catch (err) {
      console.error("[useSaveDailyStats] Failed to save daily stats:", err);
      throw err;
    }
  };

  return { save };
}
