import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { doc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { handleError } from "../lib/errorHandler";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The kind of Firestore write operation to replay when back online. */
export type QueueOperationType = "set_merge" | "set_full" | "delete";

/**
 * A single queued Firestore operation stored in localStorage.
 * Items with `attempts >= 3` are considered permanently failed and
 * will not be retried unless the queue is cleared.
 */
export interface QueueItem {
  /** Unique identifier generated at enqueue time. */
  id: string;
  /** Firestore document path, e.g. "leads/123" or "draps/456". */
  docPath: string;
  /** The write operation to perform when replaying. */
  operation: QueueOperationType;
  /** Payload for set operations; undefined for delete operations. */
  data?: Record<string, unknown>;
  /** Unix ms timestamp recorded when the item was enqueued. */
  timestamp: number;
  /** Number of replay attempts made so far; starts at 0. */
  attempts: number;
  /** The last error message if the most recent attempt failed. */
  lastError?: string;
  /** Unix ms timestamp of the last replay attempt (for backoff calculation). */
  lastAttemptAt?: number;
}

/**
 * Value returned by `useOfflineQueue`.
 */
export interface UseOfflineQueueReturn {
  /** Whether the browser currently reports a network connection. */
  isOnline: boolean;
  /** True while the hook is actively replaying queued operations. */
  isSyncing: boolean;
  /** Number of pending items (attempts < 3) waiting to be replayed. */
  queueLength: number;
  /** Items that have failed 3 or more times and will not be retried automatically. */
  failedItems: QueueItem[];
  /**
   * Explicitly enqueue a Firestore write for later replay.
   * Use this when you want user-visible queuing on top of Firestore's
   * built-in offline persistence.
   *
   * @param docPath  - Firestore document path (e.g. "leads/abc123")
   * @param data     - Document payload; pass `undefined` for delete operations
   * @param operation - Defaults to "set_merge"
   */
  enqueue: (
    docPath: string,
    data: Record<string, unknown> | undefined,
    operation?: QueueOperationType
  ) => void;
  /**
   * Manually trigger a queue replay attempt.
   * No-ops if offline or already syncing.
   */
  processQueue: () => Promise<void>;
  /**
   * Discard all permanently-failed items (attempts >= 3) from the queue
   * and from localStorage.
   */
  clearFailed: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "asg-crm:offline-queue";
const MAX_ATTEMPTS = 3;
const RECONNECT_SETTLE_MS = 1500;

/** Exponential backoff delay in ms for retry attempt N (0-indexed). */
function backoffDelay(attempt: number): number {
  // 0 → 0ms, 1 → 2000ms, 2 → 4000ms (capped at 8 s)
  return Math.min(2000 * Math.pow(2, attempt - 1), 8000);
}

/**
 * Returns true if the item's last error happened recently enough that
 * we should skip it this pass (backoff not yet elapsed).
 */
function isBackingOff(item: QueueItem): boolean {
  if (item.attempts === 0 || !item.lastAttemptAt) return false;
  const delay = backoffDelay(item.attempts);
  return Date.now() - item.lastAttemptAt < delay;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/** Load the persisted queue from localStorage. Returns [] on any error. */
function loadQueue(): QueueItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as QueueItem[];
  } catch {
    return [];
  }
}

/** Persist the current queue to localStorage. Silently swallows write errors. */
function saveQueue(items: QueueItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // localStorage may be unavailable (private browsing quota, etc.)
  }
}

