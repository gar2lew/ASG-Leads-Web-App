/**
 * CalendarPanel.tsx — Month-view calendar with bookings snapshot.
 *
 * Supports independent dark/light theme, date selection, relative labels,
 * and a "Show bookings" toggle that lists appointments for the selected date.
 */

import { useCallback, useMemo, useState } from "react";
import { X, ChevronLeft, ChevronRight, Calendar as CalIcon, Sun, Moon, ListFilter } from "lucide-react";
import { useAppointments } from "../../hooks/useFirebase";
import type { AppointmentStatus } from "../../types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Theme = "dark" | "light";

interface CalendarPanelProps {
  onClose: () => void;
  theme: Theme;
  onToggleTheme: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Returns 0=Monday … 6=Sunday for a given Date */
function getWeekday(date: Date): number {
  const d = date.getDay(); // 0=Sun … 6=Sat
  return d === 0 ? 6 : d - 1;
}

function fmtDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function todayStr(): string {
  const d = new Date();
  return fmtDate(d.getFullYear(), d.getMonth(), d.getDate());
}

function relativeLabel(dateStr: string): string | null {
  const today = todayStr();
  const tomorrow = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return fmtDate(d.getFullYear(), d.getMonth(), d.getDate());
  })();
  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return fmtDate(d.getFullYear(), d.getMonth(), d.getDate());
  })();
  if (dateStr === today) return "Today";
  if (dateStr === tomorrow) return "Tomorrow";
  if (dateStr === yesterday) return "Yesterday";
  return null;
}

function statusColor(status: AppointmentStatus): string {
  const map: Record<string, string> = {
    "pencilled-in": "#94a3b8",
    confirmed: "#22c55e",
    arrived: "#3b82f6",
    started: "#f59e0b",
    completed: "#10b981",
    "no-show": "#ef4444",
    cancelled: "#6b7280",
    "rebook-fc": "#8b5cf6",
    "rebook-fr": "#06b6d4",
    "fc-complete-fr-booked": "#14b8a6",
    "stopped-at-door": "#f97316",
    "presented-no-sale": "#a855f7",
    "did-not-qualify": "#64748b",
  };
  return map[status] || "#94a3b8";
}

