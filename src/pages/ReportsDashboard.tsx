/**
 * ReportsDashboard.tsx — Complete Reporting System with Forecasting & Targets
 *
 * Features:
 *  - Weighted pipeline forecasting (lead 20%, conditional 50%, unconditional 80%, settled 100%)
 *  - Company revenue/commission target tracking from settings/main
 *  - Per-rep target tracking from settings.repTargets
 *  - Progress bars with % complete and remaining values
 *  - Underperforming rep highlighting
 *  - Weekly + Monthly operational visibility
 *  - Date range selector: This Week / This Month / Last Month / Custom
 *  - KPI grid, charts, risk section, paginated table
 *  - CSV + PDF export
 *  - Responsive, touch-optimised
 *  - Single Firestore fetch, useMemo for all calculations
 *
 * Data sources: deals, leads, reps, settings — no new collections.
 */

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { onSnapshot, doc } from "firebase/firestore";
import { useDeals } from "../hooks/useFirebase";
import { useFirebaseAuthUser } from "../hooks/useFirebaseAuthUser";
import { db } from "../lib/firebase";
import { useAppStore } from "../stores/appStore";
import { normalizeLeadStatus } from "../lib/statusConfig";
import { Rep, Lead, DealStatus, AppSettings } from "../types";
import {
  Download,
  Filter,
  DollarSign,
  TrendingUp,
  Users,
  CheckCircle,
  AlertTriangle,
  BarChart3,
  Loader,
  ChevronUp,
  ChevronDown,
  FileText,
  ChevronLeft,
  ChevronRight,
  Clock,
  Target,
  AlertCircle,
  Gauge,
  Award,
  Zap,
} from "lucide-react";
import { EmptyState } from "../components/ui/EmptyState";

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const STUCK_DAYS = 7;
const AT_RISK_DAYS = 7;

const STAGE_WEIGHTS: Record<string, number> = {
  lead: 0.2,
  conditional: 0.5,
  unconditional: 0.8,
  settled: 1.0,
};

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Deal {
  id: string;
  leadId?: string;
  clientName: string;
  status: DealStatus;
  dealValue: number;
  commissionTotal: number;
  commissionPaid: number;
  expectedSettlementDate: string;
  contractSignedDate?: string;
  financeApprovedDate?: string;
  assignedTo: number;
  lastUpdate: number;
  createdAt: number;
  createdBy: string;
  notes?: unknown[];
}

type DateRangePreset = "this-week" | "this-month" | "last-month" | "custom";
interface DateRange {
  label: string;
  from: string;
  to: string;
}

interface KPIs {
  activeDeals: number;
  pipelineValue: number;
  settledValue: number;
  totalCommission: number;
  commissionOutstanding: number;
  leadCount: number;
  bookedCount: number;
  settledCount: number;
  leadToBookedRate: string;
  bookedToSettledRate: string;
}

interface ForecastData {
  revenue: number;
  commission: number;
  contributingDeals: number;
}

interface RepTargetData {
  id: number;
  name: string;
  dealsSettled: number;
  revenueGenerated: number;
  targetRevenue: number;
  progress: number;
  remaining: number;
}

interface RepPerf {
  name: string;
  dealsHandled: number;
  dealsSettled: number;
  conversion: string;
  totalCommission: number;
  totalValue: number;
}

interface RiskDeal {
  clientName: string;
  status: string;
  stuckDays: number;
  settlementDate: string;
  assignedTo: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Firestore Hooks
// ─────────────────────────────────────────────────────────────────────────────

function useAppSettings() {
  const { currentUser, authLoading } = useFirebaseAuthUser();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!currentUser) {
      setLoading(false);
      return;
    }

