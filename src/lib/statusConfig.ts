/**
 * Centralised lead-status colour helpers.
 *
 * Single source of truth for resolving status colours throughout the app.
 * All components should call getStatusColor() rather than duplicating the
 * `statusColors[s] ?? DEFAULT_STATUS_COLORS[s] ?? '#9ca3af'` pattern inline.
 */

import { DEFAULT_STATUS_COLORS, type LeadStatus } from "../types";

const FALLBACK_COLOR = '#9ca3af';

export const CANONICAL_LEAD_STATUSES = [
  "DQ",
  "No Answer",
  "Revisit",
  "Booked",
  "Not Interested",
  "Wrong Number",
] as const;

export type CanonicalLeadStatus = (typeof CANONICAL_LEAD_STATUSES)[number];

export function normalizeLeadStatus(status: string | null | undefined, fallback: CanonicalLeadStatus = "DQ"): CanonicalLeadStatus {
  const normalized = String(status ?? "").trim().toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ");
  if (!normalized) return fallback;
  if (["dq", "lead", "leads", "new", "new lead", "new leads", "fresh", "back to dq"].includes(normalized)) return "DQ";
  if (["live", "active", "contacted", "qualified", "booked", "booking", "appointment", "appt", "appointment booked"].includes(normalized)) return "Booked";
  if (["revisit", "callback", "call back", "cb", "follow up", "followup", "fu"].includes(normalized)) return "Revisit";
  if (["not interested", "ni", "not int", "n/i", "lost"].includes(normalized)) return "Not Interested";
  if (["wrong number", "wn", "wrong no", "wrong num"].includes(normalized)) return "Wrong Number";
  if (["no answer", "na", "no ans", "not answered", "no reply"].includes(normalized)) return "No Answer";
  const exact = CANONICAL_LEAD_STATUSES.find((item) => item.toLowerCase() === normalized);
  return exact ?? fallback;
}

export function normalizeLeadStatusForWrite(status: LeadStatus | string | null | undefined): LeadStatus {
  return normalizeLeadStatus(status) as LeadStatus;
}

// Colour precedence: customColors → DEFAULT_STATUS_COLORS → FALLBACK_COLOR
/**
 * Returns the hex colour for a given lead status string.
 *
 * Priority:
 *   1. Admin-configured override (from Firestore settings → Zustand statusColors)
 *   2. Built-in default from DEFAULT_STATUS_COLORS
 *   3. Neutral grey fallback (FALLBACK_COLOR)
 *
 * @param status       - LeadStatus string (e.g. "DQ", "Booked")
 * @param customColors - Optional overrides from useAppStore().statusColors
 */
export function getStatusColor(status: string, customColors?: Record<string, string>): string {
  const canonical = normalizeLeadStatus(status);
  return customColors?.[canonical] ?? DEFAULT_STATUS_COLORS[canonical] ?? FALLBACK_COLOR;
}

/**
 * Returns an `{ backgroundColor, color }` style object for a status badge.
 * Background is the status colour at ~13 % opacity; text is the full colour.
 */
export function getStatusBadgeStyle(
  status: string,
  customColors?: Record<string, string>,
): { backgroundColor: string; color: string } {
  const hex = getStatusColor(status, customColors);
  return { backgroundColor: `${hex}22`, color: hex };
}

/** All defined lead status labels in display order */
export const LEAD_STATUS_OPTIONS = CANONICAL_LEAD_STATUSES;
