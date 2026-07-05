import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Lead } from "../types";
import { useLeads, useSaveLead, useDeleteLead, useAddAuditEntry } from "../hooks/useFirebase";
import { addDoc, collection } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useCallbackReminders } from "../hooks/useCallbackReminders";
import { useToast } from "../context/ToastContext";
import { useAppStore } from "../stores/appStore";
import DataTable from "../components/DataTable";
import CallLogger from "../components/CallLogger";
import { LeadSidebar } from "../components/LeadSidebar";
import { AddLeadModal } from "../components/AddLeadModal";
import { reportWriteResult } from "../hooks/useNetworkStatus";
import { Loader } from "lucide-react";
import { getNextAction } from "../lib/nextAction";
import { filterOperationalLeads } from "../lib/workflowState";
import { injectRowFlashStyles } from "../lib/animation";

interface LeadsPageProps {
  addLeadOpen?: boolean;
  onAddLeadOpenChange?: (open: boolean) => void;
  pendingCallLeadId?: number | null;
  onPendingCallLeadConsumed?: () => void;
  initialFilter?: string | null;
  onFilterCleared?: () => void;
}

function shouldShowNotificationBlockedBanner(): boolean {
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) return false;
  const ua = navigator.userAgent;
  const isMobileSafari =
    /iP(ad|hone|od)/.test(ua) && /Safari/.test(ua) && !/(CriOS|FxiOS|EdgiOS)/.test(ua);
  if (isMobileSafari) return false;
  return Notification.permission === "denied";
}

