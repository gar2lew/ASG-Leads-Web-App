/**
 * Centralised date formatting, validation, and relative date utilities
 *
 * Rules:
 *  - All internal storage remains YYYY-MM-DD (ISO date string)
 *  - Display defaults to "DD MMM" (e.g. "10 Apr")
 *  - Full format: "DD/MM/YYYY"
 *  - Relative: "Today", "Yesterday", "X days ago"
 *  - Future dates are rejected or auto-corrected to today
 *  - Ambiguous input assumed DD/MM/YYYY
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Parse ANY reasonable date string/number/Date into a Date object.
 * Returns null on failure.
 */
function parseDate(input: string | number | Date | undefined | null): Date | null {
  if (!input) return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  if (typeof input === "number") return new Date(input);

  const s = String(input).trim();
  if (!s) return null;

  // Already ISO date (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + "T00:00:00");
    return isNaN(d.getTime()) ? null : d;
  }

  // ISO with time
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    return isNaN(d.getTime()) ? null : d;
  }

  // MM/DD/YYYY (US format — only if we can't parse as DD/MM)
  const mdyMatch = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (mdyMatch) {
    const [, a, b, year] = mdyMatch;
    const fullYear = year.length === 2 ? 2000 + Number(year) : Number(year);
    // Try DD/MM first
    const d1 = new Date(fullYear, Number(b) - 1, Number(a));
    if (!isNaN(d1.getTime()) && d1.getMonth() === Number(b) - 1 && d1.getDate() === Number(a)) return d1;
    // Fall back to MM/DD
    const d2 = new Date(fullYear, Number(a) - 1, Number(b));
    return isNaN(d2.getTime()) ? null : d2;
  }

  // Fallback: native Date parser
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a date string. Rejects future dates.
 * Returns a corrected YYYY-MM-DD string or null.
 */
export function validateDate(input: string | undefined | null, allowFuture = false): string | null {
  if (!input) return null;
  const d = parseDate(input);
  if (!d) return null;

  const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (!allowFuture) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    if (d > today) return todayISO(); // auto-correct to today
  }

  return iso;
}

/**
 * Check if a date is in the future.
 */
export function isFutureDate(input: string | number | Date | undefined | null): boolean {
  const d = parseDate(input);
  if (!d) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return d > today;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting — Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default display: "DD MMM" (e.g. "10 Apr")
 * Falls back to "-" for invalid/missing dates.
 */
export function formatDate(input: string | number | Date | undefined | null): string {
  const d = parseDate(input);
  if (!d) return "-";
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/**
 * Full format: "DD/MM/YYYY" (e.g. "10/04/2026")
 */
export function formatDateFull(input: string | number | Date | undefined | null): string {
  const d = parseDate(input);
  if (!d) return "-";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * With year when different from current year: "DD MMM" or "DD MMM YYYY"
 */
export function formatDateSmart(input: string | number | Date | undefined | null): string {
  const d = parseDate(input);
  if (!d) return "-";
  const now = new Date();
  if (d.getFullYear() !== now.getFullYear()) {
    return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
  }
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/**
 * Relative date: "Today", "Yesterday", "X days ago", or "DD MMM" if older than 30 days.
 */
export function formatDateRelative(input: string | number | Date | undefined | null): string {
  const d = parseDate(input);
  if (!d) return "-";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);

  const diffMs = today.getTime() - d.getTime();
  const diffDays = Math.round(diffMs / 86_400_000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 0) return `${Math.abs(diffDays)} days in future`;
  if (diffDays <= 30) return `${diffDays} days ago`;

  return formatDateSmart(input);
}

/**
 * Short weekday + date: "Fri 10 Apr"
 */
export function formatDateWithDay(input: string | number | Date | undefined | null): string {
  const d = parseDate(input);
  if (!d) return "-";
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${days[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/**
 * Long format: "Friday, 10 April 2026"
 */
export function formatDateLong(input: string | number | Date | undefined | null): string {
  const d = parseDate(input);
  if (!d) return "-";
  const months = [
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
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Time only: "14:30"
 */
export function formatTime(input: string | undefined | null): string {
  if (!input) return "-";
  const s = String(input).trim();
  if (/^\d{2}:\d{2}/.test(s)) return s.slice(0, 5);
  const d = parseDate(input);
  if (!d) return "-";
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Date + time: "10 Apr 14:30"
 */
export function formatDateTime(
  input: string | number | Date | undefined | null,
  timeInput?: string | undefined | null,
): string {
  const datePart = formatDateSmart(input);
  const timePart = formatTime(typeof timeInput === "string" ? timeInput : undefined);
  if (timePart === "-") return datePart;
  return `${datePart} ${timePart}`;
}

/**
 * Timestamp to relative: "2 hours ago", "just now"
 */
export function timeAgo(ms: number | undefined | null): string {
  if (!ms) return "-";
  const diff = Date.now() - ms;
  if (diff < 0) return "just now";
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return formatDateSmart(ms);
}

/**
 * Get today as YYYY-MM-DD
 */
export function today(): string {
  return todayISO();
}

/**
 * Get yesterday as YYYY-MM-DD
 */
export function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Days between two dates
 */
export function daysBetween(
  a: string | number | Date | undefined | null,
  b: string | number | Date | undefined | null,
): number {
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da || !db) return Infinity;
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}
