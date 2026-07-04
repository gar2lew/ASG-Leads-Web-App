import { useState, useEffect, useMemo } from "react";

const SSR_DEFAULTS = {
  isOnline: true,
  hasSyncError: false,
  hasPendingWrites: false,
  isSyncing: false,
  isRetryingWrite: false,
  lastSyncAt: undefined as number | undefined,
  lastWriteFailedAt: undefined as number | undefined,
  pendingWritesStartedAt: undefined as number | undefined,
  isProbablyOffline: false,
};

// Module-level write-state signals.
// Lightweight pub/sub so write callers and snapshot listeners can report real
// Firestore activity without routing through Zustand.
type WriteListener = () => void;
const writeListeners = new Set<WriteListener>();
let lastWriteFailedAtModule: number | undefined = undefined;
let lastSyncAtModule: number | undefined = undefined;
let hasPendingWritesModule = false;
let pendingWritesStartedAtModule: number | undefined = undefined;

function emit() {
  writeListeners.forEach((fn) => fn());
}

export function reportWriteResult(ok: boolean): void {
  const now = Date.now();
  if (ok) {
    lastWriteFailedAtModule = undefined;
    lastSyncAtModule = now;
  } else {
    lastWriteFailedAtModule = now;
    lastSyncAtModule = undefined;
  }
  emit();
}

export function clearWriteFailure(): void {
  if (lastWriteFailedAtModule === undefined) return;
  lastWriteFailedAtModule = undefined;
  emit();
}

export function reportPendingWrites(hasPending: boolean): void {
  if (hasPendingWritesModule === hasPending) return;

  hasPendingWritesModule = hasPending;
  pendingWritesStartedAtModule = hasPending ? Date.now() : undefined;

  if (!hasPending && lastWriteFailedAtModule === undefined) {
    lastSyncAtModule = Date.now();
  }

  emit();
}

export function useNetworkStatus(): {
  isOnline: boolean;
  hasSyncError: boolean;
  hasPendingWrites: boolean;
  isSyncing: boolean;
  isRetryingWrite: boolean;
  lastSyncAt?: number;
  lastWriteFailedAt?: number;
  pendingWritesStartedAt?: number;
  isProbablyOffline: boolean;
} {
  const isBrowser = typeof window !== "undefined";
  const [isOnline, setIsOnline] = useState<boolean>(() => (isBrowser ? navigator.onLine : SSR_DEFAULTS.isOnline));
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!isBrowser) return;

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const listener: WriteListener = () => setTick((t) => t + 1);
    writeListeners.add(listener);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      writeListeners.delete(listener);
    };
  }, [isBrowser]);

  const lastWriteFailedAt = lastWriteFailedAtModule;
  const lastSyncAt = lastSyncAtModule;
  const hasPendingWrites = hasPendingWritesModule;
  const pendingWritesStartedAt = pendingWritesStartedAtModule;
  const hasSyncError = lastWriteFailedAt !== undefined;
  const isSyncing = hasPendingWrites;
  const isRetryingWrite = hasSyncError && hasPendingWrites;

  return useMemo(
    () =>
      isBrowser
        ? {
            isOnline,
            hasSyncError,
            hasPendingWrites,
            isSyncing,
            isRetryingWrite,
            lastSyncAt,
            lastWriteFailedAt,
            pendingWritesStartedAt,
            isProbablyOffline: !isOnline || (hasSyncError && !hasPendingWrites),
          }
        : SSR_DEFAULTS,
    [
      isBrowser,
      isOnline,
      hasSyncError,
      hasPendingWrites,
      isSyncing,
      isRetryingWrite,
      lastSyncAt,
      lastWriteFailedAt,
      pendingWritesStartedAt,
    ],
  );
}
