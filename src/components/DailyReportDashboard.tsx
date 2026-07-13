/**
 * DailyReportDashboard.tsx
 *
 * Admin tab component showing per-rep daily performance metrics.
 * Uses Firestore-backed dailyStats when available, falls back to live Zustand
 * store computation for today's date when no aggregated data exists yet.
 */

import { useState, useMemo, useCallback } from "react";
import {
  BarChart2,
  Download,
  TrendingUp,
  TrendingDown,
  Users,
  Calendar,
  RefreshCw,
} from "lucide-react";
import { useDailyStats, DailyStats } from "../hooks/useDailyStats";
import { useAppStore } from "../stores/appStore";
import type { Lead, Rep } from "../types";
import { DataStateWrapper, LoadingSkeleton } from "./StateViews";

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

type SortColumn =
  | "repName"
  | "calls"
  | "appointments"
  | "dealsCreated"
  | "dealsClosed"
  | "commissionEarned"
  | "trainingSessions"
  | "avgTrainingScore"
  | "draps";

type SortDirection = "asc" | "desc";

// Flattened row shape used for display + CSV export
interface TableRow {
  repId: number;
  repName: string;
  calls: number;
  appointments: number;
  dealsCreated: number;
  dealsClosed: number;
  commissionEarned: number;
  trainingSessions: number;
  avgTrainingScore: number;
  draps: {
    dials: number;
    responses: number;
    appointments: number;
    presentations: number;
    sales: number;
  };
}

function drapsLabel(d: TableRow["draps"]): string {
  return `${d.dials}/${d.responses}/${d.appointments}/${d.presentations}/${d.sales}`;
}

