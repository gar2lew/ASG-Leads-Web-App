import React, { useMemo } from "react";
import { Lead } from "../types";
import { getNextAction } from "../lib/nextAction";
import {
  currentPerthDate,
  deriveOperationalCounters,
  deriveOperationalQueueSnapshot,
  filterOperationalLeads,
  getWorkflowState,
  type OperationalLeadFilter,
} from "../lib/workflowState";
import { CANONICAL_LEAD_STATUSES, getStatusColor, normalizeLeadStatus } from "../lib/statusConfig";
import { useCrmLeadStatusSummary, useLeads, useOperationalQueueLeads } from "../hooks/useFirebase";
import { useAppStore } from "../stores/appStore";
import {
  Phone,
  Users,
  Calendar,
  AlertTriangle,
  TrendingUp,
  Clock,
  Loader,
  Star,
  Activity,
  ArrowUp,
  ArrowRight,
  CheckCircle2,
  PhoneCall,
  Zap,
  ClipboardList,
  MapPin,
  FileText,
  CalendarClock,
  X,
  Sparkles,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────
function todayStr() {
  return currentPerthDate();
}

function startOfWeek() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split("T")[0];
}
function timeUntil(dateStr: string, timeStr?: string) {
  const dt = new Date(`${dateStr}${timeStr ? "T" + timeStr : "T00:00"}`);
  const diff = dt.getTime() - Date.now();
  if (diff < 0) {
    const m = Math.abs(Math.round(diff / 60000));
    if (m < 60) return `${m}m overdue`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h overdue`;
    return `${Math.floor(h / 24)}d overdue`;
  }
  const m = Math.round(diff / 60000);
  if (m < 60) return `in ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `in ${h}h`;
  return `in ${Math.floor(h / 24)}d`;
}

// Normalise call date to YYYY-MM-DD regardless of old ISO string or new date-only format
function normCallDate(d: string): string {
  if (!d) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? d : parsed.toISOString().split("T")[0];
}

function timeAgo(dateStr: string, timeStr?: string) {
  // Handle both new format (YYYY-MM-DD + HH:MM) and old (ISO strings stored directly)
  const isNewFmt = /^\d{4}-\d{2}-\d{2}$/.test(dateStr ?? "") && (!timeStr || /^\d{2}:\d{2}$/.test(timeStr));
  const dt = isNewFmt ? new Date(`${dateStr}T${timeStr || "00:00"}`) : new Date(timeStr || dateStr || ""); // old ISO fallback
  const diff = Date.now() - dt.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

function greeting(name: string) {
  const h = new Date().getHours();
  if (h < 12) return `Good morning, ${name} 👋`;
  if (h < 17) return `Good afternoon, ${name} 👋`;
  return `Good evening, ${name} 👋`;
}

function fmtDate() {
  return new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  sub,
  icon,
  gradient,
  border,
  trend,
}: {
  label: string;
  value: number | string;
  sub?: string;
  icon: React.ReactNode;
  gradient: string;
  border: string;
  trend?: { dir: "up" | "down" | "neutral"; label: string };
}) {
  return (
    <div
      className={`bg-[var(--surface)] rounded-2xl p-4 sm:p-5 border ${border} shadow-sm hover:shadow-md hover:scale-[1.01] active:scale-[0.98] transition-all duration-200 group`}
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${gradient}`}
        >
          {icon}
        </div>
        {trend && (
          <span
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 ${
              trend.dir === "up"
                ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                : trend.dir === "down"
                  ? "bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400"
                  : "bg-[var(--hover)] text-[var(--text-muted)]"
            }`}
          >
            {trend.dir === "up" ? (
              <ArrowUp size={9} />
            ) : trend.dir === "down" ? (
              <ArrowUp size={9} className="rotate-180" />
            ) : null}
            {trend.label}
          </span>
        )}
      </div>
      <div className="text-2xl sm:text-3xl font-bold text-[var(--text)] leading-none mb-1 tabular-nums">
        {value}
      </div>
      <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">{label}</div>
      {sub && <div className="text-xs text-[var(--text-muted)] mt-1">{sub}</div>}
    </div>
  );
}

