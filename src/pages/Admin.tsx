/**
 * Admin Page
 *
 * Tabs:
 * - Rep Roster    — manage roster (add, edit, toggle active, remove, financial fields)
 * - Lead Stats    — status breakdown, leads per rep, recent activity
 * - Rep Performance — calls, leads assigned, conversion per rep + target progress
 * - Operations    — overdue callbacks, upcoming bookings, stale leads
 * - Settings      — commission rate defaults, rep targets, stale threshold
 * - Audit Log     — browseable activity history with user/action filters
 */

import React, { useState, useMemo, useRef } from "react";
import { Rep, Lead, AppSettings, RepTarget, DEFAULT_STATUS_COLORS, ServiceType, SyncConfig } from "../types";
import { LEAD_STATUS_OPTIONS, getStatusColor, normalizeLeadStatus } from "../lib/statusConfig";
import { useAppStore } from "../stores/appStore";
import {
  useAuditLog,
  useAppSettings,
  useSaveSettings,
  useLeads,
  useSaveRep,
  useDeleteRep,
  useServiceTypes,
  useSaveServiceType,
  useDeleteServiceType,
  useSaveLead,
  useDeleteLead,
} from "../hooks/useFirebase";
import { exportAsCSV, exportLeadsCSV, exportCallHistoryCSV } from "../lib/utils";
import { uploadFile } from "../lib/storage";
import { DEFAULT_SERVICE_TYPES } from "./Calendar";
import { useToast } from "../context/ToastContext";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../lib/firebase";
import {
  UserPlus,
  Pencil,
  Check,
  X,
  Power,
  ShieldCheck,
  Trash2,
  ChevronDown,
  ChevronRight,
  Download,
  ClipboardList,
  BarChart2,
  TrendingUp,
  AlertCircle,
  Settings,
  Phone,
  Zap,
  Activity,
  CalendarCheck,
  PhoneCall,
  Users,
  Target,
  Camera,
  CalendarDays,
  Database,
  RefreshCw,
  ExternalLink,
  Clock,
  ArrowDownCircle,
  ArrowUpCircle,
  Palette,
  FlaskConical,
  Search,
  HeartPulse,
  History,
} from "lucide-react";
import { KnowledgeLayout } from "../components/KnowledgeLayout";
import { SystemSettingsPanel } from "../components/SystemSettingsPanel";
import { SystemHealthPanel } from "../components/SystemHealthPanel";
import { SettingsHistoryPanel } from "../components/SettingsHistoryPanel";
import { DailyReportDashboard } from "../components/DailyReportDashboard";
import { ADMIN_GUIDE_SECTIONS } from "../data/knowledgeBase";
import { AUTOMATION_RULES } from "../lib/automation";
import { isOverdue } from "../lib/followUp";
import { VoiceRecorder } from "../components/VoiceRecorder";