function formatCurrency(value: number): string {
  if (value === 0) return "$0";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// ── Live computation from Zustand store ───────────────────────────────────────

function computeLiveRows(
  leads: Lead[],
  reps: Rep[],
  date: string
): TableRow[] {
  return reps
    .filter((rep) => rep.active !== false)
    .map((rep) => {
      // Calls: count CallHistory entries for this rep on this date
      const calls = leads
        .flatMap((l) => l.callHistory ?? [])
        .filter(
          (c) =>
            (c.repId === rep.id || c.rep === rep.name) && c.date === date
        ).length;

      // Appointments: leads where fcAppt or frAppt has repId === rep.id and date === today
      const appointments = leads.filter(
        (l) =>
          (l.fcAppt?.repId === rep.id && l.fcAppt?.date === date) ||
          (l.frAppt?.repId === rep.id && l.frAppt?.date === date)
      ).length;

      // Deals created: leads where dqRep === rep.id and leadDate === today
      const dealsCreated = leads.filter(
        (l) => l.dqRep === rep.id && l.leadDate === date
      ).length;

      return {
        repId: rep.id,
        repName: rep.name,
        calls,
        appointments,
        dealsCreated,
        dealsClosed: 0,
        commissionEarned: 0,
        trainingSessions: 0,
        avgTrainingScore: 0,
        draps: {
          dials: 0,
          responses: 0,
          appointments: 0,
          presentations: 0,
          sales: 0,
        },
      } satisfies TableRow;
    });
}

// ── CSV export ────────────────────────────────────────────────────────────────

function exportCSV(rows: TableRow[], date: string): void {
  const headers = [
    "Rep Name",
    "Calls",
    "Appts",
    "Deals Created",
    "Deals Closed",
    "Commission (AUD)",
    "Training Sessions",
    "Avg Score",
    "DRAPS (D/R/A/P/S)",
  ];

  const csvRows = rows.map((r) => [
    r.repName,
    r.calls,
    r.appointments,
    r.dealsCreated,
    r.dealsClosed,
    r.commissionEarned,
    r.trainingSessions,
    r.avgTrainingScore > 0 ? r.avgTrainingScore.toFixed(1) : "—",
    drapsLabel(r.draps),
  ]);

  const totalRow = [
    "TOTAL",
    rows.reduce((s, r) => s + r.calls, 0),
    rows.reduce((s, r) => s + r.appointments, 0),
    rows.reduce((s, r) => s + r.dealsCreated, 0),
    rows.reduce((s, r) => s + r.dealsClosed, 0),
    rows.reduce((s, r) => s + r.commissionEarned, 0),
    rows.reduce((s, r) => s + r.trainingSessions, 0),
    "",
    "",
  ];

  const csvContent = [headers, ...csvRows, totalRow]
    .map((row) =>
      row
        .map((cell) => {
          const str = String(cell);
          return str.includes(",") || str.includes('"')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        })
        .join(",")
    )
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `daily-report-${date}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ── Column header with sort indicator ────────────────────────────────────────

interface SortableHeaderProps {
  label: string;
  column: SortColumn;
  currentColumn: SortColumn;
  direction: SortDirection;
  onClick: (col: SortColumn) => void;
  className?: string;
}

function SortableHeader({
  label,
  column,
  currentColumn,
  direction,
  onClick,
  className = "",
}: SortableHeaderProps) {
  const isActive = currentColumn === column;
  return (
    <th
      onClick={() => onClick(column)}
      className={`px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap group ${className}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span
          className={`transition-opacity ${
            isActive ? "opacity-100" : "opacity-0 group-hover:opacity-40"
          }`}
        >
          {isActive && direction === "asc" ? (
            <TrendingUp className="w-3 h-3" />
          ) : (
            <TrendingDown className="w-3 h-3" />
          )}
        </span>
      </span>
    </th>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function DailyReportDashboard() {
  const today = todayString();

  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [sortColumn, setSortColumn] = useState<SortColumn>("calls");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const { stats, loading, error } = useDailyStats({ date: selectedDate });
  const { leads, reps } = useAppStore();

  // Determine data source
  const isToday = selectedDate === today;
  const hasAggregated = stats.length > 0;
  const isLiveMode = !hasAggregated && isToday;

  // Build flattened rows from whatever data source applies
  const rawRows = useMemo<TableRow[]>(() => {
    if (hasAggregated) {
      return stats.map(
        (s: DailyStats): TableRow => ({
          repId: s.repId,
          repName: s.repName,
          calls: s.metrics.calls,
          appointments: s.metrics.appointments,
          dealsCreated: s.metrics.dealsCreated,
          dealsClosed: s.metrics.dealsClosed,
          commissionEarned: s.metrics.commissionEarned,
          trainingSessions: s.metrics.trainingSessions,
          avgTrainingScore: s.metrics.avgTrainingScore,
          draps: { ...s.draps },
        })
      );
    }

    if (isLiveMode) {
      return computeLiveRows(leads, reps, selectedDate);
    }

    return [];
  }, [hasAggregated, isLiveMode, stats, leads, reps, selectedDate]);

  // Per-column max values for highlighting best performer
  const colMaxes = useMemo(() => {
    const num = (key: keyof TableRow) =>
      Math.max(...rawRows.map((r) => (r[key] as number) ?? 0), 0);
    return {
      calls: num("calls"),
      appointments: num("appointments"),
      dealsCreated: num("dealsCreated"),
      dealsClosed: num("dealsClosed"),
      commissionEarned: num("commissionEarned"),
      trainingSessions: num("trainingSessions"),
      avgTrainingScore: num("avgTrainingScore"),
    };
  }, [rawRows]);

  // Sorted rows
  const sortedRows = useMemo<TableRow[]>(() => {
    if (rawRows.length === 0) return [];
    return [...rawRows].sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      if (sortColumn === "repName") {
        aVal = a.repName.toLowerCase();
        bVal = b.repName.toLowerCase();
      } else if (sortColumn === "draps") {
        // Sort by total DRAPS score
        const sum = (r: TableRow) =>
          r.draps.dials +
          r.draps.responses +
          r.draps.appointments +
          r.draps.presentations +
          r.draps.sales;
        aVal = sum(a);
        bVal = sum(b);
      } else {
        aVal = a[sortColumn] as number;
        bVal = b[sortColumn] as number;
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [rawRows, sortColumn, sortDirection]);

  // Summary totals
  const totals = useMemo(() => {
    return {
      calls: sortedRows.reduce((s, r) => s + r.calls, 0),
      appointments: sortedRows.reduce((s, r) => s + r.appointments, 0),
      dealsCreated: sortedRows.reduce((s, r) => s + r.dealsCreated, 0),
      dealsClosed: sortedRows.reduce((s, r) => s + r.dealsClosed, 0),
      commissionEarned: sortedRows.reduce((s, r) => s + r.commissionEarned, 0),
      trainingSessions: sortedRows.reduce((s, r) => s + r.trainingSessions, 0),
      draps: {
        dials: sortedRows.reduce((s, r) => s + r.draps.dials, 0),
        responses: sortedRows.reduce((s, r) => s + r.draps.responses, 0),
        appointments: sortedRows.reduce(
          (s, r) => s + r.draps.appointments,
          0
        ),
        presentations: sortedRows.reduce(
          (s, r) => s + r.draps.presentations,
          0
        ),
        sales: sortedRows.reduce((s, r) => s + r.draps.sales, 0),
      },
    };
  }, [sortedRows]);

  const handleSort = useCallback(
    (col: SortColumn) => {
      if (col === sortColumn) {
        setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortColumn(col);
        setSortDirection("desc");
      }
    },
    [sortColumn]
  );

  const handleExport = useCallback(() => {
    exportCSV(sortedRows, selectedDate);
  }, [sortedRows, selectedDate]);

  // Cell class helpers
  const isBest = (col: keyof typeof colMaxes, value: number) =>
    colMaxes[col] > 0 && value === colMaxes[col];

  const cellClass = (col: keyof typeof colMaxes, value: number) => {
    if (isBest(col, value)) {
      return "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 font-semibold rounded px-2 py-0.5";
    }
    if (value === 0) {
      return "text-gray-400 dark:text-gray-600";
    }
    return "text-gray-900 dark:text-gray-100";
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-indigo-500 dark:text-indigo-400 flex-shrink-0" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Daily Performance Report
            </h2>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Daily rhythm view for calls, appointments, deals, training, and DRAPS activity.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Data source indicator */}
          {!loading && (
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                isLiveMode
                  ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
                  : hasAggregated
                  ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
              }`}
            >
              {isLiveMode ? (
                <>
                  <RefreshCw className="w-3 h-3" />
                  Live data
                </>
              ) : hasAggregated ? (
                <>
                  <Calendar className="w-3 h-3" />
                  Aggregated data
                </>
              ) : (
                <>
                  <Users className="w-3 h-3" />
                  No data
                </>
              )}
            </span>
          )}

          {/* Date selector */}
          <div className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <input
              type="date"
              value={selectedDate}
              max={today}
              onChange={(e) => setSelectedDate(e.target.value || today)}
              className="px-2.5 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
            />
          </div>

          {/* Export CSV button */}
          <button
            onClick={handleExport}
            disabled={sortedRows.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {!loading && (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs text-gray-600 shadow-sm dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
          {isLiveMode
            ? "Today is using live CRM activity because aggregated daily stats are not available yet."
            : hasAggregated
              ? "This report is using aggregated dailyStats records for the selected date."
              : "No report rows are available for the selected date."}
        </div>
      )}

      {/* ── Data states (loading / error / empty / content) ─────────────────── */}
      <DataStateWrapper
        loading={loading}
        error={error ?? undefined}
        isEmpty={!loading && !error && sortedRows.length === 0}
        loadingComponent={<LoadingSkeleton rows={8} className="py-4" />}
        emptyProps={{
          icon: <BarChart2 className="w-10 h-10 text-gray-400 dark:text-gray-600" />,
          title: isToday ? "No data yet for today" : `No data for ${selectedDate}`,
          description: !isToday
            ? "Historical data requires aggregated entries in dailyStats. Run the daily aggregation function to populate this."
            : "Data will appear once reps have logged activity today.",
        }}
      >
      {/* ── Desktop table ──────────────────────────────────────────────────── */}
      {sortedRows.length > 0 && (
        <>
          {/* Table — hidden on mobile */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <SortableHeader
                    label="Rep Name"
                    column="repName"
                    currentColumn={sortColumn}
                    direction={sortDirection}
                    onClick={handleSort}
                    className="min-w-[140px]"
                  />
                  <SortableHeader
                    label="Calls"
                    column="calls"
                    currentColumn={sortColumn}
                    direction={sortDirection}
                    onClick={handleSort}
                  />
                  <SortableHeader
                    label="Appts"
                    column="appointments"
                    currentColumn={sortColumn}
                    direction={sortDirection}
                    onClick={handleSort}
                  />
                  <SortableHeader
                    label="Deals Created"
                    column="dealsCreated"
                    currentColumn={sortColumn}
                    direction={sortDirection}
                    onClick={handleSort}
                  />
                  <SortableHeader
                    label="Deals Closed"
                    column="dealsClosed"
                    currentColumn={sortColumn}
                    direction={sortDirection}
                    onClick={handleSort}
                  />
                  <SortableHeader
                    label="Commission"
                    column="commissionEarned"
                    currentColumn={sortColumn}
                    direction={sortDirection}
                    onClick={handleSort}
                  />
                  <SortableHeader
                    label="Training"
                    column="trainingSessions"
                    currentColumn={sortColumn}
                    direction={sortDirection}
                    onClick={handleSort}
                  />
                  <SortableHeader
                    label="Avg Score"
                    column="avgTrainingScore"
                    currentColumn={sortColumn}
                    direction={sortDirection}
                    onClick={handleSort}
                  />
                  <SortableHeader
                    label="DRAPS"
                    column="draps"
                    currentColumn={sortColumn}
                    direction={sortDirection}
                    onClick={handleSort}
                    className="min-w-[110px]"
                  />
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
                {sortedRows.map((row) => (
                  <tr
                    key={row.repId}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                  >
                    {/* Rep Name */}
                    <td className="px-3 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">
                      {row.repName}
                    </td>

                    {/* Calls */}
                    <td className="px-3 py-3">
                      <span className={cellClass("calls", row.calls)}>
                        {row.calls}
                      </span>
                    </td>

                    {/* Appointments */}
                    <td className="px-3 py-3">
                      <span
                        className={cellClass("appointments", row.appointments)}
                      >
                        {row.appointments}
                      </span>
                    </td>

                    {/* Deals Created */}
                    <td className="px-3 py-3">
                      <span
                        className={cellClass("dealsCreated", row.dealsCreated)}
                      >
                        {row.dealsCreated}
                      </span>
                    </td>

                    {/* Deals Closed */}
                    <td className="px-3 py-3">
                      <span
                        className={cellClass("dealsClosed", row.dealsClosed)}
                      >
                        {row.dealsClosed}
                      </span>
                    </td>

                    {/* Commission */}
                    <td className="px-3 py-3">
                      <span
                        className={cellClass(
                          "commissionEarned",
                          row.commissionEarned
                        )}
                      >
                        {formatCurrency(row.commissionEarned)}
                      </span>
                    </td>

                    {/* Training Sessions */}
                    <td className="px-3 py-3">
                      <span
                        className={cellClass(
                          "trainingSessions",
                          row.trainingSessions
                        )}
                      >
                        {row.trainingSessions}
                      </span>
                    </td>

                    {/* Avg Score */}
                    <td className="px-3 py-3">
                      {row.avgTrainingScore === 0 ? (
                        <span className="text-gray-400 dark:text-gray-600">
                          —
                        </span>
                      ) : (
                        <span
                          className={cellClass(
                            "avgTrainingScore",
                            row.avgTrainingScore
                          )}
                        >
                          {row.avgTrainingScore.toFixed(1)}
                        </span>
                      )}
                    </td>

                    {/* DRAPS */}
                    <td className="px-3 py-3 font-mono text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {drapsLabel(row.draps)}
                    </td>
                  </tr>
                ))}
              </tbody>

              {/* Summary row */}
              <tfoot>
                <tr className="bg-gray-50 dark:bg-gray-800/60 border-t-2 border-gray-300 dark:border-gray-600 font-semibold text-gray-700 dark:text-gray-300">
                  <td className="px-3 py-3 text-sm uppercase tracking-wide">
                    Total
                  </td>
                  <td className="px-3 py-3 text-sm">{totals.calls}</td>
                  <td className="px-3 py-3 text-sm">{totals.appointments}</td>
                  <td className="px-3 py-3 text-sm">{totals.dealsCreated}</td>
                  <td className="px-3 py-3 text-sm">{totals.dealsClosed}</td>
                  <td className="px-3 py-3 text-sm">
                    {formatCurrency(totals.commissionEarned)}
                  </td>
                  <td className="px-3 py-3 text-sm">
                    {totals.trainingSessions}
                  </td>
                  <td className="px-3 py-3 text-sm text-gray-400">—</td>
                  <td className="px-3 py-3 text-xs font-mono text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {drapsLabel(totals.draps)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ── Mobile card list ──────────────────────────────────────────── */}
          <div className="md:hidden space-y-3">
            {sortedRows.map((row) => (
              <div
                key={row.repId}
                className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold text-gray-900 dark:text-white text-base">
                    {row.repName}
                  </span>
                  <span className="text-xs font-mono text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                    DRAPS: {drapsLabel(row.draps)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <MobileStatCell
                    label="Calls"
                    value={row.calls}
                    isBest={isBest("calls", row.calls)}
                  />
                  <MobileStatCell
                    label="Appointments"
                    value={row.appointments}
                    isBest={isBest("appointments", row.appointments)}
                  />
                  <MobileStatCell
                    label="Deals Created"
                    value={row.dealsCreated}
                    isBest={isBest("dealsCreated", row.dealsCreated)}
                  />
                  <MobileStatCell
                    label="Deals Closed"
                    value={row.dealsClosed}
                    isBest={isBest("dealsClosed", row.dealsClosed)}
                  />
                  <MobileStatCell
                    label="Commission"
                    value={row.commissionEarned}
                    displayValue={formatCurrency(row.commissionEarned)}
                    isBest={isBest("commissionEarned", row.commissionEarned)}
                  />
                  <MobileStatCell
                    label="Training"
                    value={row.trainingSessions}
                    isBest={isBest("trainingSessions", row.trainingSessions)}
                  />
                  <MobileStatCell
                    label="Avg Score"
                    value={row.avgTrainingScore}
                    displayValue={
                      row.avgTrainingScore === 0
                        ? "—"
                        : row.avgTrainingScore.toFixed(1)
                    }
                    isBest={isBest("avgTrainingScore", row.avgTrainingScore)}
                  />
                </div>
              </div>
            ))}

            {/* Mobile totals card */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
                Totals
              </p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <MobileStatCell label="Calls" value={totals.calls} />
                <MobileStatCell
                  label="Appointments"
                  value={totals.appointments}
                />
                <MobileStatCell
                  label="Deals Created"
                  value={totals.dealsCreated}
                />
                <MobileStatCell
                  label="Deals Closed"
                  value={totals.dealsClosed}
                />
                <MobileStatCell
                  label="Commission"
                  value={totals.commissionEarned}
                  displayValue={formatCurrency(totals.commissionEarned)}
                />
                <MobileStatCell
                  label="Training"
                  value={totals.trainingSessions}
                />
              </div>
            </div>
          </div>
        </>
      )}
      </DataStateWrapper>
    </div>
  );
}

// ── Mobile card stat cell ─────────────────────────────────────────────────────

interface MobileStatCellProps {
  label: string;
  value: number;
  displayValue?: string;
  isBest?: boolean;
}

function MobileStatCell({
  label,
  value,
  displayValue,
  isBest = false,
}: MobileStatCellProps) {
  const display = displayValue ?? String(value);

  return (
    <div
      className={`rounded-lg px-3 py-2 ${
        isBest
          ? "bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800"
          : "bg-gray-50 dark:bg-gray-800/60"
      }`}
    >
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">
        {label}
      </p>
      <p
        className={`font-semibold ${
          isBest
            ? "text-green-700 dark:text-green-300"
            : value === 0
            ? "text-gray-400 dark:text-gray-600"
            : "text-gray-900 dark:text-white"
        }`}
      >
        {display}
      </p>
    </div>
  );
}
