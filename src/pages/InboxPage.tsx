import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Lead } from "../types";
import { useOperationalQueueLeads, useSaveLead } from "../hooks/useFirebase";
import { getNextAction } from "../lib/nextAction";
import { buildInboxDonePatch, getActionableWorkflowItems } from "../lib/workflowState";
import { LeadSidebar } from "../components/LeadSidebar";
import CallLogger from "../components/CallLogger";
import { useToast } from "../context/ToastContext";
import { Inbox, Phone, Check } from "lucide-react";

export function InboxPage() {
  const { leads, loading, truncated } = useOperationalQueueLeads();
  const { save: saveLead } = useSaveLead();
  const { showToast } = useToast();

  const [currentLeadId, setCurrentLeadId] = useState<number | null>(null);
  const [callLead, setCallLead] = useState<Lead | null>(null);
  const [pendingIntent, setPendingIntent] = useState<string | null>(null);
  const [pendingDoneIds, setPendingDoneIds] = useState<Set<number>>(() => new Set());

  const tasks = useMemo(() => {
    return getActionableWorkflowItems(leads).map((item) => ({ ...item, action: getNextAction(item.lead) }));
  }, [leads]);
  const tasksRef = useRef(tasks);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const selected = tasks.find((t) => t.lead.id === currentLeadId)?.lead ?? null;

  const currentIdx = tasks.findIndex((t) => t.lead.id === currentLeadId);

  const resolveQueuedLead = useCallback((leadId: number): Lead | null => {
    return tasksRef.current.find((task) => task.lead.id === leadId)?.lead ?? null;
  }, []);

  const handleSave = useCallback(
    async (updated: Lead) => {
      const ok = await saveLead(updated);
      if (ok) {
        showToast(`${updated.name} saved`, "success");
        return true;
      }

      showToast("Failed to save. Please try again.", "error");
      return false;
    },
    [saveLead, showToast],
  );

  const handleDelete = useCallback(
    async (lead: Lead) => {
      await saveLead({ ...lead, status: "_deleted" as Lead["status"] });
      setCurrentLeadId(null);
    },
    [saveLead],
  );

  const handleSidebarCall = useCallback((_lead: Lead) => {
    setCallLead(_lead);
  }, []);

  const handleDone = useCallback(
    async (e: React.MouseEvent, leadId: number) => {
      e.stopPropagation();
      const queuedLead = resolveQueuedLead(leadId);
      if (!queuedLead) {
        showToast("That task is no longer in the queue.", "info");
        return;
      }

      setPendingDoneIds((prev) => new Set(prev).add(leadId));
      const ok = await saveLead(buildInboxDonePatch(queuedLead));
      if (ok) {
        showToast(`${queuedLead.name} completed`, "success");
        const latestTasks = tasksRef.current;
        const idx = latestTasks.findIndex((t) => t.lead.id === leadId);
        const nextLead = latestTasks.find((task, taskIndex) => taskIndex > idx && task.lead.id !== leadId)?.lead;
        setCurrentLeadId(nextLead?.id ?? null);
      } else {
        showToast("❌ Failed to update. Please try again.", "error");
      }
      setPendingDoneIds((prev) => {
        const next = new Set(prev);
        next.delete(leadId);
        return next;
      });
    },
    [resolveQueuedLead, saveLead, showToast],
  );

  const handleQuickCall = useCallback((e: React.MouseEvent, lead: Lead) => {
    e.stopPropagation();
    setCallLead(lead);
  }, []);

  const handleSaveCall = useCallback(
    async (updated: Lead) => {
      const ok = await saveLead(updated);
      if (ok) {
        showToast(`Call logged for ${updated.name}`, "success");
        setCallLead(null);
        const idx = tasks.findIndex((t) => t.lead.id === updated.id);
        const nextLead = tasks[idx + 1]?.lead;
        setCurrentLeadId(nextLead?.id ?? null);
        return true;
      } else {
        showToast("Failed to save call. Please try again.", "error");
        return false;
      }
    },
    [saveLead, showToast, tasks],
  );

  return (
    <div className="flex-1 flex flex-col bg-[var(--surface)] overflow-y-auto">
      <div className="max-w-xl mx-auto w-full px-6 py-16">

        {/* Icon + heading */}
        <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-8"
          style={{ background: "rgba(184,147,58,0.12)" }}>
          <Inbox size={18} style={{ color: "#b8933a" }} />
        </div>

        <div className="flex items-baseline justify-between mb-1">
          <h1 className="text-xl font-semibold text-[var(--text)]">Inbox</h1>
          {currentLeadId !== null && currentIdx !== -1 && (
            <span className="text-xs text-[var(--text-muted)]">
              Task {currentIdx + 1} of {tasks.length}
            </span>
          )}
        </div>
        <p className="text-sm text-[var(--text-muted)] mb-8">
          {loading ? "Loading…" : `${tasks.length} action${tasks.length !== 1 ? "s" : ""} need your attention`}
        </p>

        {truncated && (
          <p className="text-xs text-amber-600 dark:text-amber-300 mb-4">
            Queue limit reached. Some older items may need a filtered Leads search.
          </p>
        )}

        {/* Task list */}
        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[80, 65, 75, 55].map((w, i) => (
              <div key={i} className="h-14 rounded-xl skeleton-shimmer" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">All clear — nothing needs attention right now.</p>
        ) : (
          <ul className="space-y-2">
            {tasks.map(({ lead, action }) => {
              const isCurrent = lead.id === currentLeadId;
              return (
                <li
                  key={lead.id}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors duration-100 ${
                    isCurrent
                      ? "border-amber-500/40 bg-[var(--hover)] shadow-[inset_2px_0_0_#b8933a]"
                      : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--hover)]"
                  }`}
                >
                  {/* Clickable lead info — opens sidebar */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setCurrentLeadId(lead.id)}
                    onKeyDown={(e) => e.key === "Enter" && setCurrentLeadId(lead.id)}
                    className="flex-1 min-w-0 cursor-pointer"
                  >
                    <p className="text-sm font-medium text-[var(--text)] truncate">{lead.name}</p>
                    <p className="text-xs text-[var(--text-muted)] truncate">{action.label}</p>
                    {isCurrent && (
                      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] text-[var(--text-muted)] italic">
                          Suggested: {action.label} — {action.reason}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); setPendingIntent(action.type); setCurrentLeadId(lead.id); }}
                          className="text-[10px] font-medium px-2 py-0.5 rounded-md transition-colors duration-100"
                          style={{ background: "rgba(184,147,58,0.12)", color: "#b8933a" }}
                        >
                          Use Script
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Priority badge + quick actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${
                        action.priority === "high"
                          ? "bg-amber-500/15 text-amber-500"
                          : "bg-gray-500/15 text-gray-400"
                      }`}
                    >
                      {action.priority}
                    </span>

                    <button
                      onClick={(e) => handleQuickCall(e, lead)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--border)] transition-colors duration-100"
                      title="Open sidebar to log call"
                    >
                      <Phone size={11} />
                      Call
                    </button>

                    <button
                      onClick={(e) => handleDone(e, lead.id)}
                      disabled={pendingDoneIds.has(lead.id)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-[var(--text-muted)] hover:text-green-400 hover:bg-green-500/10 transition-colors duration-100"
                      title="Mark as contacted"
                    >
                      <Check size={11} />
                      {pendingDoneIds.has(lead.id) ? "Saving" : "Done"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Sidebar */}
      {selected && (
        <LeadSidebar
          lead={selected}
          onClose={() => { setCurrentLeadId(null); setPendingIntent(null); }}
          onSave={handleSave}
          onDelete={handleDelete}
          onCall={handleSidebarCall}
          initialAIIntent={pendingIntent ?? undefined}
        />
      )}
      {callLead && (
        <CallLogger
          lead={callLead}
          isOpen={Boolean(callLead)}
          onClose={() => setCallLead(null)}
          onSave={handleSaveCall}
        />
      )}
    </div>
  );
}
