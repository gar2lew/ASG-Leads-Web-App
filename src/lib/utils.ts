/**
 * Utility Functions for ASG Leads
 *
 * Input validation, sanitization, formatting
 */

import type { Lead } from "../types";

/**
 * Normalise an Australian phone number.
 * Fixes the most common issue: Google Sheets drops the leading 0 from mobile numbers
 * because it stores them as numeric (412345678 → 0412345678).
 */
export function normalizeAUPhone(raw: string): string {
  if (!raw) return raw;
  const digits = String(raw).replace(/\D/g, ""); // strip all non-digit characters

  // 9-digit mobile starting with 4 → Google Sheets dropped the leading 0
  if (digits.length === 9 && digits.startsWith("4")) return `0${digits}`;

  // International +614XX or 614XX → 04XX
  if (digits.length === 11 && digits.startsWith("614")) return `0${digits.slice(2)}`;
  if (digits.length === 12 && digits.startsWith("6104")) return `0${digits.slice(3)}`;

  // Already 10 digits (AU mobile or landline) — return digits only (spaces stripped)
  if (digits.length === 10) return digits;

  // Unknown format — return original trimmed string unchanged
  return String(raw).trim();
}

/**
 * Format date to readable string
 */
export function formatDate(date: string | number | Date | undefined): string {
  if (!date) return "-";

  try {
    const d = new Date(date);
    return new Intl.DateTimeFormat("en-AU", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(d);
  } catch {
    return "-";
  }
}

/**
 * Format time (HH:MM)
 */
export function formatTime(time: string | undefined): string {
  if (!time) return "-";
  try {
    const [h, m] = time.split(":");
    return `${h}:${m}`;
  } catch {
    return "-";
  }
}

/**
 * Format datetime to ISO string for display
 */
export function formatDateTime(date: string | undefined, time: string | undefined): string {
  if (!date) return "-";
  return `${formatDate(date)} ${time ? formatTime(time) : ""}`.trim();
}

/**
 * Sanitize phone number
 *
 * - Removes special characters except +, -, (), space
 * - Ensures valid AU format (04XX XXX XXX)
 * - Returns cleaned number
 */
export function sanitizePhone(phone: string): string {
  if (!phone) return "";

  // Remove all non-digit characters except +, -, (, ), space
  const cleaned = phone.replace(/[^\d\s+\-()]/g, "");

  // If it starts with +, keep the +
  if (cleaned.startsWith("+")) {
    return cleaned;
  }

  // Extract digits only
  const digitsOnly = cleaned.replace(/\D/g, "");

  // Australian phone validation
  if (digitsOnly.length < 10) {
    return cleaned; // Let parent handle validation
  }

  // Format as 04XX XXX XXX
  if (digitsOnly.startsWith("04") || digitsOnly.startsWith("4")) {
    const formatted = digitsOnly.slice(digitsOnly.startsWith("04") ? 0 : 1).match(/^04\d{0,8}/) || [""];
    return formatted[0];
  }

  return cleaned;
}

/**
 * Validate Australian phone number
 */
export function isValidPhone(phone: string): boolean {
  if (!phone) return false;

  const cleaned = phone.replace(/\D/g, "");

  // Must be 10 digits, starting with 04
  if (cleaned.length === 10 && cleaned.startsWith("04")) {
    return true;
  }

  // Or 11 digits starting with 614
  if (cleaned.length === 11 && cleaned.startsWith("614")) {
    return true;
  }

  return false;
}

/**
 * Sanitize email
 *
 * - Trims whitespace
 * - Lowercases
 */
export function sanitizeEmail(email: string): string {
  if (!email) return "";
  return email.trim().toLowerCase();
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  if (!email) return true; // Email is optional
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

/**
 * Sanitize general text input
 *
 * - Trims whitespace
 * - Removes extra spaces
 * - Prevents XSS
 */
export function sanitizeInput(input: string): string {
  if (!input) return "";

  return input
    .trim()
    .replace(/\s+/g, " ") // Replace multiple spaces with single
    .replace(/[<>]/g, ""); // Remove potential HTML tags
}

/**
 * Debounce function
 *
 * Returns a debounced version of a function
 */
export function debounce<T extends (...args: never[]) => unknown>(fn: T, delay: number): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;

  return function debounced(...args: Parameters<T>) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Format currency
 */
export function formatCurrency(amount: number | undefined): string {
  if (!amount) return "$0.00";

  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(amount);
}

/**
 * Get days since date
 */
export function daysSince(date: string | undefined): number {
  if (!date) return Infinity;

  const d = new Date(date);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - d.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}

/**
 * Check if lead is overdue callback
 */
export function isOverdueCallback(lead: { callbackDate?: string; status?: string }): boolean {
  if (lead.status !== "revisit" || !lead.callbackDate) return false;

  const callbackDate = new Date(lead.callbackDate);
  const now = new Date();
  return callbackDate < now;
}

/**
 * Get lead priority (for sorting/urgency)
 *
 * Higher number = higher priority
 */
export function getLeadPriority(lead: { status?: string; callbackDate?: string; lastCall?: string }): number {
  // Overdue callbacks = highest priority
  if (isOverdueCallback(lead)) return 100;

  // Booked = high priority
  if (lead.status === "booked") return 80;

  // Revisit = medium-high priority
  if (lead.status === "revisit") return 60;

  // Not called yet = medium priority
  if (!lead.lastCall) return 40;

  // Called but live = medium-low
  if (lead.status === "live") return 20;

  // Other = low priority
  return 0;
}

/**
 * Get rep avatar initials
 */
export function getInitials(name: string): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Get status badge color (Tailwind classes)
 */
export function getStatusBadgeColor(status: string | undefined): {
  bg: string;
  text: string;
} {
  const colors: Record<string, { bg: string; text: string }> = {
    dq: {
      bg: "bg-gray-100 dark:bg-gray-800",
      text: "text-gray-800 dark:text-gray-200",
    },
    live: {
      bg: "bg-green-100 dark:bg-green-900",
      text: "text-green-800 dark:text-green-200",
    },
    booked: {
      bg: "bg-amber-100 dark:bg-amber-900",
      text: "text-amber-800 dark:text-amber-200",
    },
    revisit: {
      bg: "bg-yellow-100 dark:bg-yellow-900",
      text: "text-yellow-800 dark:text-yellow-200",
    },
    "not-interested": {
      bg: "bg-red-100 dark:bg-red-900",
      text: "text-red-800 dark:text-red-200",
    },
    "wrong-number": {
      bg: "bg-gray-100 dark:bg-gray-700",
      text: "text-gray-800 dark:text-gray-200",
    },
  };

  return colors[status || "dq"] || colors["dq"];
}

/**
 * Format phone number for display
 *
 * 0412345678 → 0412 345 678
 */
export function formatPhoneForDisplay(phone: string): string {
  if (!phone) return "";

  const cleaned = phone.replace(/\D/g, "");

  if (cleaned.length === 10 && cleaned.startsWith("04")) {
    return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`;
  }

  return phone;
}

/**
 * Check if date is today
 */
export function isToday(date: string | undefined): boolean {
  if (!date) return false;

  const d = new Date(date);
  const today = new Date();

  return (
    d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear()
  );
}

/**
 * Check if date is tomorrow
 */
export function isTomorrow(date: string | undefined): boolean {
  if (!date) return false;

  const d = new Date(date);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  return (
    d.getDate() === tomorrow.getDate() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getFullYear() === tomorrow.getFullYear()
  );
}

/**
 * Get next business day
 */
export function getNextBusinessDay(): Date {
  const date = new Date();
  date.setDate(date.getDate() + 1);

  // Skip weekends
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() + 1);
  }

  return date;
}

/**
 * Export data as CSV
 */
export function exportAsCSV(data: Array<Record<string, unknown>>, filename: string, columns?: string[]) {
  if (data.length === 0) return;

  // Get headers
  const headers = columns || Object.keys(data[0]);

  // Build CSV
  const csv = [
    headers.join(","),
    ...data.map((row) =>
      headers
        .map((header) => {
          const value = row[header];
          // Escape quotes and wrap in quotes if contains comma
          if (typeof value === "string" && value.includes(",")) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value ?? "";
        })
        .join(","),
    ),
  ].join("\n");

  // Download
  const blob = new Blob([csv], { type: "text/csv" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}-${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

/**
 * Export leads as CSV (formatted, human-readable columns)
 */
export function exportLeadsCSV(leads: Lead[], repsMap: Record<number, string> = {}) {
  if (leads.length === 0) return;
  const rows = leads.map((l) => ({
    Name: l.name ?? "",
    Phone: l.phone ?? "",
    Email: l.email ?? "",
    "House #": l.houseNum ?? "",
    Street: l.street ?? "",
    Suburb: l.suburb ?? "",
    Postcode: l.postcode ?? "",
    Status: l.status ?? "",
    Ownership: l.ownership ?? "",
    Superannuation: l.superannuation ?? "",
    Rep: repsMap[l.dqRep] ?? l.dqRep ?? "",
    "Lead Date": l.leadDate ?? "",
    "Last Call": l.lastCall ?? "",
    "Callback Date": l.callbackDate ?? "",
    "Callback Time": l.callbackTime ?? "",
    Notes: l.notes ?? "",
  }));
  exportAsCSV(rows, "asg-leads");
}

/**
 * Export full call history as CSV
 */
export function exportCallHistoryCSV(leads: Lead[]) {
  const rows: Array<Record<string, unknown>> = [];
  leads.forEach((l) => {
    (l.callHistory || []).forEach((c) => {
      rows.push({
        "Lead Name": l.name ?? "",
        Phone: l.phone ?? "",
        Suburb: l.suburb ?? "",
        Date: c.date ?? "",
        Time: c.time ?? "",
        Rep: c.rep ?? "",
        Result: c.result ?? "",
        Notes: c.notes ?? "",
      });
    });
  });
  if (rows.length === 0) return false;
  exportAsCSV(rows, "asg-call-history");
  return true;
}