    const unsub = onSnapshot(
      doc(db, "settings", "main"),
      (snap) => {
        setSettings(snap.exists() ? (snap.data() as AppSettings) : null);
        setLoading(false);
      },
      (err) => {
        console.error("[ReportsDashboard.useAppSettings] Firestore error:", err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [authLoading, currentUser]);
  return { settings, loading };
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);

const fmtDate = (s: string) => {
  if (!s) return "—";
  const d = new Date(s + "T00:00:00");
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
};

const daysSince = (ts: number) => Math.floor((Date.now() - ts) / 86_400_000);
const daysUntil = (s: string) => {
  if (!s) return Infinity;
  return Math.ceil((new Date(s + "T00:00:00").getTime() - Date.now()) / 86_400_000);
};
const repName = (id: number | undefined, reps: Rep[]) => {
  if (!id) return "Unassigned";
  return reps.find((r) => r.id === id)?.name ?? "Unknown";
};
const isActive = (s: DealStatus) => s !== "settled" && s !== "lost";

const ST: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  lead: {
    label: "Lead",
    bg: "bg-gray-100 dark:bg-gray-800/40",
    text: "text-gray-700 dark:text-gray-300",
    dot: "bg-gray-400",
  },
  conditional: {
    label: "Conditional",
    bg: "bg-orange-100 dark:bg-orange-900/40",
    text: "text-orange-700 dark:text-orange-300",
    dot: "bg-orange-400",
  },
  unconditional: {
    label: "Unconditional",
    bg: "bg-purple-100 dark:bg-purple-900/40",
    text: "text-purple-700 dark:text-purple-300",
    dot: "bg-purple-400",
  },
  settled: {
    label: "Settled",
    bg: "bg-emerald-100 dark:bg-emerald-900/40",
    text: "text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-400",
  },
  lost: {
    label: "Lost",
    bg: "bg-red-100 dark:bg-red-900/40",
    text: "text-red-700 dark:text-red-300",
    dot: "bg-red-400",
  },
};

const STAGES: DealStatus[] = ["lead", "conditional", "unconditional", "settled", "lost"];

// ── Date Range ────────────────────────────────────────────────────────────────

function getDateRange(preset: DateRangePreset, customFrom?: string, customTo?: string): DateRange {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  switch (preset) {
    case "this-week": {
      const day = now.getDay();
      const from = new Date(now);
      from.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
      return { label: "This Week", from: from.toISOString().split("T")[0], to: today };
    }
    case "this-month":
      return {
        label: "This Month",
        from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`,
        to: today,
      };
    case "last-month": {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lme = new Date(now.getFullYear(), now.getMonth(), 0);
      return { label: "Last Month", from: lm.toISOString().split("T")[0], to: lme.toISOString().split("T")[0] };
    }
    case "custom":
      return { label: "Custom Range", from: customFrom || today, to: customTo || today };
  }
}

function filterDealsByDate(deals: Deal[], range: DateRange): Deal[] {
  return deals.filter((d) => d.expectedSettlementDate >= range.from && d.expectedSettlementDate <= range.to);
}

// ── Intelligence Flags ────────────────────────────────────────────────────────

function getFlags(d: Deal) {
  const done = !isActive(d.status);
  const ds = daysSince(d.lastUpdate);
  const du = daysUntil(d.expectedSettlementDate);
  return {
    isStuck: !done && ds > STUCK_DAYS,
    isAtRisk: !done && ds > STUCK_DAYS && du >= 0 && du <= AT_RISK_DAYS,
    stuckDays: !done && ds > STUCK_DAYS ? ds : 0,
    riskDays: !done && ds > STUCK_DAYS && du >= 0 && du <= AT_RISK_DAYS ? du : 0,
    overdue: !done && du < 0,
    overdueDays: !done && du < 0 ? Math.abs(du) : 0,
  };
}

// ── KPI Calculator ────────────────────────────────────────────────────────────

function calculateKPIs(deals: Deal[], leads: Lead[]): KPIs {
  const active = deals.filter((d) => isActive(d.status));
  const settled = deals.filter((d) => d.status === "settled");
  const bookedLeads = leads.filter((l) => normalizeLeadStatus(l.status) === "Booked");
  return {
    activeDeals: active.length,
    pipelineValue: active.reduce((s, d) => s + (d.dealValue || 0), 0),
    settledValue: settled.reduce((s, d) => s + (d.dealValue || 0), 0),
    totalCommission: deals.reduce((s, d) => s + (d.commissionTotal || 0), 0),
    commissionOutstanding: deals.reduce(
      (s, d) => s + Math.max(0, (d.commissionTotal || 0) - (d.commissionPaid || 0)),
      0,
    ),
    leadCount: leads.length,
    bookedCount: bookedLeads.length,
    settledCount: settled.length,
    leadToBookedRate:
      leads.length > 0
        ? (
            (bookedLeads.length / Math.max(leads.filter((l) => l.callHistory && l.callHistory.length > 0).length, 1)) *
            100
          ).toFixed(1) + "%"
        : "0%",
    bookedToSettledRate:
      bookedLeads.length > 0 ? ((settled.length / Math.max(bookedLeads.length, 1)) * 100).toFixed(1) + "%" : "0%",
  };
}

// ── Forecasting ───────────────────────────────────────────────────────────────

function calculateForecast(deals: Deal[]): ForecastData {
  const active = deals.filter((d) => isActive(d.status));
  let revenue = 0,
    commission = 0;
  active.forEach((d) => {
    const w = STAGE_WEIGHTS[d.status] ?? 0;
    revenue += (d.dealValue || 0) * w;
    commission += (d.commissionTotal || 0) * w;
  });
  return { revenue, commission, contributingDeals: active.length };
}
function groupRevenueOverTime(deals: Deal[], range: DateRange) {
  const buckets = new Map<string, number>();
  deals.forEach((d) => {
    if (d.expectedSettlementDate < range.from || d.expectedSettlementDate > range.to) return;
    const dt = new Date(d.expectedSettlementDate + "T00:00:00");
    if (isNaN(dt.getTime())) return;
    const weekStart = new Date(dt);
    weekStart.setDate(dt.getDate() - dt.getDay() + 1);
    const key = weekStart.toISOString().split("T")[0];
    buckets.set(key, (buckets.get(key) || 0) + (d.dealValue || 0));
  });
  return [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function getRepPerformance(deals: Deal[], reps: Rep[]): RepPerf[] {
  const map = new Map<
    number,
    { name: string; dealsHandled: number; dealsSettled: number; totalCommission: number; totalValue: number }
  >();
  deals.forEach((d) => {
    const e = map.get(d.assignedTo) || {
      name: repName(d.assignedTo, reps),
      dealsHandled: 0,
      dealsSettled: 0,
      totalCommission: 0,
      totalValue: 0,
    };
    e.dealsHandled++;
    if (d.status === "settled") e.dealsSettled++;
    e.totalCommission += d.commissionTotal || 0;
    e.totalValue += d.dealValue || 0;
    map.set(d.assignedTo, e);
  });
  return [...map.entries()]
    .map(([, v]) => ({
      name: v.name,
      dealsHandled: v.dealsHandled,
      dealsSettled: v.dealsSettled,
      totalCommission: v.totalCommission,
      totalValue: v.totalValue,
      conversion: v.dealsHandled > 0 ? ((v.dealsSettled / v.dealsHandled) * 100).toFixed(0) + "%" : "0%",
    }))
    .sort((a, b) => b.totalValue - a.totalValue);
}

function getRepTargetData(deals: Deal[], reps: Rep[], settings: AppSettings | null): RepTargetData[] {
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const today = now.toISOString().split("T")[0];
  const monthSettled = deals.filter(
    (d) => d.status === "settled" && d.expectedSettlementDate >= monthStart && d.expectedSettlementDate <= today,
  );

  return reps
    .filter((r) => r.active !== false)
    .map((r) => {
      const repSettled = monthSettled.filter((d) => d.assignedTo === r.id);
      const revenueGenerated = repSettled.reduce((s, d) => s + (d.dealValue || 0), 0);
      const repTarget = settings?.repTargets?.[r.id];
      const targetRevenue = repTarget?.monthlyBookings
        ? repTarget.monthlyBookings * 50000 // Default estimate per booking
        : 0;
      // If a custom monthlyRevenueTarget is set in rep targets, use that
      const customTarget = (repTarget as Record<string, unknown> | undefined)?.monthlyRevenue as number;
      const finalTarget = customTarget > 0 ? customTarget : targetRevenue;
      const progress = finalTarget > 0 ? Math.min((revenueGenerated / finalTarget) * 100, 100) : 0;
      const remaining = Math.max(finalTarget - revenueGenerated, 0);

      return {
        id: r.id,
        name: r.name,
        dealsSettled: repSettled.length,
        revenueGenerated,
        targetRevenue: finalTarget,
        progress,
        remaining,
      };
    })
    .sort((a, b) => b.revenueGenerated - a.revenueGenerated);
}

// ─────────────────────────────────────────────────────────────────────────────
// Export Functions
// ─────────────────────────────────────────────────────────────────────────────

function generateCSV(deals: Deal[], reps: Rep[]): string {
  const header = "Client Name,Status,Deal Value,Commission Total,Commission Paid,Settlement Date,Assigned To\n";
  const rows = deals
    .map(
      (d) =>
        `"${d.clientName}","${ST[d.status]?.label || d.status}",${d.dealValue || 0},${d.commissionTotal || 0},${d.commissionPaid || 0},"${d.expectedSettlementDate}","${repName(d.assignedTo, reps)}"`,
    )
    .join("\n");
  return header + rows;
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function generatePDF(deals: Deal[], reps: Rep[], kpis: KPIs, rangeLabel: string, forecast: ForecastData) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.setTextColor(30, 30, 30);
  doc.text("ASG CRM — Reports Dashboard", 14, 20);
  doc.setFontSize(10);
  doc.setTextColor(120, 120, 120);
  doc.text(`Date Range: ${rangeLabel}  |  Generated: ${new Date().toLocaleDateString("en-AU")}`, 14, 28);

  // KPIs + Forecast
  let y = 40;
  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  const entries: [string, string][] = [
    ["Active Deals", String(kpis.activeDeals)],
    ["Pipeline Value", fmt(kpis.pipelineValue)],
    ["Forecast Revenue", fmt(forecast.revenue)],
    ["Forecast Commission", fmt(forecast.commission)],
    ["Total Commission", fmt(kpis.totalCommission)],
    ["Commission Outstanding", fmt(kpis.commissionOutstanding)],
    ["Lead → Booked", kpis.leadToBookedRate],
    ["Booked → Settled", kpis.bookedToSettledRate],
  ];
  entries.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(value as string, 80, y);
    y += 7;
  });

  // Table
  y += 5;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  const cols: string[] = ["Client", "Status", "Value", "Comm", "Settlement", "Rep"];
  let x = 14;
  cols.forEach((col) => {
    doc.text(col as string, x, y);
    x += 30;
  });
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setDrawColor(200, 200, 200);
  doc.line(14, y, 196, y);
  y += 5;
  deals.slice(0, 50).forEach((d) => {
    if (y > 275) {
      doc.addPage();
      y = 20;
    }
    x = 14;
    const vals = [
      d.clientName.slice(0, 22),
      ST[d.status]?.label || "",
      fmt(d.dealValue || 0),
      fmt(d.commissionTotal || 0),
      d.expectedSettlementDate || "—",
      repName(d.assignedTo, reps).slice(0, 18),
    ];
    vals.forEach((v) => {
      doc.text(v as string, x, y);
      x += 30;
    });
    y += 6;
  });
  doc.save(`reports-${new Date().toISOString().split("T")[0]}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Chart Components
// ─────────────────────────────────────────────────────────────────────────────

function PipelineChart({ deals }: { deals: Deal[] }) {
  const data = useMemo(() => {
    const max = Math.max(...STAGES.map((s) => deals.filter((d) => d.status === s).length), 1);
    return STAGES.map((s) => ({
      status: s,
      count: deals.filter((d) => d.status === s).length,
      value: deals.filter((d) => d.status === s).reduce((sum, d) => sum + (d.dealValue || 0), 0),
      pct: (deals.filter((d) => d.status === s).length / max) * 100,
    }));
  }, [deals]);

  return (
    <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-4 shadow-sm hover:shadow-md transition-shadow">
      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4 flex items-center gap-1.5">
        <BarChart3 size={14} /> Pipeline by Stage
      </h3>
      <div className="space-y-3">
        {data.map((d) => (
          <div key={d.status}>
            <div className="flex items-center justify-between text-xs mb-1">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${ST[d.status].dot}`} />
                <span className="font-medium text-gray-700 dark:text-gray-300">{ST[d.status].label}</span>
              </div>
              <div className="tabular-nums text-gray-500 dark:text-gray-400">
                {d.count} · {fmt(d.value)}
              </div>
            </div>
            <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all ${ST[d.status].dot.replace("400", "500")}`}
                style={{ width: `${d.pct}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RevenueChart({ data }: { data: [string, number][] }) {
  if (data.length < 2)
    return (
      <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-4 shadow-sm hover:shadow-md transition-shadow">
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4 flex items-center gap-1.5">
          <TrendingUp size={14} /> Revenue Over Time (Weekly)
        </h3>
        <EmptyState
          title="Not enough data"
          description="for selected range"
          icon="chart"
        />
      </div>
    );

  const maxVal = Math.max(...data.map((d) => d[1]), 1);
  const w = 600,
    h = 200,
    pad = 45;
  const points = data.map((d, i) => ({
    x: pad + (i / (data.length - 1)) * (w - pad * 2),
    y: pad + (1 - d[1] / maxVal) * (h - pad * 2),
    label: d[0].slice(5),
    value: d[1],
  }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = linePath + ` L ${points[points.length - 1].x} ${h - pad} L ${points[0].x} ${h - pad} Z`;

  return (
    <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-4 shadow-sm hover:shadow-md transition-shadow">
      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4 flex items-center gap-1.5">
        <TrendingUp size={14} /> Revenue Over Time (Weekly)
      </h3>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full min-w-[300px]" style={{ maxHeight: 200 }}>
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <line
              key={f}
              x1={pad}
              y1={pad + (1 - f) * (h - pad * 2)}
              x2={w - pad}
              y2={pad + (1 - f) * (h - pad * 2)}
              stroke="currentColor"
              className="text-gray-200 dark:text-gray-700"
              strokeWidth="1"
            />
          ))}
          <path d={areaPath} fill="url(#revGrad)" opacity="0.15" />
          <path d={linePath} fill="none" stroke="#f59e0b" strokeWidth="2.5" />
          {points.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="4" fill="#f59e0b" />
              <text x={p.x} y={h - 10} textAnchor="middle" className="fill-gray-400" fontSize="10">
                {p.label}
              </text>
            </g>
          ))}
          <defs>
            <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI Cards
// ─────────────────────────────────────────────────────────────────────────────

function KPICards({ kpis }: { kpis: KPIs }) {
  const cards = [
    {
      label: "Active Deals",
      value: String(kpis.activeDeals),
      icon: <TrendingUp size={18} className="text-blue-600 dark:text-blue-400" />,
      grad: "bg-blue-50 dark:bg-blue-900/20",
    },
    {
      label: "Pipeline Value",
      value: fmt(kpis.pipelineValue),
      icon: <DollarSign size={18} className="text-emerald-600 dark:text-emerald-400" />,
      grad: "bg-emerald-50 dark:bg-emerald-900/20",
    },
    {
      label: "Settled Value",
      value: fmt(kpis.settledValue),
      icon: <CheckCircle size={18} className="text-green-600 dark:text-green-400" />,
      grad: "bg-green-50 dark:bg-green-900/20",
    },
    {
      label: "Commission Earned",
      value: fmt(kpis.totalCommission),
      icon: <DollarSign size={18} className="text-amber-600 dark:text-amber-400" />,
      grad: "bg-amber-50 dark:bg-amber-900/20",
    },
    {
      label: "Comm. Outstanding",
      value: fmt(kpis.commissionOutstanding),
      icon: <AlertTriangle size={18} className="text-red-600 dark:text-red-400" />,
      grad: "bg-red-50 dark:bg-red-900/20",
    },
    {
      label: "Lead → Booked",
      value: kpis.leadToBookedRate,
      icon: <Users size={18} className="text-purple-600 dark:text-purple-400" />,
      grad: "bg-purple-50 dark:bg-purple-900/20",
    },
    {
      label: "Booked → Settled",
      value: kpis.bookedToSettledRate,
      icon: <Target size={18} className="text-teal-600 dark:text-teal-400" />,
      grad: "bg-teal-50 dark:bg-teal-900/20",
    },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2 sm:gap-3">
      {cards.map((c) => (
        <div
          key={c.label}
          className={`rounded-xl border border-gray-200 dark:border-white/[0.06] ${c.grad} p-3 sm:p-4 shadow-sm`}
        >
          <div className="flex items-start justify-between mb-2">
            <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center ${c.grad}`}>
              {c.icon}
            </div>
          </div>
          <div className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white leading-none mb-1 tabular-nums">
            {c.value}
          </div>
          <div className="text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            {c.label}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Forecast Section
// ─────────────────────────────────────────────────────────────────────────────

function ForecastSection({ forecast }: { forecast: ForecastData }) {
  return (
    <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-4 shadow-sm hover:shadow-md transition-shadow">
      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4 flex items-center gap-1.5">
        <Zap size={14} className="text-amber-500" /> Revenue Forecast (Weighted Pipeline)
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="text-center p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40">
          <div className="text-2xl sm:text-3xl font-bold text-blue-700 dark:text-blue-300 tabular-nums">
            {fmt(forecast.revenue)}
          </div>
          <div className="text-xs text-blue-500 dark:text-blue-400 mt-1 font-medium">Forecast Revenue</div>
        </div>
        <div className="text-center p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/40">
          <div className="text-2xl sm:text-3xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
            {fmt(forecast.commission)}
          </div>
          <div className="text-xs text-emerald-500 dark:text-emerald-400 mt-1 font-medium">Forecast Commission</div>
        </div>
        <div className="text-center p-4 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-900/40 col-span-2 sm:col-span-1">
          <div className="text-2xl sm:text-3xl font-bold text-purple-700 dark:text-purple-300 tabular-nums">
            {forecast.contributingDeals}
          </div>
          <div className="text-xs text-purple-500 dark:text-purple-400 mt-1 font-medium">Deals Contributing</div>
        </div>
      </div>
      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-3">
        Weighted by stage: Lead 20% · Conditional 50% · Unconditional 80% · Settled 100%
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Company Targets
// ─────────────────────────────────────────────────────────────────────────────

function CompanyTargets({ deals, settings }: { deals: Deal[]; settings: AppSettings | null }) {
  const targets = useMemo(() => {
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const today = now.toISOString().split("T")[0];
    const monthSettled = deals.filter(
      (d) => d.status === "settled" && d.expectedSettlementDate >= monthStart && d.expectedSettlementDate <= today,
    );

    const revenueTarget = ((settings?.repTargets as Record<string, unknown>)?.companyMonthlyRevenue as number) ?? 0;
    const commissionTarget =
      ((settings?.repTargets as Record<string, unknown>)?.companyMonthlyCommission as number) ?? 0;
    const weeklyBookingsTarget =
      ((settings?.repTargets as Record<string, unknown>)?.companyWeeklyBookings as number) ?? 0;

    const revenueActual = monthSettled.reduce((s, d) => s + (d.dealValue || 0), 0);
    const commissionActual = monthSettled.reduce((s, d) => s + (d.commissionTotal || 0), 0);
    // Approximate bookings as deals created this month
    const bookingsActual = deals.filter((d) => d.createdAt >= new Date(monthStart + "T00:00:00").getTime()).length;

    return {
      revenue: {
        target: revenueTarget,
        actual: revenueActual,
        pct: revenueTarget > 0 ? Math.min((revenueActual / revenueTarget) * 100, 100) : 0,
      },
      commission: {
        target: commissionTarget,
        actual: commissionActual,
        pct: commissionTarget > 0 ? Math.min((commissionActual / commissionTarget) * 100, 100) : 0,
      },
      bookings: {
        target: weeklyBookingsTarget,
        actual: bookingsActual,
        pct: weeklyBookingsTarget > 0 ? Math.min((bookingsActual / (weeklyBookingsTarget * 4)) * 100, 100) : 0,
      },
    };
  }, [deals, settings]);

  const hasTargets = targets.revenue.target > 0 || targets.commission.target > 0 || targets.bookings.target > 0;
  if (!hasTargets) return null;

  const renderBar = (
    label: string,
    data: { target: number; actual: number; pct: number },
    icon: React.ReactNode,
    _color: string,
  ) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium text-gray-700 dark:text-gray-300">{label}</span>
        </div>
        <div className="tabular-nums text-gray-500 dark:text-gray-400">
          {fmt(data.actual)} / {fmt(data.target)}
        </div>
      </div>
      <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-3">
        <div
          className={`h-3 rounded-full transition-all ${data.pct >= 100 ? "bg-green-500" : data.pct >= 60 ? "bg-amber-500" : "bg-red-500"}`}
          style={{ width: `${Math.min(data.pct, 100)}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs">
        <span
          className={`font-semibold ${data.pct >= 100 ? "text-green-600 dark:text-green-400" : data.pct >= 60 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}
        >
          {data.pct.toFixed(0)}% complete
        </span>
        {data.pct < 100 && data.target > 0 && (
          <span className="text-gray-400">{fmt(data.target - data.actual)} remaining</span>
        )}
        {data.pct >= 100 && <span className="text-green-600 dark:text-green-400 font-semibold">✓ Target achieved</span>}
      </div>
    </div>
  );

  return (
    <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-4 shadow-sm hover:shadow-md transition-shadow">
      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4 flex items-center gap-1.5">
        <Gauge size={14} className="text-blue-500" /> Company Targets (This Month)
      </h3>
      <div className="space-y-4">
        {targets.revenue.target > 0 &&
          renderBar(
            "Revenue Target",
            targets.revenue,
            <DollarSign size={14} className="text-emerald-500" />,
            "emerald",
          )}
        {targets.commission.target > 0 &&
          renderBar(
            "Commission Target",
            targets.commission,
            <DollarSign size={14} className="text-amber-500" />,
            "amber",
          )}
        {targets.bookings.target > 0 &&
          renderBar(
            "Weekly Bookings (×4)",
            {
              ...targets.bookings,
              actual: targets.bookings.actual,
              target: targets.bookings.target * 4,
              pct: targets.bookings.pct,
            },
            <Award size={14} className="text-purple-500" />,
            "purple",
          )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Rep Targets Table
// ─────────────────────────────────────────────────────────────────────────────

function RepTargetsTable({ repTargets }: { repTargets: RepTargetData[] }) {
  if (repTargets.length === 0) return null;
  const hasAnyTarget = repTargets.some((r) => r.targetRevenue > 0);
  if (!hasAnyTarget) return null;

  const thCls =
    "px-3 py-2.5 text-left text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide";

  return (
    <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-white/[0.06]">
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
          <Target size={14} className="text-purple-500" /> Rep Targets (This Month)
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: "600px" }}>
          <thead className="bg-gray-50 dark:bg-slate-900/40">
            <tr>
              <th className={thCls}>Rep</th>
              <th className={thCls}>Deals Settled</th>
              <th className={thCls}>Revenue</th>
              <th className={thCls}>Target</th>
              <th className={thCls}>Progress</th>
              <th className={thCls}>Remaining</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-[var(--surface)]">
            {repTargets.map((r) => (
              <tr
                key={r.id}
                className={`border-b border-gray-50 dark:border-white/[0.03] ${r.targetRevenue > 0 && r.progress < 50 ? "bg-red-50/30 dark:bg-red-900/5" : ""}`}
              >
                <td className="px-3 py-2.5 font-medium text-gray-900 dark:text-white">{r.name}</td>
                <td className="px-3 py-2.5 tabular-nums text-gray-700 dark:text-gray-300">{r.dealsSettled}</td>
                <td className="px-3 py-2.5 tabular-nums font-semibold text-gray-900 dark:text-white">
                  {fmt(r.revenueGenerated)}
                </td>
                <td className="px-3 py-2.5 tabular-nums text-gray-700 dark:text-gray-300">
                  {r.targetRevenue > 0 ? fmt(r.targetRevenue) : "—"}
                </td>
                <td className="px-3 py-2.5">
                  {r.targetRevenue > 0 ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${r.progress >= 100 ? "bg-green-500" : r.progress >= 60 ? "bg-amber-500" : "bg-red-500"}`}
                          style={{ width: `${Math.min(r.progress, 100)}%` }}
                        />
                      </div>
                      <span
                        className={`text-xs font-bold tabular-nums ${r.progress >= 100 ? "text-green-600 dark:text-green-400" : r.progress >= 60 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}
                      >
                        {r.progress.toFixed(0)}%
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">No target set</span>
                  )}
                </td>
                <td className="px-3 py-2.5 tabular-nums text-gray-700 dark:text-gray-300">
                  {r.remaining > 0 ? fmt(r.remaining) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Risk Section
// ─────────────────────────────────────────────────────────────────────────────

function RiskSection({ deals, reps }: { deals: Deal[]; reps: Rep[] }) {
  const chaseList = useMemo(
    () =>
      deals
        .filter((d) => getFlags(d).isStuck && !getFlags(d).isAtRisk)
        .map((d) => ({
          clientName: d.clientName,
          status: ST[d.status]?.label || d.status,
          stuckDays: getFlags(d).stuckDays,
          settlementDate: d.expectedSettlementDate,
          assignedTo: d.assignedTo,
        })),
    [deals],
  );
  const atRiskList = useMemo(
    () =>
      deals
        .filter((d) => getFlags(d).isAtRisk)
        .map((d) => ({
          clientName: d.clientName,
          status: ST[d.status]?.label || d.status,
          stuckDays: getFlags(d).stuckDays,
          settlementDate: d.expectedSettlementDate,
          assignedTo: d.assignedTo,
        })),
    [deals],
  );
  const thCls =
    "px-3 py-2.5 text-left text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide";

  const renderTable = (title: string, icon: React.ReactNode, data: RiskDeal[], color: string) => {
    if (data.length === 0) return null;
    return (
      <div
        className={`rounded-xl border ${color === "red" ? "border-red-200 dark:border-red-800" : "border-amber-200 dark:border-amber-800"} overflow-hidden`}
      >
        <div
          className={`px-4 py-3 ${color === "red" ? "bg-red-50 dark:bg-red-900/20" : "bg-amber-50 dark:bg-amber-900/20"} flex items-center gap-2`}
        >
          {icon}
          <h3
            className={`text-sm font-bold ${color === "red" ? "text-red-700 dark:text-red-300" : "text-amber-700 dark:text-amber-300"}`}
          >
            {title} ({data.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "600px" }}>
            <thead className="bg-gray-50 dark:bg-slate-900/40">
              <tr>
                <th className={thCls}>Client</th>
                <th className={thCls}>Status</th>
                <th className={thCls}>Days Stuck</th>
                <th className={thCls}>Settlement</th>
                <th className={thCls}>Rep</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-[var(--surface)]">
              {data.map((d, i) => (
                <tr key={i} className="border-b border-gray-50 dark:border-white/[0.03]">
                  <td className="px-3 py-2.5 font-medium text-gray-900 dark:text-white">{d.clientName}</td>
                  <td className="px-3 py-2.5">
                    <span className="text-xs text-gray-700 dark:text-gray-300">{d.status}</span>
                  </td>
                  <td
                    className={`px-3 py-2.5 font-semibold tabular-nums ${color === "red" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}
                  >
                    {d.stuckDays}d
                  </td>
                  <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300">{fmtDate(d.settlementDate)}</td>
                  <td className="px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300">
                    {repName(d.assignedTo, reps)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  if (chaseList.length === 0 && atRiskList.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
        <AlertCircle size={16} className="text-amber-500" /> Risk Overview
      </h2>
      {renderTable("Chase List", <Clock size={14} className="text-amber-500" />, chaseList, "amber")}
      {renderTable("At Risk Deals", <AlertTriangle size={14} className="text-red-500" />, atRiskList, "red")}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Rep Performance Table
// ─────────────────────────────────────────────────────────────────────────────

function RepPerfTable({ reps }: { reps: RepPerf[] }) {
  if (reps.length === 0) return null;
  const thCls =
    "px-3 py-2.5 text-left text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide";
  return (
    <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-white/[0.06]">
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
          <Users size={14} /> Rep Performance
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: "600px" }}>
          <thead className="bg-gray-50 dark:bg-slate-900/40">
            <tr>
              <th className={thCls}>Rep</th>
              <th className={thCls}>Deals</th>
              <th className={thCls}>Settled</th>
              <th className={thCls}>Conversion</th>
              <th className={thCls}>Value</th>
              <th className={thCls}>Commission</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-[var(--surface)]">
            {reps.map((r) => (
              <tr
                key={r.name}
                className="border-b border-gray-50 dark:border-white/[0.03] hover:bg-gray-50 dark:hover:bg-[var(--hover)]"
              >
                <td className="px-3 py-2.5 font-medium text-gray-900 dark:text-white">{r.name}</td>
                <td className="px-3 py-2.5 tabular-nums text-gray-700 dark:text-gray-300">{r.dealsHandled}</td>
                <td className="px-3 py-2.5 tabular-nums text-green-600 dark:text-green-400">{r.dealsSettled}</td>
                <td className="px-3 py-2.5 tabular-nums text-gray-700 dark:text-gray-300">{r.conversion}</td>
                <td className="px-3 py-2.5 tabular-nums font-semibold text-gray-900 dark:text-white">
                  {fmt(r.totalValue)}
                </td>
                <td className="px-3 py-2.5 tabular-nums font-semibold text-gray-900 dark:text-white">
                  {fmt(r.totalCommission)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Paginated Table
// ─────────────────────────────────────────────────────────────────────────────

function PaginatedTable({ deals, reps }: { deals: Deal[]; reps: Rep[] }) {
  const [sortField, setSortField] = useState<"expectedSettlementDate" | "dealValue" | "commissionTotal">(
    "expectedSettlementDate",
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const pageSize = 15;

  const sorted = useMemo(() => {
    return [...deals].sort((a, b) => {
      let c = 0;
      if (sortField === "expectedSettlementDate") c = a.expectedSettlementDate.localeCompare(b.expectedSettlementDate);
      else if (sortField === "dealValue") c = (a.dealValue || 0) - (b.dealValue || 0);
      else if (sortField === "commissionTotal") c = (a.commissionTotal || 0) - (b.commissionTotal || 0);
      return sortDir === "asc" ? c : -c;
    });
  }, [deals, sortField, sortDir]);

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);

  const handleSort = (f: typeof sortField) => {
    if (sortField === f) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(f);
      setSortDir("asc");
    }
    setPage(0);
  };
  const sortIcon = (f: typeof sortField) =>
    sortField === f ? sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} /> : null;
  const thCls =
    "px-3 py-2.5 text-left text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none";

  if (deals.length === 0)
    return (
      <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] overflow-hidden shadow-sm hover:shadow-md transition-shadow">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-white/[0.06]">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
            <FileText size={14} /> Deals Table (0)
          </h3>
        </div>
        <EmptyState
          title="No deals to display"
          icon="document"
        />
      </div>
    );

  return (
    <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-white/[0.06]">
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
          <FileText size={14} /> Deals Table ({deals.length})
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: "700px" }}>
          <thead className="bg-gray-50 dark:bg-slate-900/40">
            <tr>
              <th className={thCls} onClick={() => handleSort("dealValue")}>
                Client {sortIcon("dealValue")}
              </th>
              <th className="px-3 py-2.5 text-left text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Status
              </th>
              <th className={thCls} onClick={() => handleSort("dealValue")}>
                Value {sortIcon("dealValue")}
              </th>
              <th className={thCls} onClick={() => handleSort("commissionTotal")}>
                Commission {sortIcon("commissionTotal")}
              </th>
              <th className={thCls} onClick={() => handleSort("expectedSettlementDate")}>
                Settlement {sortIcon("expectedSettlementDate")}
              </th>
              <th className="px-3 py-2.5 text-left text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Rep
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-[var(--surface)]">
            {paged.map((d) => (
              <tr
                key={d.id}
                className="border-b border-gray-50 dark:border-white/[0.03] hover:bg-gray-50 dark:hover:bg-[var(--hover)]"
              >
                <td className="px-3 py-2.5 font-medium text-gray-900 dark:text-white">{d.clientName}</td>
                <td className="px-3 py-2.5">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${ST[d.status]?.bg} ${ST[d.status]?.text}`}
                  >
                    {ST[d.status]?.label || d.status}
                  </span>
                </td>
                <td className="px-3 py-2.5 tabular-nums font-semibold text-gray-900 dark:text-white">
                  {fmt(d.dealValue || 0)}
                </td>
                <td className="px-3 py-2.5 tabular-nums text-green-600 dark:text-green-400">
                  {fmt(d.commissionTotal || 0)}
                </td>
                <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300">{fmtDate(d.expectedSettlementDate)}</td>
                <td className="px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300">{repName(d.assignedTo, reps)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-white/[0.06]">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[var(--hover)] disabled:opacity-30 min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
              const pg = totalPages <= 5 ? i : page > 2 ? page - 2 + i : i;
              return (
                <button
                  key={pg}
                  onClick={() => setPage(pg)}
                  className={`w-9 h-9 rounded-lg text-sm font-medium min-w-[44px] ${pg === page ? "bg-amber-500 text-white" : "hover:bg-gray-100 dark:hover:bg-[var(--hover)] text-gray-700 dark:text-gray-300"}`}
                >
                  {pg + 1}
                </button>
              );
            })}
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[var(--hover)] disabled:opacity-30 min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export function ReportsDashboardPage() {
  const { deals, loading } = useDeals();
  const { reps } = useAppStore();
  const leads = useAppStore((s) => s.leads || []);
  const { settings } = useAppSettings();

  const [datePreset, setDatePreset] = useState<DateRangePreset>("this-month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [repFilter, setRepFilter] = useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = useState<DealStatus | "all">("all");
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);

  const dateRange = useMemo(() => getDateRange(datePreset, customFrom, customTo), [datePreset, customFrom, customTo]);

  const filteredDeals = useMemo(() => {
    let result = filterDealsByDate(deals, dateRange);
    if (repFilter !== "all") result = result.filter((d) => d.assignedTo === repFilter);
    if (statusFilter !== "all") result = result.filter((d) => d.status === statusFilter);
    return result;
  }, [deals, dateRange, repFilter, statusFilter]);

  const kpis = useMemo(() => calculateKPIs(deals, leads), [deals, leads]);
  const forecast = useMemo(() => calculateForecast(deals), [deals]);
  const chartData = useMemo(() => groupRevenueOverTime(filteredDeals, dateRange), [filteredDeals, dateRange]);
  const repPerformance = useMemo(() => getRepPerformance(filteredDeals, reps), [filteredDeals, reps]);
  const repTargetData = useMemo(() => getRepTargetData(deals, reps, settings), [deals, reps, settings]);

  const activeReps = reps.filter((r) => r.active !== false);

  const handleExportCSV = useCallback(() => {
    downloadCSV(generateCSV(filteredDeals, reps), `deals-${datePreset}-${new Date().toISOString().split("T")[0]}.csv`);
  }, [filteredDeals, reps, datePreset]);

  const handleExportPDF = useCallback(async () => {
    setExporting("pdf");
    await generatePDF(filteredDeals, reps, kpis, dateRange.label, forecast);
    setExporting(null);
  }, [filteredDeals, reps, kpis, dateRange.label, forecast]);

  if (loading)
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader size={32} className="animate-spin text-amber-500" />
      </div>
    );

  return (
    <div className="flex-1 flex flex-col bg-[var(--bg)] overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <BarChart3 size={18} className="text-amber-500" /> Reports Dashboard
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={datePreset}
            onChange={(e) => {
              setDatePreset(e.target.value as DateRangePreset);
              if (e.target.value !== "custom") {
                setCustomFrom("");
                setCustomTo("");
              }
            }}
            className="min-h-11 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 dark:border-white/[0.08] dark:bg-[var(--surface)] dark:text-white"
          >
            <option value="this-week">This Week</option>
            <option value="this-month">This Month</option>
            <option value="last-month">Last Month</option>
            <option value="custom">Custom Range</option>
          </select>
          {datePreset === "custom" && (
            <>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="min-h-11 rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 dark:border-white/[0.08] dark:bg-[var(--surface)] dark:text-white"
              />
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="min-h-11 rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 dark:border-white/[0.08] dark:bg-[var(--surface)] dark:text-white"
              />
            </>
          )}
          <span className="text-xs text-gray-500 dark:text-gray-400 px-2 hidden sm:inline">
            {dateRange.from} → {dateRange.to}
          </span>
          <button
            onClick={handleExportCSV}
            className="flex min-h-11 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 sm:text-sm dark:border-white/[0.08] dark:bg-[var(--surface)] dark:text-gray-300 dark:hover:bg-[var(--hover)]"
          >
            <Download size={14} />
            <span className="hidden sm:inline">CSV</span>
          </button>
          <button
            onClick={handleExportPDF}
            disabled={exporting === "pdf"}
            className="flex min-h-11 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:opacity-50 sm:text-sm dark:border-white/[0.08] dark:bg-[var(--surface)] dark:text-gray-300 dark:hover:bg-[var(--hover)]"
          >
            {exporting === "pdf" ? <Loader size={14} className="animate-spin" /> : <FileText size={14} />}
            <span className="hidden sm:inline">PDF</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-5">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:gap-3 dark:border-white/[0.06] dark:bg-[var(--surface)]">
            <div className="flex min-h-11 items-center gap-1.5 pr-1">
              <Filter size={14} className="text-gray-400" />
              <span className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                Filters:
              </span>
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as DealStatus | "all")}
              className="min-h-11 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 dark:border-white/[0.08] dark:bg-[var(--surface)] dark:text-white"
            >
              <option value="all">All Statuses</option>
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {ST[s].label}
                </option>
              ))}
            </select>
            <select
              value={repFilter}
              onChange={(e) => setRepFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
              className="min-h-11 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 dark:border-white/[0.08] dark:bg-[var(--surface)] dark:text-white"
            >
              <option value="all">All Reps</option>
              {activeReps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/50 dark:bg-amber-900/20">
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                <Clock size={13} />
                Review Window
              </div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{dateRange.label}</p>
              <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-300">
                {dateRange.from} to {dateRange.to}
              </p>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800/50 dark:bg-blue-900/20">
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                <Target size={13} />
                Use For
              </div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Performance review</p>
              <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-300">
                Compare pipeline, targets, rep outcomes, and settlement risk.
              </p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800/50 dark:bg-emerald-900/20">
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                <Gauge size={13} />
                Active Filter
              </div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {filteredDeals.length.toLocaleString()} deal{filteredDeals.length === 1 ? "" : "s"} in scope
              </p>
              <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-300">
                {repFilter === "all" ? "All reps" : repName(repFilter, reps)} |{" "}
                {statusFilter === "all" ? "all statuses" : ST[statusFilter]?.label}
              </p>
            </div>
          </div>

          {/* KPI Cards */}
          <KPICards kpis={kpis} />

          {/* Forecast */}
          <ForecastSection forecast={forecast} />

          {/* Company Targets */}
          <CompanyTargets deals={deals} settings={settings} />

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
            <PipelineChart deals={deals.filter((d) => isActive(d.status))} />
            <RevenueChart data={chartData} />
          </div>

          {/* Rep Performance Chart */}
          <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-4">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4 flex items-center gap-1.5">
              <Users size={14} /> Rep Performance (Commission)
            </h3>
            {repPerformance.length > 0 ? (
              <div className="space-y-3">
                {repPerformance.map((r) => {
                  const maxVal = Math.max(...repPerformance.map((rp) => rp.totalCommission), 1);
                  return (
                    <div key={r.name}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium text-gray-700 dark:text-gray-300">{r.name}</span>
                        <span className="tabular-nums text-gray-500 dark:text-gray-400">
                          {r.dealsHandled} deals · {r.conversion} settled
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2.5">
                        <div
                          className="bg-amber-500 h-2.5 rounded-full transition-all"
                          style={{ width: `${maxVal > 0 ? (r.totalCommission / maxVal) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-gray-400 text-center py-4">No rep data yet</p>
            )}
          </div>

          {/* Rep Targets */}
          <RepTargetsTable repTargets={repTargetData} />

          {/* Rep Performance Table */}
          <RepPerfTable reps={repPerformance} />

          {/* Risk Section */}
          <RiskSection deals={deals} reps={reps} />

          {/* Paginated Table */}
          <PaginatedTable deals={filteredDeals} reps={reps} />
        </div>
      </div>
    </div>
  );
}

export default ReportsDashboardPage;
