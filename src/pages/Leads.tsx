import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Lead } from '../types';
import { useLeads, useSaveLead, useDeleteLead } from '../hooks/useFirebase';
import { useCallbackReminders } from '../hooks/useCallbackReminders';
import { useToast } from '../context/ToastContext';
import { useAppStore } from '../stores/appStore';
import DataTable from '../components/DataTable';
import CallLogger from '../components/CallLogger';
import { LeadSidebar } from '../components/LeadSidebar';
import { AddLeadModal } from '../components/AddLeadModal';
import { Loader } from 'lucide-react';

interface LeadsPageProps {
  addLeadOpen?: boolean;
  onAddLeadOpenChange?: (open: boolean) => void;
  pendingCallLeadId?: number | null;
  onPendingCallLeadConsumed?: () => void;
}

export function LeadsPage({ addLeadOpen = false, onAddLeadOpenChange, pendingCallLeadId, onPendingCallLeadConsumed }: LeadsPageProps) {
  const { leads, loading: leadsLoading, error: leadsError } = useLeads();
  const { save: saveLead, loading: saveLoading, error: saveError } = useSaveLead();
  const { remove: deleteLead, loading: deleteLoading } = useDeleteLead();
  const { showToast } = useToast();
  const { currentUser } = useAppStore();
  useCallbackReminders(leads);

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showCallLogger, setShowCallLogger] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);

  // ── Soft delete undo state ────────────────────────────────────────────────
  const [undoLead, setUndoLead] = useState<Lead | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync external addLeadOpen → internal close handler
  const setShowAddLead = useCallback(
    (open: boolean) => { onAddLeadOpenChange?.(open); },
    [onAddLeadOpenChange]
  );
  const showAddLead = addLeadOpen;

  // ── Pending call from Dashboard ─────────────────────────────────────────────
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

  // ── Lead selection ──────────────────────────────────────────────────────────
  const handleSelectLead = useCallback((lead: Lead) => {
    setSelectedLead(lead);
    setShowSidebar(true);
    setShowCallLogger(false);
  }, []);

  const handleCloseSidebar = useCallback(() => {
    setShowSidebar(false);
    setSelectedLead(null);
  }, []);

  // ── Call logger ─────────────────────────────────────────────────────────────
  const handleAddCall = useCallback((lead: Lead) => {
    setSelectedLead(lead);
    setShowCallLogger(true);
    setShowSidebar(false);
  }, []);

  const handleSaveCall = useCallback(
    async (updatedLead: Lead) => {
      const ok = await saveLead(updatedLead);
      if (ok) {
        showToast(`✅ Call logged for ${updatedLead.name}`, 'success');
        setShowCallLogger(false);
        setSelectedLead(null);
      } else {
        showToast('❌ Failed to save call. Please try again.', 'error');
      }
    },
    [saveLead, showToast]
  );

  // ── Sidebar save ────────────────────────────────────────────────────────────
  const handleSaveLead = useCallback(
    async (updatedLead: Lead) => {
      const ok = await saveLead(updatedLead);
      if (ok) {
        showToast(`✅ ${updatedLead.name} saved`, 'success');
      } else {
        showToast('❌ Failed to save. Please try again.', 'error');
      }
    },
    [saveLead, showToast]
  );

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDeleteLead = useCallback(
    async (lead: Lead) => {
      // Step 1: Mark as _deleted (instant visual removal)
      const ok = await saveLead({ ...lead, status: '_deleted' as Lead['status'] });
      if (!ok) { showToast('❌ Failed to delete. Please try again.', 'error'); return; }

      setShowSidebar(false);
      setSelectedLead(null);

      // Show undo toast — the lead disappears from the table immediately
      setUndoLead(lead);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      undoTimerRef.current = setTimeout(async () => {
        // Step 2: Real delete after 5s if not undone
        await deleteLead(lead.id);
        setUndoLead(null);
      }, 5000);
    },
    [saveLead, deleteLead, showToast]
  );

  const handleUndoDelete = useCallback(async () => {
    if (!undoLead) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    // Restore original status
    await saveLead(undoLead);
    setUndoLead(null);
    showToast(`↩️ ${undoLead.name} restored`, 'success');
  }, [undoLead, saveLead, showToast]);

  // ── Inline cell edit from DataTable ─────────────────────────────────────────
  const handleUpdateLead = useCallback(
    async (updatedLead: Lead) => {
      const ok = await saveLead(updatedLead);
      if (!ok) showToast('❌ Failed to save. Please try again.', 'error');
    },
    [saveLead, showToast]
  );

  // ── Add lead ────────────────────────────────────────────────────────────────
  const handleAddLead = useCallback(
    async (newLead: Lead) => {
      const ok = await saveLead(newLead);
      if (ok) {
        showToast(`✅ ${newLead.name} added`, 'success');
      } else {
        showToast('❌ Failed to add lead.', 'error');
      }
    },
    [saveLead, showToast]
  );

  // ── Loading / Error ─────────────────────────────────────────────────────────
  if (leadsLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white dark:bg-slate-900">
        <div className="text-center">
          <Loader size={40} className="animate-spin mx-auto mb-3 text-amber-500" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">Loading leads...</p>
        </div>
      </div>
    );
  }

  if (leadsError) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white dark:bg-slate-900">
        <div className="text-center max-w-md px-6">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Failed to load leads</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-4 text-sm">{leadsError}</p>
          <button onClick={() => window.location.reload()} className="px-5 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-400 transition font-medium">
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Main layout ─────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 overflow-hidden">

      {/* Notification permission hint */}
      {'Notification' in window && Notification.permission === 'denied' && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300 flex-shrink-0">
          <span>🔔</span>
          <span>Browser notifications are blocked — callback reminders won't fire. To enable: open your browser settings → Site Settings → Notifications → allow this site.</span>
        </div>
      )}

      {/* Body: table */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden min-w-0 transition-all duration-200">
          <DataTable
            leads={leads}
            loading={leadsLoading}
            onSelectLead={handleSelectLead}
            onAddCall={handleAddCall}
            onDeleteLead={handleDeleteLead}
            onUpdateLead={handleUpdateLead}
            currentUserId={currentUser?.id}
            isAdmin={currentUser?.role === 'admin'}
          />
        </div>
      </div>

      {/* Lead details modal */}
      {showSidebar && selectedLead && (
        <LeadSidebar
          lead={selectedLead}
          onClose={handleCloseSidebar}
          onSave={handleSaveLead}
          onDelete={handleDeleteLead}
          onCall={handleAddCall}
        />
      )}

      {/* Call Logger Modal */}
      {selectedLead && (
        <CallLogger
          lead={selectedLead}
          isOpen={showCallLogger}
          onClose={() => { setShowCallLogger(false); setSelectedLead(null); }}
          onSave={handleSaveCall}
        />
      )}

      {/* Add Lead Modal */}
      {showAddLead && (
        <AddLeadModal
          onClose={() => setShowAddLead(false)}
          onSave={handleAddLead}
        />
      )}

      {/* Saving overlay */}
      {(saveLoading || deleteLoading) && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-slate-900 rounded-xl px-6 py-4 flex items-center gap-3 shadow-xl">
            <Loader size={20} className="animate-spin text-amber-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {saveLoading ? 'Saving...' : 'Deleting...'}
            </span>
          </div>
        </div>
      )}

      {saveError && (
        <div className="fixed bottom-4 right-4 bg-red-500 text-white px-4 py-3 rounded-lg shadow-lg z-50 text-sm">
          Error: {saveError}
        </div>
      )}

      {/* Undo delete toast — bottom-left so it doesn't clash with regular toasts */}
      {undoLead && (
        <div className="fixed bottom-4 left-4 z-[9998] flex items-center gap-3 bg-gray-900 dark:bg-slate-700 text-white px-4 py-3 rounded-xl shadow-xl text-sm animate-in slide-in-from-left-4 fade-in duration-300">
          <span>🗑️ <strong>{undoLead.name}</strong> deleted</span>
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
