import { WifiOff, AlertCircle, RefreshCw, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useNetworkStatus } from "../hooks/useNetworkStatus";

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function OfflineIndicator() {
  const {
    isOnline,
    hasSyncError,
    hasPendingWrites,
    isRetryingWrite,
    lastSyncAt,
  } = useNetworkStatus();
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const [recentlySynced, setRecentlySynced] = useState(false);
  useEffect(() => {
    if (!lastSyncAt || hasPendingWrites || hasSyncError) return;
    setRecentlySynced(true);
    const id = setTimeout(() => setRecentlySynced(false), 2000);
    return () => clearTimeout(id);
  }, [lastSyncAt, hasPendingWrites, hasSyncError]);

  if (isRetryingWrite) {
    return (
      <div
        className="fixed top-4 right-4 z-[1000] flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 shadow-sm"
        title="A failed write is being retried."
      >
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        Retrying save...
      </div>
    );
  }

  if (hasSyncError) {
    return (
      <div
        className="fixed top-4 right-4 z-[1000] flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 shadow-sm"
        title="The last save failed. New edits will retry when the connection is healthy."
      >
        <AlertCircle className="h-3.5 w-3.5" />
        Save failed
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div
        className="fixed top-4 right-4 z-[1000] flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700 shadow-sm"
        title="Changes made offline will sync when the connection returns."
      >
        <WifiOff className="h-3.5 w-3.5" />
        Offline
        {lastSyncAt && (
          <span className="opacity-70 font-normal">
            - last sync {timeAgo(lastSyncAt)}
          </span>
        )}
      </div>
    );
  }

  if (hasPendingWrites) {
    return (
      <div
        className="fixed top-4 right-4 z-[1000] flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 shadow-sm"
        title="Saving local changes to the cloud."
      >
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        Syncing...
      </div>
    );
  }

  if (recentlySynced) {
    return (
      <div className="fixed top-4 right-4 z-[1000] flex items-center gap-1.5 rounded-lg border border-green-300 bg-green-50 px-2.5 py-1.5 text-xs font-medium text-green-700 shadow-sm">
        <Check className="h-3.5 w-3.5" />
        Synced
      </div>
    );
  }

  return null;
}