// ── Shared rep avatar (photo > initials fallback) ─────────────────────────────
function RepAvatar({
  rep,
  size = "md",
  onClick,
  showCameraHint = false,
}: {
  rep: Rep;
  size?: "xs" | "sm" | "md" | "lg";
  onClick?: () => void;
  showCameraHint?: boolean;
}) {
  const dims = { xs: "w-6 h-6 text-[10px]", sm: "w-8 h-8 text-xs", md: "w-9 h-9 text-sm", lg: "w-12 h-12 text-lg" }[
    size
  ];
  const base = `${dims} rounded-full flex items-center justify-center flex-shrink-0 font-bold overflow-hidden relative group/av`;

  return (
    <div
      className={`${base} ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
      title={onClick ? `Change ${rep.name}'s photo` : rep.name}
    >
      {rep.photo ? (
        <img src={rep.photo} alt={rep.name} className="w-full h-full object-cover" />
      ) : (
        <div
          className={`w-full h-full flex items-center justify-center ${rep.active ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400" : "bg-gray-200 dark:bg-slate-700 text-gray-500"}`}
        >
          {rep.name[0]}
        </div>
      )}
      {/* Camera overlay on hover (when clickable) */}
      {showCameraHint && (
        <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover/av:opacity-100 transition">
          <Camera size={size === "lg" ? 16 : 11} className="text-white" />
        </div>
      )}
    </div>
  );
}

const ALL_STATUSES = [...LEAD_STATUS_OPTIONS];

// ── Helpers ────────────────────────────────────────────────────────────────────
function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

// Normalise call history date to YYYY-MM-DD — handles old ISO strings and new date-only strings
function normCallDate(d: string): string {
  if (!d) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? d : parsed.toISOString().split("T")[0];
}

function daysBetween(dateStr: string, referenceStr: string = todayStr()): number {
  const d = new Date(dateStr).getTime();
  const r = new Date(referenceStr).getTime();
  return Math.round((r - d) / 86400000);
}

function getRepName(_leads: Lead[], reps: Rep[], repId: number): string {
  return reps.find((r) => r.id === repId)?.name ?? "—";
}

function lastCallDate(lead: Lead): string | null {
  if (!lead.callHistory || lead.callHistory.length === 0) return null;
  const dates = lead.callHistory
    .map((c) => c.date)
    .filter(Boolean)
    .sort();
  return dates[dates.length - 1] ?? null;
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

// ── SummaryCard (shared) ───────────────────────────────────────────────────────
function SummaryCard({
  label,
  value,
  sub,
  suffix = "",
}: {
  label: string;
  value: number;
  sub: string;
  suffix?: string;
}) {
  return (
    <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-5">
      <div className="text-2xl font-bold text-gray-900 dark:text-white">
        {value}
        {suffix}
      </div>
      <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mt-0.5">{label}</div>
      <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</div>
    </div>
  );
}

// ── StatusBadge (shared) ───────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const { statusColors } = useAppStore();
  const displayStatus = normalizeLeadStatus(status);
  const hex = getStatusColor(displayStatus, statusColors);
  return (
    <span
      className="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: hex + "26", color: hex, border: `1px solid ${hex}55` }}
    >
      {displayStatus}
    </span>
  );
}

// ── Today's Briefing strip ────────────────────────────────────────────────────
interface BriefingData {
  callsToday: number;
  callsYesterday: number;
  callbacksToday: number;
  dqedToday: number;
  apptToday: number;
}

function TodayBriefingStrip({ data }: { data: BriefingData }) {
  const { callsToday, callsYesterday, callbacksToday, dqedToday, apptToday } = data;
  const callTrend = callsToday - callsYesterday;

  const cards = [
    {
      icon: <PhoneCall size={16} className="text-amber-500" />,
      label: "Calls Today",
      value: callsToday,
      sub:
        callTrend === 0
          ? `Same as yesterday (${callsYesterday})`
          : callTrend > 0
            ? `↑ ${callTrend} more than yesterday`
            : `↓ ${Math.abs(callTrend)} fewer than yesterday`,
      subColor:
        callTrend > 0
          ? "text-green-600 dark:text-green-400"
          : callTrend < 0
            ? "text-red-500 dark:text-red-400"
            : "text-gray-400",
    },
    {
      icon: <CalendarCheck size={16} className="text-blue-500" />,
      label: "Callbacks Due Today",
      value: callbacksToday,
      sub: callbacksToday === 0 ? "All on time ✓" : `${callbacksToday} need a call`,
      subColor: callbacksToday > 0 ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400",
    },
    {
      icon: <Users size={16} className="text-green-500" />,
      label: "Leads DQ'd Today",
      value: dqedToday,
      sub: dqedToday === 0 ? "None added yet" : `${dqedToday} new lead${dqedToday !== 1 ? "s" : ""} in system`,
      subColor: "text-gray-400 dark:text-gray-500",
    },
    {
      icon: <Target size={16} className="text-purple-500" />,
      label: "Appointments Today",
      value: apptToday,
      sub: apptToday === 0 ? "None scheduled" : `${apptToday} booking${apptToday !== 1 ? "s" : ""} today`,
      subColor: apptToday > 0 ? "text-purple-600 dark:text-purple-400" : "text-gray-400 dark:text-gray-500",
    },
  ];

  return (
    <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 dark:border-white/[0.06] flex items-center gap-2">
        <Zap size={15} className="text-amber-500" />
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Today's Briefing</h3>
        <span className="text-xs text-gray-400 ml-1">— live snapshot as of now</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-gray-100 dark:divide-slate-800">
        {cards.map((c) => (
          <div key={c.label} className="px-5 py-4 flex items-start gap-3">
            <div className="mt-0.5 flex-shrink-0">{c.icon}</div>
            <div className="min-w-0">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{c.value}</div>
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{c.label}</div>
              <div className={`text-xs mt-0.5 ${c.subColor}`}>{c.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Lead Stats tab ─────────────────────────────────────────────────────────────
function LeadStatsSection({ leads }: { leads: Lead[] }) {
  const { reps, statusColors } = useAppStore();

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    ALL_STATUSES.forEach((s) => {
      counts[s] = 0;
    });
    leads.forEach((l) => {
      if (l.status in counts) counts[l.status]++;
    });
    return counts;
  }, [leads]);

  const maxStatusCount = Math.max(...Object.values(statusCounts), 1);

  const leadsByRep = useMemo(() => {
    const map: Record<number, number> = {};
    leads.forEach((l) => {
      const id = typeof l.dqRep === "number" ? l.dqRep : 0;
      map[id] = (map[id] || 0) + 1;
    });
    return reps
      .filter((r) => r.active)
      .map((r) => ({ rep: r, count: map[r.id] || 0 }))
      .sort((a, b) => b.count - a.count);
  }, [leads, reps]);

  const maxLeadCount = Math.max(...leadsByRep.map((x) => x.count), 1);

  const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const recentLeads = useMemo(
    () =>
      leads
        .filter((l) => l.createdAt && l.createdAt > sevenDaysAgo)
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
        .slice(0, 10),
    [leads],
  );

  const suburbCounts = useMemo(() => {
    const map: Record<string, number> = {};
    leads.forEach((l) => {
      if (l.suburb) map[l.suburb] = (map[l.suburb] || 0) + 1;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [leads]);

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-5">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
          <BarChart2 size={15} className="text-amber-500" /> Lead Status Breakdown
        </h3>
        <div className="space-y-2.5">
          {ALL_STATUSES.map((s) => {
            const count = statusCounts[s] || 0;
            const pct = Math.round((count / Math.max(leads.length, 1)) * 100);
            return (
              <div key={s} className="flex items-center gap-3">
                <span className="w-28 text-xs text-gray-600 dark:text-gray-400 flex-shrink-0 truncate">{s}</span>
                <div className="flex-1 bg-gray-100 dark:bg-[var(--surface)] rounded-full h-4 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(count / maxStatusCount) * 100}%`,
                      backgroundColor: getStatusColor(s, statusColors),
                    }}
                  />
                </div>
                <span className="w-10 text-right text-xs font-semibold text-gray-900 dark:text-white flex-shrink-0">
                  {count}
                </span>
                <span className="w-8 text-right text-xs text-gray-400 flex-shrink-0">{pct}%</span>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-gray-400 mt-3 text-right">{leads.length} total leads</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-5">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Leads Assigned per Rep</h3>
          {leadsByRep.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No reps found</p>
          ) : (
            <div className="space-y-2">
              {leadsByRep.map(({ rep, count }) => (
                <div key={rep.id} className="flex items-center gap-3 text-sm">
                  <RepAvatar rep={rep} size="sm" />
                  <span className="w-20 truncate text-gray-700 dark:text-gray-300 flex-shrink-0 text-xs">
                    {rep.name}
                  </span>
                  <div className="flex-1 bg-gray-100 dark:bg-[var(--surface)] rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-amber-500"
                      style={{ width: `${(count / maxLeadCount) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 text-right font-semibold text-gray-900 dark:text-white text-xs">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-5">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Top Suburbs</h3>
          {suburbCounts.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No suburb data</p>
          ) : (
            <div className="space-y-2">
              {suburbCounts.map(([suburb, count], i) => (
                <div key={suburb} className="flex items-center gap-3 text-sm">
                  <span className="w-5 text-xs text-gray-400 font-medium flex-shrink-0">{i + 1}</span>
                  <span className="flex-1 text-gray-700 dark:text-gray-300 text-xs truncate">{suburb}</span>
                  <div className="w-20 bg-gray-100 dark:bg-[var(--surface)] rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-gray-500"
                      style={{ width: `${(count / (suburbCounts[0]?.[1] ?? 1)) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 text-right font-semibold text-gray-900 dark:text-white text-xs">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-5">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Recently Added (Last 7 Days)</h3>
        {recentLeads.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">No leads added in last 7 days</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/[0.06]">
                  {["Name", "Status", "Suburb", "Rep", "Added"].map((h) => (
                    <th key={h} className="pb-2 text-left text-gray-500 dark:text-gray-400 font-medium pr-4">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
                {recentLeads.map((l) => {
                  const rep = reps.find((r) => r.id === l.dqRep);
                  const added = l.createdAt
                    ? new Date(l.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })
                    : "—";
                  return (
                    <tr key={l.id} className="hover:bg-gray-50 dark:hover:bg-[var(--hover)]/50">
                      <td className="py-1.5 pr-4 font-medium text-gray-900 dark:text-white">{l.name}</td>
                      <td className="py-1.5 pr-4">
                        <StatusBadge status={l.status} />
                      </td>
                      <td className="py-1.5 pr-4 text-gray-600 dark:text-gray-400">{l.suburb || "—"}</td>
                      <td className="py-1.5 pr-4 text-gray-600 dark:text-gray-400">{rep?.name ?? "—"}</td>
                      <td className="py-1.5 text-gray-400">{added}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Rep Performance tab ────────────────────────────────────────────────────────
function RepPerformanceSection({
  leads,
  settings,
  onRepClick,
}: {
  leads: Lead[];
  settings: AppSettings | null;
  onRepClick: (rep: Rep) => void;
}) {
  const { reps } = useAppStore();
  const [sortKey, setSortKey] = useState<"leads" | "calls" | "booked" | "revisit" | "conversion">("calls");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const today = todayStr();
  const startOfWeek = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString().split("T")[0];
  }, []);
  const startOfMonth = today.substring(0, 8) + "01";

  const repStats = useMemo(() => {
    return reps
      .filter((r) => r.active)
      .map((rep) => {
        const repLeads = leads.filter((l) => l.dqRep === rep.id);
        const leads_count = repLeads.length;
        const booked = repLeads.filter((l) => l.status === "Booked").length;
        const revisit = repLeads.filter((l) => l.status === "Revisit").length;
        const conversion = leads_count > 0 ? Math.round((booked / leads_count) * 100) : 0;
        const calls = leads.reduce((n, l) => n + (l.callHistory?.filter((c) => c.rep === rep.name).length || 0), 0);

        // Weekly/monthly actuals for target progress
        const weeklyDQActual = leads.filter((l) => l.dqRep === rep.id && (l.leadDate ?? "") >= startOfWeek).length;
        const monthlyDQActual = leads.filter((l) => l.dqRep === rep.id && (l.leadDate ?? "") >= startOfMonth).length;
        const weeklyBookedActual = repLeads.filter(
          (l) => l.status === "Booked" && (l.bookingDate ?? "") >= startOfWeek,
        ).length;
        const monthlyBookedActual = repLeads.filter(
          (l) => l.status === "Booked" && (l.bookingDate ?? "") >= startOfMonth,
        ).length;

        const target: RepTarget | undefined = settings?.repTargets?.[rep.id];

        return {
          rep,
          leads: leads_count,
          calls,
          booked,
          revisit,
          conversion,
          target,
          weeklyDQActual,
          monthlyDQActual,
          weeklyBookedActual,
          monthlyBookedActual,
        };
      });
  }, [leads, reps, settings, startOfWeek, startOfMonth]);

  const sorted = useMemo(() => {
    return [...repStats].sort((a, b) => {
      const va = a[sortKey] as number,
        vb = b[sortKey] as number;
      return sortDir === "desc" ? vb - va : va - vb;
    });
  }, [repStats, sortKey, sortDir]);

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const SortTh = ({ label, k }: { label: string; k: typeof sortKey }) => (
    <th
      className="px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap cursor-pointer hover:text-amber-600 dark:hover:text-amber-400 select-none"
      onClick={() => handleSort(k)}
    >
      {label} {sortKey === k ? (sortDir === "desc" ? "↓" : "↑") : ""}
    </th>
  );

  if (sorted.length === 0) return <div className="py-12 text-center text-gray-400 text-sm">No active reps found</div>;

  const maxCalls = Math.max(...sorted.map((s) => s.calls), 1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard
          label="Total Calls Logged"
          value={sorted.reduce((n, s) => n + s.calls, 0)}
          sub="all reps combined"
        />
        <SummaryCard label="Total Booked" value={sorted.reduce((n, s) => n + s.booked, 0)} sub="from all leads" />
        <SummaryCard
          label="Total Revisit"
          value={sorted.reduce((n, s) => n + s.revisit, 0)}
          sub="callbacks scheduled"
        />
        <SummaryCard
          label="Avg Conversion"
          value={Math.round(sorted.reduce((n, s) => n + s.conversion, 0) / Math.max(sorted.length, 1))}
          sub="% DQ → Booked"
          suffix="%"
        />
      </div>

      <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-white/[0.06] flex items-center gap-2">
          <TrendingUp size={15} className="text-amber-500" />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Rep Leaderboard</h3>
          <span className="text-xs text-gray-400 ml-1">— click column to sort · click rep name to drill down</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-[var(--surface)]">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide w-8">
                  #
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Rep
                </th>
                <SortTh label="Calls" k="calls" />
                <SortTh label="Leads" k="leads" />
                <SortTh label="Booked" k="booked" />
                <SortTh label="Revisit" k="revisit" />
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Activity
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">
                  📈 Target
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
              {sorted.map((s, i) => {
                const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`;
                return (
                  <tr
                    key={s.rep.id}
                    className={`hover:bg-gray-50 dark:hover:bg-[var(--hover)]/50 ${i < 3 ? "bg-amber-50/30 dark:bg-amber-900/5" : ""}`}
                  >
                    <td className="px-3 py-3 text-sm">{medal}</td>
                    <td className="px-3 py-3">
                      <button
                        onClick={() => onRepClick(s.rep)}
                        className="flex items-center gap-2 hover:text-amber-600 dark:hover:text-amber-400 transition text-left"
                      >
                        <div className="w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-xs font-bold flex items-center justify-center flex-shrink-0">
                          {s.rep.name[0]}
                        </div>
                        <span className="font-medium text-gray-900 dark:text-white">{s.rep.name}</span>
                      </button>
                    </td>
                    <td className="px-3 py-3 font-semibold text-gray-900 dark:text-white">{s.calls}</td>
                    <td className="px-3 py-3 text-gray-600 dark:text-gray-400">{s.leads}</td>
                    <td className="px-3 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        {s.booked}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                        {s.revisit}
                      </span>
                    </td>
                    <td className="px-3 py-3 w-32">
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 h-1.5 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-amber-500"
                            style={{ width: `${(s.calls / maxCalls) * 100}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 min-w-[140px]">
                      {(() => {
                        const wDQ2 = s.target?.weeklyDQ;
                        const mDQ2 = s.target?.monthlyDQ;
                        const wBook = s.target?.weeklyBookings;
                        const mBook = s.target?.monthlyBookings;
                        const anyTarget = wDQ2 || mDQ2 || wBook || mBook;
                        if (!anyTarget)
                          return <span className="text-xs text-gray-300 dark:text-gray-600">No target set</span>;
                        const bar = (actual: number, target: number, color: string, label: string) => (
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-gray-400 w-12 shrink-0">{label}</span>
                            <div className="flex-1 bg-gray-100 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${color}`}
                                style={{ width: `${Math.min((actual / target) * 100, 100)}%` }}
                              />
                            </div>
                            <span
                              className={`whitespace-nowrap font-medium ${actual >= target ? "text-green-600 dark:text-green-400" : "text-gray-500"}`}
                            >
                              {actual}/{target}
                            </span>
                          </div>
                        );
                        return (
                          <div className="space-y-1">
                            {wDQ2 && bar(s.weeklyDQActual, wDQ2, "bg-amber-400", "Wk DQ")}
                            {mDQ2 && bar(s.monthlyDQActual, mDQ2, "bg-gray-400", "Mo DQ")}
                            {wBook && bar(s.weeklyBookedActual, wBook, "bg-green-400", "Wk Bk")}
                            {mBook && bar(s.monthlyBookedActual, mBook, "bg-purple-400", "Mo Bk")}
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Operations tab ─────────────────────────────────────────────────────────────
function OperationsSection({
  leads,
  reps,
  staleThresholdDays,
}: {
  leads: Lead[];
  reps: Rep[];
  staleThresholdDays: number;
}) {
  const today = todayStr();

  // 1A — Overdue callbacks
  const overdueCallbacks = useMemo(() => {
    return leads
      .filter((l) => l.status === "Revisit" && l.callbackDate && l.callbackDate < today)
      .map((l) => ({ lead: l, daysOverdue: daysBetween(l.callbackDate!) }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue);
  }, [leads, today]);

  // 1B — Upcoming bookings/appointments
  const upcoming = useMemo(() => {
    const items: { lead: Lead; date: string; type: "Booking" | "Appointment" }[] = [];
    leads.forEach((l) => {
      if (l.bookingDate && l.bookingDate >= today) items.push({ lead: l, date: l.bookingDate, type: "Booking" });
      else if (l.appointmentDate && l.appointmentDate >= today)
        items.push({ lead: l, date: l.appointmentDate, type: "Appointment" });
    });
    return items.sort((a, b) => a.date.localeCompare(b.date));
  }, [leads, today]);

  const getBucket = (dateStr: string): string => {
    const days = daysBetween(today, dateStr); // days until event
    if (days === 0) return "Today";
    if (days === 1) return "Tomorrow";
    if (days <= 7) return "This Week";
    return "Later";
  };

  const upcomingBuckets = useMemo(() => {
    const map = new Map<string, typeof upcoming>();
    const order = ["Today", "Tomorrow", "This Week", "Later"];
    order.forEach((b) => map.set(b, []));
    upcoming.forEach((item) => {
      const bucket = getBucket(item.date);
      map.get(bucket)?.push(item);
    });
    return order.filter((b) => (map.get(b)?.length ?? 0) > 0).map((b) => ({ bucket: b, items: map.get(b)! }));
  }, [upcoming]);

  // 1C — Stale leads (grouped by rep)
  const staleLeads = useMemo(() => {
    const activeStatuses = new Set(["DQ", "Booked", "Revisit"]);
    const stale: { lead: Lead; lastContact: string | null; daysSince: number }[] = [];
    leads.forEach((l) => {
      if (!activeStatuses.has(l.status)) return;
      const lcd = lastCallDate(l);
      if (!lcd) {
        // Never called — always stale if in active status
        stale.push({ lead: l, lastContact: null, daysSince: 999 });
      } else {
        const days = daysBetween(lcd);
        if (days >= staleThresholdDays) stale.push({ lead: l, lastContact: lcd, daysSince: days });
      }
    });
    return stale.sort((a, b) => b.daysSince - a.daysSince);
  }, [leads, staleThresholdDays]);

  const staleByRep = useMemo(() => {
    const map = new Map<number, typeof staleLeads>();
    staleLeads.forEach((item) => {
      const id = item.lead.dqRep;
      if (!map.has(id)) map.set(id, []);
      map.get(id)!.push(item);
    });
    return Array.from(map.entries())
      .map(([repId, items]) => ({ rep: reps.find((r) => r.id === repId), repId, items }))
      .sort((a, b) => b.items.length - a.items.length);
  }, [staleLeads, reps]);

  const [collapsedStaleReps, setCollapsedStaleReps] = useState<Set<number>>(new Set());
  const toggleStaleRep = (id: number) =>
    setCollapsedStaleReps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const overdueColor = (days: number) => {
    if (days > 7) return "text-red-600 dark:text-red-400 font-semibold";
    if (days >= 1) return "text-amber-600 dark:text-amber-400 font-semibold";
    return "text-green-600 dark:text-green-400 font-semibold";
  };

  // Live rep activity — most recent action per rep
  const repActivity = useMemo(() => {
    return reps
      .filter((r) => r.active)
      .map((rep) => {
        // Most recent call logged BY this rep
        let lastCallMs = 0;
        let lastCallDesc = "";
        leads.forEach((l) => {
          (l.callHistory || []).forEach((c) => {
            if (c.rep === rep.name && c.date) {
              const ts = new Date(`${c.date}T${c.time || "09:00"}`).getTime();
              if (!isNaN(ts) && ts > lastCallMs) {
                lastCallMs = ts;
                lastCallDesc = `Logged call — ${l.name}`;
              }
            }
          });
        });
        // Most recent lead DQ'd to this rep (by createdAt)
        let lastDQMs = 0;
        let lastDQDesc = "";
        leads.forEach((l) => {
          if (l.dqRep === rep.id && l.createdAt && l.createdAt > lastDQMs) {
            lastDQMs = l.createdAt;
            lastDQDesc = `Added lead — ${l.name}`;
          }
        });
        // Pick most recent
        let recentMs = 0;
        let recentDesc: string | null = null;
        if (lastCallMs >= lastDQMs && lastCallMs > 0) {
          recentMs = lastCallMs;
          recentDesc = lastCallDesc;
        } else if (lastDQMs > 0) {
          recentMs = lastDQMs;
          recentDesc = lastDQDesc;
        }
        return { rep, recentMs, recentDesc };
      })
      .sort((a, b) => b.recentMs - a.recentMs);
  }, [reps, leads]);

  return (
    <div className="space-y-6">
      {/* Live Rep Activity */}
      <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-white/[0.06] flex items-center gap-2">
          <Activity size={15} className="text-green-500" />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Live Rep Activity</h3>
          <span className="text-xs text-gray-400 ml-1">— most recent action per rep</span>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-slate-800">
          {repActivity.map(({ rep, recentMs, recentDesc }) => {
            const isActive = recentMs > 0 && Date.now() - recentMs < 3 * 3600 * 1000; // active in last 3h
            const isToday = recentMs > 0 && new Date(recentMs).toDateString() === new Date().toDateString();
            return (
              <div
                key={rep.id}
                className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-[var(--hover)]/40 transition"
              >
                {/* Avatar + pulse */}
                <div className="relative flex-shrink-0">
                  <RepAvatar rep={rep} size="sm" />
                  {isActive && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 border-2 border-white dark:border-slate-900" />
                  )}
                </div>
                {/* Rep name */}
                <div className="w-20 flex-shrink-0">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{rep.name}</span>
                </div>
                {/* Last action */}
                <div className="flex-1 text-sm text-gray-500 dark:text-gray-400 truncate">
                  {recentDesc ?? <span className="text-gray-300 dark:text-gray-600 italic">No activity recorded</span>}
                </div>
                {/* Time ago */}
                <div className="flex-shrink-0 text-right">
                  {recentMs > 0 ? (
                    <span
                      className={`text-xs font-medium ${isActive ? "text-green-600 dark:text-green-400" : isToday ? "text-amber-600 dark:text-amber-400" : "text-gray-400 dark:text-gray-500"}`}
                    >
                      {timeAgo(recentMs)}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Overdue Callbacks */}
      <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-white/[0.06] flex items-center gap-2">
          <Phone size={15} className="text-red-500" />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Overdue Callbacks</h3>
          {overdueCallbacks.length > 0 && (
            <span className="ml-auto text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 rounded-full font-medium">
              {overdueCallbacks.length} overdue
            </span>
          )}
        </div>
        {overdueCallbacks.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm">✅ No overdue callbacks</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-[var(--surface)]">
                <tr>
                  {["Rep", "Lead Name", "Phone", "Suburb", "Scheduled", "Days Overdue"].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                {overdueCallbacks.map(({ lead, daysOverdue }) => (
                  <tr key={lead.id} className="hover:bg-gray-50 dark:hover:bg-[var(--hover)]/50">
                    <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400 text-xs whitespace-nowrap">
                      {getRepName(leads, reps, lead.dqRep)}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-gray-900 dark:text-white">{lead.name}</td>
                    <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400 text-xs">{lead.phone}</td>
                    <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400 text-xs">{lead.suburb}</td>
                    <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">
                      {lead.callbackDate} {lead.callbackTime ? `@ ${lead.callbackTime}` : ""}
                    </td>
                    <td className={`px-3 py-2.5 text-xs whitespace-nowrap ${overdueColor(daysOverdue)}`}>
                      {daysOverdue === 0 ? "Due today" : `${daysOverdue} day${daysOverdue !== 1 ? "s" : ""}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Upcoming Bookings / Appointments */}
      <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-white/[0.06] flex items-center gap-2">
          <AlertCircle size={15} className="text-amber-500" />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Upcoming Appointments & Bookings</h3>
          {upcoming.length > 0 && (
            <span className="ml-auto text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">
              {upcoming.length} upcoming
            </span>
          )}
        </div>
        {upcoming.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm">No upcoming appointments or bookings</div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-slate-800">
            {upcomingBuckets.map(({ bucket, items }) => (
              <div key={bucket}>
                <div className="px-5 py-2 bg-gray-50 dark:bg-[var(--surface)]/60 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  {bucket} — {items.length} {items.length === 1 ? "event" : "events"}
                </div>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-50 dark:divide-slate-800/50">
                    {items.map(({ lead, date, type }) => {
                      const daysAway = daysBetween(today, date);
                      return (
                        <tr key={`${lead.id}-${type}`} className="hover:bg-gray-50 dark:hover:bg-[var(--hover)]/50">
                          <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">
                            {date}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-gray-400">
                            {daysAway === 0 ? "today" : `in ${daysAway}d`}
                          </td>
                          <td className="px-3 py-2.5 font-medium text-gray-900 dark:text-white">{lead.name}</td>
                          <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400 text-xs">
                            {getRepName(leads, reps, lead.dqRep)}
                          </td>
                          <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400 text-xs">{lead.suburb}</td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                type === "Booking"
                                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                  : "bg-gray-100 text-gray-700 dark:bg-gray-800/30 dark:text-gray-400"
                              }`}
                            >
                              {type}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stale Leads */}
      <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-white/[0.06] flex items-center gap-2">
          <AlertCircle size={15} className="text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Stale Leads <span className="font-normal text-gray-400">(no contact in {staleThresholdDays}+ days)</span>
          </h3>
          {staleLeads.length > 0 && (
            <span className="ml-auto text-xs bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-400 px-2 py-0.5 rounded-full font-medium">
              {staleLeads.length} stale
            </span>
          )}
        </div>
        {staleLeads.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm">
            ✅ No stale leads — all leads contacted within {staleThresholdDays} days
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-slate-800">
            {staleByRep.map(({ rep, repId, items }) => {
              const collapsed = collapsedStaleReps.has(repId);
              return (
                <div key={repId}>
                  <button
                    onClick={() => toggleStaleRep(repId)}
                    className="w-full px-5 py-2.5 bg-gray-50 dark:bg-[var(--surface)]/60 flex items-center gap-2 text-left hover:bg-gray-100 dark:hover:bg-[var(--hover)] transition"
                  >
                    {collapsed ? (
                      <ChevronRight size={13} className="text-gray-400" />
                    ) : (
                      <ChevronDown size={13} className="text-gray-400" />
                    )}
                    <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-gray-400 text-xs font-bold flex items-center justify-center flex-shrink-0">
                      {rep?.name?.[0] ?? "?"}
                    </div>
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                      {rep?.name ?? `Rep #${repId}`}
                    </span>
                    <span className="ml-auto text-xs text-gray-400">
                      {items.length} stale {items.length === 1 ? "lead" : "leads"}
                    </span>
                  </button>
                  {!collapsed && (
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-gray-50 dark:divide-slate-800/50">
                        {items.map(({ lead, lastContact, daysSince }) => (
                          <tr key={lead.id} className="hover:bg-gray-50 dark:hover:bg-[var(--hover)]/50">
                            <td className="px-5 py-2.5 font-medium text-gray-900 dark:text-white">{lead.name}</td>
                            <td className="px-3 py-2.5">
                              <StatusBadge status={lead.status} />
                            </td>
                            <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400 text-xs">{lead.suburb}</td>
                            <td className="px-3 py-2.5 text-gray-400 text-xs whitespace-nowrap">
                              {lastContact ? `Last: ${lastContact}` : "Never contacted"}
                            </td>
                            <td className="px-3 py-2.5 text-xs">
                              <span
                                className={
                                  daysSince >= 30 ? "text-red-500 font-semibold" : "text-amber-500 font-medium"
                                }
                              >
                                {daysSince >= 999 ? "—" : `${daysSince}d ago`}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Settings tab ───────────────────────────────────────────────────────────────
function SettingsSection({
  settings,
  reps,
  onSave,
}: {
  settings: AppSettings | null;
  reps: Rep[];
  onSave: (s: Partial<AppSettings>) => Promise<boolean>;
}) {
  const { setStatusColors } = useAppStore();

  // Commission rates
  const [dqRate, setDqRate] = useState<string>(String(settings?.commission?.dqRate ?? 0));
  const [fcRate, setFcRate] = useState<string>(String(settings?.commission?.fcRate ?? 0));
  const [frRate, setFrRate] = useState<string>(String(settings?.commission?.frRate ?? 0));
  const [ratesSaved, setRatesSaved] = useState(false);

  // Stale threshold
  const [stale, setStale] = useState<string>(String(settings?.staleThresholdDays ?? 14));
  const [staleSaved, setStaleSaved] = useState(false);

  // Rep targets — local state map keyed by rep.id
  const [targets, setTargets] = useState<Record<number, RepTarget>>(() => settings?.repTargets ?? {});
  const [targetsSaved, setTargetsSaved] = useState(false);

  // Status pin colours — local editable copy
  const [localColors, setLocalColors] = useState<Record<string, string>>(() => ({
    ...DEFAULT_STATUS_COLORS,
    ...settings?.statusColors,
  }));
  const [colorsSaved, setColorsSaved] = useState(false);

  // Keep in sync with loaded settings
  React.useEffect(() => {
    if (settings) {
      setDqRate(String(settings.commission?.dqRate ?? 0));
      setFcRate(String(settings.commission?.fcRate ?? 0));
      setFrRate(String(settings.commission?.frRate ?? 0));
      setStale(String(settings.staleThresholdDays ?? 14));
      setTargets(settings.repTargets ?? {});
      setLocalColors({ ...DEFAULT_STATUS_COLORS, ...settings.statusColors });
    }
  }, [settings]);

  const handleSaveColors = async () => {
    const ok = await onSave({ statusColors: localColors });
    if (ok) {
      setStatusColors(localColors);
      setColorsSaved(true);
      setTimeout(() => setColorsSaved(false), 2000);
    }
  };

  const activeReps = reps.filter((r) => r.active);

  const handleSaveRates = async () => {
    const ok = await onSave({ commission: { dqRate: Number(dqRate), fcRate: Number(fcRate), frRate: Number(frRate) } });
    if (ok) {
      setRatesSaved(true);
      setTimeout(() => setRatesSaved(false), 2000);
    }
  };

  const handleSaveStale = async () => {
    const ok = await onSave({ staleThresholdDays: Number(stale) });
    if (ok) {
      setStaleSaved(true);
      setTimeout(() => setStaleSaved(false), 2000);
    }
  };

  const handleSaveTargets = async () => {
    const ok = await onSave({ repTargets: targets });
    if (ok) {
      setTargetsSaved(true);
      setTimeout(() => setTargetsSaved(false), 2000);
    }
  };

  const updateTarget = (repId: number, field: keyof RepTarget, val: string) => {
    setTargets((prev) => ({
      ...prev,
      [repId]: { ...prev[repId], [field]: val === "" ? undefined : Number(val) },
    }));
  };

  const inputCls =
    "w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400";
  const labelCls = "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1";

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Commission rate defaults */}
      <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-5">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Commission Rate Defaults</h3>
        <p className="text-xs text-gray-400 mb-4">
          Reference percentages shown in Comms Calculator. Informational only.
        </p>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "DQ Rep Cut %", val: dqRate, set: setDqRate },
            { label: "FC Rep Cut %", val: fcRate, set: setFcRate },
            { label: "FR Rep Cut %", val: frRate, set: setFrRate },
          ].map(({ label, val, set }) => (
            <div key={label}>
              <label className={labelCls}>{label}</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={val}
                onChange={(e) => set(e.target.value)}
                className={inputCls}
              />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={handleSaveRates}
            className="px-4 py-2 rounded-lg bg-amber-500 text-white font-semibold text-sm hover:bg-amber-400 transition"
          >
            Save Rates
          </button>
          {ratesSaved && <span className="text-xs text-green-500 font-medium">✓ Saved</span>}
        </div>
      </div>

      {/* Stale leads threshold */}
      <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-5">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Stale Leads Threshold</h3>
        <p className="text-xs text-gray-400 mb-4">Flag leads in active statuses with no contact in this many days.</p>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min="1"
            max="365"
            value={stale}
            onChange={(e) => setStale(e.target.value)}
            className="w-28 px-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <span className="text-sm text-gray-500 dark:text-gray-400">days without contact</span>
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={handleSaveStale}
            className="px-4 py-2 rounded-lg bg-amber-500 text-white font-semibold text-sm hover:bg-amber-400 transition"
          >
            Save Threshold
          </button>
          {staleSaved && <span className="text-xs text-green-500 font-medium">✓ Saved</span>}
        </div>
      </div>

      {/* Rep targets */}
      <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-5">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Rep Targets</h3>
        <p className="text-xs text-gray-400 mb-4">
          Set weekly and monthly DQ + booking targets per rep. Progress shown in Rep Performance tab.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-white/[0.06]">
                <th className="pb-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 pr-4">Rep</th>
                <th className="pb-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 pr-3">
                  Weekly DQ
                </th>
                <th className="pb-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 pr-3">
                  Monthly DQ
                </th>
                <th className="pb-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 pr-3">
                  Wkly Bookings
                </th>
                <th className="pb-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Mo Bookings</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
              {activeReps.map((rep) => {
                const t = targets[rep.id] ?? {};
                return (
                  <tr key={rep.id}>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <RepAvatar rep={rep} size="xs" />
                        <span className="text-gray-900 dark:text-white font-medium text-xs">{rep.name}</span>
                      </div>
                    </td>
                    {(["weeklyDQ", "monthlyDQ", "weeklyBookings", "monthlyBookings"] as (keyof RepTarget)[]).map(
                      (field) => (
                        <td key={field} className="py-2 pr-3">
                          <input
                            type="number"
                            min="0"
                            placeholder="—"
                            value={t[field] ?? ""}
                            onChange={(e) => updateTarget(rep.id, field, e.target.value)}
                            className="w-20 px-2 py-1 rounded border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                          />
                        </td>
                      ),
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={handleSaveTargets}
            className="px-4 py-2 rounded-lg bg-amber-500 text-white font-semibold text-sm hover:bg-amber-400 transition"
          >
            Save All Targets
          </button>
          {targetsSaved && <span className="text-xs text-green-500 font-medium">✓ Saved</span>}
        </div>
      </div>

      {/* Status pin colours */}
      <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-5">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Status Pin Colours</h3>
        <p className="text-xs text-gray-400 mb-4">
          Customise the colour used for each status on map pins, table badges, and charts.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {ALL_STATUSES.map((status) => {
            const hex = localColors[status] ?? DEFAULT_STATUS_COLORS[status] ?? "#9ca3af";
            return (
              <div key={status} className="flex items-center gap-3">
                <input
                  type="color"
                  value={hex}
                  onChange={(e) => setLocalColors((prev) => ({ ...prev, [status]: e.target.value }))}
                  className="w-10 h-10 rounded-lg cursor-pointer border border-gray-200 dark:border-white/[0.06] p-0.5 bg-white dark:bg-[var(--surface)]"
                  title={status}
                />
                <div>
                  <div className="text-xs font-medium text-gray-700 dark:text-gray-300">{status}</div>
                  <div
                    className="mt-0.5 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ backgroundColor: hex + "26", color: hex, border: `1px solid ${hex}55` }}
                  >
                    preview
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={handleSaveColors}
            className="px-4 py-2 rounded-lg bg-amber-500 text-white font-semibold text-sm hover:bg-amber-400 transition"
          >
            Save Colours
          </button>
          <button
            onClick={() => setLocalColors({ ...DEFAULT_STATUS_COLORS })}
            className="px-4 py-2 rounded-lg border border-gray-200 dark:border-white/[0.06] text-gray-600 dark:text-gray-400 text-sm hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition"
          >
            Reset to Defaults
          </button>
          {colorsSaved && <span className="text-xs text-green-500 font-medium">✓ Saved</span>}
        </div>
      </div>
    </div>
  );
}

// ── Rep Drill-Down Modal ───────────────────────────────────────────────────────
function RepDrillDownModal({ rep, leads, onClose }: { rep: Rep; leads: Lead[]; onClose: () => void }) {
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const repLeads = useMemo(() => leads.filter((l) => l.dqRep === rep.id), [leads, rep.id]);
  const booked = repLeads.filter((l) => l.status === "Booked").length;
  const conversion = repLeads.length > 0 ? ((booked / repLeads.length) * 100).toFixed(1) : "0.0";
  const totalCalls = leads.reduce((n, l) => n + (l.callHistory?.filter((c) => c.rep === rep.name).length || 0), 0);

  const filteredLeads = useMemo(
    () => (statusFilter === "all" ? repLeads : repLeads.filter((l) => normalizeLeadStatus(l.status) === statusFilter)),
    [repLeads, statusFilter],
  );

  // All calls logged BY this rep across the entire lead set
  const recentCalls = useMemo(() => {
    const calls: { lead: Lead; date: string; time: string; result: string; notes: string }[] = [];
    leads.forEach((l) => {
      (l.callHistory ?? []).forEach((c) => {
        if (c.rep === rep.name) calls.push({ lead: l, date: c.date, time: c.time, result: c.result, notes: c.notes });
      });
    });
    return calls
      .sort((a, b) => {
        const da = `${a.date}T${a.time || "00:00"}`;
        const db2 = `${b.date}T${b.time || "00:00"}`;
        return db2.localeCompare(da);
      })
      .slice(0, 50);
  }, [leads, rep.name]);

  const statusChips = ["all", ...ALL_STATUSES.filter((s) => repLeads.some((l) => normalizeLeadStatus(l.status) === s))];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white dark:bg-[var(--surface)] rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-4 p-5 border-b border-gray-100 dark:border-white/[0.06] flex-shrink-0">
          <RepAvatar rep={rep} size="lg" />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{rep.name}</h2>
              {rep.role === "admin" && (
                <span className="flex items-center gap-0.5 text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                  <ShieldCheck size={11} /> Admin
                </span>
              )}
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  rep.active
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {rep.active ? "Active" : "Inactive"}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">ID #{rep.id}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-[var(--hover)] hover:text-gray-600 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="overflow-y-auto flex-1 p-5 space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard label="Leads" value={repLeads.length} sub="DQ'd to this rep" />
            <SummaryCard label="Calls Logged" value={totalCalls} sub="by this rep" />
            <SummaryCard label="Booked" value={booked} sub="confirmed" />
            <SummaryCard label="Conversion" value={parseFloat(conversion)} sub="DQ → Booked" suffix="%" />
          </div>

          {/* Their leads */}
          <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-white/[0.06] flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mr-2">Their Leads</h3>
              {statusChips.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition ${
                    statusFilter === s
                      ? "bg-amber-500 text-white"
                      : "bg-gray-100 dark:bg-[var(--surface)] text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-[var(--hover)]"
                  }`}
                >
                  {s === "all" ? `All (${repLeads.length})` : s}
                </button>
              ))}
            </div>
            {filteredLeads.length === 0 ? (
              <div className="py-6 text-center text-gray-400 text-sm">No leads with this status</div>
            ) : (
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 dark:bg-[var(--surface)]">
                    <tr>
                      {["Status", "Name", "Suburb", "Last Call"].map((h) => (
                        <th
                          key={h}
                          className="px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
                    {filteredLeads.map((l) => (
                      <tr key={l.id} className="hover:bg-gray-50 dark:hover:bg-[var(--hover)]/50">
                        <td className="px-3 py-2">
                          <StatusBadge status={l.status} />
                        </td>
                        <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{l.name}</td>
                        <td className="px-3 py-2 text-gray-500 dark:text-gray-400 text-xs">{l.suburb}</td>
                        <td className="px-3 py-2 text-gray-400 text-xs">{lastCallDate(l) ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Recent calls */}
          <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-white/[0.06]">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Recent Calls by {rep.name}</h3>
              <p className="text-xs text-gray-400">Latest 50 calls logged across all leads</p>
            </div>
            {recentCalls.length === 0 ? (
              <div className="py-6 text-center text-gray-400 text-sm">No calls logged yet</div>
            ) : (
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 dark:bg-[var(--surface)]">
                    <tr>
                      {["Date", "Lead", "Result", "Notes"].map((h) => (
                        <th
                          key={h}
                          className="px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
                    {recentCalls.map((c, i) => (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-[var(--hover)]/50">
                        <td className="px-3 py-2 text-gray-400 text-xs whitespace-nowrap">
                          {c.date} {c.time}
                        </td>
                        <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{c.lead.name}</td>
                        <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">{c.result}</td>
                        <td className="px-3 py-2 text-xs text-gray-400 max-w-[200px] truncate">{c.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Rep row ────────────────────────────────────────────────────────────────────
function RepRow({
  rep,
  onSave,
  onToggle,
  onRemove,
  onDrillDown,
}: {
  rep: Rep;
  onSave: (updated: Rep) => void;
  onToggle: (id: number) => void;
  onRemove: (id: number) => void;
  onDrillDown: (rep: Rep) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(rep.name);
  const [role, setRole] = useState<Rep["role"]>(rep.role ?? "rep");
  const [email, setEmail] = useState(rep.email ?? "");
  const [phone, setPhone] = useState(rep.phone ?? "");
  const [abn, setAbn] = useState(rep.abn ?? "");
  const [bsb, setBsb] = useState(rep.bsb ?? "");
  const [accountNumber, setAccountNumber] = useState(rep.accountNumber ?? "");
  const [repPin, setRepPin] = useState(rep.pin ?? "");
  const [repBackupPass, setRepBackupPass] = useState(rep.backupPassword ?? "");
  const [repColor, setRepColor] = useState(rep.color ?? "");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(rep.photo ?? "");
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [permissions, setPermissions] = useState<string[]>(rep.permissions ?? []);
  const [showOnCalendar, setShowOnCalendar] = useState(rep.showOnCalendar !== false);
  const [availableForBookings, setAvailableForBookings] = useState(rep.availableForBookings !== false);
  const [allowedServiceTypes, setAllowedServiceTypes] = useState<string[]>(rep.allowedServiceTypes ?? []);
  const [alertsEnabled, setAlertsEnabled] = useState(rep.alertsEnabled ?? false);
  const [showApptTypes, setShowApptTypes] = useState(false);
  const { serviceTypes: allServiceTypes } = useServiceTypes();
  const { showToast } = useToast();

  const ALL_PAGES: { key: string; label: string }[] = [
    { key: "dashboard", label: "Dashboard" },
    { key: "team-chat", label: "Team Chat" },
    { key: "leads", label: "Leads" },
    { key: "client-hub", label: "Clients" },
    { key: "calendar", label: "Calendar" },
    { key: "deal-dashboard", label: "Deals" },
    { key: "dq-import", label: "DQ Import" },
    { key: "map", label: "Map" },
    { key: "draps", label: "DRAPS & Stats" },
    { key: "commissions", label: "Comms Calculator" },
    { key: "document-centre", label: "Document Centre" },
    { key: "knowledge-base", label: "Knowledge Base" },
  ];
  const togglePerm = (key: string) =>
    setPermissions((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setPhotoUploading(true);
    try {
      const path = `repPhotos/${rep.id}_${Date.now()}.${file.name.split(".").pop()}`;
      const url = await uploadFile(path, file);
      setPhotoUrl(url);
      // Immediately persist the photo to Firestore via onSave
      onSave({
        ...rep,
        name: name.trim() || rep.name,
        role,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        abn: abn.trim() || undefined,
        bsb: bsb.trim() || undefined,
        accountNumber: accountNumber.trim() || undefined,
        photo: url,
        color: repColor.trim() || undefined,
      });
    } catch {
      /* silent fail */
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      ...rep,
      name: name.trim(),
      role,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      abn: abn.trim() || undefined,
      bsb: bsb.trim() || undefined,
      accountNumber: accountNumber.trim() || undefined,
      photo: photoUrl || undefined,
      pin: repPin.trim() || undefined,
      backupPassword: repBackupPass.trim() || undefined,
      permissions: permissions.length > 0 ? permissions : undefined,
      color: repColor.trim() || undefined,
      showOnCalendar: showOnCalendar,
      availableForBookings: availableForBookings,
      allowedServiceTypes: allowedServiceTypes.length > 0 ? allowedServiceTypes : undefined,
      alertsEnabled: alertsEnabled,
    });
    setEditing(false);
    setExpanded(false);
  };

  const handleCancel = () => {
    setName(rep.name);
    setRole(rep.role ?? "rep");
    setEmail(rep.email ?? "");
    setPhone(rep.phone ?? "");
    setAbn(rep.abn ?? "");
    setBsb(rep.bsb ?? "");
    setAccountNumber(rep.accountNumber ?? "");
    setRepPin(rep.pin ?? "");
    setRepBackupPass(rep.backupPassword ?? "");
    setRepColor(rep.color ?? "");
    setPermissions(rep.permissions ?? []);
    setShowOnCalendar(rep.showOnCalendar !== false);
    setAvailableForBookings(rep.availableForBookings !== false);
    setAllowedServiceTypes(rep.allowedServiceTypes ?? []);
    setAlertsEnabled(rep.alertsEnabled ?? false);
    setEditing(false);
    setExpanded(false);
  };

  return (
    <div
      className={`rounded-lg border transition ${
        rep.active
          ? "border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)]"
          : "border-gray-100 dark:border-white/[0.06] bg-gray-50 dark:bg-[var(--surface)]/50 opacity-60"
      }`}
    >
      <div className="flex items-center gap-3 p-3">
        {/* Hidden photo file input */}
        <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />

        {/* Avatar: click to drill-down (normal) OR click to upload photo (when expanded) */}
        <div className="relative flex-shrink-0">
          <RepAvatar
            rep={{ ...rep, photo: photoUrl || rep.photo }}
            size="md"
            onClick={expanded ? () => photoInputRef.current?.click() : () => onDrillDown(rep)}
            showCameraHint={expanded}
          />
          {photoUploading && (
            <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {editing ? (
          <div className="flex-1 flex items-center gap-2 flex-wrap">
            <input
              className="flex-1 min-w-[120px] px-2 py-1 rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") handleCancel();
              }}
              autoFocus
            />
            <select
              className="px-2 py-1 rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              value={role}
              onChange={(e) => setRole(e.target.value as Rep["role"])}
            >
              <option value="rep">Rep</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        ) : (
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <button
                onClick={() => onDrillDown(rep)}
                className="font-medium text-gray-900 dark:text-white text-sm truncate hover:text-amber-600 dark:hover:text-amber-400 transition"
              >
                {rep.name}
              </button>
              {rep.role === "admin" && (
                <span className="flex items-center gap-0.5 text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                  <ShieldCheck size={11} /> Admin
                </span>
              )}
              {!rep.active && <span className="text-xs text-gray-400 dark:text-gray-500">Inactive</span>}
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
              <span>ID #{rep.id}</span>
              {rep.lastLoginAt ? (
                <span className="text-green-600 dark:text-green-400 font-medium">● {timeAgo(rep.lastLoginAt)}</span>
              ) : (
                <span className="text-gray-300 dark:text-gray-600">never logged in</span>
              )}
              {!rep.isSetup && rep.active && (
                <span
                  className="text-amber-500 dark:text-amber-400 font-medium"
                  title="Rep hasn't completed first-time setup yet — they need to log in and set their PIN"
                >
                  ⚠ not set up
                </span>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-1 flex-shrink-0">
          {editing ? (
            <>
              <button
                onClick={handleSave}
                className="p-1.5 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-600 hover:bg-green-200 transition"
                title="Save"
              >
                <Check size={14} />
              </button>
              <button
                onClick={handleCancel}
                className="p-1.5 rounded-lg bg-gray-100 dark:bg-[var(--surface)] text-gray-500 hover:bg-gray-200 transition"
                title="Cancel"
              >
                <X size={14} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setExpanded(!expanded)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-[var(--hover)] hover:text-gray-600 transition"
                title="Edit details"
              >
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              <button
                onClick={() => {
                  setEditing(true);
                  setExpanded(true);
                }}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-[var(--hover)] hover:text-gray-600 transition"
                title="Quick edit name"
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={() => onToggle(rep.id)}
                className={`p-1.5 rounded-lg transition ${rep.active ? "text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500" : "text-gray-400 hover:bg-green-50 dark:hover:bg-green-900/20 hover:text-green-500"}`}
                title={rep.active ? "Deactivate" : "Activate"}
              >
                <Power size={14} />
              </button>
              {confirmRemove ? (
                <>
                  <span className="text-xs text-red-500 font-medium">Sure?</span>
                  <button
                    onClick={() => onRemove(rep.id)}
                    className="p-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100 transition"
                    title="Confirm remove"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    onClick={() => setConfirmRemove(false)}
                    className="p-1.5 rounded-lg bg-gray-100 dark:bg-[var(--surface)] text-gray-500 hover:bg-gray-200 transition"
                    title="Cancel"
                  >
                    <X size={14} />
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setConfirmRemove(true)}
                  className="p-1.5 rounded-lg text-gray-300 dark:text-slate-600 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 transition"
                  title="Remove rep"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100 dark:border-white/[0.06] grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: "Email", val: email, set: setEmail, placeholder: "rep@example.com" },
            { label: "Phone", val: phone, set: setPhone, placeholder: "04xx xxx xxx" },
            { label: "ABN", val: abn, set: setAbn, placeholder: "12 345 678 901" },
            { label: "BSB", val: bsb, set: setBsb, placeholder: "062 000" },
            { label: "Account #", val: accountNumber, set: setAccountNumber, placeholder: "12345678" },
          ].map(({ label, val, set, placeholder }) => (
            <div key={label}>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</label>
              <input
                className="w-full px-2 py-1 rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                value={val}
                onChange={(e) => set(e.target.value)}
                placeholder={placeholder}
              />
            </div>
          ))}

          {/* ── Calendar Colour ── */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Calendar Colour</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={repColor || "#9ca3af"}
                onChange={(e) => setRepColor(e.target.value)}
                className="h-9 w-16 rounded border border-gray-200 dark:border-white/[0.06] cursor-pointer"
              />
              <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{repColor || "not set"}</span>
              {repColor && (
                <button
                  type="button"
                  onClick={() => setRepColor("")}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* ── Calendar Toggles ── */}
          <div className="col-span-full">
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Calendar Visibility
            </label>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300 select-none">
                <input
                  type="checkbox"
                  checked={showOnCalendar}
                  onChange={(e) => setShowOnCalendar(e.target.checked)}
                  className="rounded accent-amber-500"
                />
                Show on Calendar
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300 select-none">
                <input
                  type="checkbox"
                  checked={availableForBookings}
                  onChange={(e) => setAvailableForBookings(e.target.checked)}
                  className="rounded accent-amber-500"
                />
                Available for Bookings
              </label>
            </div>
          </div>

          {/* ── Performance Alerts ── */}
          <div className="col-span-full">
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Performance Alerts
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={alertsEnabled}
                onChange={(e) => setAlertsEnabled(e.target.checked)}
                className="rounded accent-amber-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Enable Performance Alerts
              </span>
            </label>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
              When enabled, this rep receives in-app nudges for activity targets — low activity warnings, target progress, and end-of-day summaries.
            </p>
          </div>

          {/* ── Login credentials (admin-visible) ── */}
          <div className="col-span-full border-t border-gray-100 dark:border-white/[0.06] pt-3 mt-1">
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">
              🔐 Login Credentials
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  PIN <span className="text-gray-400 font-normal">(4–6 digits)</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={repPin}
                  onChange={(e) => setRepPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="Not set"
                  maxLength={6}
                  className="w-full px-2 py-1 rounded-lg border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-900/10 text-gray-900 dark:text-white text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Backup Password
                </label>
                <input
                  type="text"
                  value={repBackupPass}
                  onChange={(e) => setRepBackupPass(e.target.value)}
                  placeholder="Not set"
                  className="w-full px-2 py-1 rounded-lg border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-900/10 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Account Status
                </label>
                <div
                  className={`px-2 py-1.5 rounded-lg text-xs font-medium ${rep.isSetup ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"}`}
                >
                  {rep.isSetup ? "✓ Set up" : "⏳ Awaiting first login"}
                </div>
              </div>
            </div>
          </div>
          {/* Photo upload row */}
          <div className="col-span-full">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Profile Photo</label>
            <div className="flex items-center gap-3">
              <RepAvatar
                rep={{ ...rep, photo: photoUrl || rep.photo }}
                size="lg"
                onClick={() => photoInputRef.current?.click()}
                showCameraHint
              />
              <div>
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={photoUploading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-white/[0.08] text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition disabled:opacity-50"
                >
                  <Camera size={12} />
                  {photoUploading ? "Uploading…" : photoUrl || rep.photo ? "Change Photo" : "Upload Photo"}
                </button>
                {(photoUrl || rep.photo) && (
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoUrl("");
                      onSave({ ...rep, photo: undefined });
                    }}
                    className="mt-1 text-xs text-red-400 hover:text-red-500 hover:underline block"
                  >
                    Remove photo
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ── Page Access Permissions ───────────────────────────────── */}
          <div className="col-span-full">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Page Access
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPermissions([])}
                  className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline"
                >
                  Full access (default)
                </button>
                <button
                  type="button"
                  onClick={() => setPermissions(["team-chat", "map"])}
                  className="text-xs text-amber-500 hover:text-amber-600 underline"
                >
                  Knock-only preset
                </button>
              </div>
            </div>
            <div className="p-3 rounded-lg border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-[var(--surface)]/50">
              {permissions.length === 0 ? (
                <p className="text-xs text-green-600 dark:text-green-400 font-medium mb-2">
                  ✓ Full access — can see all pages
                </p>
              ) : (
                <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mb-2">
                  ⚠ Restricted — can only see selected pages
                </p>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {ALL_PAGES.map(({ key, label }) => (
                  <label
                    key={key}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer select-none text-xs font-medium transition ${
                      permissions.includes(key)
                        ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700"
                        : "bg-white dark:bg-[var(--surface)] text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-white/[0.06]"
                    } ${permissions.length === 0 ? "opacity-40" : ""}`}
                  >
                    <input
                      type="checkbox"
                      className="accent-amber-500"
                      checked={permissions.length === 0 || permissions.includes(key)}
                      disabled={permissions.length === 0}
                      onChange={() => {
                        if (permissions.length > 0) togglePerm(key);
                      }}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* ── Appointment Type Permissions ── */}
          {allServiceTypes.length > 0 && (
            <div className="col-span-full">
              <button
                type="button"
                onClick={() => setShowApptTypes((s) => !s)}
                className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 hover:text-gray-700 dark:hover:text-gray-300 transition"
              >
                {showApptTypes ? "▾" : "▸"} Appointment Types{" "}
                {allowedServiceTypes.length === 0 ? "(all allowed)" : `(${allowedServiceTypes.length} selected)`}
              </button>
              {showApptTypes && (
                <div className="p-3 rounded-lg border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-[var(--surface)]/50">
                  <div className="flex gap-3 mb-2">
                    <button
                      type="button"
                      onClick={() => setAllowedServiceTypes([])}
                      className="text-xs text-green-600 hover:underline"
                    >
                      Allow all
                    </button>
                    <button
                      type="button"
                      onClick={() => setAllowedServiceTypes(allServiceTypes.map((s) => s.id))}
                      className="text-xs text-gray-400 hover:underline"
                    >
                      Clear all
                    </button>
                  </div>
                  {allowedServiceTypes.length === 0 && (
                    <p className="text-xs text-green-600 dark:text-green-400 font-medium mb-2">
                      ✓ All appointment types allowed
                    </p>
                  )}
                  {Array.from(new Set(allServiceTypes.map((s) => s.category))).map((cat) => (
                    <div key={cat} className="mb-2">
                      <p className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-1">{cat}</p>
                      <div className="grid grid-cols-2 gap-1">
                        {allServiceTypes
                          .filter((s) => s.category === cat)
                          .map((st) => (
                            <label key={st.id} className="flex items-center gap-1.5 text-xs cursor-pointer">
                              <input
                                type="checkbox"
                                checked={allowedServiceTypes.length === 0 || allowedServiceTypes.includes(st.id)}
                                disabled={allowedServiceTypes.length === 0}
                                onChange={() => {
                                  if (allowedServiceTypes.length === 0) return;
                                  setAllowedServiceTypes((prev) =>
                                    prev.includes(st.id) ? prev.filter((id) => id !== st.id) : [...prev, st.id],
                                  );
                                }}
                                className="rounded accent-amber-500"
                              />
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: st.color }} />
                              <span className="text-gray-700 dark:text-gray-300 truncate">{st.name}</span>
                            </label>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Login & Access ── */}
          <div className="col-span-full mt-1 p-4 rounded-xl bg-slate-50 dark:bg-[var(--surface)]/50 border border-slate-200 dark:border-white/[0.06]/50">
            <h5 className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider mb-3">
              Login &amp; Access
            </h5>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                {email.trim() ? (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 dark:bg-green-400 flex-shrink-0" />
                    Email linked: {email.trim()}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 flex-shrink-0" />
                    No login email set
                  </span>
                )}
              </div>
              {email.trim() && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await sendPasswordResetEmail(auth, email.trim());
                      showToast(`Password reset email sent to ${email.trim()}`, "success");
                    } catch (e: unknown) {
                      showToast("Failed to send reset email: " + (e instanceof Error ? e.message : String(e)), "error");
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-700/20 text-gray-700 dark:text-gray-400 border border-gray-200 dark:border-gray-600/30 hover:bg-gray-200 dark:hover:bg-gray-600/30 transition"
                >
                  📧 Send Password Reset Email
                </button>
              )}
            </div>
            {!email.trim() && (
              <p className="text-xs text-slate-400 dark:text-gray-500 mt-2">
                Set this rep's email in the Email field above, click Save, then use "Send Password Reset Email" to let
                them create their own password.
              </p>
            )}
          </div>

          <div className="col-span-full flex gap-2 pt-1">
            <button
              onClick={handleSave}
              className="px-4 py-1.5 rounded-lg bg-amber-500 text-white font-semibold text-sm hover:bg-amber-400 transition"
            >
              Save
            </button>
            <button
              onClick={handleCancel}
              className="px-4 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.06] text-gray-600 dark:text-gray-400 text-sm hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Audit log ──────────────────────────────────────────────────────────────────
function AuditLogSection() {
  const { reps } = useAppStore();
  const { entries, loading } = useAuditLog(500);
  const [filterUser, setFilterUser] = useState("");
  const [filterAction, setFilterAction] = useState("");

  const filtered = useMemo(
    () =>
      entries.filter((e) => {
        if (filterUser && e.user !== filterUser) return false;
        if (filterAction && !e.action.includes(filterAction)) return false;
        return true;
      }),
    [entries, filterUser, filterAction],
  );

  const handleExport = () => {
    exportAsCSV(
      filtered.map((e) => ({
        Date: e.date,
        Time: e.time,
        User: e.user,
        Action: e.action,
        Detail: e.detail,
        "Lead ID": e.leadId ?? "",
        "Lead Name": e.leadName ?? "",
      })),
      "asg-audit-log",
    );
  };

  const actionBadge = (action: string) => {
    if (action.includes("created")) return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    if (action.includes("deleted")) return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    if (action.includes("call")) return "bg-gray-100 text-gray-700 dark:bg-gray-800/30 dark:text-gray-400";
    return "bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-400";
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filterUser}
          onChange={(e) => setFilterUser(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white text-sm focus:outline-none"
        >
          <option value="">All Users</option>
          {reps.map((r) => (
            <option key={r.id} value={r.name}>
              {r.name}
            </option>
          ))}
        </select>
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white text-sm focus:outline-none"
        >
          <option value="">All Actions</option>
          <option value="created">Created</option>
          <option value="updated">Updated</option>
          <option value="deleted">Deleted</option>
          <option value="call">Call Logged</option>
        </select>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.06] text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition"
        >
          <Download size={13} /> Export CSV
        </button>
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} entries</span>
      </div>

      {loading ? (
        <div className="py-8 text-center text-gray-400 text-sm">Loading audit log…</div>
      ) : filtered.length === 0 ? (
        <div className="py-8 text-center text-gray-400 dark:text-gray-500 text-sm">No audit entries found</div>
      ) : (
        <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] overflow-hidden">
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 dark:bg-[var(--surface)]">
                <tr>
                  {["Date", "Time", "User", "Action", "Detail"].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                {filtered.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-[var(--hover)]/50">
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap text-xs">{e.date}</td>
                    <td className="px-3 py-2 text-gray-400 whitespace-nowrap text-xs">{e.time}</td>
                    <td className="px-3 py-2 font-medium text-gray-900 dark:text-white whitespace-nowrap">{e.user}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${actionBadge(e.action)}`}>
                        {e.action}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400 text-xs">{e.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Calendar Settings section ─────────────────────────────────────────────────
function CalendarSettingsSection() {
  const { showToast } = useToast();
  const { serviceTypes } = useServiceTypes();
  const { save } = useSaveServiceType();
  const { remove } = useDeleteServiceType();

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [loadingDefaults, setLoadingDefaults] = useState(false);
  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editColor, setEditColor] = useState("#f59e0b");
  const [editDuration, setEditDuration] = useState(60);
  // Editable category headers
  const [editingCatName, setEditingCatName] = useState<string | null>(null);
  const [editCatValue, setEditCatValue] = useState("");
  const [renamingCat, setRenamingCat] = useState(false);

  // Add form state
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("General");
  const [newColor, setNewColor] = useState("#f59e0b");
  const [newDuration, setNewDuration] = useState(60);
  const [addError, setAddError] = useState("");

  const inputCls =
    "w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500";

  // Derive categories dynamically from existing service types (+ fallback defaults)
  const defaultCatOrder = [
    "General",
    "First Consult",
    "Finance",
    "Property Sale",
    "Site/Lot Viewings",
    "Lead Re-Engagement",
    "Zoom Meeting",
  ];
  const existingCats = Array.from(new Set(serviceTypes.map((s) => s.category)));
  const categories = Array.from(new Set([...defaultCatOrder, ...existingCats]));

  const grouped = useMemo(() => {
    return categories
      .map((cat) => ({
        cat,
        types: serviceTypes.filter((s) => s.category === cat).sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99)),
      }))
      .filter((g) => g.types.length > 0);
  }, [serviceTypes, categories]);

  const handleAdd = async () => {
    if (!newName.trim()) {
      setAddError("Name is required");
      return;
    }
    setAddError("");
    const id = `st_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newSt: ServiceType = {
      id,
      name: newName.trim(),
      category: newCategory,
      color: newColor,
      defaultDuration: newDuration,
      sortOrder: Math.max(0, ...serviceTypes.map((s) => s.sortOrder ?? 0)) + 10,
    };
    const ok = await save(newSt);
    if (ok) {
      showToast("✅ Service type added", "success");
      setNewName("");
      setNewColor("#f59e0b");
      setNewDuration(60);
    } else {
      showToast("❌ Failed to save", "error");
    }
  };

  const handleDelete = async (id: string) => {
    await remove(id);
    setConfirmDeleteId(null);
    showToast("Service type deleted", "success");
  };

  const handleLoadDefaults = async () => {
    setLoadingDefaults(true);
    for (const def of DEFAULT_SERVICE_TYPES) {
      const id = `st_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await save({ ...def, id });
      await new Promise((r) => setTimeout(r, 60));
    }
    setLoadingDefaults(false);
    showToast("✅ Default service types loaded", "success");
  };

  const startEdit = (st: ServiceType) => {
    setEditingId(st.id);
    setEditName(st.name);
    setEditCategory(st.category);
    setEditColor(st.color);
    setEditDuration(st.defaultDuration);
    setConfirmDeleteId(null);
  };

  const handleEditSave = async (st: ServiceType) => {
    await save({
      ...st,
      name: editName.trim() || st.name,
      category: editCategory,
      color: editColor,
      defaultDuration: editDuration,
    });
    setEditingId(null);
    showToast("✅ Saved", "success");
  };

  const handleCopy = async (st: ServiceType) => {
    const id = `st_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const maxOrder = Math.max(0, ...serviceTypes.map((s) => s.sortOrder ?? 0));
    const copy: ServiceType = { ...st, id, name: `Copy of ${st.name}`, sortOrder: maxOrder + 10 };
    await save(copy);
    startEdit(copy);
    showToast("✅ Copied — update and save", "success");
  };

  const handleReorder = async (st: ServiceType, dir: "up" | "down", siblings: ServiceType[]) => {
    const idx = siblings.findIndex((s) => s.id === st.id);
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;
    const other = siblings[swapIdx];
    const aOrder = st.sortOrder ?? idx * 10;
    const bOrder = other.sortOrder ?? swapIdx * 10;
    await save({ ...st, sortOrder: bOrder });
    await new Promise((r) => setTimeout(r, 60));
    await save({ ...other, sortOrder: aOrder });
    showToast("Reordered", "success");
  };

  const handleRenameCategory = async (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) {
      setEditingCatName(null);
      return;
    }
    setRenamingCat(true);
    const toRename = serviceTypes.filter((st) => st.category === oldName);
    for (const st of toRename) {
      await save({ ...st, category: trimmed });
      await new Promise((r) => setTimeout(r, 60));
    }
    setRenamingCat(false);
    setEditingCatName(null);
    showToast(`✅ Renamed "${oldName}" → "${trimmed}"`, "success");
  };

  return (
    <div className="space-y-6">
      {/* Load defaults banner (only when empty) */}
      {serviceTypes.length === 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">No service types yet</p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              Load the default ASG service types to get started quickly.
            </p>
          </div>
          <button
            onClick={handleLoadDefaults}
            disabled={loadingDefaults}
            className="px-4 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 font-medium disabled:opacity-50 whitespace-nowrap"
          >
            {loadingDefaults ? "Loading…" : "Load Defaults"}
          </button>
        </div>
      )}

      {/* Service types grouped by category */}
      {grouped.map(({ cat, types }) => (
        <div
          key={cat}
          className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] overflow-hidden"
        >
          {/* Category header — click to rename */}
          <div className="px-5 py-3 border-b border-gray-100 dark:border-white/[0.06] bg-amber-50 dark:bg-amber-900/10 flex items-center gap-2">
            {editingCatName === cat ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  autoFocus
                  value={editCatValue}
                  onChange={(e) => setEditCatValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameCategory(cat, editCatValue);
                    if (e.key === "Escape") setEditingCatName(null);
                  }}
                  className="flex-1 px-2 py-1 text-sm rounded border border-amber-300 dark:border-amber-600 bg-white dark:bg-[var(--surface)] text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                <button
                  onClick={() => handleRenameCategory(cat, editCatValue)}
                  disabled={renamingCat}
                  className="text-xs px-2 py-1 bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50"
                >
                  {renamingCat ? "…" : "Save"}
                </button>
                <button
                  onClick={() => setEditingCatName(null)}
                  className="text-xs px-2 py-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-[var(--hover)] rounded"
                >
                  ✕
                </button>
              </div>
            ) : (
              <>
                <h3
                  className="text-sm font-semibold text-amber-700 dark:text-amber-400 cursor-pointer hover:text-amber-900 dark:hover:text-amber-300 flex-1"
                  title="Click to rename category"
                  onClick={() => {
                    setEditingCatName(cat);
                    setEditCatValue(cat);
                  }}
                >
                  {cat} <span className="text-xs font-normal text-amber-500">✏️</span>
                </h3>
                <span className="text-xs text-amber-500 dark:text-amber-500">{types.length} types</span>
              </>
            )}
          </div>
          {types.length === 0 ? (
            <p className="px-5 py-4 text-sm text-gray-400 dark:text-gray-500">No types in this category yet.</p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-slate-800">
              {types.map((st, idx) => (
                <div key={st.id}>
                  {editingId === st.id ? (
                    // Inline edit form
                    <div className="px-4 py-3 bg-amber-50 dark:bg-amber-900/10 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-gray-500 mb-0.5 block">Name</label>
                          <input value={editName} onChange={(e) => setEditName(e.target.value)} className={inputCls} />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 mb-0.5 block">Category</label>
                          <input
                            list={`cat-list-${st.id}`}
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value)}
                            className={inputCls}
                          />
                          <datalist id={`cat-list-${st.id}`}>
                            {categories.map((c) => (
                              <option key={c} value={c} />
                            ))}
                          </datalist>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 mb-0.5 block">Colour</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={editColor}
                              onChange={(e) => setEditColor(e.target.value)}
                              className="h-8 w-12 rounded border border-gray-200 dark:border-white/[0.06] cursor-pointer"
                            />
                            <span className="text-xs text-gray-500 font-mono">{editColor}</span>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 mb-0.5 block">Duration</label>
                          <select
                            value={editDuration}
                            onChange={(e) => setEditDuration(Number(e.target.value))}
                            className={inputCls}
                          >
                            <option value={20}>20 min</option>
                            <option value={30}>30 min</option>
                            <option value={45}>45 min</option>
                            <option value={60}>60 min</option>
                            <option value={90}>90 min</option>
                            <option value={120}>120 min</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditSave(st)}
                          className="px-3 py-1 text-xs bg-amber-500 text-white rounded-lg hover:bg-amber-600"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1 text-xs border border-gray-200 dark:border-white/[0.08] text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-[var(--hover)]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-4 py-2.5">
                      {/* Reorder buttons */}
                      <div className="flex flex-col gap-0.5 flex-shrink-0">
                        <button
                          onClick={() => handleReorder(st, "up", types)}
                          disabled={idx === 0}
                          className="text-gray-300 dark:text-slate-600 hover:text-gray-500 disabled:opacity-20 disabled:cursor-default leading-none"
                          title="Move up"
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => handleReorder(st, "down", types)}
                          disabled={idx === types.length - 1}
                          className="text-gray-300 dark:text-slate-600 hover:text-gray-500 disabled:opacity-20 disabled:cursor-default leading-none"
                          title="Move down"
                        >
                          ▼
                        </button>
                      </div>
                      <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: st.color }} />
                      <span className="flex-1 text-sm text-gray-800 dark:text-gray-200 truncate">{st.name}</span>
                      <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                        {st.defaultDuration}min
                      </span>
                      {/* Action buttons */}
                      {confirmDeleteId === st.id ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-red-500">Delete?</span>
                          <button
                            onClick={() => handleDelete(st.id)}
                            className="text-xs px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-xs px-2 py-1 border border-gray-200 dark:border-white/[0.08] rounded text-gray-500 hover:bg-gray-50 dark:hover:bg-[var(--hover)]"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={() => startEdit(st)}
                            className="p-1.5 text-gray-400 hover:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/20 rounded transition"
                            title="Edit"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => handleCopy(st)}
                            className="p-1.5 text-gray-400 hover:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/20 rounded transition"
                            title="Duplicate"
                          >
                            📋
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(st.id)}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition"
                            title="Delete"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Add new service type */}
      <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-5">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Add Service Type</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Name *</label>
            <input
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setAddError("");
              }}
              placeholder="e.g. Finance Run"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            {addError && <p className="text-xs text-red-500 mt-1">{addError}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Category</label>
            <input
              list="new-cat-list"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <datalist id="new-cat-list">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Colour</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="h-9 w-16 rounded border border-gray-200 dark:border-white/[0.06] cursor-pointer"
              />
              <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{newColor}</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Default Duration</label>
            <select
              value={newDuration}
              onChange={(e) => setNewDuration(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value={20}>20 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={45}>45 minutes</option>
              <option value={60}>60 minutes</option>
              <option value={90}>90 minutes</option>
              <option value={120}>120 minutes</option>
            </select>
          </div>
        </div>
        <button
          onClick={handleAdd}
          className="mt-4 px-4 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 font-medium"
        >
          + Add Service Type
        </button>
      </div>
    </div>
  );
}

// ── SyncSection ───────────────────────────────────────────────────────────────
function SyncSection({
  settings,
  onSaveSettings,
  onOpenSyncModal,
}: {
  settings: AppSettings | null;
  onSaveSettings: (s: Partial<AppSettings>) => void;
  onOpenSyncModal: () => void;
}) {
  const sync = settings?.sheets;
  const [url, setUrl] = React.useState(sync?.url ?? "");
  const [tab, setTab] = React.useState(sync?.tab ?? "Sheet1");
  const [autoEnabled, setAutoEnabled] = React.useState(sync?.autoSyncEnabled ?? false);
  const [intervalMins, setIntervalMins] = React.useState(sync?.autoSyncIntervalMins ?? 15);
  const [saved, setSaved] = React.useState(false);

  // Keep local state in sync with loaded settings
  React.useEffect(() => {
    if (sync?.url) setUrl(sync.url);
    if (sync?.tab) setTab(sync.tab);
    if (sync?.autoSyncEnabled !== undefined) setAutoEnabled(sync.autoSyncEnabled);
    if (sync?.autoSyncIntervalMins) setIntervalMins(sync.autoSyncIntervalMins);
  }, [sync?.url, sync?.tab, sync?.autoSyncEnabled, sync?.autoSyncIntervalMins]);

  const handleSave = () => {
    onSaveSettings({
      sheets: {
        url,
        tab,
        autoSyncEnabled: autoEnabled,
        autoSyncIntervalMins: intervalMins,
        lastSyncAt: sync?.lastSyncAt,
        lastSyncResult: sync?.lastSyncResult,
        lastSyncSummary: sync?.lastSyncSummary,
      } as SyncConfig,
    });
    localStorage.setItem("asgSheetUrl", url);
    localStorage.setItem("asgSheetTab", tab);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const lastSyncText = sync?.lastSyncAt
    ? (() => {
        const diff = Date.now() - sync.lastSyncAt;
        if (diff < 60000) return "Just now";
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return `${Math.floor(diff / 86400000)}d ago`;
      })()
    : null;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Google Sheets Sync</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Configure two-way sync between the CRM and a Google Sheet.
        </p>
      </div>

      {/* Sync Status */}
      {sync?.lastSyncAt && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-[var(--surface)]/50 border border-gray-200 dark:border-white/[0.06]">
          <div
            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
              sync.lastSyncResult === "success"
                ? "bg-green-500"
                : sync.lastSyncResult === "partial"
                  ? "bg-amber-500"
                  : sync.lastSyncResult === "error"
                    ? "bg-red-500"
                    : "bg-gray-400"
            }`}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Last synced {lastSyncText}</p>
            {sync.lastSyncSummary && (
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{sync.lastSyncSummary}</p>
            )}
          </div>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              sync.lastSyncResult === "success"
                ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                : sync.lastSyncResult === "partial"
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                  : sync.lastSyncResult === "error"
                    ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                    : "bg-gray-100 text-gray-600"
            }`}
          >
            {sync.lastSyncResult === "success"
              ? "✓ Success"
              : sync.lastSyncResult === "partial"
                ? "⚠ Partial"
                : sync.lastSyncResult === "error"
                  ? "✕ Error"
                  : "Unknown"}
          </span>
        </div>
      )}

      {/* Configuration */}
      <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-5 space-y-4">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-amber-600 dark:text-amber-400 text-xs font-bold">
            1
          </span>
          Sheet Configuration
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Google Sheet URL</label>
            <input
              type="text"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-400"
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Tab / Sheet Name</label>
            <input
              type="text"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-400"
              placeholder="Sheet1"
              value={tab}
              onChange={(e) => setTab(e.target.value)}
            />
          </div>
        </div>

        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 pt-1">
          <span className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-amber-600 dark:text-amber-400 text-xs font-bold">
            2
          </span>
          Auto-Sync Schedule
        </h4>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAutoEnabled((v) => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${autoEnabled ? "bg-amber-500" : "bg-gray-300 dark:bg-slate-600"}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${autoEnabled ? "translate-x-6" : "translate-x-1"}`}
              />
            </button>
            <span className="text-sm text-gray-700 dark:text-gray-300">Auto-sync on page load</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 dark:text-gray-400">Interval</label>
            <select
              className="px-2 py-1 text-sm rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none"
              value={intervalMins}
              onChange={(e) => setIntervalMins(Number(e.target.value))}
              disabled={!autoEnabled}
            >
              <option value={5}>5 min</option>
              <option value={15}>15 min</option>
              <option value={30}>30 min</option>
              <option value={60}>60 min</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-400 transition"
          >
            {saved ? "✓ Saved" : "Save Configuration"}
          </button>
          <button
            onClick={onOpenSyncModal}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-white/[0.08] text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition flex items-center gap-1.5"
          >
            <span>Open Sync Modal</span>
            <ExternalLink size={13} />
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      {sync?.url && (
        <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-5">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Quick Actions</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            These open the Sheets Sync modal pre-configured. You will need to authenticate with Google once per session.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={onOpenSyncModal}
              className="flex items-center justify-center gap-2 px-3 py-3 rounded-lg bg-gray-50 dark:bg-gray-800/20 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-400 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800/30 transition"
            >
              <ArrowDownCircle size={15} />
              Pull from Sheet
            </button>
            <button
              onClick={onOpenSyncModal}
              className="flex items-center justify-center gap-2 px-3 py-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm font-medium hover:bg-green-100 dark:hover:bg-green-900/30 transition"
            >
              <ArrowUpCircle size={15} />
              Push to Sheet
            </button>
            <button
              onClick={onOpenSyncModal}
              className="flex items-center justify-center gap-2 px-3 py-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-sm font-medium hover:bg-amber-100 dark:hover:bg-amber-900/30 transition"
            >
              <RefreshCw size={15} />
              Two-Way Sync
            </button>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="bg-gray-50 dark:bg-gray-800/30 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-700 dark:text-gray-400 mb-2">How Two-Way Sync Works</p>
        <ul className="text-xs text-gray-600 dark:text-gray-300 space-y-1 list-disc list-inside">
          <li>
            <strong>Pull</strong> — reads new rows from the sheet and imports them as leads (matched by phone)
          </li>
          <li>
            <strong>Push</strong> — writes all CRM leads back to the sheet (overwrites)
          </li>
          <li>
            <strong>Two-Way</strong> — Pull first (get new sheet entries), then Push (export everything back)
          </li>
          <li>Google OAuth is required each session — click any action button above to authenticate</li>
        </ul>
      </div>
    </div>
  );
}

// ── DataToolsSection ──────────────────────────────────────────────────────────
function DataToolsSection({
  leads,
  reps,
  onUpdateLeads: _onUpdateLeads,
  onExport,
}: {
  leads: Lead[];
  reps: Rep[];
  onUpdateLeads: (updated: Lead[]) => void;
  onExport: (type: "leads" | "calls") => void;
}) {
  const { showToast } = useToast();
  const [bulkFrom, setBulkFrom] = React.useState("");
  const [bulkTo, setBulkTo] = React.useState("");
  const [confirmBulk, setConfirmBulk] = React.useState(false);
  const [assignFrom, setAssignFrom] = React.useState<number | "">("");
  const [assignTo, setAssignTo] = React.useState<number | "">("");
  const [confirmAssign, setConfirmAssign] = React.useState(false);
  const [archiveDays, setArchiveDays] = React.useState(60);
  const [confirmArchive, setConfirmArchive] = React.useState(false);
  const { save: saveLead } = useSaveLead();
  const { remove: deleteLead } = useDeleteLead();

  const statusCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    leads.forEach((l) => {
      const s = normalizeLeadStatus(l.status);
      counts[s] = (counts[s] ?? 0) + 1;
    });
    return counts;
  }, [leads]);

  const STATUS_COLORS: Record<string, string> = {
    DQ: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    Booked: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
    Revisit: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
    "Not Interested": "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    "Wrong Number": "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    "No Answer": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  };

  const bulkCount = bulkFrom ? leads.filter((l) => normalizeLeadStatus(l.status) === bulkFrom).length : 0;
  const assignCount = assignFrom ? leads.filter((l) => l.dqRep === assignFrom).length : 0;

  const staleForArchive = React.useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - archiveDays);
    return leads.filter((l) => {
      if (l.status !== "DQ") return false;
      if (l.callHistory && l.callHistory.length > 0) return false;
      const d = l.leadDate ? new Date(l.leadDate) : null;
      return d && d < cutoff;
    });
  }, [leads, archiveDays]);

  const handleBulkStatus = async () => {
    if (!bulkFrom || !bulkTo || bulkFrom === bulkTo) return;
    const toUpdate = leads.filter((l) => normalizeLeadStatus(l.status) === bulkFrom);
    let done = 0;
    for (const lead of toUpdate) {
      await saveLead({ ...lead, status: bulkTo as import("../types").LeadStatus });
      done++;
    }
    showToast(`Updated ${done} leads from ${bulkFrom} → ${bulkTo}`, "success");
    setConfirmBulk(false);
    setBulkFrom("");
    setBulkTo("");
  };

  const handleBulkAssign = async () => {
    if (!assignFrom || !assignTo || assignFrom === assignTo) return;
    const toUpdate = leads.filter((l) => l.dqRep === assignFrom);
    let done = 0;
    for (const lead of toUpdate) {
      await saveLead({ ...lead, dqRep: assignTo as number });
      done++;
    }
    showToast(`Reassigned ${done} leads`, "success");
    setConfirmAssign(false);
    setAssignFrom("");
    setAssignTo("");
  };

  const handleArchive = async () => {
    let done = 0;
    for (const lead of staleForArchive) {
      await deleteLead(lead.id);
      done++;
    }
    showToast(`Archived (deleted) ${done} stale DQ leads`, "success");
    setConfirmArchive(false);
  };

  const ALL_STATUSES_DT = [...LEAD_STATUS_OPTIONS];
  const activeReps = reps.filter((r) => r.active);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Data Tools</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">Bulk operations and data management for leads.</p>
      </div>

      {/* Lead counts */}
      <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-5">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Lead Counts by Status</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {ALL_STATUSES_DT.map((s) => (
            <div key={s} className={`p-3 rounded-lg ${STATUS_COLORS[s] ?? "bg-gray-100 text-gray-700"}`}>
              <p className="text-lg font-bold">{statusCounts[s] ?? 0}</p>
              <p className="text-xs font-medium">{s}</p>
            </div>
          ))}
          <div className="p-3 rounded-lg bg-gray-900 text-white dark:bg-gray-700">
            <p className="text-lg font-bold">{leads.length}</p>
            <p className="text-xs font-medium">Total</p>
          </div>
        </div>
      </div>

      {/* Bulk Status Change */}
      <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-5 space-y-3">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Bulk Status Change</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400">Move all leads with one status to another status.</p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none"
            value={bulkFrom}
            onChange={(e) => {
              setBulkFrom(e.target.value);
              setConfirmBulk(false);
            }}
          >
            <option value="">From status…</option>
            {ALL_STATUSES_DT.map((s) => (
              <option key={s} value={s}>
                {s} ({statusCounts[s] ?? 0})
              </option>
            ))}
          </select>
          <span className="text-gray-400 text-sm">→</span>
          <select
            className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none"
            value={bulkTo}
            onChange={(e) => {
              setBulkTo(e.target.value);
              setConfirmBulk(false);
            }}
          >
            <option value="">To status…</option>
            {ALL_STATUSES_DT.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {bulkFrom &&
            bulkTo &&
            bulkFrom !== bulkTo &&
            (confirmBulk ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-600 font-medium">Update {bulkCount} leads?</span>
                <button
                  onClick={handleBulkStatus}
                  className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-400"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setConfirmBulk(false)}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-white/[0.08] text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[var(--hover)]"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmBulk(true)}
                className="px-3 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-400"
              >
                Apply to {bulkCount} leads
              </button>
            ))}
        </div>
      </div>

      {/* Bulk Reassign */}
      <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-5 space-y-3">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Bulk Reassign Leads</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Transfer all leads assigned to one rep to another rep.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none"
            value={assignFrom}
            onChange={(e) => {
              setAssignFrom(Number(e.target.value) || "");
              setConfirmAssign(false);
            }}
          >
            <option value="">From rep…</option>
            {activeReps.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({leads.filter((l) => l.dqRep === r.id).length})
              </option>
            ))}
          </select>
          <span className="text-gray-400 text-sm">→</span>
          <select
            className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none"
            value={assignTo}
            onChange={(e) => {
              setAssignTo(Number(e.target.value) || "");
              setConfirmAssign(false);
            }}
          >
            <option value="">To rep…</option>
            {activeReps
              .filter((r) => r.id !== assignFrom)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
          </select>
          {assignFrom &&
            assignTo &&
            (confirmAssign ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-600 font-medium">Reassign {assignCount} leads?</span>
                <button
                  onClick={handleBulkAssign}
                  className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-400"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setConfirmAssign(false)}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-white/[0.08] text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[var(--hover)]"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmAssign(true)}
                className="px-3 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-400"
              >
                Reassign {assignCount} leads
              </button>
            ))}
        </div>
      </div>

      {/* Archive stale DQs */}
      <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-5 space-y-3">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Archive Stale DQ Leads</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Permanently delete DQ leads that have never been called and were added more than N days ago.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-700 dark:text-gray-300">Older than</span>
          <input
            type="number"
            min={7}
            max={365}
            className="w-20 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none text-center"
            value={archiveDays}
            onChange={(e) => {
              setArchiveDays(Number(e.target.value));
              setConfirmArchive(false);
            }}
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">days with no calls</span>
          <span className="text-sm text-gray-500">— {staleForArchive.length} leads</span>
          {staleForArchive.length > 0 &&
            (confirmArchive ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-600 font-medium">
                  Delete {staleForArchive.length} leads permanently?
                </span>
                <button
                  onClick={handleArchive}
                  className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-400"
                >
                  Delete
                </button>
                <button
                  onClick={() => setConfirmArchive(false)}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-white/[0.08] text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[var(--hover)]"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmArchive(true)}
                className="px-3 py-2 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-800 text-sm font-medium hover:bg-red-200 dark:hover:bg-red-900/50"
              >
                Archive {staleForArchive.length} leads
              </button>
            ))}
        </div>
      </div>

      {/* Export Tools */}
      <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-5 space-y-3">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Export Data</h4>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onExport("leads")}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-200 dark:hover:bg-[var(--hover)] transition"
          >
            <Download size={14} /> Export All Leads (CSV)
          </button>
          <button
            onClick={() => onExport("calls")}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-200 dark:hover:bg-[var(--hover)] transition"
          >
            <Download size={14} /> Export Call History (CSV)
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Admin page ───────────────────────────────────────────────────────────
// ── System Health Section ─────────────────────────────────────────────────────
function SystemHealthSection({ leads }: { leads: Lead[] }) {
  const today = new Date().toISOString().split("T")[0];

  const stats = useMemo(() => {
    const active = leads.filter((l) => l.status !== "_deleted");
    const noContact = active.filter((l) => !l.callHistory?.length);
    const overdueFollowUps = active.filter(
      (l) => l.nextContactDate && isOverdue(l.nextContactDate),
    );
    const stale14 = active.filter((l) => {
      if (!l.lastCall && !l.callHistory?.length) return false; // never contacted — different metric
      const lastTs = l.lastCall ? new Date(l.lastCall).getTime() : 0;
      return Date.now() - lastTs > 14 * 24 * 60 * 60 * 1000;
    });
    const withFollowUp = active.filter((l) => l.nextContactDate);

    return {
      total: active.length,
      noContact: noContact.length,
      overdueFollowUps: overdueFollowUps.length,
      stale14: stale14.length,
      withFollowUp: withFollowUp.length,
    };
  }, [leads, today]);

  const healthCards = [
    {
      label: "Total Active Leads",
      value: stats.total,
      icon: <Users size={18} className="text-gray-500" />,
      bg: "bg-gray-50 dark:bg-slate-800/40",
      border: "border-gray-200 dark:border-slate-700",
      text: "text-gray-900 dark:text-white",
      sub: "in system (excl. deleted)",
    },
    {
      label: "No Contact Yet",
      value: stats.noContact,
      icon: <PhoneCall size={18} className="text-amber-500" />,
      bg: stats.noContact > 0 ? "bg-amber-50 dark:bg-amber-900/20" : "bg-gray-50 dark:bg-slate-800/40",
      border: stats.noContact > 0 ? "border-amber-200 dark:border-amber-900/50" : "border-gray-200 dark:border-slate-700",
      text: stats.noContact > 0 ? "text-amber-700 dark:text-amber-300" : "text-gray-900 dark:text-white",
      sub: "leads with no call history",
    },
    {
      label: "Overdue Follow-Ups",
      value: stats.overdueFollowUps,
      icon: <AlertCircle size={18} className="text-red-500" />,
      bg: stats.overdueFollowUps > 0 ? "bg-red-50 dark:bg-red-900/20" : "bg-gray-50 dark:bg-slate-800/40",
      border: stats.overdueFollowUps > 0 ? "border-red-200 dark:border-red-900/50" : "border-gray-200 dark:border-slate-700",
      text: stats.overdueFollowUps > 0 ? "text-red-700 dark:text-red-300" : "text-gray-900 dark:text-white",
      sub: "nextContactDate is past",
    },
    {
      label: "Stale (14+ days)",
      value: stats.stale14,
      icon: <Clock size={18} className="text-orange-500" />,
      bg: stats.stale14 > 0 ? "bg-orange-50 dark:bg-orange-900/20" : "bg-gray-50 dark:bg-slate-800/40",
      border: stats.stale14 > 0 ? "border-orange-200 dark:border-orange-900/50" : "border-gray-200 dark:border-slate-700",
      text: stats.stale14 > 0 ? "text-orange-700 dark:text-orange-300" : "text-gray-900 dark:text-white",
      sub: "last call was 14+ days ago",
    },
    {
      label: "Follow-Ups Scheduled",
      value: stats.withFollowUp,
      icon: <CalendarCheck size={18} className="text-green-500" />,
      bg: "bg-green-50 dark:bg-green-900/20",
      border: "border-green-200 dark:border-green-900/50",
      text: "text-green-700 dark:text-green-300",
      sub: "leads with nextContactDate set",
    },
  ];

  const healthScore = stats.total > 0
    ? Math.round(((stats.total - stats.noContact - stats.overdueFollowUps) / stats.total) * 100)
    : 100;

  return (
    <div className="space-y-6">
      {/* Overall score */}
      <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <HeartPulse size={15} className="text-red-500" />
              Pipeline Health Score
            </h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              Based on contact rate and follow-up compliance
            </p>
          </div>
          <div className="text-right">
            <span
              className={`text-3xl font-black ${
                healthScore >= 80
                  ? "text-green-600 dark:text-green-400"
                  : healthScore >= 60
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-red-600 dark:text-red-400"
              }`}
            >
              {healthScore}%
            </span>
          </div>
        </div>
        <div className="w-full h-3 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              healthScore >= 80
                ? "bg-green-500"
                : healthScore >= 60
                  ? "bg-amber-400"
                  : "bg-red-500"
            }`}
            style={{ width: `${healthScore}%` }}
          />
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {healthCards.map((card) => (
          <div
            key={card.label}
            className={`rounded-xl border p-4 ${card.bg} ${card.border}`}
          >
            <div className="flex items-center gap-2 mb-2">{card.icon}</div>
            <div className={`text-2xl font-bold ${card.text}`}>{card.value}</div>
            <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mt-0.5">
              {card.label}
            </div>
            <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{card.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Status Config Section ─────────────────────────────────────────────────────
function StatusConfigSection() {
  const { statusColors, setStatusColors } = useAppStore();
  const { save: saveSettings } = useSaveSettings();
  const [localColors, setLocalColors] = useState<Record<string, string>>({ ...statusColors });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const statuses = [...LEAD_STATUS_OPTIONS];

  const handleColorChange = (status: string, color: string) => {
    setLocalColors((prev) => ({ ...prev, [status]: color }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    await saveSettings({ statusColors: localColors });
    setStatusColors(localColors);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleReset = (status: string) => {
    const defaultColor = DEFAULT_STATUS_COLORS[status] ?? "#9ca3af";
    setLocalColors((prev) => ({ ...prev, [status]: defaultColor }));
    setSaved(false);
  };

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <Palette size={15} className="text-amber-500" />
              Status Colours
            </h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              Changes persist to Firestore and apply immediately across all devices.
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-400 transition disabled:opacity-50"
          >
            {saving ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : saved ? (
              <Check size={13} />
            ) : (
              <Check size={13} />
            )}
            {saving ? "Saving…" : saved ? "Saved!" : "Save Changes"}
          </button>
        </div>

        <div className="space-y-2">
          {statuses.map((status) => {
            const current = localColors[status] ?? DEFAULT_STATUS_COLORS[status] ?? "#9ca3af";
            const isDefault = current === (DEFAULT_STATUS_COLORS[status] ?? "#9ca3af");
            return (
              <div
                key={status}
                className="flex items-center gap-4 p-3 rounded-lg bg-gray-50 dark:bg-[var(--surface)] border border-gray-100 dark:border-white/[0.05]"
              >
                {/* Colour swatch */}
                <div
                  className="w-8 h-8 rounded-lg border-2 border-white/20 flex-shrink-0 shadow-sm"
                  style={{ backgroundColor: current }}
                />

                {/* Status name */}
                <span className="text-sm font-semibold text-gray-800 dark:text-white w-28 flex-shrink-0">
                  {status}
                </span>

                {/* Badge preview */}
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: current + "26", color: current, border: `1px solid ${current}55` }}
                >
                  {status}
                </span>

                {/* Hex input */}
                <input
                  type="text"
                  value={current}
                  maxLength={7}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (/^#[0-9a-fA-F]{0,6}$/.test(v)) handleColorChange(status, v);
                  }}
                  className="w-24 px-2 py-1 text-xs font-mono rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-400"
                />

                {/* Colour picker */}
                <input
                  type="color"
                  value={current}
                  onChange={(e) => handleColorChange(status, e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent flex-shrink-0"
                  title="Pick colour"
                />

                {/* Reset to default */}
                {!isDefault && (
                  <button
                    onClick={() => handleReset(status)}
                    className="text-xs text-gray-400 hover:text-amber-500 transition ml-auto flex-shrink-0"
                    title="Reset to default"
                  >
                    Reset
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Automation Rules Section ──────────────────────────────────────────────────
function AutomationRulesSection() {
  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-5">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-1">
          <FlaskConical size={15} className="text-amber-500" />
          Active Automation Rules
        </h3>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-5">
          Rules run client-side when a lead is opened. If conditions are met and no manual override
          exists, the lead is updated automatically. Rules are defined in{" "}
          <code className="text-amber-500 bg-amber-50 dark:bg-amber-900/20 px-1 py-0.5 rounded text-[10px]">
            src/lib/automation.ts
          </code>
        </p>

        <div className="space-y-3">
          {AUTOMATION_RULES.map((rule) => (
            <div
              key={rule.id}
              className={`p-4 rounded-xl border ${
                rule.active
                  ? "border-green-200 bg-green-50 dark:border-green-900/50 dark:bg-green-900/10"
                  : "border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-800/40"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 mt-0.5 ${
                      rule.active ? "bg-green-500 animate-pulse" : "bg-gray-400"
                    }`}
                  />
                  <span className="text-sm font-semibold text-gray-800 dark:text-white">{rule.name}</span>
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                    rule.active
                      ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300"
                      : "bg-gray-100 dark:bg-slate-700 text-gray-500"
                  }`}
                >
                  {rule.active ? "Active" : "Disabled"}
                </span>
              </div>

              <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 leading-relaxed">
                {rule.description}
              </p>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="flex items-start gap-2 p-2 rounded-lg bg-white/60 dark:bg-white/[0.04] border border-gray-100 dark:border-white/[0.04]">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide flex-shrink-0 mt-0.5">
                    Trigger
                  </span>
                  <span className="text-[11px] text-gray-600 dark:text-gray-400">{rule.trigger}</span>
                </div>
                <div className="flex items-start gap-2 p-2 rounded-lg bg-white/60 dark:bg-white/[0.04] border border-gray-100 dark:border-white/[0.04]">
                  <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wide flex-shrink-0 mt-0.5">
                    Action
                  </span>
                  <span className="text-[11px] text-gray-600 dark:text-gray-400">{rule.action}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Future rules placeholder */}
      <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-dashed border-gray-200 dark:border-slate-700 p-5">
        <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-2 mb-3">
          <Zap size={13} />
          Planned Rules
        </h4>
        <div className="space-y-2">
          {[
            "Booked lead → no FC date after 48h → alert rep",
            "No contact in 7 days → escalate to admin",
            "Callback date missed → re-queue as high priority",
          ].map((rule) => (
            <div
              key={rule}
              className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 py-1.5"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-slate-600 flex-shrink-0" />
              {rule}
              <span className="ml-auto text-[10px] bg-gray-100 dark:bg-slate-700 text-gray-400 px-1.5 py-0.5 rounded">
                Coming soon
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Data Inspector Section ────────────────────────────────────────────────────
function DataInspectorSection({ leads, reps }: { leads: Lead[]; reps: Rep[] }) {
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return leads.slice(0, 100); // cap display to 100 for performance
    return leads
      .filter(
        (l) =>
          l.name?.toLowerCase().includes(q) ||
          l.phone?.includes(q) ||
          l.suburb?.toLowerCase().includes(q) ||
          l.status?.toLowerCase().includes(q),
      )
      .slice(0, 100);
  }, [leads, search]);

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none"
        />
        <input
          type="text"
          placeholder="Search leads by name, phone, suburb or status…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-400"
        />
      </div>

      <div className="text-xs text-gray-400 dark:text-gray-500">
        Showing {filtered.length} of {leads.length} leads
        {!search && leads.length > 100 && " — search to find specific leads"}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 dark:border-white/[0.06] bg-gray-50 dark:bg-[var(--surface)]">
                <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Name
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Status
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden sm:table-cell">
                  Rep
                </th>
                <th className="text-center px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Calls
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden md:table-cell">
                  Follow-up
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-white/[0.04]">
              {filtered.map((lead) => {
                const rep = reps.find((r) => r.id === lead.dqRep)?.name ?? "—";
                const isExpanded = expandedId === lead.id;
                return (
                  <React.Fragment key={lead.id}>
                    <tr
                      className="hover:bg-gray-50 dark:hover:bg-white/[0.02] cursor-pointer transition-colors"
                      onClick={() => setExpandedId(isExpanded ? null : lead.id)}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                        {lead.name || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={lead.status} />
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                        {rep}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-500 dark:text-gray-400">
                        {lead.callHistory?.length ?? 0}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {lead.nextContactDate ? (
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                              isOverdue(lead.nextContactDate)
                                ? "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400"
                                : "bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400"
                            }`}
                          >
                            {lead.nextContactDate}
                          </span>
                        ) : (
                          <span className="text-gray-300 dark:text-gray-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-gray-300 dark:text-gray-600 text-base">
                          {isExpanded ? "▲" : "▼"}
                        </span>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={6} className="px-4 pb-3">
                          <pre className="text-[10px] font-mono text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-[var(--surface)] rounded-lg p-3 overflow-x-auto max-h-64 overflow-y-auto border border-gray-100 dark:border-white/[0.04]">
                            {JSON.stringify(lead, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Admin Guide Section ───────────────────────────────────────────────────────
function AdminGuideSection() {
  return (
    <div
      className="rounded-xl overflow-hidden border border-gray-200 dark:border-white/[0.06]"
      style={{ height: "620px" }}
    >
      <KnowledgeLayout
        title="Admin Technical Guide"
        subtitle="System Reference"
        sections={ADMIN_GUIDE_SECTIONS}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
void SystemHealthSection;
void StatusConfigSection;
void AutomationRulesSection;
void DataInspectorSection;
void AdminGuideSection;

export function AdminPage({ onOpenSheetsSync }: { onOpenSheetsSync?: () => void } = {}) {
  const { reps, setReps } = useAppStore();
  const { leads } = useLeads();
  const { settings } = useAppSettings();
  const { save: saveSettings } = useSaveSettings();
  const { save: saveRepToFirestore } = useSaveRep();
  const { remove: deleteRepFromFirestore } = useDeleteRep();
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<Rep["role"]>("rep");
  const [addError, setAddError] = useState("");
  const [newFormerName, setNewFormerName] = useState("");
  const [addFormerError, setAddFormerError] = useState("");
  const [activeTab, setActiveTab] = useState<
    | "reps"
    | "leadstats"
    | "performance"
    | "operations"
    | "sync"
    | "data-tools"
    | "settings"
    | "system-settings"
    | "settings-history"
    | "system-health"
    | "daily-report"
    | "audit"
    | "calendar-settings"
  >("reps");
  const [repDrillDown, setRepDrillDown] = useState<Rep | null>(null);

  // Save to Zustand (→ localStorage) AND Firestore
  const handleSaveRep = (updated: Rep) => {
    setReps(reps.map((r) => (r.id === updated.id ? updated : r)));
    saveRepToFirestore(updated);
  };

  const handleToggle = (id: number) => {
    const updated = reps.map((r) => (r.id === id ? { ...r, active: !r.active } : r));
    setReps(updated);
    const rep = updated.find((r) => r.id === id);
    if (rep) saveRepToFirestore(rep);
  };

  const handleRemove = (id: number) => {
    setReps(reps.filter((r) => r.id !== id));
    deleteRepFromFirestore(id);
  };

  const handleAddRep = () => {
    const name = newName.trim();
    if (!name) {
      setAddError("Name is required");
      return;
    }
    if (reps.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
      setAddError("Name already exists");
      return;
    }
    const nextId = Math.max(0, ...reps.map((r) => r.id)) + 1;
    const newRep: Rep = { id: nextId, name, active: true, role: newRole };
    setReps([...reps, newRep]);
    saveRepToFirestore(newRep);
    setNewName("");
    setNewRole("rep");
    setAddError("");
  };

  const handleAddFormerStaff = () => {
    const name = newFormerName.trim();
    if (!name) {
      setAddFormerError("Name is required");
      return;
    }
    if (reps.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
      setAddFormerError("Name already exists");
      return;
    }
    const nextId = Math.max(0, ...reps.map((r) => r.id)) + 1;
    // active: false = placeholder (no login, appears in lead-assignment dropdowns only)
    const newRep: Rep = { id: nextId, name, active: false, role: "rep" };
    setReps([...reps, newRep]);
    saveRepToFirestore(newRep);
    setNewFormerName("");
    setAddFormerError("");
  };

  const activeCount = reps.filter((r) => r.active).length;
  const totalCalls = leads.reduce((n, l) => n + (l.callHistory?.length || 0), 0);

  const callsByRep: Record<number, number> = {};
  leads.forEach((lead) => {
    (lead.callHistory || []).forEach((call) => {
      const rep = reps.find((r) => r.name === call.rep);
      if (rep) callsByRep[rep.id] = (callsByRep[rep.id] || 0) + 1;
    });
  });

  const staleThreshold = settings?.staleThresholdDays ?? 14;

  // Quick counts for Operations tab badge
  const today = todayStr();
  const overdueCount = leads.filter((l) => l.status === "Revisit" && l.callbackDate && l.callbackDate < today).length;

  // Today's Briefing data
  const briefingData = useMemo((): BriefingData => {
    const todayDate = todayStr();
    const yest = yesterdayStr();
    let callsToday = 0;
    let callsYesterday = 0;
    leads.forEach((l) => {
      (l.callHistory || []).forEach((c) => {
        if (normCallDate(c.date) === todayDate) callsToday++;
        if (normCallDate(c.date) === yest) callsYesterday++;
      });
    });
    const callbacksToday = leads.filter((l) => l.status === "Revisit" && l.callbackDate === todayDate).length;
    const dqedToday = leads.filter((l) => l.leadDate === todayDate).length;
    const apptToday = leads.filter(
      (l) => l.bookingDate === todayDate || (l as any).appointmentDate === todayDate,
    ).length;
    return { callsToday, callsYesterday, callbacksToday, dqedToday, apptToday };
  }, [leads]);

  const tabs = [
    { id: "reps" as const, label: "Rep Roster", icon: <ShieldCheck size={14} /> },
    { id: "leadstats" as const, label: "Lead Stats", icon: <BarChart2 size={14} /> },
    { id: "performance" as const, label: "Rep Performance", icon: <TrendingUp size={14} /> },
    {
      id: "operations" as const,
      label: "Operations",
      icon: <AlertCircle size={14} />,
      badge: overdueCount > 0 ? overdueCount : undefined,
    },
    { id: "sync" as const, label: "Sync", icon: <RefreshCw size={14} /> },
    { id: "data-tools" as const, label: "Data Tools", icon: <Database size={14} /> },
    { id: "settings" as const, label: "CRM Settings", icon: <Settings size={14} /> },
    { id: "system-settings" as const, label: "System Controls", icon: <Zap size={14} /> },
    { id: "settings-history" as const, label: "Control History", icon: <History size={14} /> },
    { id: "system-health" as const, label: "System Health", icon: <HeartPulse size={14} /> },
    { id: "daily-report" as const, label: "Daily Report", icon: <BarChart2 size={14} /> },
    { id: "audit" as const, label: "Audit Log", icon: <ClipboardList size={14} /> },
    { id: "calendar-settings" as const, label: "Calendar", icon: <CalendarDays size={14} /> },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 px-4 py-5 sm:px-6 dark:bg-[var(--bg)] space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Admin</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Manage roster, operations, system controls, sync tools, and audit visibility.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard label="Total Reps" value={reps.length} sub={`${activeCount} active`} />
        <SummaryCard label="Total Leads" value={leads.length} sub="in system" />
        <SummaryCard label="Total Calls" value={totalCalls} sub="all time" />
      </div>

      {/* Today's Briefing */}
      <TodayBriefingStrip data={briefingData} />

      {/* Tabs */}
      <div className="sticky top-0 z-20 flex gap-1 overflow-x-auto border-b border-gray-200 bg-gray-50/95 py-1 backdrop-blur dark:border-white/[0.06] dark:bg-[var(--bg)]/95">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex min-h-11 items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition -mb-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 flex-shrink-0 ${
              activeTab === t.id
                ? "border-amber-500 text-amber-600 dark:text-amber-400"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            {t.icon}
            {t.label}
            {"badge" in t && t.badge && (
              <span className="ml-1 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Reps tab */}
      {activeTab === "reps" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-5">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
              Rep Roster <span className="text-gray-400 font-normal">({reps.length})</span>
            </h3>
            {/* Login summary banner */}
            {(() => {
              const activeReps = reps.filter((r) => r.active);
              const withEmail = activeReps.filter((r) => r.email).length;
              const total = activeReps.length;
              if (total === 0) return null;
              return (
                <div
                  className={`flex items-center gap-3 p-3 rounded-xl mb-4 border text-sm ${
                    withEmail === total
                      ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/40 text-green-700 dark:text-green-400"
                      : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-400"
                  }`}
                >
                  <span className="text-lg flex-shrink-0">{withEmail === total ? "✅" : "⚠️"}</span>
                  <span>
                    <strong>
                      {withEmail}/{total}
                    </strong>{" "}
                    active reps have login emails configured
                    {withEmail < total && " — expand each rep row to set their email and send a password reset"}
                  </span>
                </div>
              );
            })()}
            <div className="space-y-2">
              {reps.map((rep) => (
                <RepRow
                  key={rep.id}
                  rep={rep}
                  onSave={handleSaveRep}
                  onToggle={handleToggle}
                  onRemove={handleRemove}
                  onDrillDown={setRepDrillDown}
                />
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-5">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
                <UserPlus size={15} className="text-amber-500" /> Add Rep
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Name *</label>
                  <input
                    className={`w-full px-3 py-2 rounded-lg border text-sm bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400 ${addError ? "border-red-400" : "border-gray-300 dark:border-white/[0.08]"}`}
                    placeholder="Full name"
                    value={newName}
                    onChange={(e) => {
                      setNewName(e.target.value);
                      setAddError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddRep();
                    }}
                  />
                  {addError && <p className="text-xs text-red-500 mt-1">{addError}</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Role</label>
                  <select
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-white/[0.08] text-sm bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as Rep["role"])}
                  >
                    <option value="rep">Rep</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <button
                  onClick={handleAddRep}
                  className="w-full py-2 rounded-lg bg-amber-500 text-white font-semibold hover:bg-amber-400 transition text-sm flex items-center justify-center gap-2"
                >
                  <UserPlus size={15} /> Add Rep
                </button>
              </div>
            </div>

            {/* Former Staff placeholder card */}
            <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-5">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-2">
                <Users size={15} className="text-gray-400" /> Add Former Staff Member
              </h3>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
                Placeholder names for staff who no longer work here. They appear in lead-assignment dropdowns so you can
                import old leads without assigning them to yourself. They cannot log in.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Name *</label>
                  <input
                    className={`w-full px-3 py-2 rounded-lg border text-sm bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gray-400 ${addFormerError ? "border-red-400" : "border-gray-300 dark:border-white/[0.08]"}`}
                    placeholder="e.g. Sarah (Former)"
                    value={newFormerName}
                    onChange={(e) => {
                      setNewFormerName(e.target.value);
                      setAddFormerError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddFormerStaff();
                    }}
                  />
                  {addFormerError && <p className="text-xs text-red-500 mt-1">{addFormerError}</p>}
                </div>
                <button
                  onClick={handleAddFormerStaff}
                  className="w-full py-2 rounded-lg bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-300 dark:hover:bg-[var(--hover)] transition text-sm flex items-center justify-center gap-2"
                >
                  <UserPlus size={15} /> Add Former Staff
                </button>
              </div>
            </div>

            <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-5">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Calls per Rep</h3>
              {totalCalls === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">No calls logged yet</p>
              ) : (
                <div className="space-y-2">
                  {reps
                    .filter((r) => (callsByRep[r.id] || 0) > 0)
                    .sort((a, b) => (callsByRep[b.id] || 0) - (callsByRep[a.id] || 0))
                    .map((rep) => {
                      const count = callsByRep[rep.id] || 0;
                      const maxCalls2 = Math.max(...reps.map((r) => callsByRep[r.id] || 0));
                      const pct = maxCalls2 > 0 ? (count / maxCalls2) * 100 : 0;
                      return (
                        <div key={rep.id} className="flex items-center gap-3 text-sm">
                          <span className="w-16 truncate text-gray-700 dark:text-gray-300 flex-shrink-0">
                            {rep.name}
                          </span>
                          <div className="flex-1 bg-gray-100 dark:bg-[var(--surface)] rounded-full h-1.5">
                            <div className="h-1.5 rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-8 text-right font-semibold text-gray-900 dark:text-white">{count}</span>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "leadstats" && <LeadStatsSection leads={leads} />}

      {activeTab === "performance" && (
        <RepPerformanceSection leads={leads} settings={settings} onRepClick={setRepDrillDown} />
      )}

      {activeTab === "operations" && (
        <OperationsSection leads={leads} reps={reps} staleThresholdDays={staleThreshold} />
      )}

      {activeTab === "sync" && (
        <SyncSection
          settings={settings}
          onSaveSettings={(s) => {
            saveSettings(s);
          }}
          onOpenSyncModal={() => onOpenSheetsSync?.()}
        />
      )}

      {activeTab === "data-tools" && (
        <DataToolsSection
          leads={leads}
          reps={reps}
          onUpdateLeads={() => {}}
          onExport={(type) => {
            const repsMap: Record<number, string> = {};
            reps.forEach((r) => {
              repsMap[r.id] = r.name;
            });
            if (type === "leads") exportLeadsCSV(leads, repsMap);
            else exportCallHistoryCSV(leads);
          }}
        />
      )}

      {activeTab === "settings" && (
        <div className="space-y-8 p-6">
          <SettingsSection settings={settings} reps={reps} onSave={saveSettings} />
          <div>
            <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">Voice Sample</p>
            <VoiceRecorder />
          </div>
        </div>
      )}

      {activeTab === "system-settings" && <SystemSettingsPanel />}

      {activeTab === "settings-history" && <SettingsHistoryPanel />}

      {activeTab === "system-health" && <SystemHealthPanel />}

      {activeTab === "daily-report" && <DailyReportDashboard />}

      {activeTab === "audit" && <AuditLogSection />}

      {activeTab === "calendar-settings" && <CalendarSettingsSection />}

      {/* Rep Drill-Down Modal */}
      {repDrillDown && <RepDrillDownModal rep={repDrillDown} leads={leads} onClose={() => setRepDrillDown(null)} />}
    </div>
  );
}

export default AdminPage;