/** Generate a unique queue item identifier. */
function generateId(): string {
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Supplemental offline queue on top of Firestore's built-in
 * `persistentLocalCache`. Use this when you need:
 * - Explicit localStorage-backed retry with user-visible state
 * - Deterministic ordered replay (operations fire one at a time)
 * - A UI-facing `failedItems` list for error surfaces
 *
 * When the user is always online this hook adds zero Firestore overhead —
 * the queue stays empty and `isOnline` / `isSyncing` are the only live values.
 */
export function useOfflineQueue(): UseOfflineQueueReturn {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [queue, setQueue] = useState<QueueItem[]>(() => loadQueue());
  // Prevent concurrent processQueue calls (e.g. rapid reconnect events)
  const processingRef = useRef<boolean>(false);
  const isOnlineRef = useRef<boolean>(isOnline);

  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  // -------------------------------------------------------------------------
  // processQueue — replay pending items against Firestore one by one
  // -------------------------------------------------------------------------

  const processQueue = useCallback(async (): Promise<void> => {
    // Guard against concurrent invocations (e.g. rapid online events)
    if (!isOnlineRef.current || processingRef.current) return;

    processingRef.current = true;
    setIsSyncing(true);

    try {
      // Fresh read from localStorage so we always work with the latest state,
      // even if another tab or a rapid enqueue happened since last render.
      const currentQueue = loadQueue();

      const pending = currentQueue.filter((i) => i.attempts < MAX_ATTEMPTS);

      const successIds = new Set<string>();
      const processedItems = new Map<string, QueueItem>();

      for (const item of pending) {
        // Skip items still in their backoff window
        if (isBackingOff(item)) continue;

        try {
          const segments = item.docPath.split("/");
          const ref = doc(db, segments[0], ...segments.slice(1));

          if (item.operation === "delete") {
            await deleteDoc(ref);
          } else if (item.operation === "set_full") {
            await setDoc(ref, item.data ?? {});
          } else {
            // Default: set_merge
            await setDoc(ref, item.data ?? {}, { merge: true });
          }

          successIds.add(item.id);
        } catch (err) {
          item.attempts += 1;
          item.lastAttemptAt = Date.now();
          item.lastError =
            err instanceof Error ? err.message : "Unknown error";

          // Log to our error handler (non-fatal)
          handleError(err, `useOfflineQueue.replay(${item.docPath})`);
        } finally {
          processedItems.set(item.id, item);
        }
      }

      // Rebuild from the freshest persisted queue so writes enqueued during replay
      // are preserved, while attempted items keep their latest retry metadata.
      const latestQueue = loadQueue();
      const remaining = latestQueue.flatMap((item) => {
        if (successIds.has(item.id)) return [];
        return [processedItems.get(item.id) ?? item];
      });

      saveQueue(remaining);
      setQueue(remaining);
    } finally {
      setIsSyncing(false);
      processingRef.current = false;
    }
  }, []);

  // -------------------------------------------------------------------------
  // Online / offline listeners
  // -------------------------------------------------------------------------

  useEffect(() => {
    const handleOnline = (): void => {
      isOnlineRef.current = true;
      setIsOnline(true);
      // Give Firestore 1.5 s to re-establish its WebSocket before we replay
      setTimeout(() => {
        void processQueue();
      }, RECONNECT_SETTLE_MS);
    };

    const handleOffline = (): void => {
      isOnlineRef.current = false;
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [processQueue]);

  // -------------------------------------------------------------------------
  // enqueue — add an operation to the local queue
  // -------------------------------------------------------------------------

  const enqueue = useCallback(
    (
      docPath: string,
      data: Record<string, unknown> | undefined,
      operation: QueueOperationType = "set_merge"
    ): void => {
      setQueue((prev) => {
        // Duplicate prevention: if the same docPath + operation already exists
        // with 0 attempts (not yet tried), merge the new data into it rather
        // than creating a second write for the same document. This prevents
        // stale overwrites when the user rapidly edits the same record offline.
        const existingIdx = prev.findIndex(
          (i) => i.docPath === docPath && i.operation === operation && i.attempts === 0
        );

        if (existingIdx !== -1 && operation !== "delete") {
          const updated = [...prev];
          updated[existingIdx] = {
            ...updated[existingIdx],
            // Merge new data on top of the existing queued payload
            data: { ...(updated[existingIdx].data ?? {}), ...(data ?? {}) },
            timestamp: Date.now(),
          };
          saveQueue(updated);
          return updated;
        }

        const item: QueueItem = {
          id: generateId(),
          docPath,
          operation,
          data,
          timestamp: Date.now(),
          attempts: 0,
        };

        const next = [...prev, item];
        saveQueue(next);
        return next;
      });
    },
    []
  );

  // -------------------------------------------------------------------------
  // clearFailed — discard permanently-failed items
  // -------------------------------------------------------------------------

  const clearFailed = useCallback((): void => {
    setQueue((prev) => {
      const next = prev.filter((i) => i.attempts < MAX_ATTEMPTS);
      saveQueue(next);
      return next;
    });
  }, []);

  // -------------------------------------------------------------------------
  // Derived / memoised values
  // -------------------------------------------------------------------------

  const failedItems = useMemo(
    () => queue.filter((i) => i.attempts >= MAX_ATTEMPTS),
    [queue]
  );

  return {
    isOnline,
    isSyncing,
    queueLength: queue.filter((i) => i.attempts < MAX_ATTEMPTS).length,
    failedItems,
    enqueue,
    processQueue,
    clearFailed,
  };
}
