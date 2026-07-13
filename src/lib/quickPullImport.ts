import type { LeadStatus } from "../types";

export type QuickPullDateResolution = {
  leadDate: string;
  source: "sheet" | "fallback";
  warning?: "missing" | "invalid";
};

export type QuickPullSummary = {
  rowsRead: number;
  added: number;
  updated: number;
  skipped: number;
  failed: number;
  fallbackDates: number;
  invalidDates: number;
  possibleLimitReached: boolean;
};

export const QUICK_PULL_DATE_ALIASES = [
  "date",
  "lead date",
  "dq date",
  "enquiry date",
  "enquiry",
  "created date",
  "created",
  "submitted date",
  "timestamp",
];

export function findQuickPullColumn(headers: string[], aliases: string[]): number {
  const normalizedHeaders = headers.map((header) => header.toLowerCase().trim());
  return normalizedHeaders.findIndex((header) => aliases.some((alias) => header === alias || header.includes(alias)));
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function toIsoDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function expandYear(value: number): number {
  if (value >= 100) return value;
  return value >= 50 ? 1900 + value : 2000 + value;
}

export function parseQuickPullLeadDate(rawValue: string): string | null {
  const raw = rawValue.trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return toIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const auDate = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (auDate) {
    return toIsoDate(expandYear(Number(auDate[3])), Number(auDate[2]), Number(auDate[1]));
  }

  const serial = Number(raw);
  if (Number.isFinite(serial) && serial > 20000 && serial < 90000) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + Math.floor(serial) * 24 * 60 * 60 * 1000);
    return toIsoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }

  return null;
}

export function resolveQuickPullLeadDate(rawValue: string, fallbackDate: string): QuickPullDateResolution {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return { leadDate: fallbackDate, source: "fallback", warning: "missing" };
  }

  const parsed = parseQuickPullLeadDate(trimmed);
  if (!parsed) {
    return { leadDate: fallbackDate, source: "fallback", warning: "invalid" };
  }

  return { leadDate: parsed, source: "sheet" };
}

export function normalizeQuickPullStatus(rawStatus: string): LeadStatus {
  const lower = rawStatus.toLowerCase().replace(/[-_]/g, " ").trim();
  if (lower === "dq") return "DQ";
  if (lower === "live" || lower === "booked") return "Booked";
  if (lower === "revisit" || lower === "callback" || lower === "call back") return "Revisit";
  if (lower === "not interested" || lower === "ni") return "Not Interested";
  if (lower === "wrong number" || lower === "wn") return "Wrong Number";
  if (lower === "no answer" || lower === "na") return "No Answer";
  return "DQ";
}

export function createQuickPullSummary(rowsRead: number): QuickPullSummary {
  return {
    rowsRead,
    added: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    fallbackDates: 0,
    invalidDates: 0,
    possibleLimitReached: rowsRead === 100,
  };
}

export function formatQuickPullSummary(summary: QuickPullSummary): string {
  const parts = [
    `${summary.rowsRead} row${summary.rowsRead === 1 ? "" : "s"} read`,
    `${summary.added} new`,
    `${summary.updated} updated`,
    `${summary.skipped} skipped`,
  ];
  if (summary.failed > 0) parts.push(`${summary.failed} failed`);
  if (summary.fallbackDates > 0) parts.push(`${summary.fallbackDates} date fallback${summary.fallbackDates === 1 ? "" : "s"}`);
  if (summary.possibleLimitReached) parts.push("possible 100-row source limit");
  return parts.join(", ");
}