// ── Calls Bar Chart ───────────────────────────────────────────────────────────
function CallsBarChart({
  callsByDay,
}: {
  callsByDay: { label: string; shortDate: string; count: number; isToday: boolean }[];
}) {
  const maxVal = Math.max(...callsByDay.map((d) => d.count), 1);
  return (
    <div className="flex items-end gap-1.5 sm:gap-2 h-28 sm:h-36 pt-2">
      {callsByDay.map((day) => {
        const pct = (day.count / maxVal) * 100;
        return (
          <div key={day.shortDate} className="flex-1 flex flex-col items-center gap-1 group/bar">
            <span
              className={`text-[10px] sm:text-xs font-semibold transition-opacity ${day.count > 0 ? "opacity-100" : "opacity-0 group-hover/bar:opacity-60"} ${day.isToday ? "text-amber-500" : "text-[var(--text-muted)]"}`}
            >
              {day.count || ""}
            </span>
            <div className="w-full flex items-end rounded-t-lg overflow-hidden" style={{ height: "80px" }}>
              <div
                className={`w-full rounded-t-lg transition-all duration-700 ease-out ${day.isToday ? "bg-amber-500" : "bg-panel dark:bg-hover group-hover/bar:bg-hover dark:group-hover/bar:bg-panel"}`}
                style={{ height: `${Math.max(pct, day.count > 0 ? 6 : 2)}%`, opacity: day.count === 0 ? 0.25 : 1 }}
              />
            </div>
            <span
              className={`text-[10px] sm:text-xs font-medium ${day.isToday ? "text-amber-500 font-bold" : "text-[var(--text-muted)]"}`}
            >
              {day.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Conversion Funnel ─────────────────────────────────────────────────────────
function FunnelStep({
  label,
  count,
  total,
  color,
  icon,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
  icon: React.ReactNode;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-[var(--text)]">{label}</span>
          <span className="text-xs font-bold text-[var(--text)] tabular-nums">{count.toLocaleString()}</span>
        </div>
        <div className="w-full h-2 bg-[var(--hover)] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${color.replace("bg-", "bg-").replace("/20", "")}`}
            style={{ width: `${pct}%`, backgroundColor: undefined }}
          />
        </div>
      </div>
      <span className="text-xs text-[var(--text-muted)] w-10 text-right flex-shrink-0 tabular-nums">
        {pct}%
      </span>
    </div>
  );
}

// ── Result badge colours ──────────────────────────────────────────────────────
function resultBadge(result?: string) {
  const r = (result || "").toLowerCase();
  if (r.includes("book") || r.includes("appt"))
    return "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300";
  if (r.includes("interest")) return "bg-[var(--hover)] text-[var(--text)]";
  if (r.includes("callback") || r.includes("revisit"))
    return "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300";
  if (r.includes("not") || r.includes("wrong") || r.includes("no answer"))
    return "bg-[var(--hover)] text-[var(--text-muted)]";
  return "bg-[var(--hover)] text-[var(--text)]";
}

function repInitial(name?: string) {
  return (name || "?").charAt(0).toUpperCase();
}

function leadQueueFilter(value: OperationalLeadFilter) {
  return { type: "leads" as const, value };
}

// ── Quick action card ─────────────────────────────────────────────────────────
function QuickAction({
  label,
  icon,
  color,
  onClick,
  badge,
}: {
  label: string;
  icon: React.ReactNode;
  color: string;
  onClick?: () => void;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-2 px-4 py-3 rounded-xl border transition hover:scale-[1.03] active:scale-[0.97] cursor-pointer select-none ${color}`}
    >
      <div className="relative">
        {icon}
        {badge != null && badge > 0 && (
          <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </div>
      <span className="text-xs font-semibold whitespace-nowrap">{label}</span>
    </button>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export function DashboardPage({
  onCallLead,
  onNavigate,
}: {
  onCallLead?: (lead: Lead) => void;
  onNavigate?: (page: string, filter?: { type: "leads" | "clients"; value: string }) => void;
}) {
  const { leads, loading } = useLeads();
  const {
    totalCount: crmLeadTotal,
    statusCounts: crmStatusCounts,
    loading: crmStatusSummaryLoading,
    error: crmStatusSummaryError,
  } = useCrmLeadStatusSummary();
  const { leads: operationalQueueLeads, truncated: queueTruncated } = useOperationalQueueLeads();
  const { currentUser, reps, statusColors } = useAppStore();
  const today = todayStr();
  const weekStart = startOfWeek();

  // ── All calls flattened ──────────────────────────────────────────────────
  const allCalls = useMemo(
    () =>
      leads.flatMap((l) =>
        (l.callHistory || []).map((c) => ({
          ...c,
          leadId: l.id,
          leadName: l.name || "—",
          leadStatus: l.status,
        })),
      ),
    [leads],
  );

  const leadCounters = useMemo(() => deriveOperationalCounters(leads), [leads]);
  const queueSnapshot = useMemo(() => deriveOperationalQueueSnapshot(operationalQueueLeads), [operationalQueueLeads]);

  // ── Stats ────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const queueCounters = queueSnapshot.counters;
    const callsToday = allCalls.filter((c) => normCallDate(c.date) === today).length;
    const callsThisWeek = allCalls.filter((c) => normCallDate(c.date) >= weekStart).length;
    const newToday = leads.filter((l) => l.leadDate === today).length;
    const newThisWeek = leads.filter((l) => (l.leadDate ?? "") >= weekStart).length;
    const callbacks = queueSnapshot.callbackItems.map(({ lead }) => lead);
    const overdueCount = queueCounters.overdueCallbacks;
    const convRate = leadCounters.total > 0 ? ((leadCounters.booked / leadCounters.total) * 100).toFixed(1) : "0.0";

    return {
      callsToday,
      callsThisWeek,
      booked: leadCounters.booked,
      dq: leadCounters.dq,
      newToday,
      newThisWeek,
      callbacks,
      overdueCount,
      total: leadCounters.total,
      actionable: queueCounters.actionable,
      followups: queueCounters.followups,
      overdueFollowups: queueCounters.overdueFollowups,
      convRate,
    };
  }, [leads, leadCounters, queueSnapshot, allCalls, today, weekStart]);

  const dashboardTotals = useMemo(() => {
    const statusTotal = Object.values(crmStatusCounts).reduce((sum, count) => sum + count, 0);
    const total = crmLeadTotal ?? statusTotal;
    const booked = crmStatusCounts.Booked;
    return {
      total,
      booked,
      dq: crmStatusCounts.DQ,
      convRate: total > 0 ? ((booked / total) * 100).toFixed(1) : "0.0",
    };
  }, [crmLeadTotal, crmStatusCounts]);

  // ── Priority Work Queue (Next Action Engine) ─────────────────────────────
  // No extra Firestore queries — uses call history + lead fields only.
  // Calendar appointments and subcollection notes are not loaded here;
  // the engine gracefully handles empty arrays / undefined for those inputs.
  const priorityActions = useMemo(() => {
    return queueSnapshot.actionableItems
      .map((item) => ({ ...item, action: getNextAction(item.lead, []) }))
      .slice(0, 15);
  }, [queueSnapshot]);

  // ── Follow-Up Engine ─────────────────────────────────────────────────────
  // Surfaces leads whose nextContactDate is due today or overdue.
  // Uses string comparison on ISO dates — no library needed.
  const followUpData = useMemo(() => {
    const dueToday = queueSnapshot.dueFollowupTodayItems.map(({ lead }) => lead);
    const overdue = queueSnapshot.overdueFollowupItems.map(({ lead }) => lead);
    return { dueToday, overdue };
  }, [queueSnapshot]);

  const queueShortcuts = useMemo(
    () =>
      [
        {
          label: "Work Queue",
          icon: <Zap size={16} className="text-amber-400" />,
          color: "bg-amber-500/10 border-amber-500/20 text-amber-300 hover:bg-amber-500/20",
          badge: stats.actionable,
          count: stats.actionable,
          filter: "actionable-queue" as OperationalLeadFilter,
        },
        {
          label: "Follow-Ups",
          icon: <Clock size={16} className="text-sky-400" />,
          color: "bg-sky-500/10 border-sky-500/20 text-sky-300 hover:bg-sky-500/20",
          badge: stats.overdueFollowups,
          count: stats.followups,
          filter: (stats.overdueFollowups > 0 ? "overdue-followups" : "followups") as OperationalLeadFilter,
        },
      ].filter((shortcut) => shortcut.count > 0),
    [stats.actionable, stats.followups, stats.overdueFollowups],
  );

  // ── Today's Focus ────────────────────────────────────────────────────────
  const todayFocus = useMemo(() => {
    // How many leads from a set have at least one call logged today
    const calledTodayCount = (set: Lead[]) =>
      set.filter((l) => (l.callHistory ?? []).some((c) => normCallDate(c.date) === today)).length;

    const items: Array<{
      id: string;
      label: string;
      count: number;
      doneToday: number;
      icon: React.ReactNode;
      color: string;
      nav: [string, any?];
    }> = [];

    // ── Overdue callbacks ──
    const overdueCallbackLeads = queueSnapshot.overdueCallbackItems.map(({ lead }) => lead);
    if (overdueCallbackLeads.length > 0)
      items.push({
        id: "overdue-callbacks",
        label: `Return ${overdueCallbackLeads.length} overdue callback${overdueCallbackLeads.length !== 1 ? "s" : ""}`,
        count: overdueCallbackLeads.length,
        doneToday: calledTodayCount(overdueCallbackLeads),
        icon: <Phone size={13} />,
        color: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/60",
        nav: ["leads", { type: "leads", value: "overdue-callbacks" }],
      });

    // ── Untouched leads ──
    const noContactLeads = filterOperationalLeads(leads, "no-contact");
    // "done today" = leads that had their first-ever call logged today (they're no longer in no-contact set)
    const firstCallToday = leads.filter(
      (l) => l.callHistory?.length === 1 && normCallDate(l.callHistory[0].date) === today,
    ).length;
    if (noContactLeads.length > 0)
      items.push({
        id: "no-contact",
        label: `Call ${noContactLeads.length.toLocaleString()} untouched lead${noContactLeads.length !== 1 ? "s" : ""}`,
        count: noContactLeads.length,
        doneToday: firstCallToday,
        icon: <Users size={13} />,
        color:
          "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/60",
        nav: ["leads", { type: "leads", value: "no-contact" }],
      });

    // ── Needs FC booking ──
    const needsFcLeads = leads.filter((l) => l.status === "Booked" && !l.fcAppt?.date);
    if (needsFcLeads.length > 0)
      items.push({
        id: "needs-fc",
        label: `Book FC for ${needsFcLeads.length} client${needsFcLeads.length !== 1 ? "s" : ""}`,
        count: needsFcLeads.length,
        doneToday: calledTodayCount(needsFcLeads),
        icon: <Calendar size={13} />,
        color:
          "text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800/60",
        nav: ["leads", { type: "leads", value: "clients-no-fc" }],
      });

    // ── Needs FR booking ──
    const needsFrLeads = leads.filter((l) => l.fcAppt?.result === "Completed" && !l.frAppt?.date);
    if (needsFrLeads.length > 0)
      items.push({
        id: "needs-fr",
        label: `Book FR for ${needsFrLeads.length} client${needsFrLeads.length !== 1 ? "s" : ""}`,
        count: needsFrLeads.length,
        doneToday: calledTodayCount(needsFrLeads),
        icon: <Calendar size={13} />,
        color:
          "text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800/60",
        nav: ["client-hub", { type: "clients", value: "fc-completed-no-fr" }],
      });

    // ── Overdue follow-ups ──
    if (followUpData.overdue.length > 0)
      items.push({
        id: "overdue-followups",
        label: `Follow up ${followUpData.overdue.length} overdue lead${followUpData.overdue.length !== 1 ? "s" : ""}`,
        count: followUpData.overdue.length,
        doneToday: calledTodayCount(followUpData.overdue),
        icon: <Clock size={13} />,
        color:
          "text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800/60",
        nav: ["leads", { type: "leads", value: "overdue-followups" }],
      });

    return items.sort((a, b) => b.count - a.count).slice(0, 3);
  }, [leads, queueSnapshot, followUpData, today]);

  // ── Calls per day (last 7 days) ───────────────────────────────────────────
  const callsByDay = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const dateKey = d.toISOString().split("T")[0];
      const label = i === 6 ? "Today" : d.toLocaleDateString("en-AU", { weekday: "short" });

      return {
        shortDate: dateKey,
        label,
        count: allCalls.filter((c) => normCallDate(c.date) === dateKey).length,
        isToday: dateKey === today,
      };
    });
  }, [allCalls, today]);

  // ── Conversion funnel data ───────────────────────────────────────────────
  const funnelTotal = dashboardTotals.total;

  // ── Status donut ─────────────────────────────────────────────────────────
  const statusCounts = useMemo(() => {
    return CANONICAL_LEAD_STATUSES.map((label) => ({
      label,
      value: crmStatusCounts[label],
      color: getStatusColor(label, statusColors),
    }));
  }, [crmStatusCounts, statusColors]);

  // ── Recent activity (last 20 calls) ─────────────────────────────────────
  const recentActivity = useMemo(() => {
    return [...allCalls]
      .sort((a, b) => {
        const isNewFmtB = /^\d{4}-\d{2}-\d{2}$/.test(b.date ?? "") && (!b.time || /^\d{2}:\d{2}$/.test(b.time));
        const isNewFmtA = /^\d{4}-\d{2}-\d{2}$/.test(a.date ?? "") && (!a.time || /^\d{2}:\d{2}$/.test(a.time));
        const ta = isNewFmtB
          ? new Date(`${b.date}T${b.time || "00:00"}`).getTime()
          : new Date(b.time || b.date || "").getTime();
        const tb = isNewFmtA
          ? new Date(`${a.date}T${a.time || "00:00"}`).getTime()
          : new Date(a.time || a.date || "").getTime();
        return ta - tb;
      })
      .slice(0, 18);
  }, [allCalls]);

  // ── Rep leaderboard ──────────────────────────────────────────────────────
  const repStats = useMemo(() => {
    return reps
      .filter((r) => r.active)
      .map((rep) => {
        const repCalls = allCalls.filter((c) => c.rep === rep.name || (c as { repId?: number }).repId === rep.id);
        const callsToday = repCalls.filter((c) => normCallDate(c.date) === today).length;
        const callsWeek = repCalls.filter((c) => normCallDate(c.date) >= weekStart).length;
        const leadsOwned = leads.filter((l) => l.dqRep === rep.id).length;
        const bookedCount = leads.filter((l) => l.dqRep === rep.id && normalizeLeadStatus(l.status) === "Booked").length;
        const liveCount = 0;
        const convRate = leadsOwned > 0 ? Math.round((bookedCount / leadsOwned) * 100) : 0;
        return { rep, total: repCalls.length, callsToday, callsWeek, leadsOwned, bookedCount, liveCount, convRate };
      })
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [reps, allCalls, leads, today, weekStart]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader size={32} className="animate-spin text-amber-500" />
      </div>
    );
  }

  const maxCalls = Math.max(...repStats.map((r) => r.total), 1);

  // ── Next Action colour/icon maps (defined after loading guard) ────────────
  const ACTION_ICON: Record<string, React.ReactNode> = {
    call: <Phone size={11} />,
    followup: <Clock size={11} />,
    callback: <Calendar size={11} />,
    confirm: <Calendar size={11} />,
    booked: <CheckCircle2 size={11} />,
    settled: <CheckCircle2 size={11} />,
    lost: <X size={11} />,
    none: <CheckCircle2 size={11} />,
  };

  const PRIORITY_ROW_CLS: Record<"high" | "medium" | "low", string> = {
    high: "border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-900/20",
    medium: "border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-900/20",
    low: "border-[var(--border)] bg-[var(--surface)] dark:bg-slate-900/40",
  };

  const PRIORITY_BADGE_CLS: Record<"high" | "medium" | "low", string> = {
    high: "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300",
    medium: "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300",
    low: "bg-[var(--hover)] text-[var(--text-muted)]",
  };

  const PRIORITY_STRIPE_CLS: Record<"high" | "medium" | "low", string> = {
    high: "bg-red-500",
    medium: "bg-amber-400",
    low: "bg-[var(--border)]",
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--bg)] p-3 sm:p-4 md:p-5 space-y-4 sm:space-y-5">
      {crmStatusSummaryError && (
        <div className="rounded-xl border border-red-300/60 bg-red-50 dark:bg-red-900/20 px-4 py-2 text-xs text-red-800 dark:text-red-200">
          Dashboard full CRM status counts could not load: {crmStatusSummaryError}
        </div>
      )}
      {queueTruncated && (
        <div className="rounded-xl border border-amber-300/60 bg-amber-50 dark:bg-amber-900/20 px-4 py-2 text-xs text-amber-800 dark:text-amber-200">
          Operational queue query reached its safety limit. Counts may exclude older matching items until the queue is narrowed.
        </div>
      )}
      {/* ── Hero banner ── */}
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #121214 0%, #1A1A1D 50%, #121214 100%)",
          boxShadow: "0 4px 32px rgba(18,18,20,0.35)",
        }}
      >
        {/* Subtle dot grid overlay */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: "radial-gradient(circle, #c9a84c 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
        {/* Gold accent line */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl"
          style={{ background: "linear-gradient(to bottom, #c9a84c, #f59e0b, #c9a84c)" }}
        />

        <div className="relative flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 p-5 sm:p-6">
          {/* Logo */}
          <img
            src="/asg-circle.png"
            alt="ASG"
            className="w-16 h-16 rounded-full object-cover flex-shrink-0 hidden sm:block"
            style={{ border: "2px solid rgba(201,168,76,0.5)", boxShadow: "0 0 24px rgba(201,168,76,0.2)" }}
          />

          {/* Greeting text */}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-white leading-tight">
              {greeting(currentUser?.name || "there")}
            </h1>
            <p className="text-sm mt-0.5" style={{ color: "rgba(201,168,76,0.9)" }}>
              {fmtDate()}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-white/10 text-white/80">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Operational window: {stats.total.toLocaleString()} loaded
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-white/10 text-white/80">
                Total CRM leads: {crmLeadTotal?.toLocaleString() ?? "…"}
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-white/10 text-white/80">
                Dashboard totals use full CRM status counts
              </span>
              {stats.newToday > 0 && (
                <span
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
                  style={{ background: "rgba(201,168,76,0.2)", color: "#f5c842" }}
                >
                  <ArrowUp size={10} />
                  {stats.newToday} added today
                </span>
              )}
              {stats.overdueCount > 0 && (
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/20 text-red-300">
                  <AlertTriangle size={10} />
                  {stats.overdueCount} overdue callbacks
                </span>
              )}
            </div>
          </div>

          {/* Right-side key number */}
          <div className="hidden lg:flex flex-col items-end gap-0.5 flex-shrink-0 text-right">
            <span className="text-4xl font-black text-white tabular-nums">{stats.callsToday}</span>
            <span className="text-xs font-medium" style={{ color: "rgba(201,168,76,0.8)" }}>
              calls today
            </span>
            <span className="text-[10px] text-white/40">{stats.callsThisWeek} this week</span>
          </div>
        </div>

        {/* Quick actions strip */}
        <div className="relative border-t border-white/10 px-5 sm:px-6 py-3 flex items-center gap-2 overflow-x-auto scrollbar-none">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40 flex-shrink-0 mr-1">
            Quick
          </span>
          <QuickAction
            label="Add Lead"
            icon={<Users size={16} className="text-amber-400" />}
            color="bg-amber-500/10 border-amber-500/20 text-amber-300 hover:bg-amber-500/20"
            onClick={() => onNavigate?.("leads")}
          />
          <QuickAction
            label="DQ Import"
            icon={<ClipboardList size={16} className="text-gray-400" />}
            color="bg-gray-500/10 border-gray-500/20 text-gray-300 hover:bg-gray-500/20"
            onClick={() => onNavigate?.("dq-import")}
          />
          {queueShortcuts.map((shortcut) => (
            <QuickAction
              key={shortcut.label}
              label={shortcut.label}
              icon={shortcut.icon}
              color={shortcut.color}
              badge={shortcut.badge}
              onClick={() => onNavigate?.("leads", leadQueueFilter(shortcut.filter))}
            />
          ))}
          <QuickAction
            label="Callbacks"
            icon={<Phone size={16} className="text-emerald-400" />}
            color="bg-emerald-500/10 border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20"
            badge={stats.overdueCount}
            onClick={() => onNavigate?.("leads", leadQueueFilter(stats.overdueCount > 0 ? "overdue-callbacks" : "callbacks"))}
          />
          <QuickAction
            label="Map"
            icon={<MapPin size={16} className="text-purple-400" />}
            color="bg-purple-500/10 border-purple-500/20 text-purple-300 hover:bg-purple-500/20"
            onClick={() => onNavigate?.("map")}
          />
          <QuickAction
            label="DRAPS"
            icon={<Zap size={16} className="text-gray-400" />}
            color="bg-gray-500/10 border-gray-500/20 text-gray-300 hover:bg-gray-500/20"
            onClick={() => onNavigate?.("draps")}
          />
          <QuickAction
            label="Documents"
            icon={<FileText size={16} className="text-rose-400" />}
            color="bg-rose-500/10 border-rose-500/20 text-rose-300 hover:bg-rose-500/20"
            onClick={() => onNavigate?.("document-centre")}
          />
        </div>
      </div>

      {/* ── Stat cards (6) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
        <StatCard
          label="Operational Window"
          value={stats.total.toLocaleString()}
          sub={`Total CRM leads: ${crmLeadTotal?.toLocaleString() ?? "loading"}; ${stats.newThisWeek} added this week`}
          icon={<Users size={20} className="text-[var(--text-muted)]" />}
          gradient="bg-[var(--hover)] dark:bg-gray-800/30"
          border="border-[var(--border)]"
        />
        <StatCard
          label="Calls Today"
          value={stats.callsToday}
          sub={`${stats.callsThisWeek} this week`}
          icon={<PhoneCall size={20} className="text-green-600 dark:text-green-400" />}
          gradient="bg-green-50 dark:bg-green-900/30"
          border="border-green-200 dark:border-green-900/50"
          trend={stats.callsToday > 0 ? { dir: "up", label: `${stats.callsToday} today` } : undefined}
        />
        <StatCard
          label="DQ Leads"
          value={crmStatusSummaryLoading ? "…" : dashboardTotals.dq.toLocaleString()}
          sub="full CRM new/fresh leads"
          icon={<Activity size={20} className="text-[var(--text-muted)]" />}
          gradient="bg-[var(--hover)] dark:bg-gray-800/30"
          border="border-[var(--border)]"
        />
        <StatCard
          label="Booked"
          value={crmStatusSummaryLoading ? "…" : dashboardTotals.booked.toLocaleString()}
          sub="full CRM appointments set"
          icon={<CheckCircle2 size={20} className="text-emerald-600 dark:text-emerald-400" />}
          gradient="bg-emerald-50 dark:bg-emerald-900/30"
          border="border-emerald-200 dark:border-emerald-900/50"
          trend={dashboardTotals.booked > 0 ? { dir: "up", label: `${dashboardTotals.convRate}%` } : undefined}
        />
        <StatCard
          label="Conversion"
          value={crmStatusSummaryLoading ? "…" : `${dashboardTotals.convRate}%`}
          sub={`${dashboardTotals.booked.toLocaleString()} of ${dashboardTotals.total.toLocaleString()} total CRM leads`}
          icon={<TrendingUp size={20} className="text-amber-600 dark:text-amber-400" />}
          gradient="bg-amber-50 dark:bg-amber-900/30"
          border="border-amber-200 dark:border-amber-900/50"
        />
        <StatCard
          label="Callbacks Due"
          value={stats.callbacks.length}
          sub={stats.overdueCount > 0 ? `⚠️ ${stats.overdueCount} overdue` : "all on time"}
          icon={<AlertTriangle size={20} className={stats.overdueCount > 0 ? "text-red-500" : "text-slate-400"} />}
          gradient={stats.overdueCount > 0 ? "bg-red-50 dark:bg-red-900/30" : "bg-[var(--hover)] dark:bg-slate-700/50"}
          border={
            stats.overdueCount > 0 ? "border-red-200 dark:border-red-900/50" : "border-[var(--border)]"
          }
          trend={stats.overdueCount > 0 ? { dir: "down", label: `${stats.overdueCount} late` } : undefined}
        />
      </div>

      {/* ── Today's Focus ── */}
      <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-[var(--text)] flex items-center gap-1.5">
            <Zap size={14} className="text-[#b8933a]" />
            Today's Focus
          </h3>
          {todayFocus.length > 0 && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#b8933a]/10 text-[#b8933a]">
              {todayFocus.length} action{todayFocus.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        {todayFocus.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-5 px-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/60 text-center">
            <div className="w-9 h-9 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
              <Sparkles size={18} className="text-green-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-green-700 dark:text-green-300">All clear for today!</p>
              <p className="text-xs text-green-600/70 dark:text-green-400/60 mt-0.5">No outstanding actions — great work.</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {todayFocus.map((item) => {
              const pct = item.doneToday > 0 ? Math.round((item.doneToday / (item.count + item.doneToday)) * 100) : 0;
              const hasProgress = item.doneToday > 0;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate?.(item.nav[0] as any, item.nav[1])}
                  className={`flex items-start gap-3 w-full text-left px-3 py-3 rounded-xl border text-sm font-medium transition-all hover:scale-[1.01] active:scale-[0.98] ${item.color}`}
                >
                  <span className="flex-shrink-0 mt-0.5">{item.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold truncate">{item.label}</span>
                      <ArrowRight size={12} className="flex-shrink-0 opacity-50" />
                    </div>
                    {hasProgress ? (
                      <div className="mt-1.5 space-y-1">
                        <div className="flex items-center justify-between text-[10px] opacity-70">
                          <span>{item.doneToday} done today</span>
                          <span>{pct}%</span>
                        </div>
                        <div className="h-1 rounded-full bg-current opacity-20 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-current opacity-80 transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] opacity-60 mt-0.5">Start now →</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Priority Work Queue ── */}
      {priorityActions.length > 0 && (
        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-4 sm:p-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-[var(--text)] flex items-center gap-2">
                <AlertTriangle size={14} className="text-red-500" />
                Priority Work Queue
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {priorityActions.length} lead{priorityActions.length !== 1 ? "s" : ""} need
                {priorityActions.length === 1 ? "s" : ""} attention — sorted by urgency
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onNavigate?.("leads", leadQueueFilter("actionable-queue"))}
                className="hidden sm:inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)] transition"
                title="Open the full actionable queue"
              >
                Open queue
                <ArrowRight size={11} />
              </button>
              {priorityActions.filter(({ action }) => action.priority === "high").length > 0 && (
                <span className="text-[10px] font-bold bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300 px-2 py-0.5 rounded-full">
                  {priorityActions.filter(({ action }) => action.priority === "high").length} high
                </span>
              )}
              {priorityActions.filter(({ action }) => action.priority === "medium").length > 0 && (
                <span className="text-[10px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300 px-2 py-0.5 rounded-full">
                  {priorityActions.filter(({ action }) => action.priority === "medium").length} med
                </span>
              )}
            </div>
          </div>

          {/* Lead rows grouped by priority */}
          <div className="space-y-2 max-h-80 overflow-y-auto pr-0.5">
            {(() => {
              const high = priorityActions.filter((a) => a.action.priority === "high");
              const medium = priorityActions.filter((a) => a.action.priority === "medium");
              const low = priorityActions.filter((a) => a.action.priority === "low");
              const groups: { label: string; items: typeof priorityActions; dot: string; textColor: string }[] = [];
              if (high.length > 0)
                groups.push({
                  label: "HIGH PRIORITY",
                  items: high,
                  dot: "bg-red-500",
                  textColor: "text-red-600 dark:text-red-400",
                });
              if (medium.length > 0)
                groups.push({
                  label: "MEDIUM",
                  items: medium,
                  dot: "bg-amber-500",
                  textColor: "text-amber-600 dark:text-amber-400",
                });
              if (low.length > 0)
                groups.push({
                  label: "LOW",
                  items: low,
                  dot: "bg-green-500",
                  textColor: "text-green-600 dark:text-green-400",
                });
              const highCount = priorityActions.filter((a) => a.action.priority === "high").length;
              if (groups.length === 0)
                return (
                  <div className="text-center py-8">
                    <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-2.5">
                      <CheckCircle2 size={20} className="text-green-500" />
                    </div>
                    <p className="text-sm font-semibold text-[var(--text)]">All caught up!</p>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">No urgent actions right now.</p>
                  </div>
                );
              if (highCount === 0 && priorityActions.length > 0)
                return (
                  <>
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40 mb-2">
                      <CheckCircle2 size={13} className="text-green-500 flex-shrink-0" />
                      <span className="text-xs font-semibold text-green-700 dark:text-green-400">All high priority tasks complete</span>
                    </div>
                    {groups.map((g) => (
                      <div key={g.label}>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${g.dot}`} />
                          <span className={`text-[10px] font-bold tracking-wider ${g.textColor}`}>{g.label}</span>
                          <span className="text-[10px] text-[var(--text-muted)]">({g.items.length})</span>
                        </div>
                        <div className="space-y-1.5 mb-3">
                          {g.items.map(({ lead, action }) => {
                            const rep = reps.find((r) => r.id === lead.dqRep)?.name ?? "—";
                            const isHigh = action.priority === "high";
                            const isMedium = action.priority === "medium";
                            return (
                              <div key={lead.id} className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs transition-colors ${PRIORITY_ROW_CLS[action.priority]}`}>
                                <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${PRIORITY_STRIPE_CLS[action.priority]}`} />
                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${isHigh ? "bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-300" : isMedium ? "bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-300" : "bg-[var(--hover)] text-[var(--text-muted)]"}`}>
                                  {ACTION_ICON[action.type]}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-bold text-[var(--text)] truncate max-w-[120px]">{lead.name}</span>
                                    <span className={`font-bold px-1.5 py-0.5 rounded text-[9px] flex-shrink-0 ${PRIORITY_BADGE_CLS[action.priority]}`}>{action.label}</span>
                                  </div>
                                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate">{action.reason} · {rep}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </>
                );
              return groups.map((g) => (
                <div key={g.label}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${g.dot}`} />
                    <span className={`text-[10px] font-bold tracking-wider ${g.textColor}`}>{g.label}</span>
                    <span className="text-[10px] text-[var(--text-muted)]">({g.items.length})</span>
                  </div>
                  <div className="space-y-1.5 mb-3">
                    {g.items.map(({ lead, action }) => {
                      const rep = reps.find((r) => r.id === lead.dqRep)?.name ?? "—";
                      const isHigh = action.priority === "high";
                      const isMedium = action.priority === "medium";
                      return (
                        <div
                          key={lead.id}
                          className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs transition-colors ${PRIORITY_ROW_CLS[action.priority]}`}
                        >
                          {/* Priority stripe */}
                          <div
                            className={`w-1 self-stretch rounded-full flex-shrink-0 ${PRIORITY_STRIPE_CLS[action.priority]}`}
                          />

                          {/* Action type icon */}
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                              isHigh
                                ? "bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-300"
                                : isMedium
                                  ? "bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-300"
                                  : "bg-[var(--hover)] text-[var(--text-muted)]"
                            }`}
                          >
                            {ACTION_ICON[action.type]}
                          </div>

                          {/* Lead info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-[var(--text)] truncate max-w-[120px]">
                                {lead.name}
                              </span>
                              <span
                                className={`font-bold px-1.5 py-0.5 rounded text-[9px] flex-shrink-0 ${PRIORITY_BADGE_CLS[action.priority]}`}
                              >
                                {action.label}
                              </span>
                            </div>
                            <p className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate">
                              {action.reason} · {rep}
                            </p>
                          </div>

                          {/* Quick action button */}
                          {(action.type === "call" || action.type === "followup") && onCallLead && (
                            <button
                              onClick={() => onCallLead(lead)}
                              className="flex-shrink-0 p-2 rounded-lg bg-amber-500 text-white hover:bg-amber-400 transition active:scale-[0.95]"
                              title="Log call for this lead"
                            >
                              <Phone size={12} />
                            </button>
                          )}
                          {(action.type === "call" || action.type === "followup") && !onCallLead && (
                            <button
                              onClick={() =>
                                onNavigate?.(
                                  "leads",
                                  leadQueueFilter(action.type === "followup" ? "followups" : "actionable-queue"),
                                )
                              }
                              className="flex-shrink-0 p-2 rounded-lg bg-amber-500 text-white hover:bg-amber-400 transition active:scale-[0.95]"
                              title="Open matching queue"
                            >
                              <Phone size={12} />
                            </button>
                          )}
                          {action.type === "callback" && onCallLead && (
                            <button
                              onClick={() => onCallLead(lead)}
                              className="flex-shrink-0 p-2 rounded-lg bg-amber-500 text-white hover:bg-amber-400 transition active:scale-[0.95]"
                              title="Log callback call"
                            >
                              <Phone size={12} />
                            </button>
                          )}
                          {action.type === "callback" && !onCallLead && (
                            <button
                              onClick={() => onNavigate?.("leads", leadQueueFilter("callbacks"))}
                              className="flex-shrink-0 p-2 rounded-lg bg-amber-500 text-white hover:bg-amber-400 transition active:scale-[0.95]"
                              title="Open callback queue"
                            >
                              <Phone size={12} />
                            </button>
                          )}
                          {action.type === "confirm" && (
                            <button
                              onClick={() => onNavigate?.("calendar")}
                              className="flex-shrink-0 p-2 rounded-lg bg-indigo-500 text-white hover:bg-indigo-400 transition active:scale-[0.95]"
                              title="Go to Calendar"
                            >
                              <Calendar size={12} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      {/* ── Follow-Ups Due Today ── */}
      {followUpData.dueToday.length > 0 && (
        <div className="bg-[var(--surface)] rounded-2xl border border-amber-200 dark:border-amber-900/50 p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-[var(--text)] flex items-center gap-2">
                <CalendarClock size={14} className="text-amber-500" />
                Follow-Ups Due Today
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {followUpData.dueToday.length} lead{followUpData.dueToday.length !== 1 ? "s" : ""} to contact today
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onNavigate?.("leads", leadQueueFilter("followups"))}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-200 dark:border-amber-900/50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition"
                title="Open follow-up queue"
              >
                Open
                <ArrowRight size={11} />
              </button>
              <span className="text-[10px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">
                Today
              </span>
            </div>
          </div>
          <div className="space-y-1.5">
            {followUpData.dueToday.map((lead) => {
              const rep = reps.find((r) => r.id === lead.dqRep)?.name ?? "—";
              return (
                <div
                  key={lead.id}
                  className="flex items-center gap-2.5 p-2.5 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-900/20 text-xs"
                >
                  <div className="w-1 self-stretch rounded-full bg-amber-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[var(--text)] truncate">{lead.name}</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                      {rep} · {normalizeLeadStatus(lead.status)}
                    </p>
                  </div>
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold flex-shrink-0 whitespace-nowrap">
                    Due today
                  </span>
                  {onCallLead && (
                    <button
                      onClick={() => onCallLead(lead)}
                      className="flex-shrink-0 p-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-400 transition"
                      title="Log call"
                    >
                      <Phone size={11} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Overdue Follow-Ups ── */}
      {followUpData.overdue.length > 0 && (
        <div className="bg-[var(--surface)] rounded-2xl border border-red-200 dark:border-red-900/50 p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-[var(--text)] flex items-center gap-2">
                <AlertTriangle size={14} className="text-red-500" />
                Overdue Follow-Ups
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {followUpData.overdue.length} missed — oldest first
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onNavigate?.("leads", leadQueueFilter("overdue-followups"))}
                className="inline-flex items-center gap-1 rounded-lg border border-red-200 dark:border-red-900/50 px-2.5 py-1.5 text-[11px] font-semibold text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40 transition"
                title="Open overdue follow-up queue"
              >
                Open
                <ArrowRight size={11} />
              </button>
              <span className="text-[10px] font-bold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 px-2 py-0.5 rounded-full">
                {followUpData.overdue.length} overdue
              </span>
            </div>
          </div>
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
            {followUpData.overdue.map((lead) => {
              const rep = reps.find((r) => r.id === lead.dqRep)?.name ?? "—";
              const daysLate = Math.floor(
                (Date.now() - new Date(lead.nextContactDate! + "T00:00").getTime()) / 86400000,
              );
              return (
                <div
                  key={lead.id}
                  className="flex items-center gap-2.5 p-2.5 rounded-xl border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-900/20 text-xs"
                >
                  <div className="w-1 self-stretch rounded-full bg-red-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[var(--text)] truncate">{lead.name}</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                      {rep} · {lead.status}
                    </p>
                  </div>
                  <span className="text-[10px] text-red-600 dark:text-red-400 font-semibold flex-shrink-0 whitespace-nowrap">
                    {daysLate <= 1 ? "Yesterday" : `${daysLate}d ago`}
                  </span>
                  {onCallLead && (
                    <button
                      onClick={() => onCallLead(lead)}
                      className="flex-shrink-0 p-1.5 rounded-lg bg-red-500 text-white hover:bg-red-400 transition"
                      title="Log call"
                    >
                      <Phone size={11} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* 7-day call volume */}
        <div className="lg:col-span-3 bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-4 sm:p-5 hover:scale-[1.01] active:scale-[0.98] transition-all duration-150">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-[var(--text)]">Call Volume</h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">Last 7 days</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-[var(--text-muted)] opacity-80" />
                Previous
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-amber-500" />
                Today
              </span>
            </div>
          </div>
          <CallsBarChart callsByDay={callsByDay} />
        </div>

        {/* Conversion funnel */}
        <div className="lg:col-span-2 bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-4 sm:p-5 hover:scale-[1.01] active:scale-[0.98] transition-all duration-150">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-[var(--text)]">Pipeline</h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Lead status breakdown</p>
          </div>
          <div className="space-y-3">
            <FunnelStep
              label="DQ'd"
              count={dashboardTotals.dq}
              total={funnelTotal}
              color="bg-[var(--hover)]"
              icon={<Users size={14} className="text-slate-500 dark:text-slate-400" />}
            />
            <div className="flex justify-center">
              <ArrowRight size={14} className="text-gray-300 dark:text-slate-600 rotate-90" />
            </div>
            <FunnelStep
              label="Booked"
              count={dashboardTotals.booked}
              total={funnelTotal}
              color="bg-emerald-100 dark:bg-emerald-900/40"
              icon={<CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400" />}
            />
          </div>

          {/* Status mini-breakdown */}
          <div className="mt-4 pt-4 border-t border-[var(--border)]">
            <div className="flex flex-wrap gap-1.5">
              {statusCounts.slice(0, 6).map((s) => (
                <span
                  key={s.label}
                  className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-[var(--hover)] text-[var(--text-muted)]"
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
                  {s.label} {s.value}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Lower row: callbacks + activity ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Callback queue */}
        <div className="lg:col-span-2 bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-4 sm:p-5 hover:scale-[1.01] active:scale-[0.98] transition-all duration-150">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-[var(--text)]">Callback Queue</h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">{stats.callbacks.length} due or overdue</p>
            </div>
            <div className="flex items-center gap-1.5">
              {stats.callbacks.length > 0 && (
                <button
                  onClick={() =>
                    onNavigate?.("leads", leadQueueFilter(stats.overdueCount > 0 ? "overdue-callbacks" : "callbacks"))
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)] transition"
                  title="Open callback queue"
                >
                  Open
                  <ArrowRight size={11} />
                </button>
              )}
              {stats.overdueCount > 0 && (
                <span className="text-xs font-semibold bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300 px-2 py-0.5 rounded-full">
                  {stats.overdueCount} overdue
                </span>
              )}
            </div>
          </div>
          {stats.callbacks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-36 text-gray-300 dark:text-slate-600 gap-2">
              <Calendar size={32} />
              <span className="text-sm text-[var(--text-muted)]">No callbacks due</span>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-0.5">
              {stats.callbacks.slice(0, 8).map((lead) => {
                const overdue = getWorkflowState(lead).isOverdue;
                const rep = reps.find((r) => r.id === lead.dqRep)?.name || "—";
                return (
                  <div
                    key={lead.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-sm transition-colors ${
                      overdue
                        ? "border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-900/20"
                        : "border-[var(--border)] bg-[var(--surface)] dark:bg-slate-900/50"
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${overdue ? "bg-red-500 text-white" : "bg-amber-500 text-white"}`}
                    >
                      {repInitial(rep)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-gray-900 dark:text-white text-xs truncate">
                          {lead.name}
                        </span>
                        {overdue && (
                          <span className="text-[9px] font-bold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/50 px-1 py-0.5 rounded flex-shrink-0">
                            LATE
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] mt-0.5">
                        <Clock size={9} />
                        <span>{timeUntil(lead.callbackDate!, lead.callbackTime)}</span>
                        <span>· {rep}</span>
                      </div>
                    </div>
                    {onCallLead && (
                      <button
                        onClick={() => onCallLead(lead)}
                        className="flex-shrink-0 p-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-400 transition"
                      >
                        <Phone size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent activity feed */}
        <div className="lg:col-span-3 bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-4 sm:p-5 hover:scale-[1.01] active:scale-[0.98] transition-all duration-150">
          <div className="mb-3">
            <h3 className="text-sm font-bold text-[var(--text)]">Recent Activity</h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Latest call logs across all leads</p>
          </div>
          {recentActivity.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-36 text-gray-300 dark:text-slate-600 gap-2">
              <Activity size={32} />
              <span className="text-sm text-[var(--text-muted)]">No calls logged yet</span>
            </div>
          ) : (
            <div className="space-y-0 max-h-64 overflow-y-auto divide-y divide-gray-50 dark:divide-slate-700/50">
              {recentActivity.map((call, i) => (
                <div key={i} className="flex items-center gap-3 py-2.5 first:pt-0">
                  <div className="w-7 h-7 rounded-full bg-panel flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                    {repInitial(call.rep)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[var(--text)] truncate">{call.leadName}</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate">
                      {call.rep || "Unknown"} · {timeAgo(call.date, call.time)}
                    </p>
                  </div>
                  {call.result && (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${resultBadge(call.result)}`}
                    >
                      {call.result}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Rep leaderboard (full width, upgraded) ── */}
      <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-4 sm:p-5 hover:scale-[1.01] active:scale-[0.98] transition-all duration-150">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-[var(--text)]">Rep Leaderboard</h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Ranked by total calls logged</p>
          </div>
          <Star size={16} className="text-amber-400" />
        </div>

        {repStats.length === 0 ? (
          <div className="text-center py-8 text-[var(--text-muted)] text-sm">No calls logged yet</div>
        ) : (
          <>
            {/* Column headers — hidden on mobile */}
            <div className="hidden sm:grid grid-cols-[2rem_1fr_3fr_5rem_5rem_5rem_5rem] gap-3 items-center mb-2 px-1">
              <span />
              <span className="text-label">
                Rep
              </span>
              <span className="text-label">
                Activity
              </span>
              <span className="text-label text-right">
                Calls
              </span>
              <span className="text-label text-right">
                This Week
              </span>
              <span className="text-label text-right">
                Booked
              </span>
              <span className="text-label text-right">
                Conv %
              </span>
            </div>

            <div className="space-y-2">
              {repStats.map((item, i) => {
                const pct = (item.total / maxCalls) * 100;
                const medals = ["🥇", "🥈", "🥉"];
                const isTop3 = i < 3;
                return (
                  <div
                    key={item.rep.id}
                    className={`grid grid-cols-[2rem_1fr] sm:grid-cols-[2rem_1fr_3fr_5rem_5rem_5rem_5rem] gap-3 items-center p-3 rounded-xl transition-colors ${
                      isTop3
                        ? "bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30"
                        : "bg-[var(--surface)] border border-[var(--border)]"
                    }`}
                  >
                    {/* Rank */}
                    <span className="text-base text-center w-8 flex-shrink-0">
                      {medals[i] || <span className="text-xs font-bold text-[var(--text-muted)]">{i + 1}</span>}
                    </span>

                    {/* Name + today badge */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${isTop3 ? "bg-amber-500" : "bg-slate-400 dark:bg-slate-600"}`}
                        >
                          {repInitial(item.rep.name)}
                        </div>
                        <span className="text-sm font-semibold text-[var(--text)] truncate">
                          {item.rep.name}
                        </span>
                        {item.callsToday > 0 && (
                          <span className="hidden sm:inline text-[10px] font-bold bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                            +{item.callsToday} today
                          </span>
                        )}
                      </div>
                      {/* Mobile: show mini bar */}
                      <div className="sm:hidden mt-1.5 h-1.5 bg-[var(--hover)] rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>

                    {/* Progress bar (desktop) */}
                    <div className="hidden sm:flex items-center gap-2">
                      <div className="flex-1 h-2 bg-[var(--hover)] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${isTop3 ? "bg-amber-500" : "bg-panel dark:bg-hover"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    {/* Total calls */}
                    <div className="hidden sm:block text-right">
                      <span className="text-sm font-bold text-[var(--text)] tabular-nums">{item.total}</span>
                      <span className="text-xs text-[var(--text-muted)] ml-1">calls</span>
                    </div>

                    {/* This week */}
                    <div className="hidden sm:block text-right">
                      <span
                        className={`text-sm font-bold tabular-nums ${item.callsWeek > 0 ? "text-indigo-600 dark:text-indigo-400" : "text-[var(--text-muted)]"}`}
                      >
                        {item.callsWeek}
                      </span>
                    </div>

                    {/* Booked */}
                    <div className="hidden sm:block text-right">
                      <span
                        className={`text-sm font-bold tabular-nums ${item.bookedCount > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-[var(--text-muted)]"}`}
                      >
                        {item.bookedCount}
                      </span>
                    </div>

                    {/* Conversion rate */}
                    <div className="hidden sm:block text-right">
                      <span
                        className={`text-sm font-bold tabular-nums ${
                          item.convRate >= 20
                            ? "text-emerald-600 dark:text-emerald-400"
                            : item.convRate >= 10
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-[var(--text-muted)]"
                        }`}
                      >
                        {item.convRate}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default DashboardPage;
