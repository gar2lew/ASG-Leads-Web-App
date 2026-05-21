import React, { useEffect, useRef, useState } from "react";
import {
  CheckCircle,
  CloudOff,
  Loader,
  RefreshCw,
  WifiOff,
  XCircle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// ConnectionStatus
// ---------------------------------------------------------------------------

export interface ConnectionStatusProps {
  isOnline: boolean;
  isSyncing: boolean;
  queueLength: number;
  failedItems?: number;
  className?: string;
}

type DisplayState = "offline" | "syncing" | "synced" | "online" | "error";

export function ConnectionStatus({
  isOnline,
  isSyncing,
  queueLength,
  failedItems = 0,
  className = "",
}: ConnectionStatusProps) {
  const [visible, setVisible] = useState<boolean>(false);
  const [showSynced, setShowSynced] = useState<boolean>(false);
  const hadActiveWork = useRef<boolean>(false);

  useEffect(() => {
    if (isOnline && !isSyncing && queueLength === 0 && failedItems === 0) {
      const timer = setTimeout(() => setVisible(false), 3000);
      return () => clearTimeout(timer);
    }

    setVisible(true);
  }, [isOnline, isSyncing, queueLength, failedItems]);

  useEffect(() => {
    const hasActiveWork = isSyncing || queueLength > 0;

    if (
      hadActiveWork.current &&
      !hasActiveWork &&
      failedItems === 0 &&
      isOnline
    ) {
      setShowSynced(true);
      const timer = setTimeout(() => setShowSynced(false), 2000);
      hadActiveWork.current = hasActiveWork;
      return () => clearTimeout(timer);
    }

    if (hasActiveWork || failedItems > 0 || !isOnline) {
      setShowSynced(false);
    }

    hadActiveWork.current = hasActiveWork;
  }, [isSyncing, queueLength, failedItems, isOnline]);

  const displayState: DisplayState = (() => {
    if (failedItems > 0) return "error";
    if (!isOnline) return "offline";
    if (showSynced) return "synced";
    if (isSyncing || queueLength > 0) return "syncing";
    return "online";
  })();

  return (
    <div
      className={`flex items-center transition-opacity duration-500 ${
        visible ? "opacity-100" : "opacity-0 pointer-events-none"
      } ${className}`}
      aria-live="polite"
      aria-atomic="true"
    >
      {displayState === "error" && (
        <span
          className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-100 dark:bg-red-900/40 border border-red-200 dark:border-red-700/40 text-red-700 dark:text-red-300 text-[11px] font-semibold"
          title="One or more saves failed. New edits will retry when possible."
        >
          <XCircle size={11} aria-hidden="true" />
          {failedItems > 1 ? `${failedItems} saves failed` : "Save failed"}
        </span>
      )}

      {displayState === "offline" && (
        <span
          className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-100 dark:bg-red-900/40 border border-red-200 dark:border-red-700/40 text-red-700 dark:text-red-300 text-[11px] font-semibold"
          title="Changes will stay local until the connection returns."
        >
          <WifiOff size={11} aria-hidden="true" />
          {queueLength > 0 ? `Offline - ${queueLength} queued` : "Offline"}
        </span>
      )}

      {displayState === "syncing" && (
        <span
          className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700/40 text-amber-700 dark:text-amber-400 text-[11px] font-semibold"
          title="Saving local changes to the cloud."
        >
          <RefreshCw size={11} className="animate-spin" aria-hidden="true" />
          {queueLength > 1 ? `Syncing ${queueLength}...` : "Syncing..."}
        </span>
      )}

      {displayState === "synced" && (
        <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-800/40 text-green-700 dark:text-green-400 text-[11px] font-semibold">
          <CheckCircle size={11} aria-hidden="true" />
          Synced
        </span>
      )}

      {displayState === "online" && (
        <span
          className="w-2 h-2 rounded-full bg-green-500 animate-pulse"
          aria-label="Online"
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SaveStateToast
// ---------------------------------------------------------------------------

export interface SaveStateToastProps {
  state: "saving" | "saved_locally" | "syncing" | "saved" | "error";
  message?: string;
}

const TOAST_CONFIG: Record<
  SaveStateToastProps["state"],
  {
    icon: React.ReactNode;
    label: (msg?: string) => string;
    pill: string;
    durationMs: number;
  }
> = {
  saving: {
    icon: (
      <Loader
        size={12}
        className="animate-spin shrink-0"
        aria-hidden="true"
      />
    ),
    label: () => "Saving...",
    pill:
      "bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300",
    durationMs: 3000,
  },
  saved_locally: {
    icon: <CloudOff size={12} className="shrink-0" aria-hidden="true" />,
    label: () => "Saved locally",
    pill:
      "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700/40 text-blue-700 dark:text-blue-300",
    durationMs: 3000,
  },
  syncing: {
    icon: (
      <RefreshCw
        size={12}
        className="animate-spin shrink-0"
        aria-hidden="true"
      />
    ),
    label: () => "Syncing...",
    pill:
      "bg-amber-100 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700/40 text-amber-700 dark:text-amber-400",
    durationMs: 3000,
  },
  saved: {
    icon: <CheckCircle size={12} className="shrink-0" aria-hidden="true" />,
    label: () => "Saved",
    pill:
      "bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-800/40 text-green-700 dark:text-green-400",
    durationMs: 2000,
  },
  error: {
    icon: <XCircle size={12} className="shrink-0" aria-hidden="true" />,
    label: (msg) => msg ?? "Save failed - retry when ready",
    pill:
      "bg-red-100 dark:bg-red-900/40 border-red-200 dark:border-red-700/40 text-red-700 dark:text-red-300",
    durationMs: 6000,
  },
};

export function SaveStateToast({ state, message }: SaveStateToastProps) {
  const [mounted, setMounted] = useState<boolean>(true);
  const [opacity, setOpacity] = useState<boolean>(false);

  useEffect(() => {
    const fadeIn = requestAnimationFrame(() => setOpacity(true));
    const dismiss = setTimeout(() => {
      setOpacity(false);
      const unmount = setTimeout(() => setMounted(false), 500);
      return () => clearTimeout(unmount);
    }, TOAST_CONFIG[state].durationMs);

    return () => {
      cancelAnimationFrame(fadeIn);
      clearTimeout(dismiss);
    };
  }, [state]);

  if (!mounted) return null;

  const config = TOAST_CONFIG[state];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`
        fixed z-50 transition-opacity duration-500
        bottom-4 left-1/2 -translate-x-1/2
        sm:left-auto sm:translate-x-0 sm:right-4 sm:bottom-4
        ${opacity ? "opacity-100" : "opacity-0"}
      `}
    >
      <span
        className={`
          flex items-center gap-2 px-3 py-2 rounded-full
          border text-[12px] font-semibold shadow-md
          whitespace-nowrap select-none
          ${config.pill}
        `}
      >
        {config.icon}
        {config.label(message)}
      </span>
    </div>
  );
}

export default ConnectionStatus;