export function LeadsPage({
  addLeadOpen = false,
  onAddLeadOpenChange,
  pendingCallLeadId,
  onPendingCallLeadConsumed,
  initialFilter,
  onFilterCleared,
}: LeadsPageProps) {
  const { leads, loading: leadsLoading, error: leadsError, loadMore, hasMore, loadingMore } = useLeads();
  const { save: saveLead, loading: saveLoading, error: saveError } = useSaveLead();
  const { remove: deleteLead, loading: deleteLoading } = useDeleteLead();
  const { add: addAudit } = useAddAuditEntry();
  const { showToast } = useToast();
  const { currentUser } = useAppStore();

  // â”€â”€ Phase 5.2 â€” Failed-write retry buffer (lead update path only) â”€â”€â”€â”€â”€â”€â”€â”€
  const [lastFailedSave, setLastFailedSave] = useState<Lead | null>(null);
  const [retrying, setRetrying] = useState(false);

  // â”€â”€ Phase 7 â€” minimal audit logger (status + callback changes) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const logLeadAudit = useCallback(
    async (action: string, detail: string, leadId: number, leadName: string) => {
      if (!currentUser) return;
      const now = new Date();
      await addAudit({
        timestamp: now.getTime(),
        date: now.toISOString().split("T")[0],
        time: now.toTimeString().slice(0, 5),
        user: currentUser.name,
        action,
        detail,
        leadId,
        leadName,
      });
    },
    [currentUser, addAudit],
  );
  useCallbackReminders(leads);

  // Inject row flash keyframes once
  useEffect(() => {
    injectRowFlashStyles();
  }, []);

  // Row flash feedback
  const [flashedLeadId, setFlashedLeadId] = useState<number | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stores the last AI-suggested action used in the sidebar, keyed by lead ID
  // to prevent cross-lead attribution. Cleared on every status_change write.
  const lastAIContextRef = useRef<{ leadId: string; action: string } | null>(null);

  const flashRow = useCallback((leadId: number) => {
    setFlashedLeadId(leadId);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlashedLeadId(null), 600);
  }, []);

  const showFeedback = useCallback((msg: string) => {
    setActionFeedback(msg);
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setActionFeedback(null), 2500);
  }, []);

  const handleAIScriptUsed = useCallback((leadId: string | number, action: string) => {
    lastAIContextRef.current = { leadId: String(leadId), action };
  }, []);

  // Apply filter from Dashboard navigation
  const filteredLeads = useMemo(() => {
    return filterOperationalLeads(leads, initialFilter);
  }, [leads, initialFilter]);

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showCallLogger, setShowCallLogger] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);

  // â”€â”€ Soft delete undo state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [undoLeads, setUndoLeads] = useState<Lead[] | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originalLeadRef = useRef<Lead | null>(null);

  // Sync external addLeadOpen â†’ internal close handler
  const setShowAddLead = useCallback(
    (open: boolean) => {
      onAddLeadOpenChange?.(open);
    },
    [onAddLeadOpenChange],
  );
  const showAddLead = addLeadOpen;

  // â”€â”€ Pending call from Dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (!pendingCallLeadId || leads.length === 0) return;
    const lead = leads.find((l) => l.id === pendingCallLeadId);
    if (lead) {
      setSelectedLead(lead);
      setShowCallLogger(true);
      setShowSidebar(false);
      onPendingCallLeadConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCallLeadId, leads]);

  // â”€â”€ Lead selection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleSelectLead = useCallback((lead: Lead) => {
    originalLeadRef.current = lead;
    setSelectedLead(lead);
    setShowSidebar(true);
    setShowCallLogger(false);
  }, []);

  const handleCloseSidebar = useCallback(() => {
    setShowSidebar(false);
    setSelectedLead(null);
  }, []);

  // â”€â”€ Call logger â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleAddCall = useCallback((lead: Lead) => {
    setSelectedLead(lead);
    setShowCallLogger(true);
    setShowSidebar(false);
  }, []);

  const handleSaveCall = useCallback(
    async (updatedLead: Lead) => {
      const ok = await saveLead(updatedLead);
      if (ok) {
        showToast(`âœ… Call logged for ${updatedLead.name}`, "success");
        flashRow(updatedLead.id);
        showFeedback("Call logged âœ“");
        setShowCallLogger(false);
        setSelectedLead(null);

        // â”€â”€ Flow mode: auto-select next highest priority lead â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const nextLead = filteredLeads
          .filter((l) => l.id !== updatedLead.id && l.status !== "_deleted")
          .sort((a, b) => {
            const aAction = getNextAction(a);
            const bAction = getNextAction(b);
            const priorityVal = { high: 0, medium: 1, low: 2 };
            return (priorityVal[aAction.priority] ?? 2) - (priorityVal[bAction.priority] ?? 2);
          })[0];
        if (nextLead) {
          setTimeout(() => {
            setSelectedLead(nextLead);
            setShowSidebar(true);
          }, 300);
        }
        return true;
      } else {
        showToast("Failed to save call. Please try again.", "error");
        return false;
      }
    },
    [saveLead, showToast, flashRow, showFeedback, filteredLeads],
  );

  // â”€â”€ Sidebar save â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleSaveLead = useCallback(
    async (updatedLead: Lead) => {
      const prev = originalLeadRef.current;
      const ok = await saveLead(updatedLead);
      reportWriteResult(ok);
      if (ok) {
        originalLeadRef.current = updatedLead;
        setLastFailedSave(null);
        flashRow(updatedLead.id);
        showFeedback("Updated âœ“");
        showToast(`âœ… ${updatedLead.name} saved`, "success");

        // Phase 7 â€” audit only field-level changes worth tracking
        if (prev) {
          if (prev.status !== updatedLead.status) {
            // Read and clear atomically â€” lead ID guard prevents cross-lead attribution
            const stored = lastAIContextRef.current;
            const contextAction =
              stored?.leadId === String(updatedLead.id) ? stored.action : undefined;
            lastAIContextRef.current = null;

            void logLeadAudit(
              "lead_status_changed",
              `Status: ${prev.status} â†’ ${updatedLead.status}`,
              updatedLead.id,
              updatedLead.name,
            );
            void addDoc(collection(db, "auditLogs"), {
              type: "status_change",
              entityId: updatedLead.id,
              previousValue: prev.status,
              newValue: updatedLead.status,
              userId: String(currentUser?.id ?? "unknown"),
              timestamp: Date.now(),
              source: contextAction ? "ai" : "manual",
              ...(contextAction ? { contextAction } : {}),
            }).catch((err) => console.warn("[audit]", err));
          }
          if ((prev.callbackDate || "") !== (updatedLead.callbackDate || "")) {
            void logLeadAudit(
              "lead_callback_updated",
              `Callback: ${prev.callbackDate || "â€”"} â†’ ${updatedLead.callbackDate || "â€”"}`,
              updatedLead.id,
              updatedLead.name,
            );
            void addDoc(collection(db, "auditLogs"), {
              type: "callback_update",
              entityId: updatedLead.id,
              previousValue: prev.callbackDate ?? "",
              newValue: updatedLead.callbackDate ?? "",
              userId: String(currentUser?.id ?? "unknown"),
              timestamp: Date.now(),
              source: "manual",
            }).catch((err) => console.warn("[audit]", err));
          }
        }
      } else {
        setLastFailedSave(updatedLead);
        showToast("âŒ Failed to save. Tap retry to try again.", "error");
        return false;
      }
      return true;
    },
    [saveLead, showToast, flashRow, showFeedback, logLeadAudit],
  );

  // â”€â”€ Phase 5.2 â€” Retry handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleRetrySave = useCallback(async () => {
    if (!lastFailedSave || retrying) return;
    setRetrying(true);
    const ok = await saveLead(lastFailedSave);
    reportWriteResult(ok);
    setRetrying(false);
    if (ok) {
      setLastFailedSave(null);
      flashRow(lastFailedSave.id);
      showToast(`âœ… ${lastFailedSave.name} saved`, "success");
    } else {
      showToast("âŒ Retry failed. Check your connection.", "error");
    }
  }, [lastFailedSave, retrying, saveLead, flashRow, showToast]);

  // â”€â”€ Delete â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleDeleteLead = useCallback(
    async (lead: Lead) => {
      // Step 1: Mark as _deleted (instant visual removal)
      const ok = await saveLead({ ...lead, status: "_deleted" as Lead["status"] });
      if (!ok) {
        showToast("âŒ Failed to delete. Please try again.", "error");
        return;
      }

      setShowSidebar(false);
      setSelectedLead(null);

      // Show undo toast â€” the lead disappears from the table immediately
      setUndoLeads([lead]);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      undoTimerRef.current = setTimeout(async () => {
        // Step 2: Real delete after 5s if not undone
        await deleteLead(lead.id);
        setUndoLeads(null);
      }, 5000);
    },
    [saveLead, deleteLead, showToast],
  );

  const handleBulkDeleteLeads = useCallback(
    async (targets: Lead[]) => {
      if (targets.length === 0) return;
      const deleted: Lead[] = [];
      for (const lead of targets) {
        const ok = await saveLead({ ...lead, status: "_deleted" as Lead["status"] });
        if (ok) deleted.push(lead);
      }

      if (deleted.length === 0) {
        showToast("Failed to delete selected leads. Please try again.", "error");
        return;
      }
      if (deleted.length < targets.length) {
        showToast(`Deleted ${deleted.length} of ${targets.length} selected leads. Some failed.`, "error");
      }

      setUndoLeads(deleted);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      undoTimerRef.current = setTimeout(async () => {
        await Promise.all(deleted.map((lead) => deleteLead(lead.id)));
        setUndoLeads(null);
      }, 8000);
    },
    [saveLead, deleteLead, showToast],
  );

  const handleUndoDelete = useCallback(async () => {
    if (!undoLeads || undoLeads.length === 0) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    // Restore original status
    await Promise.all(undoLeads.map((lead) => saveLead(lead)));
    const label = undoLeads.length === 1 ? undoLeads[0].name : `${undoLeads.length} leads`;
    setUndoLeads(null);
    showToast(`${label} restored`, "success");
  }, [undoLeads, saveLead, showToast]);

  // â”€â”€ Inline cell edit from DataTable â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleUpdateLead = useCallback(
    async (updatedLead: Lead) => {
      const ok = await saveLead(updatedLead);
      if (!ok) showToast("âŒ Failed to save. Please try again.", "error");
    },
    [saveLead, showToast],
  );

  // â”€â”€ Next Action click â†’ instant response â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleNextAction = useCallback(
    (lead: Lead) => {
      const hasContact = (lead.callHistory?.length ?? 0) > 0;
      // No contact or follow-up â†’ open CallLogger immediately
      if (!hasContact || lead.status === "new" || lead.status === "contacted" || lead.status === "qualified") {
        handleAddCall(lead);
        return;
      }
      // Callback scheduled â†’ open CallLogger
      if (lead.callbackDate) {
        handleAddCall(lead);
        return;
      }
      // Booked â†’ open sidebar for full client view
      if (lead.status === "booked" || lead.status === "Booked") {
        setSelectedLead(lead);
        setShowSidebar(true);
        setShowCallLogger(false);
        return;
      }
      // Fallback â†’ open sidebar
      handleSelectLead(lead);
    },
    [handleAddCall, handleSelectLead],
  );

  // â”€â”€ Add lead â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleAddLead = useCallback(
    async (newLead: Lead) => {
      const ok = await saveLead(newLead);
      if (ok) {
        showToast(`âœ… ${newLead.name} added`, "success");
      } else {
        showToast("âŒ Failed to add lead.", "error");
      }
    },
    [saveLead, showToast],
  );

  // â”€â”€ Loading / Error â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (leadsLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--bg)] px-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 py-5 text-center shadow-sm">
          <Loader size={40} className="animate-spin mx-auto mb-3 text-amber-500" />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Loading leads...</p>
        </div>
      </div>
    );
  }

  if (leadsError) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--bg)] px-4">
        <div className="max-w-md rounded-xl border border-red-200 bg-white px-6 py-5 text-center shadow-sm dark:border-red-900/50 dark:bg-[var(--surface)]">
          <div className="text-4xl mb-4">!</div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Failed to load leads</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-4 text-sm">
            We could not load the live lead queue. Check your connection, then retry. If this keeps happening, contact an admin with the console error details.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="min-h-11 rounded-lg bg-amber-500 px-5 py-2 font-medium text-white transition hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Main layout
  return (
    <div className="flex-1 flex flex-col bg-[var(--bg)] overflow-hidden">
      {/* Notification permission hint */}
      {shouldShowNotificationBlockedBanner() && (
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300 flex-shrink-0">
          <span>ðŸ””</span>
          <span>
            Browser notifications are blocked, so callback reminders won't fire. To enable: open your browser settings,
            Site Settings, Notifications, then allow this site.
          </span>
        </div>
      )}

      {/* Filter indicator banner */}
      {initialFilter && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300 flex-shrink-0">
          <span className="font-semibold">
            {initialFilter === "no-contact" && "Filter: Leads with no contact yet"}
            {initialFilter === "clients-no-fc" && "Filter: Clients needing FC booking"}
            {initialFilter === "overdue-callbacks" && "Filter: Overdue callbacks"}
            {initialFilter === "overdue-followups" && "Filter: Overdue follow-ups"}
            {initialFilter === "callbacks" && "Filter: Actionable callbacks"}
            {initialFilter === "followups" && "Filter: Actionable follow-ups"}
            {initialFilter === "actionable-queue" && "Filter: Actionable queue"}
          </span>
          <button
            onClick={onFilterCleared}
            className="flex min-h-9 items-center gap-1 rounded px-2 py-1 transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 dark:hover:bg-amber-900/30"
          >
            <span>Clear filter</span>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Body: table + optional inline sidebar on lg+ */}
      <div className="flex flex-1 overflow-hidden">
        {/* Action feedback indicator */}
        {actionFeedback && (
          <div className="absolute top-4 right-4 z-50 px-3 py-2 rounded-lg bg-green-500 text-white text-xs font-medium shadow-lg animate-pulse pointer-events-none">
            {actionFeedback}
          </div>
        )}
        {/* Table fills space; sidebar sits beside it on lg+ */}
        <div className="flex-1 overflow-hidden min-w-0 transition-all duration-200">
          <DataTable
            leads={filteredLeads}
            loading={leadsLoading}
            onSelectLead={handleSelectLead}
            onAddCall={handleAddCall}
            onDeleteLead={handleDeleteLead}
            onBulkDeleteLeads={handleBulkDeleteLeads}
            onUpdateLead={handleUpdateLead}
            onNextAction={handleNextAction}
            flashedLeadId={flashedLeadId}
            currentUserId={currentUser?.id}
            isAdmin={currentUser?.role === "admin"}
            loadMore={loadMore}
            hasMore={hasMore}
            loadingMore={loadingMore}
            forceAllTab={Boolean(initialFilter)}
          />
        </div>

      </div>

      {/* Lead detail modal â€” centered overlay on all screen sizes */}
      {showSidebar && selectedLead && (
        <LeadSidebar
          lead={selectedLead}
          onClose={handleCloseSidebar}
          onSave={handleSaveLead}
          onDelete={handleDeleteLead}
          onCall={handleAddCall}
          onAIScriptUsed={handleAIScriptUsed}
        />
      )}

      {/* Call Logger Modal */}
      {selectedLead && (
        <CallLogger
          lead={selectedLead}
          isOpen={showCallLogger}
          onClose={() => {
            setShowCallLogger(false);
            setSelectedLead(null);
          }}
          onSave={handleSaveCall}
        />
      )}

      {/* Add Lead Modal */}
      {showAddLead && <AddLeadModal onClose={() => setShowAddLead(false)} onSave={handleAddLead} />}

      {/* Non-blocking save indicator */}
      {(saveLoading || deleteLoading) && (
        <div className="fixed bottom-4 right-4 z-[100] pointer-events-none">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 flex items-center gap-3 shadow-xl">
            <Loader size={20} className="animate-spin text-amber-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {saveLoading ? "Saving..." : "Deleting..."}
            </span>
          </div>
        </div>
      )}

      {saveError && (
        <div className="fixed bottom-4 right-4 bg-red-500 text-white px-4 py-3 rounded-lg shadow-lg z-50 text-sm">
          Error: {saveError}
        </div>
      )}

      {lastFailedSave && (
        <div className="fixed bottom-16 right-4 z-[9998] flex items-center gap-3 bg-red-900 text-white px-4 py-3 rounded-xl shadow-xl text-sm">
          <span>Save failed for <strong>{lastFailedSave.name}</strong></span>
          <button
            onClick={handleRetrySave}
            disabled={retrying}
            className="ml-1 px-3 py-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white rounded-lg font-semibold text-xs transition"
          >
            {retrying ? "Retryingâ€¦" : "Retry"}
          </button>
        </div>
      )}

      {/* Undo delete toast â€” bottom-left so it doesn't clash with regular toasts */}
      {undoLeads && undoLeads.length > 0 && (
        <div className="fixed bottom-4 left-4 z-[9998] flex items-center gap-3 bg-gray-900 dark:bg-slate-700 text-white px-4 py-3 rounded-xl shadow-xl text-sm animate-in slide-in-from-left-4 fade-in duration-300">
          <span>
            <strong>{undoLeads.length === 1 ? undoLeads[0].name : `${undoLeads.length} leads`}</strong> deleted
          </span>
          <button
            onClick={handleUndoDelete}
            className="ml-1 px-3 py-1 bg-[#b8933a] hover:bg-[#d4aa55] text-white rounded-lg font-semibold text-xs transition"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

export default LeadsPage;