function statusLabel(status: AppointmentStatus): string {
  return status
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatTime(t: string): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Themes
// ─────────────────────────────────────────────────────────────────────────────

const THEMES: Record<
  Theme,
  {
    panelBg: string;
    panelBorder: string;
    headerBg: string;
    headerText: string;
    headerIcon: string;
    closeBtnDefault: string;
    closeBtnHover: string;
    closeBtnHoverBg: string;
    monthNavText: string;
    dayHeader: string;
    cellBg: string;
    cellBgHover: string;
    cellText: string;
    cellToday: string;
    cellTodayBorder: string;
    cellSelected: string;
    cellSelectedBorder: string;
    cellMuted: string;
    cellMutedText: string;
    bookingBg: string;
    bookingText: string;
    bookingBorder: string;
    badgeBg: string;
    badgeText: string;
    divider: string;
    toggleBg: string;
    toggleText: string;
  }
> = {
  dark: {
    panelBg: "#0f0f12",
    panelBorder: "#2a2a2e",
    headerBg: "#1A1A1D",
    headerText: "rgb(156, 163, 175)",
    headerIcon: "rgb(107, 114, 128)",
    closeBtnDefault: "rgb(107, 114, 128)",
    closeBtnHover: "rgb(209, 213, 219)",
    closeBtnHoverBg: "rgba(255,255,255,0.05)",
    monthNavText: "rgb(229, 231, 235)",
    dayHeader: "rgb(107, 114, 128)",
    cellBg: "rgba(255,255,255,0.02)",
    cellBgHover: "rgba(255,255,255,0.06)",
    cellText: "rgb(229, 231, 235)",
    cellToday: "rgba(184,147,58,0.12)",
    cellTodayBorder: "#b8933a",
    cellSelected: "rgba(184,147,58,0.18)",
    cellSelectedBorder: "#d4aa55",
    cellMuted: "transparent",
    cellMutedText: "rgb(63, 63, 70)",
    bookingBg: "rgba(255,255,255,0.03)",
    bookingText: "rgb(209, 213, 219)",
    bookingBorder: "rgba(255,255,255,0.06)",
    badgeBg: "rgba(184,147,58,0.2)",
    badgeText: "#d4aa55",
    divider: "#2a2a2e",
    toggleBg: "rgba(255,255,255,0.06)",
    toggleText: "rgb(156, 163, 175)",
  },
  light: {
    panelBg: "#ffffff",
    panelBorder: "#d1d5db",
    headerBg: "#f3f4f6",
    headerText: "rgb(75, 85, 99)",
    headerIcon: "rgb(107, 114, 128)",
    closeBtnDefault: "rgb(156, 163, 175)",
    closeBtnHover: "rgb(75, 85, 99)",
    closeBtnHoverBg: "rgba(0,0,0,0.05)",
    monthNavText: "rgb(17, 24, 39)",
    dayHeader: "rgb(107, 114, 128)",
    cellBg: "#f9fafb",
    cellBgHover: "#f3f4f6",
    cellText: "rgb(31, 41, 55)",
    cellToday: "rgba(184,147,58,0.1)",
    cellTodayBorder: "#b8933a",
    cellSelected: "rgba(184,147,58,0.15)",
    cellSelectedBorder: "#d4aa55",
    cellMuted: "transparent",
    cellMutedText: "rgb(209, 213, 219)",
    bookingBg: "#f9fafb",
    bookingText: "rgb(55, 65, 81)",
    bookingBorder: "#e5e7eb",
    badgeBg: "rgba(184,147,58,0.15)",
    badgeText: "#92702a",
    divider: "#e5e7eb",
    toggleBg: "rgba(0,0,0,0.04)",
    toggleText: "rgb(75, 85, 99)",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const PANEL_WIDTH = 320;
const PANEL_HEIGHT = 440;

export function CalendarPanel({ onClose, theme, onToggleTheme }: CalendarPanelProps) {
  const isDark = theme === "dark";
  const t = THEMES[theme];

  // Month navigation
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  // Selected date
  const [selectedDate, setSelectedDate] = useState(todayStr());

  // Show bookings toggle
  const [showBookings, setShowBookings] = useState(true);

  // Fetch appointments for the view month
  const { appointments, loading: apptLoading } = useAppointments({
    from: fmtDate(viewYear, viewMonth, 1),
    to: fmtDate(viewYear, viewMonth, getDaysInMonth(viewYear, viewMonth)),
  });

  // Navigate month
  const prevMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 0) {
        setViewYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  }, []);

  const nextMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 11) {
        setViewYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
  }, []);

  const goToday = useCallback(() => {
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setSelectedDate(todayStr());
  }, [now]);

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const days: { day: number; dateStr: string; isCurrentMonth: boolean }[] = [];
    const firstDay = getWeekday(new Date(viewYear, viewMonth, 1));
    const daysInMonth = getDaysInMonth(viewYear, viewMonth);
    const prevMonthDays = viewMonth === 0 ? getDaysInMonth(viewYear - 1, 11) : getDaysInMonth(viewYear, viewMonth - 1);

    // Previous month trailing days
    for (let i = firstDay - 1; i >= 0; i--) {
      const day = prevMonthDays - i;
      const pm = viewMonth === 0 ? 11 : viewMonth - 1;
      const py = viewMonth === 0 ? viewYear - 1 : viewYear;
      days.push({ day, dateStr: fmtDate(py, pm, day), isCurrentMonth: false });
    }

    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({ day: d, dateStr: fmtDate(viewYear, viewMonth, d), isCurrentMonth: true });
    }

    // Next month leading days to fill 42 cells (6 rows)
    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining; d++) {
      const nm = viewMonth === 11 ? 0 : viewMonth + 1;
      const ny = viewMonth === 11 ? viewYear + 1 : viewYear;
      days.push({ day: d, dateStr: fmtDate(ny, nm, d), isCurrentMonth: false });
    }

    return days;
  }, [viewYear, viewMonth]);

  // Bookings for selected date
  const selectedBookings = useMemo(() => {
    if (!showBookings) return [];
    return appointments.filter((a) => a.date === selectedDate).slice(0, 5);
  }, [appointments, selectedDate, showBookings]);

  // Appointment count per day (for badge)
  const apptCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    appointments.forEach((a) => {
      map[a.date] = (map[a.date] || 0) + 1;
    });
    return map;
  }, [appointments]);

  const today = todayStr();
  const relLabel = relativeLabel(selectedDate);
  const [year, month, day] = selectedDate.split("-").map(Number);
  const selectedDateObj = new Date(year, month - 1, day);
  const selectedDayName =
    DAYS[(selectedDateObj.getDay() + 6) % 7] || DAYS[selectedDateObj.getDay() === 0 ? 6 : selectedDateObj.getDay() - 1];

  return (
    <div
      className="select-none"
      data-calendar-panel
      style={{
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
        position: "relative",
        transition: "width 0.2s ease, height 0.2s ease",
      }}
    >
      <div
        className="w-full h-full flex flex-col rounded-xl border shadow-2xl overflow-hidden"
        style={{
          background: t.panelBg,
          borderColor: t.panelBorder,
          transition: "background 0.15s ease, border-color 0.15s ease",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-3 py-2 border-b flex-shrink-0 cursor-default"
          style={{
            background: t.headerBg,
            borderColor: t.divider,
            transition: "background 0.15s ease, border-color 0.15s ease",
          }}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <CalIcon size={14} style={{ color: t.headerIcon }} />
            <span className="text-xs font-semibold tracking-wide truncate" style={{ color: t.headerText }}>
              Calendar
            </span>
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {/* Theme toggle */}
            <button
              onClick={onToggleTheme}
              className="p-1 rounded-md transition"
              style={{ color: t.closeBtnDefault }}
              title={isDark ? "Switch to light theme" : "Switch to dark theme"}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = t.closeBtnHoverBg;
                (e.currentTarget as HTMLElement).style.color = t.closeBtnHover;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.color = t.closeBtnDefault;
              }}
            >
              {isDark ? <Sun size={13} /> : <Moon size={13} />}
            </button>
            {/* Close */}
            <button
              onClick={onClose}
              className="p-1 rounded-md transition"
              style={{ color: t.closeBtnDefault }}
              title="Close calendar"
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = t.closeBtnHoverBg;
                (e.currentTarget as HTMLElement).style.color = t.closeBtnHover;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.color = t.closeBtnDefault;
              }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Month navigation */}
        <div className="flex items-center justify-between px-3 py-2 flex-shrink-0">
          <button
            onClick={prevMonth}
            className="p-1 rounded hover:bg-white/5 transition"
            style={{ color: t.monthNavText }}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={goToday}
            className="text-xs font-semibold transition"
            style={{ color: t.badgeText }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.opacity = "0.7";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.opacity = "1";
            }}
          >
            {MONTH_NAMES[viewMonth]} {viewYear}
          </button>
          <button
            onClick={nextMonth}
            className="p-1 rounded hover:bg-white/5 transition"
            style={{ color: t.monthNavText }}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 px-2 flex-shrink-0">
          {DAYS.map((d) => (
            <div key={d} className="text-[10px] font-semibold text-center py-1" style={{ color: t.dayHeader }}>
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 flex-1 px-2 pb-1 gap-px">
          {calendarDays.map((cell, i) => {
            const isToday = cell.dateStr === today;
            const isSelected = cell.dateStr === selectedDate;
            const count = apptCountMap[cell.dateStr] || 0;

            let bg = cell.isCurrentMonth ? t.cellBg : t.cellMuted;
            const textColor = cell.isCurrentMonth ? t.cellText : t.cellMutedText;
            let border = "transparent";

            if (isToday) {
              bg = t.cellToday;
              border = t.cellTodayBorder;
            }
            if (isSelected) {
              bg = t.cellSelected;
              border = t.cellSelectedBorder;
            }

            return (
              <button
                key={i}
                onClick={() => cell.isCurrentMonth && setSelectedDate(cell.dateStr)}
                className="relative rounded-md flex flex-col items-center justify-center transition cursor-pointer"
                style={{
                  background: bg,
                  color: textColor,
                  border: `1px solid ${border}`,
                  fontSize: "0.7rem",
                  fontWeight: isToday ? "700" : "500",
                  minHeight: "32px",
                  transition: "background 0.15s ease, border-color 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) (e.currentTarget as HTMLElement).style.background = t.cellBgHover;
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) (e.currentTarget as HTMLElement).style.background = bg;
                }}
                disabled={!cell.isCurrentMonth}
              >
                {cell.day}
                {count > 0 && cell.isCurrentMonth && (
                  <span className="absolute bottom-px rounded-full w-1 h-1" style={{ background: t.badgeBg }} />
                )}
              </button>
            );
          })}
        </div>

        {/* Selected date info */}
        <div
          className="px-3 py-1.5 flex-shrink-0 flex items-center justify-between"
          style={{ borderTop: `1px solid ${t.divider}` }}
        >
          <div>
            <span className="text-xs font-semibold" style={{ color: t.cellText }}>
              {selectedDayName}, {selectedDate}
            </span>
            {relLabel && (
              <span
                className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded"
                style={{ background: t.badgeBg, color: t.badgeText }}
              >
                {relLabel}
              </span>
            )}
          </div>
        </div>

        {/* Bookings section */}
        {showBookings && (
          <div
            className="flex-shrink-0 px-3 pb-2 pt-1"
            style={{ borderTop: `1px solid ${t.divider}`, maxHeight: "140px", overflowY: "auto" }}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: t.dayHeader }}>
                Bookings
              </span>
              {apptLoading && (
                <span className="text-[10px]" style={{ color: t.dayHeader }}>
                  Loading…
                </span>
              )}
            </div>
            {selectedBookings.length === 0 ? (
              <p className="text-[10px] italic py-1" style={{ color: t.cellMutedText }}>
                No bookings for this date
              </p>
            ) : (
              <div className="space-y-1">
                {selectedBookings.map((appt) => (
                  <div
                    key={appt.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md"
                    style={{
                      background: t.bookingBg,
                      border: `1px solid ${t.bookingBorder}`,
                      transition: "background 0.15s ease",
                    }}
                  >
                    <div
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: statusColor(appt.status) }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-medium truncate" style={{ color: t.bookingText }}>
                        {appt.clientName || appt.title || "Untitled"}
                      </p>
                      <p className="text-[9px]" style={{ color: t.cellMutedText }}>
                        {appt.startTime ? formatTime(appt.startTime) : ""}
                        {appt.serviceTypeId ? ` · ${appt.serviceTypeId}` : ""}
                      </p>
                    </div>
                    <span
                      className="text-[8px] font-semibold px-1 py-0.5 rounded flex-shrink-0"
                      style={{
                        background: `${statusColor(appt.status)}22`,
                        color: statusColor(appt.status),
                      }}
                    >
                      {statusLabel(appt.status)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer toggle */}
        <div
          className="px-3 py-1.5 flex-shrink-0 flex items-center justify-between"
          style={{ borderTop: `1px solid ${t.divider}` }}
        >
          <button
            onClick={() => setShowBookings((p) => !p)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md transition"
            style={{
              background: showBookings ? t.badgeBg : t.toggleBg,
              color: showBookings ? t.badgeText : t.toggleText,
              fontSize: "10px",
              fontWeight: 600,
            }}
          >
            <ListFilter size={11} />
            {showBookings ? "Hiding bookings" : "Showing bookings"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CalendarPanel;
