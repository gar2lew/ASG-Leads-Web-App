/**
 * validators.ts — Pre-write validation for all major entity types
 *
 * Each validator returns `ValidationResult`:
 *   { valid: true }                       — write is safe to proceed
 *   { valid: false, errors: string[] }    — list of human-readable issues
 *
 * Validators are pure functions (no Firestore reads) so they run synchronously
 * before any async write, keeping the UX snappy.
 *
 * Exported validators:
 *   validateDeal(deal)              — DealPipeline document
 *   validateLead(lead)              — Lead document
 *   validateTrainingSession(s)      — TrainingSession document
 *   validateDrapsEntry(d)           — DrapsEntry document
 *   validateRep(rep)                — Rep document (create / update)
 *   validateCommission(c)           — Commission document
 *   validateQueueItem(item)         — Offline queue item
 */

// ─────────────────────────────────────────────────────────────────────────────
// Shared result type
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Helper — returns a `ValidationResult` object */
function result(errors: string[]): ValidationResult {
  return { valid: errors.length === 0, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** True if value is a non-empty string (after trimming) */
function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** True if value is a finite, non-negative number */
function isNonNegativeNumber(v: unknown): v is number {
  return typeof v === "number" && isFinite(v) && v >= 0;
}

/** True if value is a valid YYYY-MM-DD date string */
function isDateString(v: unknown): v is string {
  if (typeof v !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

// ─────────────────────────────────────────────────────────────────────────────
// Deal validation
// ─────────────────────────────────────────────────────────────────────────────

const VALID_DEAL_STATUSES = new Set([
  "lead",
  "conditional",
  "unconditional",
  "settled",
  "lost",
]);

const VALID_DEAL_STAGES = new Set([
  "Booked",
  "Appointment Set",
  "Appointment Done",
  "Application In",
  "Under Assessment",
  "Approved",
  "Settlement",
  "Complete",
]);

export function validateDeal(deal: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  if (!isNonEmptyString(deal.clientName)) {
    errors.push("Deal must have a client name.");
  }

  if (!deal.status || !VALID_DEAL_STATUSES.has(deal.status as string)) {
    errors.push(
      `Deal status must be one of: ${[...VALID_DEAL_STATUSES].join(", ")}.`
    );
  }

  if (deal.stage !== undefined && !VALID_DEAL_STAGES.has(deal.stage as string)) {
    errors.push(
      `Deal stage must be one of: ${[...VALID_DEAL_STAGES].join(", ")}.`
    );
  }

  if (
    deal.dealValue !== undefined &&
    !isNonNegativeNumber(deal.dealValue as unknown)
  ) {
    errors.push("Deal value must be a non-negative number.");
  }

  if (
    deal.repId !== undefined &&
    (typeof deal.repId !== "number" || !isFinite(deal.repId as number))
  ) {
    errors.push("Deal repId must be a valid number.");
  }

  return result(errors);
}

// ─────────────────────────────────────────────────────────────────────────────
// Lead validation
// ─────────────────────────────────────────────────────────────────────────────

const VALID_LEAD_STATUSES = new Set([
  "DQ",
  "No Answer",
  "Revisit",
  "Booked",
  "Not Interested",
  "Wrong Number",
  // Legacy aliases still accepted before normalization at write/read boundaries
  "Live",
  "new",
  "contacted",
  "qualified",
  "booked",
  "lost",
]);

export function validateLead(lead: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  if (!isNonEmptyString(lead.firstName) && !isNonEmptyString(lead.name)) {
    errors.push("Lead must have a name or first name.");
  }

  if (lead.status && !VALID_LEAD_STATUSES.has(lead.status as string)) {
    errors.push(`Invalid lead status: "${lead.status}".`);
  }

  if (lead.phone !== undefined && typeof lead.phone !== "string") {
    errors.push("Lead phone must be a string.");
  }

  if (
    lead.leadDate !== undefined &&
    lead.leadDate !== null &&
    !isDateString(lead.leadDate)
  ) {
    errors.push("Lead date must be in YYYY-MM-DD format.");
  }

  return result(errors);
}

// ─────────────────────────────────────────────────────────────────────────────
// Training session validation
// ─────────────────────────────────────────────────────────────────────────────

export function validateTrainingSession(
  session: Record<string, unknown>
): ValidationResult {
  const errors: string[] = [];

  if (
    typeof session.repId !== "number" ||
    !isFinite(session.repId as number)
  ) {
    errors.push("Training session must have a valid numeric repId.");
  }

  if (session.score !== null && session.score !== undefined) {
    const score = session.score as Record<string, unknown>;
    if (
      typeof score.total !== "number" ||
      !isFinite(score.total) ||
      score.total < 0
    ) {
      errors.push("Training session score.total must be a non-negative number.");
    }
  }

  if (
    session.completedAt !== null &&
    session.completedAt !== undefined &&
    typeof session.completedAt !== "number"
  ) {
    errors.push("Training session completedAt must be a Unix timestamp (number).");
  }

  return result(errors);
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAPS entry validation
// ─────────────────────────────────────────────────────────────────────────────

export function validateDrapsEntry(
  entry: Record<string, unknown>
): ValidationResult {
  const errors: string[] = [];

  if (
    typeof entry.repId !== "number" ||
    !isFinite(entry.repId as number)
  ) {
    errors.push("DRAPS entry must have a valid numeric repId.");
  }

  if (!isDateString(entry.date)) {
    errors.push("DRAPS entry must have a date in YYYY-MM-DD format.");
  }

  const numericFields = [
    "dq",
    "referrals",
    "appointments",
    "presentations",
    "sold",
    "fcAppts",
    "fcPresented",
    "fcBooked",
    "frAppts",
    "frPresented",
    "frBooked",
  ];

  for (const field of numericFields) {
    const v = entry[field];
    if (v !== undefined && v !== null && !isNonNegativeNumber(v)) {
      errors.push(`DRAPS field "${field}" must be a non-negative number.`);
    }
  }

  return result(errors);
}

// ─────────────────────────────────────────────────────────────────────────────
// Rep validation
// ─────────────────────────────────────────────────────────────────────────────

const VALID_REP_ROLES = new Set(["rep", "manager", "admin"]);

export function validateRep(rep: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  if (!isNonEmptyString(rep.name)) {
    errors.push("Rep must have a non-empty name.");
  }

  if (
    typeof rep.id !== "number" ||
    !isFinite(rep.id as number) ||
    (rep.id as number) <= 0
  ) {
    errors.push("Rep must have a positive numeric id.");
  }

  if (rep.role && !VALID_REP_ROLES.has(rep.role as string)) {
    errors.push(
      `Rep role must be one of: ${[...VALID_REP_ROLES].join(", ")}.`
    );
  }

  if (rep.pin !== undefined) {
    const pin = String(rep.pin).trim();
    if (!/^\d{4,8}$/.test(pin)) {
      errors.push("Rep PIN must be 4–8 digits.");
    }
  }

  return result(errors);
}

// ─────────────────────────────────────────────────────────────────────────────
// Commission validation
// ─────────────────────────────────────────────────────────────────────────────

export function validateCommission(
  commission: Record<string, unknown>
): ValidationResult {
  const errors: string[] = [];

  if (!isNonEmptyString(commission.leadId) && typeof commission.leadId !== "number") {
    errors.push("Commission must reference a valid leadId.");
  }

  if (
    commission.totalAmount !== undefined &&
    !isNonNegativeNumber(commission.totalAmount)
  ) {
    errors.push("Commission totalAmount must be a non-negative number.");
  }

  if (
    commission.settlementDate !== undefined &&
    commission.settlementDate !== null &&
    !isDateString(commission.settlementDate)
  ) {
    errors.push("Commission settlementDate must be in YYYY-MM-DD format.");
  }

  if (Array.isArray(commission.repAllocations)) {
    (commission.repAllocations as Array<Record<string, unknown>>).forEach(
      (alloc, i) => {
        if (typeof alloc.repId !== "number") {
          errors.push(`repAllocations[${i}].repId must be a number.`);
        }
        if (!isNonNegativeNumber(alloc.amount)) {
          errors.push(
            `repAllocations[${i}].amount must be a non-negative number.`
          );
        }
      }
    );
  }

  return result(errors);
}

// ─────────────────────────────────────────────────────────────────────────────
// Offline queue item validation
// ─────────────────────────────────────────────────────────────────────────────

const VALID_QUEUE_OPS = new Set(["set_merge", "set_full", "delete"]);

export function validateQueueItem(
  item: Record<string, unknown>
): ValidationResult {
  const errors: string[] = [];

  if (!isNonEmptyString(item.id)) {
    errors.push("Queue item must have a non-empty id.");
  }

  if (!isNonEmptyString(item.docPath)) {
    errors.push("Queue item must have a non-empty docPath.");
  } else {
    // docPath must be a valid Firestore path (even number of segments)
    const segments = (item.docPath as string).split("/").filter(Boolean);
    if (segments.length % 2 !== 0) {
      errors.push(
        `Queue item docPath "${item.docPath}" must point to a document (even number of path segments).`
      );
    }
  }

  if (!item.operation || !VALID_QUEUE_OPS.has(item.operation as string)) {
    errors.push(
      `Queue item operation must be one of: ${[...VALID_QUEUE_OPS].join(", ")}.`
    );
  }

  if (item.operation !== "delete" && item.data !== undefined) {
    if (typeof item.data !== "object" || Array.isArray(item.data)) {
      errors.push("Queue item data must be a plain object.");
    }
  }

  return result(errors);
}
